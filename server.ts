import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import {
  findAdminByEmail,
  findAdminByIdentifier,
  findStudentByIdentifier,
  getSafePortalSettings,
  getSuperAdmin,
  hashPassword,
  loadDb,
  resolveEffectiveWhatsappCredentials,
  sanitizeUser,
  saveDb,
  signToken,
  uid,
  verifyPassword,
  type StoredUser,
} from './server/db.ts';
import {
  dispatchOrderNotifications,
  getNextInvoiceMeta,
  sendOrderEmailInvoice,
} from './server/invoice.ts';
import {
  getAccessMode,
  requireAnyAdmin,
  requireAuth,
  requireCourseAccess,
  requirePermission,
  requireSuperAdmin,
  type AuthedRequest,
} from './server/middleware.ts';
import { registerMultiAdminRoutes } from './server/routes/multiAdminRoutes.ts';
import { registerWhatsappAndRecoveryRoutes } from './server/routes/whatsappAndRecoveryRoutes.ts';
import {
  appendAuditLog,
  createSessionRecord,
  generateBackupCodes,
  getClientIp,
  pushNotification,
  recordLoginAttemptAndCheckBruteForce,
  snapshotCourseVersion,
  validateSafeMediaUrlOrDataUrl,
} from './server/security.ts';
import {
  formatWhatsappDigits,
  issueWhatsappOtpChallenge,
} from './server/whatsapp.ts';
import type {
  Announcement,
  AnnouncementCategory,
  Bundle,
  CertificateTemplateConfig,
  Coupon,
  Course,
  CourseApprovalStatus,
  CoursePaymentPlan,
  CustomCertificateRecord,
  LiveClassSession,
  LivePlatformType,
  Order,
  PaymentMethod,
  PaymentMethodType,
  PlatformLink,
  SocialPlatformType,
} from './src/types/lms.ts';
import {
  calculatePriceBreakdown,
  createSampleCatalog,
  detectStateFromGstin,
  isOrderActiveAccess,
  isValidHttpUrl,
  normalizeIndianState,
  normalizeVideoUrl,
  resolveMethodUpiId,
  validateTransactionProof,
} from './src/utils/lms.ts';
import {
  DEFAULT_ROLE_PERMISSIONS,
  canAccessCourse,
  getCourseApprovalStatus,
  getEffectiveAdminRole,
  hasPermission,
  isSuperAdmin,
} from './src/utils/rbac.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getStudentUnlockedCourseIds(student: StoredUser, orders: Order[]): Set<string> {
  const unlocked = new Set<string>(student.grantedCourseIds || []);
  for (const order of orders) {
    if (order.userId === student.id && isOrderActiveAccess(order)) {
      for (const cid of order.courseIds || []) {
        unlocked.add(cid);
      }
    }
  }
  return unlocked;
}

function sanitizePaymentPlans(raw: unknown): CoursePaymentPlan[] {
  if (!Array.isArray(raw)) return [];
  const plans: CoursePaymentPlan[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const months = Math.max(1, Math.min(60, Math.round(Number(obj.months) || 1)));
    const price = Math.max(0, Number(obj.price) || 0);
    const label =
      String(obj.label || '').trim() ||
      `${months} ${months === 1 ? 'Month' : 'Months'} Plan`;
    plans.push({
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : uid(),
      label,
      months,
      price,
    });
  }
  return plans.sort((a, b) => a.months - b.months);
}

function sanitizeCertificateConfig(
  raw: unknown
): CertificateTemplateConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    enabled: obj.enabled !== false,
    mode: obj.mode === 'uploaded' ? 'uploaded' : 'template',
    heading: String(obj.heading || '').trim(),
    certificateTitle: String(obj.certificateTitle || '').trim(),
    subtitle: String(obj.subtitle || '').trim(),
    signerName: String(obj.signerName || '').trim(),
    footerText: String(obj.footerText || '').trim(),
    customTemplateUrl: String(obj.customTemplateUrl || '').trim(),
    customTemplateName: String(obj.customTemplateName || '').trim(),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Ensure DB initializes & migrates on boot
  loadDb();

  // ---- AUTH ROUTES ----
  app.get('/api/auth/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const db = loadDb();
    const waCreds = resolveEffectiveWhatsappCredentials(db);
    res.json({
      adminExists: Boolean(getSuperAdmin(db)),
      brand: db.settings.brand,
      whatsappCloudApiConfigured: Boolean(waCreds.cloudApiReady || waCreds.webhookUrl),
      enforceWhatsapp2FA: Boolean(db.settings.enforceWhatsapp2FA),
    });
  });

  app.post('/api/auth/admin/setup', (req: Request, res: Response) => {
    const db = loadDb();
    if (getSuperAdmin(db)) {
      res.status(409).json({
        error:
          'Super Admin (Owner) account is already configured. Please use Admin Sign In.',
      });
      return;
    }

    const name = String(req.body?.name || '').trim();
    const loginId = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const phone = String(req.body?.phone || '').trim();
    const countryCode = String(req.body?.countryCode || '+91').trim() || '+91';
    const whatsappNumber = String(req.body?.whatsappNumber || phone || '').trim();
    const recoveryPin = String(req.body?.recoveryPin || '').trim();

    if (!name || !loginId || password.length < 8) {
      res.status(400).json({
        error: 'Name, Admin ID/email, and password (min 8 chars) are required.',
      });
      return;
    }

    if (recoveryPin && recoveryPin.length < 4) {
      res.status(400).json({
        error: 'Security Recovery PIN must be at least 4 characters (or leave blank).',
      });
      return;
    }

    if (db.students.some((s) => s.email === loginId)) {
      res
        .status(409)
        .json({ error: 'This ID/email is already registered as a student.' });
      return;
    }

    const emergencyBackup = generateBackupCodes(6);

    const admin: StoredUser = {
      id: uid(),
      name,
      email: loginId,
      phone,
      countryCode,
      whatsappNumber,
      whatsappVerified: false,
      passwordHash: hashPassword(password),
      ...(recoveryPin ? { recoveryPinHash: hashPassword(recoveryPin) } : {}),
      role: 'admin',
      adminRole: 'SUPER_ADMIN',
      accountStatus: 'ACTIVE',
      permissions: DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN,
      assignedCourseIds: [],
      coursePermissions: {},
      active: true,
      suspended: false,
      tokenVersion: 1,
      twoFactorEnabled: false,
      twoFactorBackupHashes: emergencyBackup.hashes,
      grantedCourseIds: [],
      createdAt: new Date().toISOString(),
    };
    db.admins = [admin, ...db.admins.filter((a) => a.adminRole !== 'SUPER_ADMIN')];
    db.admin = admin;
    if (loginId.includes('@') && !db.notifications.smtpUser) {
      db.notifications.smtpUser = loginId;
    }
    if (whatsappNumber && !db.notifications.adminWhatsapp) {
      db.notifications.adminWhatsapp = formatWhatsappDigits(whatsappNumber, countryCode);
    }

    const session = createSessionRecord({ db, user: admin, req });
    admin.lastLoginAt = new Date().toISOString();
    admin.lastLoginIp = getClientIp(req);
    appendAuditLog({
      db,
      actor: admin,
      action: 'SUPER_ADMIN_INITIALIZED',
      category: 'ADMIN',
      targetType: 'admin',
      targetId: admin.id,
      targetLabel: admin.email,
      ip: getClientIp(req),
    });
    saveDb(db);

    const token = signToken(
      { sub: admin.id, role: 'admin', sid: session.sid, tv: 1 },
      db.authSecret
    );
    res.status(201).json({
      token,
      user: sanitizeUser(admin),
      emergencyRecoveryCodes: emergencyBackup.plain,
    });
  });

  app.post('/api/auth/admin/login', async (req: Request, res: Response) => {
    const db = loadDb();
    if (!getSuperAdmin(db) && db.admins.length === 0) {
      res.status(400).json({
        error: 'No Super Admin account exists yet. Create the Super Admin account first.',
      });
      return;
    }

    const loginId = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const ip = getClientIp(req);

    const candidate = findAdminByIdentifier(db, loginId);
    if (!candidate || !verifyPassword(password, candidate.passwordHash)) {
      const matchedStudent = findStudentByIdentifier(db, loginId);
      if (matchedStudent && verifyPassword(password, matchedStudent.passwordHash)) {
        res.status(400).json({
          error:
            'This account is registered under the Student Portal. Switched to Student Portal — please sign in there.',
          wrongPortal: 'student',
        });
        return;
      }
      const attemptInfo = recordLoginAttemptAndCheckBruteForce({
        db,
        email: loginId,
        ip,
        success: false,
        reason: 'Invalid Admin credentials',
      });
      saveDb(db);
      res.status(attemptInfo.isLockedOut ? 429 : 401).json({
        error: attemptInfo.isLockedOut
          ? 'Too many failed login attempts. Suspicious activity logged — please try again later.'
          : 'Invalid Admin ID/email or password.',
      });
      return;
    }

    if (candidate.accountStatus === 'PENDING_APPROVAL') {
      res.status(403).json({
        error:
          'Your admin registration is PENDING APPROVAL by the Main Super Admin. You cannot access the Admin Dashboard until approved and activated.',
      });
      return;
    }
    if (candidate.accountStatus === 'REJECTED') {
      res.status(403).json({
        error: candidate.rejectionReason
          ? `Registration rejected: ${candidate.rejectionReason}`
          : 'Your admin registration request was rejected by the Main Super Admin.',
      });
      return;
    }
    if (candidate.accountStatus === 'APPROVED' && !candidate.active) {
      res.status(403).json({
        error:
          'Your admin registration was approved and is awaiting final activation by the Main Super Admin.',
      });
      return;
    }
    if (candidate.suspended || candidate.accountStatus === 'SUSPENDED') {
      res.status(403).json({
        error: candidate.suspendedReason
          ? `Account suspended: ${candidate.suspendedReason}`
          : 'Your administrator account is suspended.',
      });
      return;
    }
    if (!candidate.active || candidate.accountStatus === 'DEACTIVATED') {
      res.status(403).json({
        error: 'Your administrator account is deactivated. Contact the Main Super Admin.',
      });
      return;
    }

    // Direct password sign-in unless Phone/WhatsApp OTP 2FA is active below
    // Official Phone / WhatsApp Business API 2FA OTP Challenge when configured
    const waCreds = resolveEffectiveWhatsappCredentials(db);
    const waDigits = formatWhatsappDigits(
      candidate.whatsappNumber || candidate.phone || '',
      candidate.countryCode || '+91'
    );
    if (
      (waCreds.cloudApiReady || waCreds.webhookUrl) &&
      (candidate.whatsappVerified || db.settings.enforceWhatsapp2FA) &&
      waDigits.length >= 10
    ) {
      const issued = await issueWhatsappOtpChallenge({
        db,
        purpose: 'LOGIN_2FA',
        deliveryPurpose: 'LOGIN_2FA',
        e164Phone: waDigits,
        userId: candidate.id,
        email: candidate.email,
        recipientName: candidate.name,
        ip,
      });
      saveDb(db);
      if (!issued.ok) {
        res.status(issued.statusCode).json({ error: issued.error });
        return;
      }
      const challengeToken = signToken(
        {
          sub: candidate.id,
          role: 'admin',
          tv: candidate.tokenVersion || 1,
          purpose: 'whatsapp_2fa_challenge',
          extra: issued.challengeId,
        },
        db.authSecret,
        1000 * 60 * 10
      );
      res.json({
        requiresWhatsappOtp: true,
        challengeToken,
        maskedPhone: issued.maskedPhone,
        expiresAt: issued.expiresAt,
        resendAvailableAt: issued.resendAvailableAt,
        userPreview: {
          name: candidate.name,
          email: candidate.email,
          role: 'admin',
          adminRole: getEffectiveAdminRole(candidate as never),
        },
      });
      return;
    }

    const session = createSessionRecord({ db, user: candidate, req });
    candidate.lastLoginAt = new Date().toISOString();
    candidate.lastLoginIp = ip;
    recordLoginAttemptAndCheckBruteForce({
      db,
      email: candidate.email,
      ip,
      success: true,
    });
    appendAuditLog({
      db,
      actor: candidate,
      action: 'ADMIN_LOGIN_SUCCESS',
      category: 'AUTH',
      targetType: 'session',
      targetId: session.sid,
      ip,
    });
    saveDb(db);

    const token = signToken(
      {
        sub: candidate.id,
        role: 'admin',
        sid: session.sid,
        tv: candidate.tokenVersion || 1,
      },
      db.authSecret
    );
    res.json({ token, user: sanitizeUser(candidate) });
  });

  app.post('/api/auth/student/signup', (req: Request, res: Response) => {
    const db = loadDb();
    const name = String(req.body?.name || '').trim();
    const loginId = String(req.body?.email || '').trim().toLowerCase();
    const countryCode = String(req.body?.countryCode || '+91').trim() || '+91';
    const whatsappInput = String(
      req.body?.whatsappNumber || req.body?.phone || ''
    ).trim();
    const confirmWhatsapp = String(req.body?.confirmWhatsappNumber || '').trim();
    const phone = String(req.body?.phone || whatsappInput).trim();
    const state = normalizeIndianState(req.body?.state);
    const password = String(req.body?.password || '');
    const otpChallengeId = String(req.body?.otpChallengeId || '').trim();

    if (!name || !loginId || password.length < 6) {
      res.status(400).json({
        error:
          'Name, Student ID/email, and password (at least 6 characters) are required.',
      });
      return;
    }
    const waDigits = formatWhatsappDigits(whatsappInput, countryCode);
    if (waDigits.length < 10) {
      res.status(400).json({
        error: 'Valid 10-digit WhatsApp / Phone number is required for registration.',
      });
      return;
    }
    if (confirmWhatsapp && formatWhatsappDigits(confirmWhatsapp, countryCode) !== waDigits) {
      res.status(400).json({
        error: 'WhatsApp Number and Confirm WhatsApp Number must match.',
      });
      return;
    }
    if (!state) {
      res.status(400).json({
        error: 'Please select your GST State / UT during registration for automatic GST calculation.',
      });
      return;
    }

    if (
      Boolean(findAdminByEmail(db, loginId)) ||
      db.students.some((s) => s.email === loginId)
    ) {
      res.status(409).json({
        error: 'This ID/email is already registered. Please sign in instead.',
      });
      return;
    }

    const waCreds = resolveEffectiveWhatsappCredentials(db);
    let whatsappVerified = false;
    if (otpChallengeId) {
      const ch = db.otpChallenges.find(
        (c) => c.id === otpChallengeId && c.verified && !c.consumed
      );
      if (!ch || ch.e164Phone !== waDigits) {
        res.status(400).json({
          error: 'Invalid or expired WhatsApp OTP verification. Please verify your WhatsApp number.',
        });
        return;
      }
      ch.consumed = true;
      whatsappVerified = true;
    } else if (waCreds.cloudApiReady || waCreds.webhookUrl) {
      res.status(400).json({
        error:
          'Official WhatsApp verification is enabled. Please verify your WhatsApp number via 6-digit OTP to create your account.',
      });
      return;
    }

    const student: StoredUser = {
      id: uid(),
      name,
      email: loginId,
      phone,
      countryCode,
      whatsappNumber: whatsappInput || phone,
      whatsappVerified,
      ...(whatsappVerified ? { whatsappVerifiedAt: new Date().toISOString() } : {}),
      state,
      passwordHash: hashPassword(password),
      role: 'student',
      active: true,
      suspended: false,
      tokenVersion: 1,
      grantedCourseIds: [],
      createdAt: new Date().toISOString(),
    };
    db.students.push(student);
    const session = createSessionRecord({ db, user: student, req });
    student.lastLoginAt = new Date().toISOString();
    student.lastLoginIp = getClientIp(req);
    saveDb(db);

    const token = signToken(
      { sub: student.id, role: 'student', sid: session.sid, tv: 1 },
      db.authSecret
    );
    res.status(201).json({ token, user: sanitizeUser(student) });
  });

  app.post('/api/auth/student/login', async (req: Request, res: Response) => {
    const db = loadDb();
    const loginId = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const ip = getClientIp(req);

    const student = findStudentByIdentifier(db, loginId);
    if (!student || !verifyPassword(password, student.passwordHash)) {
      const matchedAdmin = findAdminByIdentifier(db, loginId);
      if (matchedAdmin && verifyPassword(password, matchedAdmin.passwordHash)) {
        res.status(400).json({
          error:
            'This account is registered under the Admin Portal. Switched to Admin Portal — please sign in there.',
          wrongPortal: 'admin',
        });
        return;
      }
      recordLoginAttemptAndCheckBruteForce({
        db,
        email: loginId,
        ip,
        success: false,
        reason: 'Invalid student credentials',
      });
      saveDb(db);
      res
        .status(401)
        .json({ error: 'Invalid Student ID/email or password.' });
      return;
    }

    if (!student.active || student.suspended) {
      res.status(403).json({
        error: 'Your student account is disabled or suspended. Contact the administrator.',
      });
      return;
    }

    // Official WhatsApp Business API 2FA OTP Challenge when configured
    const waCreds = resolveEffectiveWhatsappCredentials(db);
    const waDigits = formatWhatsappDigits(
      student.whatsappNumber || student.phone || '',
      student.countryCode || '+91'
    );
    if (
      (waCreds.cloudApiReady || waCreds.webhookUrl) &&
      (student.whatsappVerified || db.settings.enforceWhatsapp2FA) &&
      waDigits.length >= 10
    ) {
      const issued = await issueWhatsappOtpChallenge({
        db,
        purpose: 'LOGIN_2FA',
        deliveryPurpose: 'LOGIN_2FA',
        e164Phone: waDigits,
        userId: student.id,
        email: student.email,
        recipientName: student.name,
        ip,
      });
      saveDb(db);
      if (!issued.ok) {
        res.status(issued.statusCode).json({ error: issued.error });
        return;
      }
      const challengeToken = signToken(
        {
          sub: student.id,
          role: 'student',
          tv: student.tokenVersion || 1,
          purpose: 'whatsapp_2fa_challenge',
          extra: issued.challengeId,
        },
        db.authSecret,
        1000 * 60 * 10
      );
      res.json({
        requiresWhatsappOtp: true,
        challengeToken,
        maskedPhone: issued.maskedPhone,
        expiresAt: issued.expiresAt,
        resendAvailableAt: issued.resendAvailableAt,
        userPreview: {
          name: student.name,
          email: student.email,
          role: 'student',
          adminRole: null,
        },
      });
      return;
    }

    const session = createSessionRecord({ db, user: student, req });
    student.lastLoginAt = new Date().toISOString();
    student.lastLoginIp = ip;
    saveDb(db);

    const token = signToken(
      {
        sub: student.id,
        role: 'student',
        sid: session.sid,
        tv: student.tokenVersion || 1,
      },
      db.authSecret
    );
    res.json({ token, user: sanitizeUser(student) });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: sanitizeUser(req.authUser!) });
  });

  app.patch('/api/profile', requireAuth, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const user = req.authUser!;
    const name = String(req.body?.name || '').trim();
    const newLoginId = String(req.body?.email || '').trim().toLowerCase();
    const phone =
      req.body?.phone !== undefined ? String(req.body.phone || '').trim() : undefined;
    const state =
      req.body?.state !== undefined ? normalizeIndianState(req.body.state) : undefined;
    const guardianName =
      req.body?.guardianName !== undefined
        ? String(req.body.guardianName || '').trim()
        : undefined;
    const address =
      req.body?.address !== undefined ? String(req.body.address || '').trim() : undefined;
    const city =
      req.body?.city !== undefined ? String(req.body.city || '').trim() : undefined;
    const pincode =
      req.body?.pincode !== undefined ? String(req.body.pincode || '').trim() : undefined;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const recoveryPin =
      req.body?.recoveryPin !== undefined
        ? String(req.body.recoveryPin || '').trim()
        : undefined;

    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (state !== undefined) user.state = state;
    if (guardianName !== undefined) user.guardianName = guardianName;
    if (address !== undefined) user.address = address;
    if (city !== undefined) user.city = city;
    if (pincode !== undefined) user.pincode = pincode;

    // Only Super Admin may change their own login ID directly
    if (isSuperAdmin(user as never) && newLoginId && newLoginId !== user.email) {
      if (
        db.students.some((s) => s.email === newLoginId) ||
        db.admins.some((a) => a.id !== user.id && a.email === newLoginId)
      ) {
        res
          .status(409)
          .json({ error: 'That ID/email is already used by another user.' });
        return;
      }
      user.email = newLoginId;
    }

    if (recoveryPin !== undefined && recoveryPin !== '') {
      if (recoveryPin.length < 4) {
        res.status(400).json({
          error: 'Security Recovery PIN must be at least 4 characters.',
        });
        return;
      }
      user.recoveryPinHash = hashPassword(recoveryPin);
    }

    if (newPassword) {
      const minLen = user.role === 'admin' ? 8 : 6;
      if (!verifyPassword(currentPassword, user.passwordHash)) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
      }
      if (newPassword.length < minLen) {
        res.status(400).json({
          error: `New password must be at least ${minLen} characters.`,
        });
        return;
      }
      user.passwordHash = hashPassword(newPassword);
      user.mustChangePassword = false;
      appendAuditLog({
        db,
        actor: user,
        action: 'SELF_PASSWORD_CHANGED',
        category: 'SECURITY',
        targetType: user.role,
        targetId: user.id,
        targetLabel: user.email,
        ip: getClientIp(req),
      });
    }

    saveDb(db);
    res.json({ user: sanitizeUser(user) });
  });

  // ---- PORTAL SYNC STATE (STRICT FINANCIAL & COURSE SCOPING) ----
  app.get('/api/portal/state', requireAuth, (req: AuthedRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const db = loadDb();
    const user = req.authUser!;
    const mode = getAccessMode(user);

    if (mode === 'super_admin') {
      res.json({
        user: sanitizeUser(user),
        users: [...db.admins.map(sanitizeUser), ...db.students.map(sanitizeUser)],
        courses: db.courses,
        orders: db.orders,
        coupons: db.coupons,
        bundles: db.bundles,
        methods: db.methods,
        settings: getSafePortalSettings(db, 'super_admin'),
        announcement: db.announcement,
        liveClass: db.liveClass || null,
        welcomeVideo: db.welcomeVideo,
        platformLinks: db.platformLinks,
        certificates: db.certificates || [],
        progress: db.progress,
        quizAttempts: db.quizAttempts || [],
        assignmentSubmissions: db.assignmentSubmissions || [],
      });
      return;
    }

    if (mode === 'sub_admin') {
      // Scope courses to assignedCourseIds, plus reviewable/publishable courses when permitted; strictly zero financial exposure!
      const canReviewOrPublish =
        hasPermission(user as never, 'content_approve') ||
        hasPermission(user as never, 'course_publish');
      const scopedCourses = db.courses.filter(
        (c) => canReviewOrPublish || canAccessCourse(user as never, c.id)
      );
      const canSeeStudents =
        hasPermission(user as never, 'student_view') ||
        hasPermission(user as never, 'student_manage') ||
        hasPermission(user as never, 'student_support_manage');
      const canSeeCerts =
        hasPermission(user as never, 'certificate_verify') ||
        hasPermission(user as never, 'certificate_approve');
      const adminList = hasPermission(user as never, 'admin_manage')
        ? db.admins.map(sanitizeUser)
        : [sanitizeUser(user)];

      res.json({
        user: sanitizeUser(user),
        users: [
          ...adminList,
          ...(canSeeStudents ? db.students.map(sanitizeUser) : []),
        ],
        courses: scopedCourses,
        // STRICT FINANCIAL ISOLATION: Zero orders, coupons, payment methods, or financial info
        orders: [],
        coupons: [],
        bundles: [],
        methods: [],
        settings: getSafePortalSettings(db, 'sub_admin'),
        announcement: db.announcement,
        liveClass: db.liveClass || null,
        welcomeVideo: db.welcomeVideo,
        platformLinks: db.platformLinks,
        certificates: canSeeCerts ? db.certificates || [] : [],
        progress: canSeeStudents ? db.progress : {},
        quizAttempts: (db.quizAttempts || []).filter(
          (q) => canReviewOrPublish || canAccessCourse(user as never, q.courseId)
        ),
        assignmentSubmissions: (db.assignmentSubmissions || []).filter(
          (s) => canReviewOrPublish || canAccessCourse(user as never, s.courseId)
        ),
      });
      return;
    }

    // Student view: strictly PUBLISHED (visibility === 'published') or already unlocked courses
    const unlockedIds = getStudentUnlockedCourseIds(user, db.orders);
    const studentCourses: Course[] = db.courses
      .filter(
        (c) =>
          getCourseApprovalStatus(c) === 'PUBLISHED' ||
          c.visibility === 'published' ||
          unlockedIds.has(c.id)
      )
      .map((c) => {
        if (unlockedIds.has(c.id)) return c;
        return {
          ...c,
          chapters: (c.chapters || []).map((ch) => ({
            ...ch,
            lessons: (ch.lessons || []).map((l) => ({
              id: l.id,
              title: l.title,
              url: '',
              notes: '',
              file: '',
            })),
          })),
          quizzes: [],
          assignments: [],
        };
      });

    const studentOrders = db.orders.filter((o) => o.userId === user.id);
    const studentProgress: Record<string, number> = {};
    const prefix = `${user.id}_`;
    for (const [key, val] of Object.entries(db.progress)) {
      if (key.startsWith(prefix)) {
        studentProgress[key] = val;
      }
    }

    const studentVisibleLiveClass =
      db.liveClass && db.liveClass.active && db.liveClass.meetingUrl.trim()
        ? db.liveClass
        : null;

    const visibleCourseIds = new Set(studentCourses.map((c) => c.id));
    const studentBundles = db.bundles.filter(
      (b) =>
        b.courseIds.length >= 2 &&
        b.courseIds.every((cid) => visibleCourseIds.has(cid))
    );

    const studentVisibleAnnouncement =
      db.announcement && db.announcement.active ? db.announcement : null;

    const studentVisiblePlatformLinks = {
      ...db.platformLinks,
      links: (db.platformLinks.links || []).filter(
        (l) => l.active && Boolean(l.url.trim())
      ),
    };

    res.json({
      user: sanitizeUser(user),
      users: [sanitizeUser(user)],
      courses: studentCourses,
      orders: studentOrders,
      coupons: [],
      bundles: studentBundles,
      methods: db.methods.filter((m) => m.active),
      settings: getSafePortalSettings(db, 'student'),
      announcement: studentVisibleAnnouncement,
      liveClass: studentVisibleLiveClass,
      welcomeVideo: db.welcomeVideo,
      platformLinks: studentVisiblePlatformLinks,
      certificates: (db.certificates || []).filter((c) => c.studentId === user.id),
      progress: studentProgress,
      quizAttempts: (db.quizAttempts || []).filter((q) => q.studentId === user.id),
      assignmentSubmissions: (db.assignmentSubmissions || []).filter(
        (s) => s.studentId === user.id
      ),
    });
  });

  // ---- ADMIN: COURSES & CURRICULUM (RBAC + COURSE SCOPED + VERSION SNAPSHOTS) ----
  app.post('/api/admin/seed-sample', requireSuperAdmin, (_req, res) => {
    const db = loadDb();
    if (db.courses.length === 0) {
      const sample = createSampleCatalog();
      db.courses = sample.courses.map((c) => ({
        ...c,
        approvalStatus: c.visibility === 'published' ? 'PUBLISHED' : 'DRAFT',
        approvalHistory: [],
        quizzes: [],
        assignments: [],
      }));
      if (db.bundles.length === 0) db.bundles = sample.bundles;
      if (db.coupons.length === 0) db.coupons = sample.coupons;
      saveDb(db);
    }
    res.json({ ok: true });
  });

  app.post(
    '/api/admin/courses',
    requirePermission('course_create'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const title = String(req.body?.title || '').trim();
      if (!title) {
        res.status(400).json({ error: 'Course title is required.' });
        return;
      }
      const thumbCheck = validateSafeMediaUrlOrDataUrl(
        String(req.body?.thumbnailUrl || ''),
        ['image', 'http']
      );
      if (!thumbCheck.valid) {
        res.status(400).json({ error: thumbCheck.error });
        return;
      }

      const requestedPublish = req.body?.visibility === 'published';
      const canPublishDirect =
        isSuperAdmin(actor as never) || hasPermission(actor as never, 'course_publish');
      const approvalStatus: CourseApprovalStatus =
        requestedPublish && canPublishDirect ? 'PUBLISHED' : 'DRAFT';

      const course: Course = {
        id: uid(),
        title,
        category: String(req.body?.category || '').trim(),
        description: String(req.body?.description || '').trim(),
        thumbnailUrl: thumbCheck.value,
        price: isSuperAdmin(actor as never)
          ? Math.max(0, Number(req.body?.price) || 0)
          : 0,
        paymentPlans: isSuperAdmin(actor as never)
          ? sanitizePaymentPlans(req.body?.paymentPlans)
          : [],
        ...(isSuperAdmin(actor as never) && req.body?.certificateConfig !== undefined
          ? { certificateConfig: sanitizeCertificateConfig(req.body.certificateConfig) }
          : {}),
        visibility: approvalStatus === 'PUBLISHED' ? 'published' : 'draft',
        approvalStatus,
        createdById: actor.id,
        createdByName: actor.name,
        updatedAt: new Date().toISOString(),
        approvalHistory: [
          {
            id: uid(),
            status: approvalStatus,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: getEffectiveAdminRole(actor as never) || 'ADMIN',
            note: 'Course created',
            timestamp: new Date().toISOString(),
          },
        ],
        chapters: [],
        quizzes: [],
        assignments: [],
      };
      db.courses.unshift(course);

      // Automatically assign creator if sub-admin so they can manage their newly created course
      if (!isSuperAdmin(actor as never)) {
        actor.assignedCourseIds = Array.from(
          new Set([...(actor.assignedCourseIds || []), course.id])
        );
      }

      appendAuditLog({
        db,
        actor,
        action: 'COURSE_CREATED',
        category: 'COURSE',
        targetType: 'course',
        targetId: course.id,
        targetLabel: course.title,
        courseId: course.id,
        updatedValue: { approvalStatus },
        ip: getClientIp(req),
      });
      saveDb(db);
      res.status(201).json({ course });
    }
  );

  app.put(
    '/api/admin/courses/:id',
    requireCourseAccess('course_edit'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const title = String(req.body?.title || '').trim();
      if (!title) {
        res.status(400).json({ error: 'Course title is required.' });
        return;
      }
      if (req.body?.thumbnailUrl !== undefined) {
        const thumbCheck = validateSafeMediaUrlOrDataUrl(
          String(req.body.thumbnailUrl || ''),
          ['image', 'http']
        );
        if (!thumbCheck.valid) {
          res.status(400).json({ error: thumbCheck.error });
          return;
        }
        course.thumbnailUrl = thumbCheck.value;
      }

      snapshotCourseVersion({
        db,
        course,
        editor: actor,
        summary: `Updated details for "${title}"`,
      });

      course.title = title;
      course.category = String(req.body?.category || '').trim();
      course.description = String(req.body?.description || '').trim();
      course.updatedAt = new Date().toISOString();

      // Strictly lock Pricing & Certificate Templates to Super Admin
      if (isSuperAdmin(actor as never)) {
        course.price = Math.max(0, Number(req.body?.price) || 0);
        if (req.body?.paymentPlans !== undefined) {
          course.paymentPlans = sanitizePaymentPlans(req.body.paymentPlans);
        }
        if (req.body?.certificateConfig !== undefined) {
          course.certificateConfig = sanitizeCertificateConfig(req.body.certificateConfig);
        }
      }

      if (req.body?.visibility === 'published') {
        if (
          isSuperAdmin(actor as never) ||
          hasPermission(actor as never, 'course_publish', course.id)
        ) {
          course.visibility = 'published';
          course.approvalStatus = 'PUBLISHED';
        }
      } else if (req.body?.visibility === 'draft') {
        course.visibility = 'draft';
        if (course.approvalStatus === 'PUBLISHED') {
          course.approvalStatus = 'DRAFT';
        }
      }

      appendAuditLog({
        db,
        actor,
        action: 'COURSE_UPDATED',
        category: 'COURSE',
        targetType: 'course',
        targetId: course.id,
        targetLabel: course.title,
        courseId: course.id,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ course });
    }
  );

  app.delete(
    '/api/admin/courses/:id',
    requireCourseAccess('course_delete'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const target = db.courses.find((c) => c.id === req.params.id);
      if (target) {
        snapshotCourseVersion({
          db,
          course: target,
          editor: req.authUser!,
          summary: 'Backup prior to course deletion',
        });
        appendAuditLog({
          db,
          actor: req.authUser!,
          action: 'COURSE_DELETED',
          category: 'COURSE',
          targetType: 'course',
          targetId: target.id,
          targetLabel: target.title,
          courseId: target.id,
          ip: getClientIp(req),
        });
      }
      db.courses = db.courses.filter((c) => c.id !== req.params.id);
      db.bundles = db.bundles.map((b) => ({
        ...b,
        courseIds: b.courseIds.filter((cid) => cid !== req.params.id),
      }));
      saveDb(db);
      res.json({ ok: true });
    }
  );

  app.post(
    '/api/admin/courses/:id/chapters',
    requireCourseAccess('module_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const title = String(req.body?.title || '').trim();
      if (!title) {
        res.status(400).json({ error: 'Chapter title is required.' });
        return;
      }
      snapshotCourseVersion({
        db,
        course,
        editor: req.authUser!,
        summary: `Added module "${title}"`,
      });
      const chapter = { id: uid(), title, lessons: [] };
      course.chapters.push(chapter);
      course.updatedAt = new Date().toISOString();
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'CHAPTER_ADDED',
        category: 'COURSE',
        targetType: 'chapter',
        targetId: chapter.id,
        targetLabel: `${course.title} · ${chapter.title}`,
        courseId: course.id,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.status(201).json({ chapter });
    }
  );

  app.put(
    '/api/admin/courses/:id/chapters/:chapterId',
    requireCourseAccess('module_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const course = db.courses.find((c) => c.id === req.params.id);
      const chapter = course?.chapters.find(
        (ch) => ch.id === req.params.chapterId
      );
      if (!course || !chapter) {
        res.status(404).json({ error: 'Chapter not found.' });
        return;
      }
      const title = String(req.body?.title || '').trim();
      if (!title) {
        res.status(400).json({ error: 'Chapter title is required.' });
        return;
      }
      snapshotCourseVersion({
        db,
        course,
        editor: req.authUser!,
        summary: `Renamed module "${chapter.title}" -> "${title}"`,
      });
      chapter.title = title;
      course.updatedAt = new Date().toISOString();
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'CHAPTER_UPDATED',
        category: 'COURSE',
        targetType: 'chapter',
        targetId: chapter.id,
        targetLabel: `${course.title} · ${title}`,
        courseId: course.id,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ chapter });
    }
  );

  app.delete(
    '/api/admin/courses/:id/chapters/:chapterId',
    requireCourseAccess('module_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const course = db.courses.find((c) => c.id === req.params.id);
      if (course) {
        snapshotCourseVersion({
          db,
          course,
          editor: req.authUser!,
          summary: 'Removed chapter',
        });
        course.chapters = course.chapters.filter(
          (ch) => ch.id !== req.params.chapterId
        );
        course.updatedAt = new Date().toISOString();
        appendAuditLog({
          db,
          actor: req.authUser!,
          action: 'CHAPTER_DELETED',
          category: 'COURSE',
          targetType: 'chapter',
          targetId: req.params.chapterId,
          courseId: course.id,
          ip: getClientIp(req),
        });
        saveDb(db);
      }
      res.json({ ok: true });
    }
  );

  app.post(
    '/api/admin/courses/:id/chapters/:chapterId/lessons',
    requireCourseAccess('lesson_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      const chapter = course?.chapters.find(
        (ch) => ch.id === req.params.chapterId
      );
      if (!course || !chapter) {
        res.status(404).json({ error: 'Chapter not found.' });
        return;
      }
      const title = String(req.body?.title || '').trim();
      const url = normalizeVideoUrl(String(req.body?.url || ''));
      const fileRaw = String(req.body?.file || '').trim();

      if (url && !hasPermission(actor as never, 'video_upload', course.id)) {
        res.status(403).json({ error: 'Permission "video_upload" is required to add video URLs.' });
        return;
      }
      if (fileRaw && !hasPermission(actor as never, 'pdf_upload', course.id)) {
        res.status(403).json({ error: 'Permission "pdf_upload" is required to attach PDFs or study materials.' });
        return;
      }
      const fileCheck = validateSafeMediaUrlOrDataUrl(fileRaw, ['pdf', 'image', 'http']);
      if (!fileCheck.valid) {
        res.status(400).json({ error: fileCheck.error });
        return;
      }

      const notes = String(req.body?.notes || '').trim();
      if (!title || (!url && !notes && !fileCheck.value)) {
        res.status(400).json({
          error: 'Lesson title and at least a video URL, study notes, or material link are required.',
        });
        return;
      }
      snapshotCourseVersion({
        db,
        course,
        editor: actor,
        summary: `Added lesson "${title}"`,
      });
      const lesson = {
        id: uid(),
        title,
        url,
        notes,
        file: fileCheck.value,
      };
      chapter.lessons.push(lesson);
      course.updatedAt = new Date().toISOString();
      appendAuditLog({
        db,
        actor,
        action: 'LESSON_ADDED',
        category: 'COURSE',
        targetType: 'lesson',
        targetId: lesson.id,
        targetLabel: `${course.title} · ${lesson.title}`,
        courseId: course.id,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.status(201).json({ lesson });
    }
  );

  app.put(
    '/api/admin/courses/:id/chapters/:chapterId/lessons/:lessonId',
    requireCourseAccess('lesson_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      const chapter = course?.chapters.find(
        (ch) => ch.id === req.params.chapterId
      );
      const lesson = chapter?.lessons.find(
        (l) => l.id === req.params.lessonId
      );
      if (!course || !lesson) {
        res.status(404).json({ error: 'Lesson not found.' });
        return;
      }

      const nextUrl =
        req.body?.url !== undefined ? normalizeVideoUrl(String(req.body.url)) : lesson.url;
      if (nextUrl !== lesson.url && !hasPermission(actor as never, 'video_upload', course.id)) {
        res.status(403).json({ error: 'Permission "video_upload" is required to modify video URL.' });
        return;
      }
      const nextFileRaw =
        req.body?.file !== undefined ? String(req.body.file || '').trim() : lesson.file || '';
      if (nextFileRaw !== (lesson.file || '') && !hasPermission(actor as never, 'pdf_upload', course.id)) {
        res.status(403).json({ error: 'Permission "pdf_upload" is required to modify PDF/study files.' });
        return;
      }
      const fileCheck = validateSafeMediaUrlOrDataUrl(nextFileRaw, ['pdf', 'image', 'http']);
      if (!fileCheck.valid) {
        res.status(400).json({ error: fileCheck.error });
        return;
      }

      const nextTitle = String(req.body?.title || lesson.title).trim();
      const nextNotes =
        req.body?.notes !== undefined ? String(req.body.notes || '').trim() : lesson.notes || '';
      if (!nextTitle || (!nextUrl && !nextNotes && !fileCheck.value)) {
        res.status(400).json({
          error: 'Lesson title and at least a video URL, study notes, or material link are required.',
        });
        return;
      }

      snapshotCourseVersion({
        db,
        course,
        editor: actor,
        summary: `Updated lesson "${lesson.title}"`,
      });
      lesson.title = nextTitle;
      lesson.url = nextUrl;
      lesson.notes = nextNotes;
      lesson.file = fileCheck.value;
      course.updatedAt = new Date().toISOString();
      appendAuditLog({
        db,
        actor,
        action: 'LESSON_UPDATED',
        category: 'COURSE',
        targetType: 'lesson',
        targetId: lesson.id,
        targetLabel: `${course.title} · ${lesson.title}`,
        courseId: course.id,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ lesson });
    }
  );

  app.delete(
    '/api/admin/courses/:id/chapters/:chapterId/lessons/:lessonId',
    requireCourseAccess('lesson_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const course = db.courses.find((c) => c.id === req.params.id);
      const chapter = course?.chapters.find(
        (ch) => ch.id === req.params.chapterId
      );
      if (course && chapter) {
        snapshotCourseVersion({
          db,
          course,
          editor: req.authUser!,
          summary: 'Deleted lesson',
        });
        chapter.lessons = chapter.lessons.filter(
          (l) => l.id !== req.params.lessonId
        );
        course.updatedAt = new Date().toISOString();
        appendAuditLog({
          db,
          actor: req.authUser!,
          action: 'LESSON_DELETED',
          category: 'COURSE',
          targetType: 'lesson',
          targetId: req.params.lessonId,
          courseId: course.id,
          ip: getClientIp(req),
        });
        saveDb(db);
      }
      res.json({ ok: true });
    }
  );

  // ---- ADMIN: STUDENTS & DIRECT ACCESS CONTROL (RBAC) ----
  app.post(
    '/api/admin/students',
    requirePermission('student_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const name = String(req.body?.name || '').trim();
      const loginId = String(req.body?.email || '').trim().toLowerCase();
      const phone = String(req.body?.phone || '').trim();
      const state = normalizeIndianState(req.body?.state);
      const password = String(req.body?.password || '');

      if (!name || !loginId || password.length < 6) {
        res.status(400).json({
          error: 'Name, ID/email, and password (min 6 chars) are required.',
        });
        return;
      }

      if (
        Boolean(findAdminByEmail(db, loginId)) ||
        db.students.some((s) => s.email === loginId)
      ) {
        res
          .status(409)
          .json({ error: 'A user with this ID/email already exists.' });
        return;
      }

      const student: StoredUser = {
        id: uid(),
        name,
        email: loginId,
        phone,
        countryCode: '+91',
        whatsappNumber: phone,
        state,
        passwordHash: hashPassword(password),
        role: 'student',
        active: true,
        suspended: false,
        tokenVersion: 1,
        grantedCourseIds: [],
        createdAt: new Date().toISOString(),
      };
      db.students.push(student);
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'STUDENT_CREATED',
        category: 'STUDENT',
        targetType: 'student',
        targetId: student.id,
        targetLabel: student.email,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.status(201).json({ student: sanitizeUser(student) });
    }
  );

  app.patch(
    '/api/admin/students/:id/toggle',
    requirePermission('student_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const student = db.students.find((s) => s.id === req.params.id);
      if (!student) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      const prevActive = student.active;
      student.active = !student.active;
      if (!student.active) {
        student.tokenVersion = (student.tokenVersion || 1) + 1;
      }
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: student.active ? 'STUDENT_ENABLED' : 'STUDENT_DISABLED',
        category: 'STUDENT',
        targetType: 'student',
        targetId: student.id,
        targetLabel: student.email,
        previousValue: { active: prevActive },
        updatedValue: { active: student.active },
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ student: sanitizeUser(student) });
    }
  );

  app.put(
    '/api/admin/students/:id/access',
    requirePermission('student_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const student = db.students.find((s) => s.id === req.params.id);
      if (!student) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      const prevIds = [...(student.grantedCourseIds || [])];
      const courseIds = Array.isArray(req.body?.courseIds)
        ? req.body.courseIds.filter((x: unknown) => typeof x === 'string')
        : [];
      // Non-Super-Admins can only grant/revoke courses they are assigned to!
      if (!isSuperAdmin(actor as never)) {
        const added = courseIds.filter((id: string) => !prevIds.includes(id));
        const removed = prevIds.filter((id: string) => !courseIds.includes(id));
        if ([...added, ...removed].some((cid) => !canAccessCourse(actor as never, cid))) {
          res.status(403).json({
            error: 'You can only manage student enrollment for courses assigned to you.',
          });
          return;
        }
      }
      student.grantedCourseIds = Array.from(new Set(courseIds));
      appendAuditLog({
        db,
        actor,
        action: 'STUDENT_COURSE_ACCESS_UPDATED',
        category: 'STUDENT',
        targetType: 'student',
        targetId: student.id,
        targetLabel: student.email,
        previousValue: prevIds,
        updatedValue: student.grantedCourseIds,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ student: sanitizeUser(student) });
    }
  );

  // ---- STRICTLY SUPER ADMIN ONLY: FINANCIALS, ORDERS, COUPONS, BUNDLES, PAYMENT METHODS ----
  app.post(
    '/api/admin/orders/:id/approve',
    requireSuperAdmin,
    async (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const order = db.orders.find((o) => o.id === req.params.id);
      if (!order) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }

      const now = new Date();
      order.status = 'PAID';
      order.verificationStatus = 'verified';
      order.verifiedAt = now.toISOString();
      order.verifiedBy = req.authUser?.email || 'super-admin';
      order.verificationNote = `Verified & approved by Super Admin (${order.verifiedBy}).`;
      order.paidAt = now.toISOString();
      if (!order.invoiceNumber) {
        const meta = getNextInvoiceMeta(db.orders);
        order.invoiceNumber = meta.invoiceNumber;
        order.invoiceSerial = meta.serial;
      } else if (!order.invoiceSerial) {
        const m = order.invoiceNumber.match(/(\d+)$/);
        if (m) order.invoiceSerial = Number(m[1]) || undefined;
      }
      if (order.planMonths && order.planMonths > 0) {
        const exp = new Date(now);
        exp.setMonth(exp.getMonth() + order.planMonths);
        order.expiresAt = exp.toISOString();
      }
      const student = db.students.find((s) => s.id === order.userId);
      const methodObj = db.methods.find((m) => m.id === order.method);
      if (student) {
        order.buyerName = order.buyerName || student.name;
        order.buyerEmail = order.buyerEmail || student.email;
        order.buyerPhone = order.buyerPhone || student.phone || '';
        order.buyerState = order.buyerState || student.state || '';
        order.sellerState =
          order.sellerState ||
          db.settings.gstState ||
          detectStateFromGstin(db.settings.gstNumber) ||
          '';
        order.supplyType =
          order.supplyType ||
          (order.gstSplit === 'igst' ? 'inter_state' : 'intra_state');
        await dispatchOrderNotifications({
          db,
          order,
          student,
          methodName: methodObj?.name || order.method,
        });
      }
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'ORDER_APPROVED',
        category: 'FINANCE',
        targetType: 'order',
        targetId: order.id,
        targetLabel: `${order.invoiceNumber || order.id} · ₹${order.total}`,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ order });
    }
  );

  app.post(
    '/api/admin/orders/:id/reject',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const order = db.orders.find((o) => o.id === req.params.id);
      if (!order) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      order.status = 'REJECTED';
      order.verificationStatus = 'rejected';
      order.verifiedAt = new Date().toISOString();
      order.verifiedBy = req.authUser?.email || 'super-admin';
      order.verificationNote =
        String(req.body?.reason || '').trim() ||
        'Payment could not be verified by Super Admin.';
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'ORDER_REJECTED',
        category: 'FINANCE',
        targetType: 'order',
        targetId: order.id,
        targetLabel: order.id,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ order });
    }
  );

  app.post('/api/admin/coupons', requireSuperAdmin, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'Coupon code is required.' });
      return;
    }
    const coupon: Coupon = {
      id: uid(),
      code,
      type: req.body?.type === 'flat' ? 'flat' : 'percent',
      value: Math.max(1, Number(req.body?.value) || 0),
      min: Math.max(0, Number(req.body?.min) || 0),
      active: true,
    };
    db.coupons = [...db.coupons.filter((c) => c.code !== code), coupon];
    appendAuditLog({
      db,
      actor: req.authUser!,
      action: 'COUPON_SAVED',
      category: 'FINANCE',
      targetType: 'coupon',
      targetLabel: code,
      ip: getClientIp(req),
    });
    saveDb(db);
    res.status(201).json({ coupon });
  });

  app.patch(
    '/api/admin/coupons/:id/toggle',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const coupon = db.coupons.find((c) => c.id === req.params.id);
      if (!coupon) {
        res.status(404).json({ error: 'Coupon not found.' });
        return;
      }
      coupon.active = !coupon.active;
      saveDb(db);
      res.json({ coupon });
    }
  );

  app.delete('/api/admin/coupons/:id', requireSuperAdmin, (req, res) => {
    const db = loadDb();
    db.coupons = db.coupons.filter((c) => c.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  app.post('/api/admin/bundles', requireSuperAdmin, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const name = String(req.body?.name || '').trim();
    const courseIds = Array.isArray(req.body?.courseIds)
      ? req.body.courseIds.filter((x: unknown) => typeof x === 'string')
      : [];
    if (!name || courseIds.length < 2) {
      res.status(400).json({
        error: 'Bundle name and at least 2 courses are required.',
      });
      return;
    }
    const bundle: Bundle = {
      id: uid(),
      name,
      courseIds,
      price: Math.max(0, Number(req.body?.price) || 0),
      thumbnailUrl: String(req.body?.thumbnailUrl || '').trim(),
      ...(req.body?.certificateConfig !== undefined
        ? { certificateConfig: sanitizeCertificateConfig(req.body.certificateConfig) }
        : {}),
    };
    db.bundles.push(bundle);
    appendAuditLog({
      db,
      actor: req.authUser!,
      action: 'BUNDLE_CREATED',
      category: 'FINANCE',
      targetType: 'bundle',
      targetId: bundle.id,
      targetLabel: bundle.name,
      ip: getClientIp(req),
    });
    saveDb(db);
    res.status(201).json({ bundle });
  });

  app.put('/api/admin/bundles/:id', requireSuperAdmin, (req, res) => {
    const db = loadDb();
    const bundle = db.bundles.find((b) => b.id === req.params.id);
    if (!bundle) {
      res.status(404).json({ error: 'Bundle not found.' });
      return;
    }
    if (req.body?.name !== undefined) {
      const n = String(req.body.name || '').trim();
      if (!n) {
        res.status(400).json({ error: 'Bundle name is required.' });
        return;
      }
      bundle.name = n;
    }
    if (Array.isArray(req.body?.courseIds)) {
      const ids = req.body.courseIds.filter((x: unknown) => typeof x === 'string');
      if (ids.length >= 2) bundle.courseIds = ids;
    }
    if (req.body?.price !== undefined) {
      bundle.price = Math.max(0, Number(req.body.price) || 0);
    }
    if (req.body?.thumbnailUrl !== undefined) {
      bundle.thumbnailUrl = String(req.body.thumbnailUrl || '').trim();
    }
    if (req.body?.certificateConfig !== undefined) {
      bundle.certificateConfig = sanitizeCertificateConfig(req.body.certificateConfig);
    }
    saveDb(db);
    res.json({ bundle });
  });

  app.delete('/api/admin/bundles/:id', requireSuperAdmin, (req, res) => {
    const db = loadDb();
    db.bundles = db.bundles.filter((b) => b.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  // ---- SUPER ADMIN: CUSTOM CERTIFICATES & SETTINGS ----
  app.post('/api/admin/certificates', requireSuperAdmin, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const studentId = String(req.body?.studentId || '').trim();
    const targetType = req.body?.targetType === 'bundle' ? 'bundle' : 'course';
    const targetId = String(req.body?.targetId || '').trim();
    const student = db.students.find((s) => s.id === studentId);
    if (!student) {
      res.status(404).json({ error: 'Selected student not found.' });
      return;
    }
    const targetObj =
      targetType === 'bundle'
        ? db.bundles.find((b) => b.id === targetId)
        : db.courses.find((c) => c.id === targetId);
    if (!targetObj) {
      res.status(404).json({ error: 'Selected course or bundle not found.' });
      return;
    }
    const targetTitle =
      targetType === 'bundle'
        ? (targetObj as Bundle).name
        : (targetObj as Course).title;
    const mode = req.body?.mode === 'uploaded' ? 'uploaded' : 'template';
    const fileUrl = String(req.body?.fileUrl || '').trim();
    if (mode === 'uploaded' && !fileUrl) {
      res.status(400).json({ error: 'Please upload or provide a certificate file.' });
      return;
    }
    if (fileUrl) {
      const check = validateSafeMediaUrlOrDataUrl(fileUrl, ['image', 'pdf', 'http']);
      if (!check.valid) {
        res.status(400).json({ error: check.error });
        return;
      }
    }

    const existing = db.certificates.find(
      (c) =>
        c.studentId === studentId &&
        c.targetType === targetType &&
        c.targetId === targetId
    );
    const certNo =
      String(req.body?.certificateNo || '').trim() ||
      existing?.certificateNo ||
      `ATP-CERT-${new Date().getFullYear()}-${String((db.certificates?.length || 0) + 1).padStart(4, '0')}`;
    const record: CustomCertificateRecord = {
      id: existing?.id || uid(),
      studentId,
      targetType,
      targetId,
      targetTitle: String(req.body?.targetTitle || '').trim() || targetTitle,
      certificateNo: certNo,
      issuedDate:
        String(req.body?.issuedDate || '').trim() ||
        new Date().toISOString().slice(0, 10),
      mode,
      fileUrl: mode === 'uploaded' ? fileUrl : '',
      fileName: String(req.body?.fileName || '').trim(),
      customHeading: String(req.body?.customHeading || '').trim(),
      customSubtitle: String(req.body?.customSubtitle || '').trim(),
      notes: String(req.body?.notes || '').trim(),
      status: 'ACTIVE',
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      db.certificates = db.certificates.map((c) =>
        c.id === existing.id ? record : c
      );
    } else {
      db.certificates.unshift(record);
    }

    appendAuditLog({
      db,
      actor: req.authUser!,
      action: 'CERTIFICATE_ISSUED',
      category: 'CERTIFICATE',
      targetType: 'certificate',
      targetId: record.id,
      targetLabel: `${record.certificateNo} -> ${student.name}`,
      ip: getClientIp(req),
    });
    pushNotification({
      db,
      recipientUserId: student.id,
      type: 'CERTIFICATE',
      title: 'Certificate Issued',
      message: `Your certificate (${record.certificateNo}) for "${record.targetTitle}" is ready in My Certificates.`,
      actionPage: 'certificates',
    });

    saveDb(db);
    res.status(201).json({ certificate: record });
  });

  app.delete('/api/admin/certificates/:id', requireSuperAdmin, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    db.certificates = (db.certificates || []).filter(
      (c) => c.id !== req.params.id
    );
    appendAuditLog({
      db,
      actor: req.authUser!,
      action: 'CUSTOM_CERTIFICATE_REMOVED',
      category: 'CERTIFICATE',
      targetType: 'certificate',
      targetId: req.params.id,
      ip: getClientIp(req),
    });
    saveDb(db);
    res.json({ ok: true });
  });

  app.put('/api/admin/settings', requireSuperAdmin, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const body = req.body || {};
    const nextGstNumber = String(body.gstNumber ?? db.settings.gstNumber ?? '')
      .trim()
      .toUpperCase();
    const rawGstState =
      body.gstState !== undefined
        ? normalizeIndianState(body.gstState)
        : normalizeIndianState(db.settings.gstState);
    const nextGstState =
      rawGstState || detectStateFromGstin(nextGstNumber) || 'West Bengal';

    let nextStateRates: Record<string, number> = {
      ...(db.settings.stateGstRates || {}),
    };
    if (body.stateGstRates && typeof body.stateGstRates === 'object') {
      const cleanedRates: Record<string, number> = {};
      for (const [k, v] of Object.entries(
        body.stateGstRates as Record<string, unknown>
      )) {
        const normState = normalizeIndianState(k);
        const rateNum = Number(v);
        if (normState && Number.isFinite(rateNum) && rateNum >= 0 && rateNum <= 100) {
          cleanedRates[normState] = Math.round(rateNum * 100) / 100;
        }
      }
      nextStateRates = cleanedRates;
    }

    db.settings = {
      brand: String(body.brand ?? db.settings.brand).trim() || 'ARYA TAX PATHSHALA',
      gst:
        body.gst !== undefined
          ? Math.min(100, Math.max(0, Number(body.gst) || 0))
          : db.settings.gst,
      gstMode:
        body.gstMode === 'inclusive' || body.gstMode === 'exclusive'
          ? body.gstMode
          : db.settings.gstMode,
      gstSection: String(body.gstSection ?? db.settings.gstSection ?? '').trim(),
      sacCode: String(body.sacCode ?? db.settings.sacCode ?? '999293').trim(),
      gstNumber: nextGstNumber,
      gstState: nextGstState,
      autoGstByState:
        body.autoGstByState !== undefined
          ? Boolean(body.autoGstByState)
          : db.settings.autoGstByState !== false,
      stateGstRates: nextStateRates,
      gstSplit:
        body.gstSplit === 'igst' || body.gstSplit === 'cgst_sgst'
          ? body.gstSplit
          : db.settings.gstSplit,
      instantActivation:
        body.instantActivation !== undefined
          ? Boolean(body.instantActivation)
          : db.settings.instantActivation,
      threshold:
        body.threshold !== undefined
          ? Math.min(100, Math.max(1, Number(body.threshold) || 75))
          : db.settings.threshold,
      certHeading: String(body.certHeading ?? db.settings.certHeading).trim(),
      certSub: String(body.certSub ?? db.settings.certSub).trim(),
      certSigner: String(body.certSigner ?? db.settings.certSigner).trim(),
      certFooter: String(body.certFooter ?? db.settings.certFooter).trim(),
      certSignatureUrl:
        body.certSignatureUrl !== undefined
          ? String(body.certSignatureUrl || '').trim()
          : db.settings.certSignatureUrl || '',
      certSealText:
        body.certSealText !== undefined
          ? String(body.certSealText || '').trim()
          : db.settings.certSealText || 'CERTIFIED',
      requireTwoFactorForAdmins:
        body.requireTwoFactorForAdmins !== undefined
          ? Boolean(body.requireTwoFactorForAdmins)
          : Boolean(db.settings.requireTwoFactorForAdmins),
      enforceWhatsapp2FA:
        body.enforceWhatsapp2FA !== undefined
          ? Boolean(body.enforceWhatsapp2FA)
          : Boolean(db.settings.enforceWhatsapp2FA),
    };

    if (body.smtpUser !== undefined) {
      db.notifications.smtpUser = String(body.smtpUser || '').trim();
    }
    if (body.clearSmtpPass) {
      db.notifications.smtpPass = '';
    } else if (typeof body.smtpPass === 'string' && body.smtpPass.trim()) {
      db.notifications.smtpPass = body.smtpPass.trim();
    }
    if (body.senderName !== undefined) {
      db.notifications.senderName = String(body.senderName || '').trim() || db.settings.brand;
    }
    if (body.adminWhatsapp !== undefined) {
      db.notifications.adminWhatsapp = String(body.adminWhatsapp || '').trim();
    }
    if (body.whatsappWebhookUrl !== undefined) {
      db.notifications.whatsappWebhookUrl = String(body.whatsappWebhookUrl || '').trim();
    }
    if (body.whatsappPhoneNumberId !== undefined) {
      db.notifications.whatsappPhoneNumberId = String(body.whatsappPhoneNumberId || '').trim();
    }
    if (body.clearWhatsappToken) {
      db.notifications.whatsappApiToken = '';
    } else if (
      typeof body.whatsappApiToken === 'string' &&
      body.whatsappApiToken.trim()
    ) {
      db.notifications.whatsappApiToken = body.whatsappApiToken.trim();
    }

    appendAuditLog({
      db,
      actor: req.authUser!,
      action: 'PORTAL_SETTINGS_UPDATED',
      category: 'SYSTEM',
      targetType: 'settings',
      targetLabel: db.settings.brand,
      ip: getClientIp(req),
    });

    saveDb(db);
    res.json({ settings: getSafePortalSettings(db, 'super_admin') });
  });

  app.post('/api/admin/notifications/test-email', requireSuperAdmin, async (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const targetEmail = String(req.body?.to || req.authUser?.email || db.notifications.smtpUser || '').trim();
    if (!targetEmail.includes('@')) {
      res.status(400).json({ error: 'Please provide a valid recipient email address.' });
      return;
    }
    const adminGstState =
      db.settings.gstState || detectStateFromGstin(db.settings.gstNumber) || 'West Bengal';
    const sampleOrder: Order = {
      id: 'TEST-INV',
      invoiceNumber: 'TEST-' + new Date().getFullYear() + '-0001',
      userId: req.authUser!.id,
      buyerName: req.authUser!.name,
      buyerEmail: targetEmail,
      buyerPhone: db.notifications.adminWhatsapp || '9999999999',
      buyerState: adminGstState,
      sellerState: adminGstState,
      supplyType: db.settings.gstSplit === 'igst' ? 'inter_state' : 'intra_state',
      itemName: 'Sample GST & Tax Course Invoice Test',
      courseIds: [],
      base: 1000,
      discount: 0,
      taxable: 1000,
      gst: Math.round((1000 * (db.settings.gst || 18)) / 100),
      gstRate: db.settings.gst || 18,
      gstMode: db.settings.gstMode,
      gstSection: db.settings.gstSection,
      sacCode: db.settings.sacCode,
      gstNumber: db.settings.gstNumber,
      gstSplit: db.settings.gstSplit,
      total: 1000 + Math.round((1000 * (db.settings.gst || 18)) / 100),
      method: 'UPI QR Test',
      reference: 'TESTUTR0001',
      status: 'PAID',
      created: new Date().toISOString(),
      paidAt: new Date().toISOString(),
    };
    const result = await sendOrderEmailInvoice({
      db,
      order: sampleOrder,
      methodName: 'UPI / Payment Gateway Test',
    });
    if (result.status !== 'sent') {
      res.status(400).json({ error: result.note });
      return;
    }
    res.json({ ok: true, note: result.note });
  });

  // ---- COMMUNICATION & BROADCASTS (RBAC: announcement_manage) ----
  app.put('/api/admin/announcement', requirePermission('announcement_manage'), (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const body = req.body || {};
    const message = String(body.message || '').trim();
    if (!message) {
      res.status(400).json({ error: 'Announcement message is required.' });
      return;
    }
    const rawCat = String(body.category || 'update');
    const category: AnnouncementCategory =
      rawCat === 'exam' || rawCat === 'course' ? rawCat : 'update';
    const rawPage = String(body.actionPage || '');
    const actionPage =
      rawPage === 'courses' ||
      rawPage === 'mycourses' ||
      rawPage === 'certificates'
        ? rawPage
        : undefined;

    const announcement: Announcement = {
      id: db.announcement?.id || uid(),
      active: body.active !== false,
      category,
      title: String(body.title || '').trim(),
      message,
      actionLabel: actionPage
        ? String(body.actionLabel || '').trim() ||
          (actionPage === 'courses'
            ? 'Browse Courses'
            : actionPage === 'mycourses'
              ? 'Open My Learning'
              : 'View Certificates')
        : undefined,
      actionPage,
      updatedAt: new Date().toISOString(),
    };
    db.announcement = announcement;
    appendAuditLog({
      db,
      actor: req.authUser!,
      action: 'ANNOUNCEMENT_UPDATED',
      category: 'SYSTEM',
      targetType: 'announcement',
      targetLabel: announcement.title || announcement.category,
      ip: getClientIp(req),
    });
    saveDb(db);
    res.json({ announcement });
  });

  app.delete('/api/admin/announcement', requirePermission('announcement_manage'), (_req, res) => {
    const db = loadDb();
    db.announcement = null;
    saveDb(db);
    res.json({ ok: true });
  });

  app.put('/api/admin/live-class', requirePermission('announcement_manage'), (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const body = req.body || {};
    const title = String(body.title || '').trim();
    let meetingUrl = String(body.meetingUrl || '').trim();
    if (
      meetingUrl &&
      !/^https?:\/\//i.test(meetingUrl) &&
      /^[\w.-]+\.[a-z]{2,}/i.test(meetingUrl)
    ) {
      meetingUrl = `https://${meetingUrl}`;
    }

    if (!title || !meetingUrl) {
      res
        .status(400)
        .json({ error: 'Live class title and Zoom/Meet link are required.' });
      return;
    }

    const validPlatforms: LivePlatformType[] = ['zoom', 'meet', 'teams', 'other'];
    const rawPlat = String(body.platform || '') as LivePlatformType;
    let platform: LivePlatformType = validPlatforms.includes(rawPlat)
      ? rawPlat
      : 'other';
    if (!validPlatforms.includes(rawPlat)) {
      const lower = meetingUrl.toLowerCase();
      if (lower.includes('zoom.us')) platform = 'zoom';
      else if (lower.includes('meet.google.com')) platform = 'meet';
      else if (lower.includes('teams.microsoft.com')) platform = 'teams';
    }

    const session: LiveClassSession = {
      active: body.active !== false,
      platform,
      title,
      instructorName:
        String(body.instructorName || '').trim() ||
        req.authUser?.name ||
        'Arya Tax Mentor',
      courseTitle: String(body.courseTitle || '').trim() || undefined,
      meetingUrl,
      meetingId: String(body.meetingId || '').trim() || undefined,
      passcode: String(body.passcode || '').trim() || undefined,
      scheduledAt: String(body.scheduledAt || '').trim(),
      durationMinutes: Math.max(
        5,
        Math.min(600, Math.round(Number(body.durationMinutes) || 60))
      ),
      notes: String(body.notes || '').trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    db.liveClass = session;
    appendAuditLog({
      db,
      actor: req.authUser!,
      action: 'LIVE_CLASS_UPDATED',
      category: 'COURSE',
      targetType: 'live_class',
      targetLabel: session.title,
      ip: getClientIp(req),
    });
    saveDb(db);
    res.json({ liveClass: session });
  });

  app.delete('/api/admin/live-class', requirePermission('announcement_manage'), (_req, res) => {
    const db = loadDb();
    db.liveClass = null;
    saveDb(db);
    res.json({ ok: true });
  });

  app.put('/api/admin/welcome-video', requireAnyAdmin, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    if (
      !isSuperAdmin(actor as never) &&
      !hasPermission(actor as never, 'video_upload') &&
      !hasPermission(actor as never, 'announcement_manage')
    ) {
      res.status(403).json({
        error: 'Permission "video_upload" or "announcement_manage" is required.',
      });
      return;
    }
    const db = loadDb();
    const body = req.body || {};
    const prev = db.welcomeVideo;

    const cleanVid = normalizeVideoUrl(String(body.videoUrl ?? prev.videoUrl));

    db.welcomeVideo = {
      active: body.active !== undefined ? Boolean(body.active) : prev.active,
      title:
        String(body.title ?? prev.title).trim() ||
        'Course Orientation & Complete Syllabus Overview',
      subtitle: String(body.subtitle ?? prev.subtitle).trim(),
      videoUrl: cleanVid,
      mentorName:
        String(body.mentorName ?? prev.mentorName).trim() ||
        db.admin?.name ||
        'Arya Tax Mentor',
      mentorRole:
        String(body.mentorRole ?? prev.mentorRole).trim() ||
        'Founder & Lead Tax Practitioner',
      photoUrl:
        String(body.photoUrl ?? prev.photoUrl).trim() ||
        '/assets/aistudio/IMG_20251110_092655_764_2c1ee29a.webp',
      autoplay:
        body.autoplay !== undefined ? Boolean(body.autoplay) : prev.autoplay,
      loop: body.loop !== undefined ? Boolean(body.loop) : prev.loop,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    res.json({ welcomeVideo: db.welcomeVideo });
  });

  app.put('/api/admin/platform-links', requirePermission('announcement_manage'), (req, res) => {
    const db = loadDb();
    const body = req.body || {};
    const validPlatforms: SocialPlatformType[] = [
      'whatsapp',
      'youtube',
      'telegram',
      'instagram',
      'facebook',
      'website',
      'other',
    ];
    const rawLinks = Array.isArray(body.links) ? body.links : [];
    const links: PlatformLink[] = [];
    for (const item of rawLinks) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const label = String(obj.label || '').trim();
      const url = String(obj.url || '').trim();
      if (!label && !url) continue;
      const rawPlat = String(obj.platform || 'other') as SocialPlatformType;
      const platform = validPlatforms.includes(rawPlat) ? rawPlat : 'other';
      links.push({
        id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : uid(),
        platform,
        label: label || platform,
        subtitle: String(obj.subtitle || '').trim(),
        url,
        active: obj.active !== false,
      });
    }

    db.platformLinks = {
      heading:
        String(body.heading ?? db.platformLinks.heading).trim() ||
        'Important Links & Student Community',
      subtitle: String(body.subtitle ?? db.platformLinks.subtitle).trim(),
      links,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    res.json({ platformLinks: db.platformLinks });
  });

  // ---- PAYMENT METHODS (STRICTLY SUPER ADMIN ONLY) ----
  app.post('/api/admin/methods', requireSuperAdmin, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Payment method name is required.' });
      return;
    }
    const rawType = String(req.body?.type || 'upi_qr');
    const type: PaymentMethodType =
      rawType === 'gateway' || rawType === 'bank' ? rawType : 'upi_qr';
    const rawGatewayUrl = String(req.body?.gatewayUrl || '').trim();
    const rawInfo = String(req.body?.info || '').trim();
    const rawUpiId = String(req.body?.upiId || '').trim();
    const resolvedUpi = resolveMethodUpiId({
      upiId: rawUpiId,
      gatewayUrl: rawGatewayUrl,
      info: rawInfo,
    });

    const method: PaymentMethod = {
      id: uid(),
      name,
      type,
      upiId: resolvedUpi || rawUpiId,
      qrCodeUrl: String(req.body?.qrCodeUrl || '').trim(),
      gatewayProvider: String(req.body?.gatewayProvider || '').trim(),
      gatewayUrl: isValidHttpUrl(rawGatewayUrl) ? rawGatewayUrl : '',
      gatewayKeyId: String(req.body?.gatewayKeyId || '').trim(),
      info: rawInfo,
      active: req.body?.active !== false,
    };
    db.methods.push(method);
    appendAuditLog({
      db,
      actor: req.authUser!,
      action: 'PAYMENT_METHOD_ADDED',
      category: 'FINANCE',
      targetType: 'payment_method',
      targetLabel: method.name,
      ip: getClientIp(req),
    });
    saveDb(db);
    res.status(201).json({ method });
  });

  app.put('/api/admin/methods/:id', requireSuperAdmin, (req, res) => {
    const db = loadDb();
    const method = db.methods.find((m) => m.id === req.params.id);
    if (!method) {
      res.status(404).json({ error: 'Payment method not found.' });
      return;
    }
    const rawType = String(req.body?.type ?? method.type ?? 'upi_qr');
    method.type =
      rawType === 'gateway' || rawType === 'bank' ? rawType : 'upi_qr';
    method.name = String(req.body?.name ?? method.name).trim() || method.name;
    if (req.body?.upiId !== undefined) {
      method.upiId = String(req.body.upiId || '').trim();
    }
    if (req.body?.qrCodeUrl !== undefined) {
      method.qrCodeUrl = String(req.body.qrCodeUrl || '').trim();
    }
    if (req.body?.gatewayProvider !== undefined) {
      method.gatewayProvider = String(req.body.gatewayProvider || '').trim();
    }
    if (req.body?.gatewayUrl !== undefined) {
      const nextUrl = String(req.body.gatewayUrl || '').trim();
      const upiInUrl = resolveMethodUpiId({ gatewayUrl: nextUrl });
      if (upiInUrl && !method.upiId) {
        method.upiId = upiInUrl;
      }
      method.gatewayUrl = isValidHttpUrl(nextUrl) ? nextUrl : '';
    }
    if (req.body?.gatewayKeyId !== undefined) {
      method.gatewayKeyId = String(req.body.gatewayKeyId || '').trim();
    }
    if (req.body?.info !== undefined) {
      method.info = String(req.body.info || '').trim();
    }
    if (!method.upiId) {
      const fallbackUpi = resolveMethodUpiId(method);
      if (fallbackUpi) method.upiId = fallbackUpi;
    }
    if (req.body?.active !== undefined) {
      method.active = Boolean(req.body.active);
    }
    saveDb(db);
    res.json({ method });
  });

  app.patch('/api/admin/methods/:id/toggle', requireSuperAdmin, (req, res) => {
    const db = loadDb();
    const method = db.methods.find((m) => m.id === req.params.id);
    if (!method) {
      res.status(404).json({ error: 'Payment method not found.' });
      return;
    }
    method.active = !method.active;
    saveDb(db);
    res.json({ method });
  });

  app.delete('/api/admin/methods/:id', requireSuperAdmin, (req, res) => {
    const db = loadDb();
    db.methods = db.methods.filter((m) => m.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  // ---- UPI QR CODE IMAGE GENERATOR ----
  app.post('/api/payment/upi-qr', requireAuth, async (req, res) => {
    const upiId = String(req.body?.upiId || '').trim();
    const payeeName = String(req.body?.payeeName || 'ARYA TAX PATHSHALA').trim();
    const amount = Math.max(0, Number(req.body?.amount) || 0);
    const note = String(req.body?.note || 'Course Enrollment').trim();
    if (!upiId) {
      res.status(400).json({ error: 'UPI ID is required.' });
      return;
    }
    const uri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
      payeeName
    )}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
    try {
      const dataUrl = await QRCode.toDataURL(uri, {
        width: 320,
        margin: 2,
        color: { dark: '#142746', light: '#ffffff' },
      });
      res.json({ uri, dataUrl });
    } catch {
      res.status(500).json({ error: 'Could not generate UPI QR code.' });
    }
  });

  // ---- STUDENT: CHECKOUT & PROGRESS ----
  app.post('/api/student/checkout/preview', requireAuth, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    if (req.authUser?.role === 'admin' && !isSuperAdmin(req.authUser as never)) {
      res.status(403).json({ error: 'Financial checkout previews are restricted.' });
      return;
    }
    const itemType = req.body?.itemType === 'bundle' ? 'bundle' : 'course';
    const itemId = String(req.body?.itemId || '');
    const couponCode = String(req.body?.couponCode || '');
    const planId = String(req.body?.planId || '');
    const studentState =
      req.authUser?.role === 'student'
        ? normalizeIndianState(req.authUser.state) ||
          normalizeIndianState(db.settings.gstState)
        : normalizeIndianState(req.body?.studentState) ||
          normalizeIndianState(req.authUser?.state) ||
          normalizeIndianState(db.settings.gstState);

    const publishedCourseIds = new Set(
      db.courses.filter((c) => c.visibility === 'published').map((c) => c.id)
    );
    const target =
      itemType === 'bundle'
        ? db.bundles.find(
            (b) =>
              b.id === itemId &&
              b.courseIds.length >= 2 &&
              b.courseIds.every((cid) => publishedCourseIds.has(cid))
          )
        : db.courses.find((c) => c.id === itemId && c.visibility === 'published');

    if (!target) {
      res.status(404).json({ error: 'Item not found.' });
      return;
    }

    let effectivePrice = target.price;
    if (itemType === 'course' && planId) {
      const plan = (target as Course).paymentPlans?.find((p) => p.id === planId);
      if (plan) effectivePrice = plan.price;
    }

    const breakdown = calculatePriceBreakdown(
      effectivePrice,
      db.settings,
      couponCode,
      db.coupons,
      studentState
    );
    res.json({ breakdown });
  });

  app.post('/api/student/checkout/verify-reference', requireAuth, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const reference = String(req.body?.reference || '');
    const studentPhone = String(req.body?.studentPhone || req.authUser?.phone || '');
    const proof = validateTransactionProof(reference, studentPhone);

    if (!proof.valid) {
      res.json({
        valid: false,
        normalized: proof.normalized,
        proofType: proof.proofType,
        duplicate: false,
        message: proof.message,
      });
      return;
    }

    const duplicateOrder = db.orders.find(
      (o) =>
        o.status !== 'REJECTED' &&
        (o.reference || '').trim().replace(/\s+/g, '').toUpperCase() ===
          proof.normalized.toUpperCase()
    );
    if (duplicateOrder) {
      res.json({
        valid: false,
        normalized: proof.normalized,
        proofType: 'Duplicate Reference',
        duplicate: true,
        message:
          'This Transaction ID / UTR has already been submitted for another order. Please enter your new payment reference.',
      });
      return;
    }

    res.json({
      valid: true,
      normalized: proof.normalized,
      proofType: proof.proofType,
      duplicate: false,
      message: `${proof.message} Submit to send for Owner/Admin verification.`,
    });
  });

  app.post('/api/student/orders', requireAuth, async (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const user = req.authUser!;
    if (user.role !== 'student') {
      res.status(403).json({ error: 'Only students can place orders.' });
      return;
    }

    const itemType = req.body?.itemType === 'bundle' ? 'bundle' : 'course';
    const itemId = String(req.body?.itemId || '');
    const couponCode = String(req.body?.couponCode || '').trim().toUpperCase();
    const methodId = String(req.body?.method || '');
    const reference = String(req.body?.reference || '').trim();
    const planId = String(req.body?.planId || '');
    const studentPhone = String(req.body?.studentPhone || '').trim();
    const effectiveStudentState =
      normalizeIndianState(user.state) ||
      normalizeIndianState(db.settings.gstState);

    if (studentPhone) {
      user.phone = studentPhone;
    }

    const publishedIds = new Set(
      db.courses.filter((c) => c.visibility === 'published').map((c) => c.id)
    );
    const course =
      itemType === 'course'
        ? db.courses.find(
            (c) => c.id === itemId && c.visibility === 'published'
          )
        : undefined;
    const bundle =
      itemType === 'bundle'
        ? db.bundles.find(
            (b) =>
              b.id === itemId &&
              b.courseIds.length >= 2 &&
              b.courseIds.every((cid) => publishedIds.has(cid))
          )
        : undefined;

    if (!course && !bundle) {
      res.status(404).json({ error: 'Selected course or bundle not found.' });
      return;
    }

    const chosenPlan =
      course && planId
        ? course.paymentPlans?.find((p) => p.id === planId)
        : undefined;

    const courseIds = course ? [course.id] : bundle!.courseIds;
    const itemName = course
      ? chosenPlan
        ? `${course.title} (${chosenPlan.label})`
        : course.title
      : bundle!.name;
    const basePrice = course
      ? chosenPlan
        ? chosenPlan.price
        : course.price
      : bundle!.price;

    const unlocked = getStudentUnlockedCourseIds(user, db.orders);
    if (courseIds.every((id) => unlocked.has(id))) {
      res.status(409).json({ error: 'You already have access to this item.' });
      return;
    }

    const breakdown = calculatePriceBreakdown(
      basePrice,
      db.settings,
      couponCode,
      db.coupons,
      effectiveStudentState
    );
    if (couponCode && breakdown.couponError) {
      res.status(400).json({ error: breakdown.couponError });
      return;
    }

    const activeMethod = db.methods.find((m) => m.id === methodId && m.active);
    if (breakdown.total > 0 && !activeMethod) {
      res.status(400).json({ error: 'Please select a valid payment method.' });
      return;
    }

    const rawScreenshot = String(req.body?.proofScreenshotUrl || '').trim();
    const proofScreenshotUrl =
      rawScreenshot.startsWith('data:image/') && rawScreenshot.length <= 450_000
        ? rawScreenshot
        : '';

    let finalRef = reference;
    let proofType = 'Free Enrollment';
    if (breakdown.total > 0) {
      const proof = validateTransactionProof(reference, user.phone || studentPhone);
      if (!proof.valid) {
        res.status(400).json({ error: proof.message });
        return;
      }
      const duplicateOrder = db.orders.find(
        (o) =>
          o.status !== 'REJECTED' &&
          (o.reference || '').trim().replace(/\s+/g, '').toUpperCase() ===
            proof.normalized.toUpperCase()
      );
      if (duplicateOrder) {
        res.status(409).json({
          error:
            'This Transaction ID / UTR is already used by an existing order. Enter a fresh payment reference.',
        });
        return;
      }
      finalRef = proof.normalized;
      proofType = proof.proofType;
    }

    const now = new Date();
    const isVerifiedFree = breakdown.total === 0;
    const invoiceMeta = isVerifiedFree ? getNextInvoiceMeta(db.orders) : null;
    const resolvedMethodId = activeMethod?.id || 'free_enrollment';
    const resolvedMethodName = activeMethod?.name || 'Free Enrollment (₹0)';

    const order: Order = {
      id: uid(),
      ...(invoiceMeta
        ? {
            invoiceNumber: invoiceMeta.invoiceNumber,
            invoiceSerial: invoiceMeta.serial,
          }
        : {}),
      userId: user.id,
      buyerName: user.name,
      buyerEmail: user.email,
      buyerPhone: user.phone || studentPhone || '',
      buyerState: breakdown.buyerState || effectiveStudentState || '',
      sellerState:
        breakdown.sellerState ||
        db.settings.gstState ||
        detectStateFromGstin(db.settings.gstNumber) ||
        '',
      supplyType: breakdown.supplyType,
      itemName,
      courseIds,
      ...(chosenPlan
        ? {
            planId: chosenPlan.id,
            planLabel: chosenPlan.label,
            planMonths: chosenPlan.months,
          }
        : {}),
      base: breakdown.base,
      discount: breakdown.discount,
      taxable: breakdown.taxable,
      gst: breakdown.gst,
      gstRate: breakdown.gstRate,
      gstMode: db.settings.gstMode,
      gstSection: db.settings.gstSection,
      sacCode: db.settings.sacCode,
      gstNumber: db.settings.gstNumber,
      gstSplit: breakdown.gstSplit,
      cgst: breakdown.cgst,
      sgst: breakdown.sgst,
      igst: breakdown.igst,
      total: breakdown.total,
      method: resolvedMethodId,
      reference: finalRef || 'FREE-ENROLL',
      couponCode: breakdown.couponApplied?.code,
      status: isVerifiedFree ? 'PAID' : 'PENDING',
      verificationStatus: isVerifiedFree ? 'verified' : 'pending_verification',
      proofType,
      ...(proofScreenshotUrl ? { proofScreenshotUrl } : {}),
      verificationNote: isVerifiedFree
        ? 'Verified ₹0 enrollment.'
        : `Payment proof (${proofType}: ${finalRef}) verified in format. Course locked until Super Admin verifies payment.`,
      created: now.toISOString(),
      ...(isVerifiedFree
        ? {
            paidAt: now.toISOString(),
            verifiedAt: now.toISOString(),
            verifiedBy: 'system-free',
          }
        : {}),
    };

    if (order.status === 'PAID') {
      await dispatchOrderNotifications({
        db,
        order,
        student: user,
        methodName: resolvedMethodName,
      });
    }

    db.orders.unshift(order);
    saveDb(db);
    res.status(201).json({ order });
  });

  app.post('/api/orders/:id/resend-email', requireAuth, async (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const actor = req.authUser!;
    if (!isSuperAdmin(actor as never) && order.userId !== actor.id) {
      res.status(403).json({ error: 'Not authorized for this financial invoice.' });
      return;
    }
    if (order.status !== 'PAID') {
      res.status(400).json({
        error: 'Tax Invoice can only be generated & sent after payment is completed.',
      });
      return;
    }
    if (!order.invoiceNumber) {
      const meta = getNextInvoiceMeta(db.orders);
      order.invoiceNumber = meta.invoiceNumber;
      order.invoiceSerial = meta.serial;
    }
    const student = db.students.find((s) => s.id === order.userId);
    const methodObj = db.methods.find((m) => m.id === order.method);
    if (student) {
      order.buyerName = order.buyerName || student.name;
      order.buyerEmail = order.buyerEmail || student.email;
      order.buyerPhone = order.buyerPhone || student.phone || '';
      await dispatchOrderNotifications({
        db,
        order,
        student,
        methodName: methodObj?.name || order.method,
      });
    } else {
      const emailRes = await sendOrderEmailInvoice({
        db,
        order,
        methodName: methodObj?.name || order.method,
      });
      order.emailDispatchStatus = emailRes.status;
      order.emailDispatchNote = emailRes.note;
    }
    saveDb(db);
    res.json({
      order,
      status: order.emailDispatchStatus || 'not_configured',
      note: order.emailDispatchNote || 'Invoice prepared.',
    });
  });

  app.post(
    '/api/student/progress/complete',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const courseId = String(req.body?.courseId || '');
      const lessonId = String(req.body?.lessonId || '');
      if (!courseId || !lessonId) {
        res.status(400).json({ error: 'Missing courseId or lessonId.' });
        return;
      }
      const unlocked = getStudentUnlockedCourseIds(user, db.orders);
      if (user.role === 'student' && !unlocked.has(courseId)) {
        res.status(403).json({ error: 'Course access required.' });
        return;
      }
      const key = `${user.id}_${courseId}_${lessonId}`;
      db.progress[key] = 100;
      saveDb(db);
      res.json({ key, progress: 100 });
    }
  );

  app.post(
    '/api/student/progress/watch',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const courseId = String(req.body?.courseId || '');
      const lessonId = String(req.body?.lessonId || '');
      const delta = Number(req.body?.delta) || 0;
      const duration = Number(req.body?.duration) || 0;

      if (!courseId || !lessonId || delta <= 0 || duration <= 0) {
        res.json({ ok: true });
        return;
      }
      const unlocked = getStudentUnlockedCourseIds(user, db.orders);
      if (user.role === 'student' && !unlocked.has(courseId)) {
        res.status(403).json({ error: 'Course access required.' });
        return;
      }

      const key = `${user.id}_${courseId}_${lessonId}`;
      const nextWatched = (db.watched[key] || 0) + Math.min(delta, 5);
      const pct = Math.min(100, (nextWatched / duration) * 100);
      db.watched[key] = nextWatched;
      db.progress[key] = Math.max(db.progress[key] || 0, pct);
      saveDb(db);
      res.json({ key, progress: db.progress[key] });
    }
  );

  // Register Multi-Level Admin, RBAC, Approval, 2FA, Audit, Support, Backup routes
  registerMultiAdminRoutes(app);
  // Register WhatsApp Business Cloud API 2FA, Admin Self-Registration & Recovery Approval routes
  registerWhatsappAndRecoveryRoutes(app);

  // ---- VITE / STATIC SERVING ----
  const distDir = path.resolve(process.cwd(), 'dist');
  if (isProduction && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ARYA TAX PATHSHALA server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
