import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { AdminPermission, AdminRole } from '../../src/types/lms.ts';
import {
  ASSIGNABLE_ADMIN_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectiveAdminRole,
  isSuperAdmin,
} from '../../src/utils/rbac.ts';
import {
  findAdminByEmail,
  findAdminById,
  findAdminByIdentifier,
  findStudentByIdentifier,
  getSafePortalSettings,
  getSuperAdmin,
  hashPassword,
  loadDb,
  normalizePhone10,
  resolveEffectiveWhatsappCredentials,
  sanitizeUser,
  saveDb,
  signToken,
  uid,
  verifyPassword,
  verifyToken,
  type DatabaseSchema,
  type StoredUser,
} from '../db.ts';
import { getNextInvoiceMeta, dispatchOrderNotifications } from '../invoice.ts';
import { requireAuth, requireSuperAdmin, type AuthedRequest } from '../middleware.ts';
import {
  appendAuditLog,
  createSessionRecord,
  getClientIp,
  pushNotification,
  recordLoginAttemptAndCheckBruteForce,
  revokeUserSessions,
  verifyAndConsumeTwoFactorCode,
  verifyBackupCodeMatch,
} from '../security.ts';
import {
  formatWhatsappDigits,
  issueWhatsappOtpChallenge,
  maskWhatsappNumber,
  sendWhatsappOtpViaProvider,
  verifyOtpChallengeCode,
} from '../whatsapp.ts';
import { isOrderActiveAccess } from '../../src/utils/lms.ts';

function tryGetAuthedUser(req: Request, db: DatabaseSchema): StoredUser | null {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const payload = verifyToken(header.slice(7).trim(), db.authSecret, 'auth');
  if (!payload) return null;
  const user =
    payload.role === 'admin'
      ? findAdminById(db, payload.sub)
      : db.students.find((s) => s.id === payload.sub);
  if (!user || !user.active || user.suspended) return null;
  if ((user.tokenVersion || 1) !== payload.tv) return null;
  return user;
}

export function registerWhatsappAndRecoveryRoutes(app: Express): void {
  // ---- WHATSAPP OTP DELIVERY & VERIFICATION ----
  app.post('/api/auth/whatsapp/send-otp', async (req: Request, res: Response) => {
    const db = loadDb();
    const countryCode = String(req.body?.countryCode || '+91').trim() || '+91';
    const whatsappNumber = String(req.body?.whatsappNumber || '').trim();
    const rawPurpose = String(req.body?.purpose || 'REGISTRATION').toUpperCase();
    const purpose =
      rawPurpose === 'PASSWORD_RECOVERY' || rawPurpose === 'WHATSAPP_VERIFY'
        ? rawPurpose
        : 'REGISTRATION';

    const e164Phone = formatWhatsappDigits(whatsappNumber, countryCode);
    if (e164Phone.length < 10) {
      res.status(400).json({
        error: 'Enter a valid 10-digit WhatsApp number with country code.',
      });
      return;
    }

    const authed = tryGetAuthedUser(req, db);
    const result = await issueWhatsappOtpChallenge({
      db,
      purpose,
      deliveryPurpose:
        purpose === 'PASSWORD_RECOVERY' ? 'PASSWORD_RECOVERY' : 'REGISTRATION_OTP',
      e164Phone,
      userId: authed?.id,
      email: authed?.email,
      recipientName: String(req.body?.recipientName || authed?.name || '').trim() || undefined,
      ip: getClientIp(req),
    });

    saveDb(db);

    if (!result.ok) {
      res.status(result.statusCode).json({
        error: result.error,
        apiNotConfigured: Boolean(result.apiNotConfigured),
      });
      return;
    }

    res.json({
      ok: true,
      challengeId: result.challengeId,
      maskedPhone: result.maskedPhone,
      expiresAt: result.expiresAt,
      resendAvailableAt: result.resendAvailableAt,
    });
  });

  app.post('/api/auth/whatsapp/verify-otp', (req: Request, res: Response) => {
    const db = loadDb();
    const challengeId = String(req.body?.challengeId || '').trim();
    const code = String(req.body?.code || '').trim();
    const consumeImmediately = Boolean(req.body?.consumeImmediately);

    if (!challengeId || !code) {
      res.status(400).json({ error: 'Challenge ID and 6-digit OTP are required.' });
      return;
    }

    const check = verifyOtpChallengeCode({
      db,
      challengeId,
      code,
      consumeImmediately,
    });

    if (!check.valid || !check.challenge) {
      saveDb(db);
      res.status(400).json({ error: check.error || 'OTP verification failed.' });
      return;
    }

    // If user is already signed in and verifying their own WhatsApp profile number
    const authed = tryGetAuthedUser(req, db);
    if (authed && check.challenge.purpose === 'WHATSAPP_VERIFY') {
      const countryCode = String(req.body?.countryCode || authed.countryCode || '+91').trim();
      const rawPhone = String(req.body?.whatsappNumber || '').trim();
      if (rawPhone) {
        authed.countryCode = countryCode;
        authed.whatsappNumber = rawPhone;
        authed.phone = authed.phone || rawPhone;
      }
      authed.whatsappVerified = true;
      authed.whatsappVerifiedAt = new Date().toISOString();
      check.challenge.consumed = true;
      appendAuditLog({
        db,
        actor: authed,
        action: 'WHATSAPP_NUMBER_VERIFIED',
        category: 'SECURITY',
        targetType: authed.role,
        targetId: authed.id,
        targetLabel: maskWhatsappNumber(check.challenge.e164Phone),
        ip: getClientIp(req),
      });
    }

    saveDb(db);
    res.json({
      ok: true,
      verified: true,
      challengeId: check.challenge.id,
      maskedPhone: maskWhatsappNumber(check.challenge.e164Phone),
      ...(authed ? { user: sanitizeUser(authed) } : {}),
    });
  });

  app.post('/api/auth/whatsapp/verify-login', async (req: Request, res: Response) => {
    const db = loadDb();
    const challengeToken = String(req.body?.challengeToken || '').trim();
    const ip = getClientIp(req);
    const payload = verifyToken(
      challengeToken,
      db.authSecret,
      'whatsapp_2fa_challenge'
    );
    if (!payload || !payload.extra) {
      res.status(401).json({
        error: 'WhatsApp 2FA login session expired. Please sign in with your password again.',
      });
      return;
    }

    const user =
      payload.role === 'admin'
        ? findAdminById(db, payload.sub)
        : db.students.find((s) => s.id === payload.sub);
    if (!user || !user.active || user.suspended || (user.tokenVersion || 1) !== payload.tv) {
      res.status(403).json({ error: 'Account is inactive or unavailable.' });
      return;
    }

    // Handle Resend request on the login screen
    if (req.body?.resend) {
      const e164Phone = formatWhatsappDigits(
        user.whatsappNumber || user.phone || '',
        user.countryCode || '+91'
      );
      const reissued = await issueWhatsappOtpChallenge({
        db,
        purpose: 'LOGIN_2FA',
        deliveryPurpose: 'LOGIN_2FA',
        e164Phone,
        userId: user.id,
        email: user.email,
        recipientName: user.name,
        ip,
      });
      saveDb(db);
      if (!reissued.ok) {
        res.status(reissued.statusCode).json({
          error: reissued.error,
          apiNotConfigured: Boolean(reissued.apiNotConfigured),
        });
        return;
      }
      const nextToken = signToken(
        {
          sub: user.id,
          role: user.role,
          tv: user.tokenVersion || 1,
          purpose: 'whatsapp_2fa_challenge',
          extra: reissued.challengeId,
        },
        db.authSecret,
        1000 * 60 * 10
      );
      res.json({
        ok: true,
        resent: true,
        challengeToken: nextToken,
        maskedPhone: reissued.maskedPhone,
        expiresAt: reissued.expiresAt,
        resendAvailableAt: reissued.resendAvailableAt,
      });
      return;
    }

    const code = String(req.body?.code || '').trim();
    const check = verifyOtpChallengeCode({
      db,
      challengeId: payload.extra,
      code,
      consumeImmediately: true,
    });

    if (!check.valid) {
      recordLoginAttemptAndCheckBruteForce({
        db,
        email: user.email,
        ip,
        success: false,
        reason: 'Invalid WhatsApp 2FA OTP code',
      });
      saveDb(db);
      res.status(401).json({ error: check.error || 'Invalid 6-digit WhatsApp OTP.' });
      return;
    }

    // Mark WhatsApp ownership confirmed on first verified login
    if (!user.whatsappVerified) {
      user.whatsappVerified = true;
      user.whatsappVerifiedAt = new Date().toISOString();
    }

    const session = createSessionRecord({ db, user, req });
    user.lastLoginAt = new Date().toISOString();
    user.lastLoginIp = ip;
    recordLoginAttemptAndCheckBruteForce({
      db,
      email: user.email,
      ip,
      success: true,
    });
    appendAuditLog({
      db,
      actor: user,
      action: 'LOGIN_WHATSAPP_2FA_SUCCESS',
      category: 'AUTH',
      targetType: 'session',
      targetId: session.sid,
      ip,
    });
    saveDb(db);

    const token = signToken(
      {
        sub: user.id,
        role: user.role,
        sid: session.sid,
        tv: user.tokenVersion || 1,
      },
      db.authSecret
    );
    res.json({ token, user: sanitizeUser(user) });
  });

  // ---- ADMIN SELF-REGISTRATION & APPROVAL SYSTEM ----
  app.post('/api/auth/admin/register', (req: Request, res: Response) => {
    const db = loadDb();
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phoneInput = String(req.body?.phone || req.body?.whatsappNumber || '').trim();
    const countryCode = String(req.body?.countryCode || '+91').trim() || '+91';
    const whatsappNumber = String(req.body?.whatsappNumber || phoneInput).trim();
    const confirmWhatsappNumber = String(req.body?.confirmWhatsappNumber || '').trim();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');
    const requestedDesignation = String(req.body?.requestedDesignation || '').trim();
    const otpChallengeId = String(req.body?.otpChallengeId || '').trim();

    if (!name || !email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid Full Name and Email Address are required.' });
      return;
    }
    const phone = phoneInput;
    const waDigits = formatWhatsappDigits(whatsappNumber, countryCode);
    if (phone.replace(/\D/g, '').length < 10 || waDigits.length < 10) {
      res.status(400).json({ error: 'Valid 10-digit Phone / WhatsApp Number is required.' });
      return;
    }
    if (
      confirmWhatsappNumber &&
      formatWhatsappDigits(confirmWhatsappNumber, countryCode) !== waDigits
    ) {
      res.status(400).json({
        error: 'Phone / WhatsApp Number confirmation does not match.',
      });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Password and Confirm Password do not match.' });
      return;
    }
    if (
      !ASSIGNABLE_ADMIN_ROLES.includes(
        requestedDesignation as Exclude<AdminRole, 'SUPER_ADMIN'>
      )
    ) {
      res.status(400).json({ error: 'Please select a valid Requested Designation.' });
      return;
    }
    if (
      Boolean(findAdminByEmail(db, email)) ||
      db.students.some((s) => s.email === email)
    ) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const waCreds = resolveEffectiveWhatsappCredentials(db);
    let whatsappVerified = false;
    if (otpChallengeId) {
      const ch = db.otpChallenges.find(
        (c) => c.id === otpChallengeId && c.verified && !c.consumed
      );
      if (!ch || ch.e164Phone !== waDigits) {
        res.status(400).json({ error: 'Invalid or mismatched WhatsApp OTP verification.' });
        return;
      }
      ch.consumed = true;
      whatsappVerified = true;
    } else if (waCreds.cloudApiReady || waCreds.webhookUrl) {
      res.status(400).json({
        error: 'Please verify your WhatsApp number via 6-digit OTP before submitting registration.',
      });
      return;
    }

    const pendingAdmin: StoredUser = {
      id: uid(),
      name,
      email,
      phone,
      countryCode,
      whatsappNumber,
      whatsappVerified,
      ...(whatsappVerified ? { whatsappVerifiedAt: new Date().toISOString() } : {}),
      passwordHash: hashPassword(password),
      role: 'admin',
      adminRole: requestedDesignation as Exclude<AdminRole, 'SUPER_ADMIN'>,
      requestedDesignation: requestedDesignation as Exclude<AdminRole, 'SUPER_ADMIN'>,
      accountStatus: 'PENDING_APPROVAL',
      permissions: [],
      assignedCourseIds: [],
      coursePermissions: {},
      active: false, // Strictly inactive until Main Super Admin approves & activates
      suspended: false,
      tokenVersion: 1,
      twoFactorEnabled: false,
      grantedCourseIds: [],
      createdAt: new Date().toISOString(),
    };

    db.admins.push(pendingAdmin);

    const superAdmin = getSuperAdmin(db);
    if (superAdmin) {
      pushNotification({
        db,
        recipientUserId: superAdmin.id,
        type: 'ADMIN_REGISTRATION',
        title: 'New Admin Registration Pending Approval',
        message: `${name} (${email}) applied for ${requestedDesignation.replace('_', ' ')} · WhatsApp ${whatsappVerified ? 'Verified' : 'Unverified'}. Review & activate in Admin Hierarchy.`,
        actionPage: 'admin_team',
        relatedId: pendingAdmin.id,
      });
    }

    appendAuditLog({
      db,
      actor: pendingAdmin,
      action: 'ADMIN_REGISTRATION_SUBMITTED',
      category: 'ADMIN',
      targetType: 'admin',
      targetId: pendingAdmin.id,
      targetLabel: `${pendingAdmin.email} (Requested: ${requestedDesignation})`,
      updatedValue: { accountStatus: 'PENDING_APPROVAL', whatsappVerified },
      ip: getClientIp(req),
    });

    saveDb(db);
    res.status(201).json({
      ok: true,
      accountStatus: 'PENDING_APPROVAL',
      message:
        'Your admin registration has been submitted and is PENDING APPROVAL by the Main Super Admin. You will be able to sign in once approved and activated.',
      admin: sanitizeUser(pendingAdmin),
    });
  });

  app.get(
    '/api/admin/registrations',
    requireSuperAdmin,
    (_req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const nonOwner = db.admins
        .filter((a) => getEffectiveAdminRole(a as never) !== 'SUPER_ADMIN')
        .map(sanitizeUser);
      res.json({ registrations: nonOwner });
    }
  );

  app.post(
    '/api/admin/registrations/:id/approve',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const target = findAdminById(db, req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Registered admin account not found.' });
        return;
      }
      if (getEffectiveAdminRole(target as never) === 'SUPER_ADMIN') {
        res.status(403).json({ error: 'Cannot alter Main Super Admin ownership.' });
        return;
      }

      const rawRole = String(
        req.body?.adminRole || target.requestedDesignation || target.adminRole || 'COURSE_MANAGER'
      );
      if (!ASSIGNABLE_ADMIN_ROLES.includes(rawRole as Exclude<AdminRole, 'SUPER_ADMIN'>)) {
        res.status(400).json({ error: 'Invalid admin role.' });
        return;
      }
      const adminRole = rawRole as Exclude<AdminRole, 'SUPER_ADMIN'>;
      const permissions: AdminPermission[] = Array.isArray(req.body?.permissions)
        ? Array.from(new Set(req.body.permissions.filter((p: unknown) => typeof p === 'string')))
        : [...DEFAULT_ROLE_PERMISSIONS[adminRole]];
      const assignedCourseIds: string[] = Array.isArray(req.body?.assignedCourseIds)
        ? Array.from(new Set(req.body.assignedCourseIds.filter((c: unknown) => typeof c === 'string')))
        : target.assignedCourseIds || [];
      const activateNow = Boolean(req.body?.activateNow);

      target.adminRole = adminRole;
      target.permissions = permissions;
      target.assignedCourseIds = assignedCourseIds;
      target.rejectionReason = '';
      target.suspended = false;
      target.accountStatus = activateNow ? 'ACTIVE' : 'APPROVED';
      target.active = activateNow;

      for (const cid of assignedCourseIds) {
        const c = db.courses.find((course) => course.id === cid);
        db.assignmentHistory.unshift({
          id: uid(),
          courseId: cid,
          courseTitle: c?.title || cid,
          adminId: target.id,
          adminName: target.name,
          adminRole,
          action: 'ASSIGNED',
          permissions,
          actorId: actor.id,
          actorName: actor.name,
          timestamp: new Date().toISOString(),
        });
      }

      pushNotification({
        db,
        recipientUserId: target.id,
        type: 'ACCOUNT_STATUS',
        title: activateNow ? 'Admin Account Approved & Activated' : 'Admin Registration Approved',
        message: activateNow
          ? `Main Super Admin approved and activated your ${adminRole} account.`
          : `Your ${adminRole} registration has been approved. Pending final activation by Main Super Admin.`,
        actionPage: 'dashboard',
      });

      appendAuditLog({
        db,
        actor,
        action: activateNow
          ? 'ADMIN_REGISTRATION_APPROVED_AND_ACTIVATED'
          : 'ADMIN_REGISTRATION_APPROVED',
        category: 'ADMIN',
        targetType: 'admin',
        targetId: target.id,
        targetLabel: `${target.email} (${adminRole})`,
        updatedValue: { accountStatus: target.accountStatus, assignedCourseIds },
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ admin: sanitizeUser(target) });
    }
  );

  app.post(
    '/api/admin/registrations/:id/activate',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const target = findAdminById(db, req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Admin account not found.' });
        return;
      }
      if (getEffectiveAdminRole(target as never) === 'SUPER_ADMIN') {
        res.status(403).json({ error: 'Main Super Admin is always active.' });
        return;
      }
      if (target.accountStatus === 'PENDING_APPROVAL' || target.accountStatus === 'REJECTED') {
        res.status(400).json({ error: 'Approve this registration first before activating.' });
        return;
      }

      target.accountStatus = 'ACTIVE';
      target.active = true;
      target.suspended = false;
      target.suspendedReason = '';

      if (!target.permissions || target.permissions.length === 0) {
        const effRole = (target.adminRole || 'COURSE_MANAGER') as Exclude<AdminRole, 'SUPER_ADMIN'>;
        target.permissions = [...(DEFAULT_ROLE_PERMISSIONS[effRole] || [])];
      }

      pushNotification({
        db,
        recipientUserId: target.id,
        type: 'ACCOUNT_STATUS',
        title: 'Admin Account Activated',
        message: `Main Super Admin activated your administrator account. You may now sign in.`,
        actionPage: 'dashboard',
      });

      appendAuditLog({
        db,
        actor,
        action: 'ADMIN_ACCOUNT_ACTIVATED',
        category: 'ADMIN',
        targetType: 'admin',
        targetId: target.id,
        targetLabel: target.email,
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ admin: sanitizeUser(target) });
    }
  );

  app.post(
    '/api/admin/registrations/:id/reject',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const target = findAdminById(db, req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Admin account not found.' });
        return;
      }
      if (getEffectiveAdminRole(target as never) === 'SUPER_ADMIN') {
        res.status(403).json({ error: 'Main Super Admin cannot be rejected.' });
        return;
      }
      const reason = String(req.body?.reason || '').trim() || 'Registration declined by Main Super Admin.';

      target.accountStatus = 'REJECTED';
      target.active = false;
      target.rejectionReason = reason;
      revokeUserSessions(db, target, 'Registration rejected');

      appendAuditLog({
        db,
        actor,
        action: 'ADMIN_REGISTRATION_REJECTED',
        category: 'ADMIN',
        targetType: 'admin',
        targetId: target.id,
        targetLabel: target.email,
        updatedValue: { reason },
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ admin: sanitizeUser(target) });
    }
  );

  // ---- OFFICIAL WHATSAPP BUSINESS API CONFIG & LOGS (MAIN SUPER ADMIN ONLY) ----
  app.put(
    '/api/admin/security/whatsapp-config',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const body = req.body || {};

      if (body.whatsappBusinessAccountId !== undefined) {
        db.notifications.whatsappBusinessAccountId = String(
          body.whatsappBusinessAccountId || ''
        ).trim();
      }
      if (body.whatsappPhoneNumberId !== undefined) {
        db.notifications.whatsappPhoneNumberId = String(
          body.whatsappPhoneNumberId || ''
        ).trim();
      }
      if (body.clearWhatsappToken) {
        db.notifications.whatsappApiToken = '';
      } else if (
        typeof body.whatsappApiToken === 'string' &&
        body.whatsappApiToken.trim()
      ) {
        db.notifications.whatsappApiToken = body.whatsappApiToken.trim();
      }
      if (body.whatsappOtpTemplateName !== undefined) {
        db.notifications.whatsappOtpTemplateName = String(
          body.whatsappOtpTemplateName || ''
        ).trim();
      }
      if (body.whatsappOtpTemplateLang !== undefined) {
        db.notifications.whatsappOtpTemplateLang =
          String(body.whatsappOtpTemplateLang || '').trim() || 'en_US';
      }
      if (body.whatsappWebhookUrl !== undefined) {
        db.notifications.whatsappWebhookUrl = String(
          body.whatsappWebhookUrl || ''
        ).trim();
      }
      if (body.adminWhatsapp !== undefined) {
        db.notifications.adminWhatsapp = String(body.adminWhatsapp || '').trim();
      }
      if (body.enforceWhatsapp2FA !== undefined) {
        db.settings.enforceWhatsapp2FA = Boolean(body.enforceWhatsapp2FA);
      }

      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'WHATSAPP_API_CONFIG_UPDATED',
        category: 'SECURITY',
        targetType: 'settings',
        targetLabel: 'WhatsApp Business Cloud API',
        updatedValue: {
          hasWabaId: Boolean(db.notifications.whatsappBusinessAccountId),
          hasPhoneNumberId: Boolean(db.notifications.whatsappPhoneNumberId),
          hasToken: Boolean(db.notifications.whatsappApiToken),
          templateName: db.notifications.whatsappOtpTemplateName || '(text fallback)',
          enforceWhatsapp2FA: Boolean(db.settings.enforceWhatsapp2FA),
        },
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ settings: getSafePortalSettings(db, 'super_admin') });
    }
  );

  app.get(
    '/api/admin/security/whatsapp-logs',
    requireSuperAdmin,
    (_req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const creds = resolveEffectiveWhatsappCredentials(db);
      res.json({
        logs: db.whatsappDeliveryLogs.slice(0, 150),
        status: {
          cloudApiReady: creds.cloudApiReady,
          webhookConfigured: Boolean(creds.webhookUrl),
          templateConfigured: Boolean(creds.otpTemplateName),
          hasWabaId: Boolean(creds.businessAccountId),
          hasPhoneNumberId: Boolean(creds.phoneNumberId),
          hasAccessToken: Boolean(creds.accessToken),
          envOverrideActive: Boolean(
            process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN
          ),
        },
      });
    }
  );

  app.post(
    '/api/admin/security/whatsapp/test',
    requireSuperAdmin,
    async (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const countryCode = String(req.body?.countryCode || '+91').trim() || '+91';
      const targetPhone = String(
        req.body?.phone || db.notifications.adminWhatsapp || req.authUser?.whatsappNumber || req.authUser?.phone || ''
      ).trim();
      const e164Digits = formatWhatsappDigits(targetPhone, countryCode);
      if (e164Digits.length < 10) {
        res.status(400).json({
          error: 'Enter a valid test WhatsApp number (with country code).',
        });
        return;
      }

      const testCode = String(crypto.randomInt(100000, 1000000));
      const delivery = await sendWhatsappOtpViaProvider({
        db,
        e164Digits,
        otp: testCode,
        purpose: 'TEST_MESSAGE',
        recipientName: req.authUser?.name,
      });

      appendAuditLog({
        db,
        actor: req.authUser!,
        action: delivery.sent ? 'WHATSAPP_API_TEST_SENT' : 'WHATSAPP_API_TEST_FAILED',
        category: 'SECURITY',
        targetType: 'whatsapp_api',
        targetLabel: maskWhatsappNumber(e164Digits),
        updatedValue: delivery.sent
          ? { messageId: delivery.providerMessageId }
          : { error: delivery.error },
        ip: getClientIp(req),
      });
      saveDb(db);

      if (!delivery.sent) {
        res.status(delivery.apiNotConfigured ? 503 : 502).json({
          error: delivery.error || 'WhatsApp test message failed.',
          apiNotConfigured: Boolean(delivery.apiNotConfigured),
        });
        return;
      }

      res.json({
        ok: true,
        providerMessageId: delivery.providerMessageId,
        maskedPhone: maskWhatsappNumber(e164Digits),
      });
    }
  );

  // ---- ROLE-SPECIFIC FORGOT PASSWORD & SUPER ADMIN RECOVERY APPROVAL WORKFLOW ----
  app.post(
    '/api/auth/forgot-password/student',
    async (req: Request, res: Response) => {
      const db = loadDb();
      const loginId = String(req.body?.email || '').trim().toLowerCase();
      if (!loginId) {
        res.status(400).json({ error: 'Registered Phone Number, Email, or ID is required.' });
        return;
      }

      const student = findStudentByIdentifier(db, loginId);
      if (!student) {
        res.status(404).json({
          error: 'No student account found with this Phone Number, Email, or ID.',
        });
        return;
      }

      const waCreds = resolveEffectiveWhatsappCredentials(db);
      const rawPhone = student.whatsappNumber || student.phone || '';
      const hasPhone = rawPhone.replace(/\D/g, '').length >= 10;
      const canWhatsapp = (waCreds.cloudApiReady || Boolean(waCreds.webhookUrl)) && hasPhone;

      if (!canWhatsapp) {
        res.status(503).json({
          error: !hasPhone
            ? 'No registered 10-digit phone number found on this student account. Submit a Support Login Help request below.'
            : 'Phone / WhatsApp OTP delivery is not configured yet. Please submit a Support Login Help request below so Support Staff can assist you.',
          useSupportHelp: true,
        });
        return;
      }

      const e164Phone = formatWhatsappDigits(rawPhone, student.countryCode || '+91');
      const result = await issueWhatsappOtpChallenge({
        db,
        purpose: 'PASSWORD_RECOVERY',
        deliveryPurpose: 'PASSWORD_RECOVERY',
        e164Phone,
        userId: student.id,
        email: student.email,
        recipientName: student.name,
        ip: getClientIp(req),
      });
      saveDb(db);
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      res.json({
        ok: true,
        channel: 'WHATSAPP',
        challengeId: result.challengeId,
        maskedPhone: result.maskedPhone,
        expiresAt: result.expiresAt,
        resendAvailableAt: result.resendAvailableAt,
      });
    }
  );

  // ---- FORGOT LOGIN ID / EMAIL RECOVERY (ADMIN & STUDENT) ----
  app.post('/api/auth/forgot-id', async (req: Request, res: Response) => {
    const db = loadDb();
    const portal = req.body?.portal === 'student' ? 'student' : 'admin';
    const method = String(req.body?.method || 'password').toLowerCase();
    const nameInput = String(req.body?.name || '').trim().toLowerCase();
    const phoneInput = String(req.body?.phone || req.body?.whatsappNumber || '').trim();
    const phone10 = normalizePhone10(phoneInput);
    const countryCode = String(req.body?.countryCode || '+91').trim() || '+91';
    const passwordInput = String(req.body?.password || '');
    const recoveryPinInput = String(req.body?.recoveryPin || '').trim();
    const backupCodeInput = String(req.body?.backupCode || '').trim();
    const challengeId = String(req.body?.challengeId || '').trim();
    const otpCode = String(req.body?.code || '').trim();
    const ip = getClientIp(req);

    const pool: StoredUser[] =
      portal === 'admin'
        ? db.admins.length > 0
          ? db.admins
          : db.admin
            ? [db.admin]
            : []
        : db.students;

    if (pool.length === 0) {
      res.status(404).json({
        error:
          portal === 'admin'
            ? 'No Administrator accounts exist on this portal yet.'
            : 'No Student accounts are registered yet.',
      });
      return;
    }

    const matchesFilter = (u: StoredUser) => {
      if (nameInput) {
        const uName = String(u.name || '').trim().toLowerCase();
        if (!uName.includes(nameInput) && !nameInput.includes(uName)) {
          return false;
        }
      }
      if (phone10) {
        const p1 = normalizePhone10(u.phone);
        const p2 = normalizePhone10(u.whatsappNumber);
        if (p1 !== phone10 && p2 !== phone10) {
          return false;
        }
      }
      return true;
    };

    // Method 1: Verify via Official WhatsApp OTP
    if (method === 'whatsapp_otp') {
      if (challengeId && otpCode) {
        const check = verifyOtpChallengeCode({
          db,
          challengeId,
          code: otpCode,
          consumeImmediately: true,
        });
        if (!check.valid || !check.challenge) {
          saveDb(db);
          res.status(400).json({ error: check.error || 'Invalid or expired OTP.' });
          return;
        }
        const chPhone10 = normalizePhone10(check.challenge.e164Phone);
        const matched = pool.filter(
          (u) =>
            u.id === check.challenge?.userId ||
            (chPhone10 &&
              (normalizePhone10(u.phone) === chPhone10 ||
                normalizePhone10(u.whatsappNumber) === chPhone10))
        );
        if (matched.length === 0) {
          res.status(404).json({ error: 'No account matched the verified WhatsApp number.' });
          return;
        }
        saveDb(db);
        res.json({
          ok: true,
          recoveredAccounts: matched.map((u) => ({
            name: u.name,
            email: u.email,
            role: u.role,
            adminRole: u.adminRole || null,
          })),
        });
        return;
      }

      if (!phone10) {
        res.status(400).json({
          error: 'Enter your registered 10-digit WhatsApp / Mobile number.',
        });
        return;
      }
      const candidates = pool.filter(
        (u) =>
          normalizePhone10(u.phone) === phone10 ||
          normalizePhone10(u.whatsappNumber) === phone10
      );
      if (candidates.length === 0) {
        res.status(404).json({
          error: `No ${portal} account found with this WhatsApp / Mobile number.`,
        });
        return;
      }
      const target = candidates[0];
      const e164Phone = formatWhatsappDigits(
        target.whatsappNumber || target.phone || phoneInput,
        target.countryCode || countryCode
      );
      const issued = await issueWhatsappOtpChallenge({
        db,
        purpose: 'PASSWORD_RECOVERY',
        deliveryPurpose: 'PASSWORD_RECOVERY',
        e164Phone,
        userId: target.id,
        email: target.email,
        recipientName: target.name,
        ip,
      });
      saveDb(db);
      if (!issued.ok) {
        res.status(issued.statusCode).json({
          error: issued.error,
          apiNotConfigured: Boolean(issued.apiNotConfigured),
        });
        return;
      }
      res.json({
        ok: true,
        step: 'VERIFY_OTP',
        challengeId: issued.challengeId,
        maskedPhone: issued.maskedPhone,
        expiresAt: issued.expiresAt,
      });
      return;
    }

    // Method 2: Single-use Backup Recovery Code lookup (Admin accounts)
    if (method === 'backup_code') {
      if (!backupCodeInput) {
        res.status(400).json({ error: 'Enter your Backup Recovery Code (e.g. ABCD-1234).' });
        return;
      }
      const matched = pool.filter(
        (u) => matchesFilter(u) && verifyBackupCodeMatch(u, backupCodeInput).matched
      );
      if (matched.length === 0) {
        res.status(401).json({
          error: 'Backup Recovery Code did not match any account with those details.',
        });
        return;
      }
      appendAuditLog({
        db,
        actor: matched[0],
        action: 'FORGOT_LOGIN_ID_RECOVERED',
        category: 'SECURITY',
        targetType: matched[0].role,
        targetId: matched[0].id,
        targetLabel: matched[0].email,
        updatedValue: { method: 'backup_code' },
        ip,
      });
      saveDb(db);
      res.json({
        ok: true,
        recoveredAccounts: matched.map((u) => ({
          name: u.name,
          email: u.email,
          role: u.role,
          adminRole: u.adminRole || null,
        })),
      });
      return;
    }

    // Method 3: Security Recovery PIN verification
    if (method === 'recovery_pin') {
      if (!recoveryPinInput) {
        res.status(400).json({ error: 'Enter your Security Recovery PIN.' });
        return;
      }
      if (!nameInput && !phone10) {
        res.status(400).json({
          error: 'Enter your Full Name or Registered Mobile/WhatsApp Number along with your Security Recovery PIN.',
        });
        return;
      }
      const matched = pool.filter(
        (u) =>
          matchesFilter(u) &&
          Boolean(u.recoveryPinHash) &&
          verifyPassword(recoveryPinInput, u.recoveryPinHash!)
      );
      if (matched.length === 0) {
        res.status(401).json({
          error:
            'No matching account found for that Name/Phone and Security Recovery PIN.',
        });
        return;
      }
      appendAuditLog({
        db,
        actor: matched[0],
        action: 'FORGOT_LOGIN_ID_RECOVERED',
        category: 'SECURITY',
        targetType: matched[0].role,
        targetId: matched[0].id,
        targetLabel: matched[0].email,
        updatedValue: { method: 'recovery_pin' },
        ip,
      });
      saveDb(db);
      res.json({
        ok: true,
        recoveredAccounts: matched.map((u) => ({
          name: u.name,
          email: u.email,
          role: u.role,
          adminRole: u.adminRole || null,
        })),
      });
      return;
    }

    // Method 4: Verify using Account Password + Full Name or Mobile Number
    if (!passwordInput) {
      res.status(400).json({ error: 'Enter your account password to reveal your Login ID.' });
      return;
    }
    if (!nameInput && !phone10) {
      res.status(400).json({
        error: 'Enter your Full Name or Registered Mobile/WhatsApp number to identify your account.',
      });
      return;
    }
    const matched = pool.filter(
      (u) => matchesFilter(u) && verifyPassword(passwordInput, u.passwordHash)
    );
    if (matched.length === 0) {
      res.status(401).json({
        error: 'Name/Phone and Password did not match any account in this portal.',
      });
      return;
    }

    appendAuditLog({
      db,
      actor: matched[0],
      action: 'FORGOT_LOGIN_ID_RECOVERED',
      category: 'SECURITY',
      targetType: matched[0].role,
      targetId: matched[0].id,
      targetLabel: matched[0].email,
      updatedValue: { method: 'password' },
      ip,
    });
    saveDb(db);
    res.json({
      ok: true,
      recoveredAccounts: matched.map((u) => ({
        name: u.name,
        email: u.email,
        role: u.role,
        adminRole: u.adminRole || null,
      })),
    });
  });

  // Main Super Admin Independent Self-Recovery
  app.post(
    '/api/auth/forgot-password/super-admin',
    async (req: Request, res: Response) => {
      const db = loadDb();
      const loginId = String(req.body?.email || '').trim().toLowerCase();
      const method = String(req.body?.method || 'auto').toLowerCase();
      const superAdmin = getSuperAdmin(db);
      const matchedCandidate = loginId ? findAdminByIdentifier(db, loginId) : undefined;
      const targetSuperAdmin =
        matchedCandidate && isSuperAdmin(matchedCandidate as never)
          ? findAdminById(db, matchedCandidate.id) || matchedCandidate
          : null;

      if (!superAdmin || !loginId || !targetSuperAdmin) {
        res.status(404).json({
          error:
            'No Main Super Admin account matches this ID, Email, or Phone number.',
        });
        return;
      }

      // Option 0: Security Recovery PIN verification (works offline without WhatsApp OTP)
      if (method === 'recovery_pin') {
        const pin = String(req.body?.recoveryPin || '').trim();
        if (!targetSuperAdmin.recoveryPinHash) {
          res.status(400).json({
            error:
              'Security Recovery PIN was not set for this Owner account. Use Backup Recovery Code or Phone / WhatsApp OTP.',
          });
          return;
        }
        if (!pin || !verifyPassword(pin, targetSuperAdmin.recoveryPinHash)) {
          appendAuditLog({
            db,
            actor: targetSuperAdmin,
            action: 'SUPER_ADMIN_RECOVERY_PIN_FAILED',
            category: 'SECURITY',
            targetType: 'admin',
            targetId: targetSuperAdmin.id,
            ip: getClientIp(req),
          });
          saveDb(db);
          res.status(401).json({ error: 'Incorrect Security Recovery PIN.' });
          return;
        }
        const resetChallengeToken = signToken(
          {
            sub: targetSuperAdmin.id,
            role: 'admin',
            tv: targetSuperAdmin.tokenVersion || 1,
            purpose: 'password_reset_challenge',
          },
          db.authSecret,
          1000 * 60 * 10
        );
        appendAuditLog({
          db,
          actor: targetSuperAdmin,
          action: 'SUPER_ADMIN_RECOVERY_PIN_VERIFIED',
          category: 'SECURITY',
          targetType: 'admin',
          targetId: targetSuperAdmin.id,
          ip: getClientIp(req),
        });
        saveDb(db);
        res.json({
          ok: true,
          channel: 'RECOVERY_PIN',
          resetChallengeToken,
        });
        return;
      }

      // Option 1: Backup recovery code verification (works with or without TOTP)
      if (method === 'backup_code') {
        const backupCode = String(req.body?.backupCode || '').trim();
        const check = verifyAndConsumeTwoFactorCode(targetSuperAdmin, backupCode);
        if (!check.valid || !check.usedBackupCode) {
          appendAuditLog({
            db,
            actor: targetSuperAdmin,
            action: 'SUPER_ADMIN_RECOVERY_BACKUP_FAILED',
            category: 'SECURITY',
            targetType: 'admin',
            targetId: targetSuperAdmin.id,
            ip: getClientIp(req),
          });
          saveDb(db);
          res.status(401).json({ error: 'Invalid or already used single-use Backup Recovery Code.' });
          return;
        }
        const resetChallengeToken = signToken(
          {
            sub: targetSuperAdmin.id,
            role: 'admin',
            tv: targetSuperAdmin.tokenVersion || 1,
            purpose: 'password_reset_challenge',
          },
          db.authSecret,
          1000 * 60 * 10
        );
        appendAuditLog({
          db,
          actor: targetSuperAdmin,
          action: 'SUPER_ADMIN_RECOVERY_BACKUP_VERIFIED',
          category: 'SECURITY',
          targetType: 'admin',
          targetId: targetSuperAdmin.id,
          ip: getClientIp(req),
        });
        saveDb(db);
        res.json({
          ok: true,
          channel: 'BACKUP_CODE',
          resetChallengeToken,
        });
        return;
      }

      // Option 2: Phone / WhatsApp OTP to Super Admin's registered/owner number
      const waCreds = resolveEffectiveWhatsappCredentials(db);
      const rawOwnerWa =
        targetSuperAdmin.whatsappNumber ||
        targetSuperAdmin.phone ||
        db.notifications.adminWhatsapp ||
        '';
      const canWhatsapp =
        (waCreds.cloudApiReady || Boolean(waCreds.webhookUrl)) &&
        rawOwnerWa.replace(/\D/g, '').length >= 10;

      if (method === 'whatsapp' || (method === 'auto' && canWhatsapp)) {
        if (!canWhatsapp) {
          res.status(503).json({
            error: 'Super Admin phone number or Phone / WhatsApp OTP API is not configured. Use Security Recovery PIN or Backup Recovery Code.',
            suggestOfflineMethods: true,
            hasBackupCodes: (targetSuperAdmin.twoFactorBackupHashes?.length || 0) > 0,
            hasRecoveryPin: Boolean(targetSuperAdmin.recoveryPinHash),
          });
          return;
        }
        const e164Phone = formatWhatsappDigits(rawOwnerWa, targetSuperAdmin.countryCode || '+91');
        const issued = await issueWhatsappOtpChallenge({
          db,
          purpose: 'PASSWORD_RECOVERY',
          deliveryPurpose: 'PASSWORD_RECOVERY',
          e164Phone,
          userId: targetSuperAdmin.id,
          email: targetSuperAdmin.email,
          recipientName: targetSuperAdmin.name,
          ip: getClientIp(req),
        });
        saveDb(db);
        if (!issued.ok) {
          res.status(issued.statusCode).json({ error: issued.error });
          return;
        }
        res.json({
          ok: true,
          channel: 'WHATSAPP',
          challengeId: issued.challengeId,
          maskedPhone: issued.maskedPhone,
          expiresAt: issued.expiresAt,
          resendAvailableAt: issued.resendAvailableAt,
        });
        return;
      }

      res.status(503).json({
        error:
          'Phone / WhatsApp OTP is not configured yet. Use your Security Recovery PIN or Emergency Backup Recovery Code.',
        suggestOfflineMethods: true,
        hasBackupCodes: (targetSuperAdmin.twoFactorBackupHashes?.length || 0) > 0,
        hasRecoveryPin: Boolean(targetSuperAdmin.recoveryPinHash),
      });
    }
  );

  // Non-Super-Admin Password Recovery Request (REQUIRES MAIN SUPER ADMIN APPROVAL)
  app.post('/api/auth/forgot-password/admin-request', (req: Request, res: Response) => {
    const db = loadDb();
    const loginId = String(req.body?.email || '').trim().toLowerCase();
    if (!loginId) {
      res.status(400).json({ error: 'Registered Admin Email / ID or Phone is required.' });
      return;
    }
    const target = findAdminByIdentifier(db, loginId);
    if (!target) {
      res.status(404).json({
        error: 'No staff / sub-admin account found with this Email, ID, or Phone.',
      });
      return;
    }
    if (getEffectiveAdminRole(target as never) === 'SUPER_ADMIN') {
      res.status(400).json({
        error: 'Main Super Admin uses independent self-recovery (Phone / WhatsApp OTP, Recovery PIN, or Backup Code).',
      });
      return;
    }

    // Expire outdated requests
    const now = Date.now();
    for (const r of db.passwordRecoveryRequests) {
      if ((r.status === 'PENDING' || r.status === 'APPROVED') && r.expiresAt && Date.parse(r.expiresAt) < now) {
        r.status = 'EXPIRED';
      }
    }

    const existingPending = db.passwordRecoveryRequests.find(
      (r) => r.userId === target.id && r.status === 'PENDING'
    );
    if (existingPending) {
      res.json({
        ok: true,
        alreadyPending: true,
        request: existingPending,
        message:
          'A password recovery request for your account is already PENDING approval by the Main Super Admin.',
      });
      return;
    }

    const role = getEffectiveAdminRole(target as never) || 'ADMIN';
    const record = {
      id: uid(),
      userId: target.id,
      userName: target.name,
      userEmail: target.email,
      userRole: role,
      requestedAt: new Date().toISOString(),
      status: 'PENDING' as const,
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    };
    db.passwordRecoveryRequests.unshift(record);
    if (db.passwordRecoveryRequests.length > 300) {
      db.passwordRecoveryRequests = db.passwordRecoveryRequests.slice(0, 300);
    }

    const superAdmin = getSuperAdmin(db);
    if (superAdmin) {
      pushNotification({
        db,
        recipientUserId: superAdmin.id,
        type: 'PASSWORD_RECOVERY',
        title: `Password Recovery Request (${role})`,
        message: `${target.name} (${target.email}) requested a password reset. Approval required from Main Super Admin before reset token can be issued.`,
        actionPage: 'admin_team',
        relatedId: record.id,
      });
    }

    appendAuditLog({
      db,
      actor: target,
      action: 'PASSWORD_RECOVERY_REQUESTED',
      category: 'SECURITY',
      targetType: 'recovery_request',
      targetId: record.id,
      targetLabel: `${target.email} (${role})`,
      ip: getClientIp(req),
    });

    saveDb(db);
    res.status(201).json({
      ok: true,
      request: record,
      message:
        'Password recovery request sent to the Main Super Admin. You will receive an approved reset token once the Main Super Admin approves your request.',
    });
  });

  // Main Super Admin Recovery Approval Dashboard APIs (Strictly Super Admin ONLY!)
  app.get(
    '/api/admin/security/recovery-requests',
    requireSuperAdmin,
    (_req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const now = Date.now();
      let dirty = false;
      for (const r of db.passwordRecoveryRequests) {
        if (
          (r.status === 'PENDING' || r.status === 'APPROVED') &&
          r.expiresAt &&
          Date.parse(r.expiresAt) < now
        ) {
          r.status = 'EXPIRED';
          dirty = true;
        }
      }
      if (dirty) saveDb(db);
      res.json({
        requests: db.passwordRecoveryRequests.map((r) => ({
          id: r.id,
          userId: r.userId,
          userName: r.userName,
          userEmail: r.userEmail,
          userRole: r.userRole,
          requestedAt: r.requestedAt,
          status: r.status,
          reviewedById: r.reviewedById,
          reviewedByName: r.reviewedByName,
          reviewedAt: r.reviewedAt,
          rejectionReason: r.rejectionReason,
          deliveryChannel: r.deliveryChannel,
          expiresAt: r.expiresAt,
          completedAt: r.completedAt,
        })),
      });
    }
  );

  app.post(
    '/api/admin/security/recovery-requests/:id/approve',
    requireSuperAdmin,
    async (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const reqRec = db.passwordRecoveryRequests.find((r) => r.id === req.params.id);
      if (!reqRec) {
        res.status(404).json({ error: 'Password recovery request not found.' });
        return;
      }
      if (reqRec.userRole === 'SUPER_ADMIN') {
        res.status(403).json({
          error: 'Main Super Admin password resets are never handled via team requests.',
        });
        return;
      }
      if (reqRec.status !== 'PENDING') {
        res.status(400).json({
          error: `Request cannot be approved because its status is ${reqRec.status}.`,
        });
        return;
      }

      const targetUser = findAdminById(db, reqRec.userId);
      if (!targetUser) {
        res.status(404).json({ error: 'Target admin account no longer exists.' });
        return;
      }

      // Generate cryptographic single-use reset token (valid 30 mins), store only salted HMAC hash
      const plainToken = `ATP-RST-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
      const salt = crypto.randomBytes(16).toString('hex');
      reqRec.resetTokenSalt = salt;
      reqRec.resetTokenHash = crypto
        .createHmac('sha256', db.authSecret)
        .update(`${salt}:${plainToken}`)
        .digest('hex');
      reqRec.status = 'APPROVED';
      reqRec.reviewedById = actor.id;
      reqRec.reviewedByName = actor.name;
      reqRec.reviewedAt = new Date().toISOString();
      reqRec.expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      let deliveryChannel: 'WHATSAPP' | 'MANUAL_PORTAL_TOKEN' = 'MANUAL_PORTAL_TOKEN';
      const waCreds = resolveEffectiveWhatsappCredentials(db);
      const rawPhone = targetUser.whatsappNumber || targetUser.phone || '';
      if ((waCreds.cloudApiReady || waCreds.webhookUrl) && rawPhone.replace(/\D/g, '').length >= 10) {
        deliveryChannel = 'WHATSAPP';
      }
      reqRec.deliveryChannel = deliveryChannel;

      appendAuditLog({
        db,
        actor,
        action: 'PASSWORD_RECOVERY_APPROVED',
        category: 'SECURITY',
        targetType: 'recovery_request',
        targetId: reqRec.id,
        targetLabel: `${reqRec.userEmail} (${reqRec.userRole})`,
        updatedValue: { deliveryChannel, expiresAt: reqRec.expiresAt },
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({
        ok: true,
        request: {
          id: reqRec.id,
          userId: reqRec.userId,
          userName: reqRec.userName,
          userEmail: reqRec.userEmail,
          userRole: reqRec.userRole,
          requestedAt: reqRec.requestedAt,
          status: reqRec.status,
          reviewedByName: reqRec.reviewedByName,
          reviewedAt: reqRec.reviewedAt,
          deliveryChannel: reqRec.deliveryChannel,
          expiresAt: reqRec.expiresAt,
        },
        // Shown once to the Main Super Admin so they can hand off the approved token
        oneTimeResetToken: plainToken,
      });
    }
  );

  app.post(
    '/api/admin/security/recovery-requests/:id/reject',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const reqRec = db.passwordRecoveryRequests.find((r) => r.id === req.params.id);
      if (!reqRec) {
        res.status(404).json({ error: 'Password recovery request not found.' });
        return;
      }
      if (reqRec.status !== 'PENDING') {
        res.status(400).json({ error: `Request is already ${reqRec.status}.` });
        return;
      }

      const reason =
        String(req.body?.reason || '').trim() || 'Rejected by Main Super Admin.';
      reqRec.status = 'REJECTED';
      reqRec.reviewedById = actor.id;
      reqRec.reviewedByName = actor.name;
      reqRec.reviewedAt = new Date().toISOString();
      reqRec.rejectionReason = reason;

      appendAuditLog({
        db,
        actor,
        action: 'PASSWORD_RECOVERY_REJECTED',
        category: 'SECURITY',
        targetType: 'recovery_request',
        targetId: reqRec.id,
        targetLabel: `${reqRec.userEmail} (${reqRec.userRole})`,
        updatedValue: { reason },
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ ok: true, request: reqRec });
    }
  );

  // Unified Completion Endpoint for Student / Super Admin / Approved Staff Admin Password Reset
  app.post('/api/auth/forgot-password/complete', (req: Request, res: Response) => {
    const db = loadDb();
    const newPassword = String(req.body?.newPassword || '');
    const ip = getClientIp(req);

    // Case 1: Sub-Admin Approved Recovery Token
    const resetToken = String(req.body?.resetToken || '').trim().toUpperCase();
    if (resetToken) {
      if (newPassword.length < 8) {
        res.status(400).json({ error: 'Admin password must be at least 8 characters.' });
        return;
      }
      let matchedReq = null as DatabaseSchema['passwordRecoveryRequests'][number] | null;
      for (const r of db.passwordRecoveryRequests) {
        if (r.status !== 'APPROVED' || !r.resetTokenHash || !r.resetTokenSalt) continue;
        if (r.expiresAt && Date.parse(r.expiresAt) < Date.now()) {
          r.status = 'EXPIRED';
          continue;
        }
        const candHash = crypto
          .createHmac('sha256', db.authSecret)
          .update(`${r.resetTokenSalt}:${resetToken}`)
          .digest('hex');
        const a = Buffer.from(candHash, 'hex');
        const b = Buffer.from(r.resetTokenHash, 'hex');
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          matchedReq = r;
          break;
        }
      }

      if (!matchedReq) {
        saveDb(db);
        res.status(401).json({
          error:
            'Invalid, unapproved, or expired Password Reset Token. Only requests approved by Main Super Admin can be reset.',
        });
        return;
      }

      const targetAdmin = findAdminById(db, matchedReq.userId);
      if (!targetAdmin) {
        res.status(404).json({ error: 'Admin account not found.' });
        return;
      }

      targetAdmin.passwordHash = hashPassword(newPassword);
      targetAdmin.mustChangePassword = false;
      revokeUserSessions(db, targetAdmin, 'Password recovered via Main Super Admin approval');
      matchedReq.status = 'COMPLETED';
      matchedReq.completedAt = new Date().toISOString();
      matchedReq.resetTokenHash = undefined;
      matchedReq.resetTokenSalt = undefined;

      appendAuditLog({
        db,
        actor: targetAdmin,
        action: 'PASSWORD_RECOVERY_COMPLETED',
        category: 'SECURITY',
        targetType: 'recovery_request',
        targetId: matchedReq.id,
        targetLabel: targetAdmin.email,
        ip,
      });
      saveDb(db);
      res.json({
        ok: true,
        message: 'Password updated successfully. All previous sessions have been terminated.',
      });
      return;
    }

    // Case 2: Main Super Admin 2FA Backup Code Challenge Token
    const resetChallengeToken = String(req.body?.resetChallengeToken || '').trim();
    if (resetChallengeToken) {
      if (newPassword.length < 8) {
        res.status(400).json({ error: 'Admin password must be at least 8 characters.' });
        return;
      }
      const payload = verifyToken(
        resetChallengeToken,
        db.authSecret,
        'password_reset_challenge'
      );
      if (!payload) {
        res.status(401).json({ error: 'Recovery session expired. Verify backup code again.' });
        return;
      }
      const superAdmin = findAdminById(db, payload.sub);
      if (!superAdmin || !isSuperAdmin(superAdmin as never)) {
        res.status(403).json({ error: 'Unauthorized recovery token.' });
        return;
      }
      superAdmin.passwordHash = hashPassword(newPassword);
      revokeUserSessions(db, superAdmin, 'Main Super Admin password recovered via Backup Code');
      appendAuditLog({
        db,
        actor: superAdmin,
        action: 'SUPER_ADMIN_PASSWORD_RECOVERED',
        category: 'SECURITY',
        targetType: 'admin',
        targetId: superAdmin.id,
        ip,
      });
      saveDb(db);
      res.json({
        ok: true,
        message: 'Main Super Admin password reset complete. Sign in with your new password.',
      });
      return;
    }

    // Case 3: Student or Super Admin OTP Challenge (WhatsApp / Email)
    const challengeId = String(req.body?.challengeId || '').trim();
    const code = String(req.body?.code || '').trim();
    if (!challengeId || !code) {
      res.status(400).json({ error: 'Verification code or approved reset token is required.' });
      return;
    }

    const check = verifyOtpChallengeCode({
      db,
      challengeId,
      code,
      consumeImmediately: true,
    });
    if (!check.valid || !check.challenge || check.challenge.purpose !== 'PASSWORD_RECOVERY') {
      saveDb(db);
      res.status(400).json({ error: check.error || 'Invalid or expired verification code.' });
      return;
    }

    const targetUser =
      (check.challenge.userId &&
        (findAdminById(db, check.challenge.userId) ||
          db.students.find((s) => s.id === check.challenge!.userId))) ||
      null;
    if (!targetUser) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const minLen = targetUser.role === 'admin' ? 8 : 6;
    if (newPassword.length < minLen) {
      res.status(400).json({
        error: `New password must be at least ${minLen} characters.`,
      });
      return;
    }

    targetUser.passwordHash = hashPassword(newPassword);
    revokeUserSessions(db, targetUser, 'Password reset completed');
    appendAuditLog({
      db,
      actor: targetUser,
      action:
        targetUser.role === 'admin'
          ? 'SUPER_ADMIN_PASSWORD_RECOVERED'
          : 'STUDENT_PASSWORD_RECOVERED',
      category: 'SECURITY',
      targetType: targetUser.role,
      targetId: targetUser.id,
      targetLabel: targetUser.email,
      ip,
    });
    saveDb(db);
    res.json({
      ok: true,
      message: 'Your password has been updated. All active sessions were invalidated.',
    });
  });
}
