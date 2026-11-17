import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ActivityLogEntry,
  AdminAccountStatus,
  AdminInvitation,
  AdminPermission,
  AdminRole,
  AdminSessionRecord,
  Announcement,
  AssignmentSubmission,
  Bundle,
  Coupon,
  Course,
  CourseAssignmentHistoryEntry,
  CourseVersionRecord,
  CustomCertificateRecord,
  InternalNotification,
  IssuedCertificateMeta,
  LiveClassSession,
  Order,
  PasswordRecoveryRequest,
  PaymentMethod,
  PlatformLinksConfig,
  PortalSettings,
  ProgressMap,
  QuizAttempt,
  SupportTicket,
  User,
  UserRole,
  WelcomeShowcase,
  WhatsappDeliveryLog,
} from '../src/types/lms.ts';
import { DEFAULT_ROLE_PERMISSIONS, getCourseApprovalStatus } from '../src/utils/rbac.ts';

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  countryCode?: string;
  whatsappNumber?: string;
  whatsappVerified?: boolean;
  whatsappVerifiedAt?: string;
  state?: string;
  guardianName?: string;
  address?: string;
  city?: string;
  pincode?: string;
  enrollmentNo?: string;
  passwordHash: string;
  role: UserRole;
  adminRole?: AdminRole;
  requestedDesignation?: Exclude<AdminRole, 'SUPER_ADMIN'>;
  accountStatus?: AdminAccountStatus;
  rejectionReason?: string;
  permissions?: AdminPermission[];
  assignedCourseIds?: string[];
  coursePermissions?: Record<string, AdminPermission[]>;
  active: boolean;
  suspended?: boolean;
  suspendedReason?: string;
  suspendedAt?: string;
  tokenVersion?: number;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  twoFactorBackupHashes?: string[];
  recoveryPinHash?: string;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  lastLoginIp?: string;
  grantedCourseIds: string[];
  createdAt: string;
}

export interface NotificationSettings {
  smtpUser: string;
  smtpPass: string;
  senderName: string;
  adminWhatsapp: string;
  whatsappWebhookUrl: string;
  whatsappBusinessAccountId: string;
  whatsappApiToken: string;
  whatsappPhoneNumberId: string;
  whatsappOtpTemplateName: string;
  whatsappOtpTemplateLang: string;
}

export interface OtpChallengeRecord {
  id: string;
  purpose: 'REGISTRATION' | 'LOGIN_2FA' | 'PASSWORD_RECOVERY' | 'WHATSAPP_VERIFY';
  userId?: string;
  email?: string;
  e164Phone: string;
  otpSalt: string;
  otpHash: string;
  attempts: number;
  maxAttempts: number;
  resendCount: number;
  lastSentAt: string;
  expiresAt: string;
  verified: boolean;
  verifiedAt?: string;
  consumed: boolean;
  ip?: string;
  createdAt: string;
}

export interface PasswordRecoveryStoredRecord extends PasswordRecoveryRequest {
  resetTokenHash?: string;
  resetTokenSalt?: string;
}

export interface LoginAttemptRecord {
  id: string;
  email: string;
  ip: string;
  success: boolean;
  reason?: string;
  timestamp: string;
}

export interface DatabaseSchema {
  authSecret: string;
  admin: StoredUser | null;
  admins: StoredUser[];
  students: StoredUser[];
  courses: Course[];
  orders: Order[];
  coupons: Coupon[];
  bundles: Bundle[];
  methods: PaymentMethod[];
  settings: PortalSettings;
  notifications: NotificationSettings;
  announcement: Announcement | null;
  liveClass: LiveClassSession | null;
  welcomeVideo: WelcomeShowcase;
  platformLinks: PlatformLinksConfig;
  certificates: CustomCertificateRecord[];
  issuedCertificates: IssuedCertificateMeta[];
  progress: ProgressMap;
  watched: ProgressMap;
  invitations: AdminInvitation[];
  sessions: AdminSessionRecord[];
  loginAttempts: LoginAttemptRecord[];
  auditLogs: ActivityLogEntry[];
  courseVersions: CourseVersionRecord[];
  assignmentHistory: CourseAssignmentHistoryEntry[];
  internalNotifications: InternalNotification[];
  supportTickets: SupportTicket[];
  quizAttempts: QuizAttempt[];
  assignmentSubmissions: AssignmentSubmission[];
  otpChallenges: OtpChallengeRecord[];
  passwordRecoveryRequests: PasswordRecoveryStoredRecord[];
  whatsappDeliveryLogs: WhatsappDeliveryLog[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'lms-db.json');

const DEFAULT_METHODS: PaymentMethod[] = [
  {
    id: 'upi',
    name: 'UPI / QR Code (Google Pay · PhonePe · Paytm)',
    type: 'upi_qr',
    upiId: '',
    qrCodeUrl: '',
    gatewayProvider: '',
    gatewayUrl: '',
    gatewayKeyId: '',
    info: 'Scan the Admin QR code or pay via UPI ID, then enter your Transaction ID / UTR to activate your course immediately.',
    active: true,
  },
];

const DEFAULT_SETTINGS: PortalSettings = {
  brand: 'ARYA TAX PATHSHALA',
  gst: 18,
  gstMode: 'exclusive',
  gstSection: 'Section 9(1) CGST/SGST Act · Educational & Tax Training',
  sacCode: '999293',
  gstNumber: '',
  gstState: 'West Bengal',
  autoGstByState: true,
  stateGstRates: {},
  gstSplit: 'cgst_sgst',
  instantActivation: true,
  threshold: 75,
  certHeading: 'Certificate of Completion',
  certSub: 'has successfully completed the course',
  certSigner: 'Authorized Signatory',
  certFooter: 'This certificate is issued by ARYA TAX PATHSHALA',
  certSignatureUrl: '',
  certSealText: 'CERTIFIED',
  requireTwoFactorForAdmins: false,
  enforceWhatsapp2FA: false,
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  smtpUser: '',
  smtpPass: '',
  senderName: 'ARYA TAX PATHSHALA',
  adminWhatsapp: '',
  whatsappWebhookUrl: '',
  whatsappBusinessAccountId: '',
  whatsappApiToken: '',
  whatsappPhoneNumberId: '',
  whatsappOtpTemplateName: '',
  whatsappOtpTemplateLang: 'en_US',
};

const DEFAULT_WELCOME_VIDEO: WelcomeShowcase = {
  active: true,
  title: 'Course Orientation & Complete Syllabus Overview',
  subtitle:
    'Watch this inbuilt guide to understand GST, Income Tax & TDS modules, live filing workflow, and certification steps.',
  videoUrl: '',
  mentorName: 'Arya Tax Mentor',
  mentorRole: 'Founder & Lead Tax Practitioner · ARYA TAX PATHSHALA',
  photoUrl: '/assets/aistudio/IMG_20251110_092655_764_2c1ee29a.webp',
  autoplay: true,
  loop: true,
  updatedAt: new Date().toISOString(),
};

const DEFAULT_PLATFORM_LINKS: PlatformLinksConfig = {
  heading: 'Important Links & Student Community',
  subtitle:
    'Connect directly on WhatsApp, YouTube, Telegram, Instagram, and official portal channels.',
  links: [],
  updatedAt: new Date().toISOString(),
};

function createEmptyDb(): DatabaseSchema {
  return {
    authSecret: crypto.randomBytes(32).toString('hex'),
    admin: null,
    admins: [],
    students: [],
    courses: [],
    orders: [],
    coupons: [],
    bundles: [],
    methods: DEFAULT_METHODS,
    settings: { ...DEFAULT_SETTINGS },
    notifications: { ...DEFAULT_NOTIFICATIONS },
    announcement: null,
    liveClass: null,
    welcomeVideo: { ...DEFAULT_WELCOME_VIDEO },
    platformLinks: { ...DEFAULT_PLATFORM_LINKS },
    certificates: [],
    issuedCertificates: [],
    progress: {},
    watched: {},
    invitations: [],
    sessions: [],
    loginAttempts: [],
    auditLogs: [],
    courseVersions: [],
    assignmentHistory: [],
    internalNotifications: [],
    supportTickets: [],
    quizAttempts: [],
    assignmentSubmissions: [],
    otpChallenges: [],
    passwordRecoveryRequests: [],
    whatsappDeliveryLogs: [],
  };
}

let cachedDb: DatabaseSchema | null = null;

function normalizeStoredAdmin(raw: StoredUser, forceSuperAdmin = false): StoredUser {
  const adminRole: AdminRole = forceSuperAdmin
    ? 'SUPER_ADMIN'
    : raw.adminRole || 'ADMIN';
  const isOwner = adminRole === 'SUPER_ADMIN';
  const accountStatus: AdminAccountStatus = isOwner
    ? 'ACTIVE'
    : raw.accountStatus
      ? raw.accountStatus
      : raw.suspended
        ? 'SUSPENDED'
        : raw.active
          ? 'ACTIVE'
          : 'DEACTIVATED';
  return {
    ...raw,
    email: String(raw.email || '').trim().toLowerCase(),
    role: 'admin',
    adminRole,
    accountStatus,
    active: isOwner ? true : Boolean(raw.active),
    permissions:
      isOwner
        ? DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN
        : Array.isArray(raw.permissions)
          ? raw.permissions
          : DEFAULT_ROLE_PERMISSIONS[adminRole] || [],
    assignedCourseIds: Array.isArray(raw.assignedCourseIds)
      ? raw.assignedCourseIds
      : [],
    coursePermissions: raw.coursePermissions || {},
    tokenVersion: typeof raw.tokenVersion === 'number' ? raw.tokenVersion : 1,
    suspended: isOwner ? false : Boolean(raw.suspended),
    twoFactorEnabled: Boolean(raw.twoFactorEnabled),
    grantedCourseIds: Array.isArray(raw.grantedCourseIds)
      ? raw.grantedCourseIds
      : [],
  };
}

function normalizeCourse(c: Course): Course {
  const approvalStatus = getCourseApprovalStatus(c);
  return {
    ...c,
    approvalStatus,
    visibility: approvalStatus === 'PUBLISHED' ? 'published' : 'draft',
    approvalHistory: Array.isArray(c.approvalHistory) ? c.approvalHistory : [],
    quizzes: Array.isArray(c.quizzes) ? c.quizzes : [],
    assignments: Array.isArray(c.assignments) ? c.assignments : [],
  };
}

export function normalizePhone10(raw?: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.slice(-10);
}

export function getSuperAdmin(db: DatabaseSchema): StoredUser | null {
  return (
    db.admins.find((a) => a.adminRole === 'SUPER_ADMIN') ||
    (db.admin ? normalizeStoredAdmin(db.admin, true) : null)
  );
}

export function findAdminById(db: DatabaseSchema, id: string): StoredUser | undefined {
  const inAdmins = db.admins.find((a) => a.id === id);
  if (inAdmins) return inAdmins;
  if (db.admin && db.admin.id === id) return db.admin;
  return undefined;
}

export function findAdminByEmail(db: DatabaseSchema, email: string): StoredUser | undefined {
  const lower = String(email || '').trim().toLowerCase();
  if (!lower) return undefined;
  const inAdmins = db.admins.find((a) => a.email.trim().toLowerCase() === lower);
  if (inAdmins) return inAdmins;
  if (db.admin && db.admin.email.trim().toLowerCase() === lower) return db.admin;
  return undefined;
}

export function findAdminByIdentifier(
  db: DatabaseSchema,
  identifier: string
): StoredUser | undefined {
  const byEmail = findAdminByEmail(db, identifier);
  if (byEmail) return byEmail;
  const phone10 = normalizePhone10(identifier);
  if (!phone10) return undefined;
  const allAdmins = db.admins.length > 0 ? db.admins : db.admin ? [db.admin] : [];
  const phoneMatches = allAdmins.filter(
    (a) =>
      normalizePhone10(a.phone) === phone10 ||
      normalizePhone10(a.whatsappNumber) === phone10
  );
  return phoneMatches.length === 1 ? phoneMatches[0] : undefined;
}

export function findStudentByIdentifier(
  db: DatabaseSchema,
  identifier: string
): StoredUser | undefined {
  const lower = String(identifier || '').trim().toLowerCase();
  if (!lower) return undefined;
  const byEmail = db.students.find((s) => s.email.trim().toLowerCase() === lower);
  if (byEmail) return byEmail;
  const phone10 = normalizePhone10(identifier);
  if (!phone10) return undefined;
  const phoneMatches = db.students.filter(
    (s) =>
      normalizePhone10(s.phone) === phone10 ||
      normalizePhone10(s.whatsappNumber) === phone10
  );
  return phoneMatches.length === 1 ? phoneMatches[0] : undefined;
}

export function loadDb(): DatabaseSchema {
  if (cachedDb) return cachedDb;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      const base = createEmptyDb();

      let admins: StoredUser[] = Array.isArray(parsed.admins)
        ? parsed.admins.map((a) => normalizeStoredAdmin(a))
        : [];
      const legacyAdmin = parsed.admin
        ? normalizeStoredAdmin(parsed.admin, true)
        : null;

      if (legacyAdmin && !admins.some((a) => a.id === legacyAdmin.id)) {
        admins = [legacyAdmin, ...admins];
      }
      if (admins.length > 0 && !admins.some((a) => a.adminRole === 'SUPER_ADMIN')) {
        admins[0] = normalizeStoredAdmin(admins[0], true);
      }
      const primarySuperAdmin =
        admins.find((a) => a.adminRole === 'SUPER_ADMIN') || legacyAdmin || null;

      cachedDb = {
        ...base,
        ...parsed,
        authSecret: parsed.authSecret || base.authSecret,
        admin: primarySuperAdmin,
        admins,
        students: Array.isArray(parsed.students)
          ? parsed.students.map((s) => ({
              ...s,
              email: String(s.email || '').trim().toLowerCase(),
              tokenVersion: typeof s.tokenVersion === 'number' ? s.tokenVersion : 1,
              suspended: Boolean(s.suspended),
            }))
          : [],
        courses: Array.isArray(parsed.courses)
          ? parsed.courses.map(normalizeCourse)
          : [],
        orders: Array.isArray(parsed.orders)
          ? parsed.orders.map((o) => {
              if (o.status === 'PAID' && o.invoiceNumber && !o.invoiceSerial) {
                const m = o.invoiceNumber.match(/(\d+)$/);
                if (m) return { ...o, invoiceSerial: Number(m[1]) || undefined };
              }
              return o;
            })
          : [],
        coupons: Array.isArray(parsed.coupons) ? parsed.coupons : [],
        bundles: Array.isArray(parsed.bundles) ? parsed.bundles : [],
        methods:
          Array.isArray(parsed.methods) && parsed.methods.length > 0
            ? parsed.methods.map((m) => ({
                type: 'upi_qr',
                upiId: '',
                qrCodeUrl: '',
                gatewayProvider: '',
                gatewayUrl: '',
                gatewayKeyId: '',
                ...m,
              }))
            : DEFAULT_METHODS,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        notifications: {
          ...DEFAULT_NOTIFICATIONS,
          ...(parsed.notifications || {}),
        },
        announcement: parsed.announcement || null,
        liveClass: parsed.liveClass || null,
        welcomeVideo: {
          ...DEFAULT_WELCOME_VIDEO,
          ...(parsed.welcomeVideo || {}),
          photoUrl:
            parsed.welcomeVideo?.photoUrl || DEFAULT_WELCOME_VIDEO.photoUrl,
        },
        platformLinks: {
          ...DEFAULT_PLATFORM_LINKS,
          ...(parsed.platformLinks || {}),
          links: Array.isArray(parsed.platformLinks?.links)
            ? parsed.platformLinks.links
            : [],
        },
        certificates: Array.isArray(parsed.certificates)
          ? parsed.certificates
          : [],
        issuedCertificates: Array.isArray(parsed.issuedCertificates)
          ? parsed.issuedCertificates
          : [],
        progress: parsed.progress || {},
        watched: parsed.watched || {},
        invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        loginAttempts: Array.isArray(parsed.loginAttempts)
          ? parsed.loginAttempts
          : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        courseVersions: Array.isArray(parsed.courseVersions)
          ? parsed.courseVersions
          : [],
        assignmentHistory: Array.isArray(parsed.assignmentHistory)
          ? parsed.assignmentHistory
          : [],
        internalNotifications: Array.isArray(parsed.internalNotifications)
          ? parsed.internalNotifications
          : [],
        supportTickets: Array.isArray(parsed.supportTickets)
          ? parsed.supportTickets
          : [],
        quizAttempts: Array.isArray(parsed.quizAttempts) ? parsed.quizAttempts : [],
        assignmentSubmissions: Array.isArray(parsed.assignmentSubmissions)
          ? parsed.assignmentSubmissions
          : [],
        otpChallenges: Array.isArray(parsed.otpChallenges)
          ? parsed.otpChallenges
          : [],
        passwordRecoveryRequests: Array.isArray(parsed.passwordRecoveryRequests)
          ? parsed.passwordRecoveryRequests
          : [],
        whatsappDeliveryLogs: Array.isArray(parsed.whatsappDeliveryLogs)
          ? parsed.whatsappDeliveryLogs
          : [],
      };
      return cachedDb;
    }
  } catch {
    // Fallback to clean DB if unreadable
  }
  cachedDb = createEmptyDb();
  saveDb(cachedDb);
  return cachedDb;
}

export function resolveEffectiveWhatsappCredentials(db: DatabaseSchema): {
  businessAccountId: string;
  phoneNumberId: string;
  accessToken: string;
  otpTemplateName: string;
  otpTemplateLang: string;
  webhookUrl: string;
  cloudApiReady: boolean;
} {
  const businessAccountId = (
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
    db.notifications.whatsappBusinessAccountId ||
    ''
  ).trim();
  const phoneNumberId = (
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    db.notifications.whatsappPhoneNumberId ||
    ''
  ).trim();
  const accessToken = (
    process.env.WHATSAPP_ACCESS_TOKEN ||
    db.notifications.whatsappApiToken ||
    ''
  ).trim();
  const otpTemplateName = (
    process.env.WHATSAPP_OTP_TEMPLATE_NAME ||
    db.notifications.whatsappOtpTemplateName ||
    ''
  ).trim();
  const otpTemplateLang = (
    process.env.WHATSAPP_OTP_TEMPLATE_LANG ||
    db.notifications.whatsappOtpTemplateLang ||
    'en_US'
  ).trim();
  const webhookUrl = (
    process.env.WHATSAPP_WEBHOOK_URL ||
    db.notifications.whatsappWebhookUrl ||
    ''
  ).trim();

  return {
    businessAccountId,
    phoneNumberId,
    accessToken,
    otpTemplateName,
    otpTemplateLang,
    webhookUrl,
    cloudApiReady: Boolean(phoneNumberId && accessToken),
  };
}

export function getSafePortalSettings(
  db: DatabaseSchema,
  accessMode: 'super_admin' | 'sub_admin' | 'student'
): PortalSettings {
  const superAdmin = getSuperAdmin(db);
  const resolvedSmtpUser =
    db.notifications.smtpUser ||
    (superAdmin?.email && superAdmin.email.includes('@')
      ? superAdmin.email
      : '');
  const emailConfigured = Boolean(resolvedSmtpUser && db.notifications.smtpPass);
  const wa = resolveEffectiveWhatsappCredentials(db);
  const whatsappConfigured = Boolean(wa.cloudApiReady || wa.webhookUrl);

  if (accessMode === 'sub_admin') {
    // Strict Financial Isolation: Sub-admins receive zero financial/GST/gateway/credential configs
    return {
      brand: db.settings.brand,
      gst: 0,
      gstMode: 'exclusive',
      gstSection: '',
      sacCode: '',
      gstNumber: '',
      gstState: '',
      autoGstByState: false,
      stateGstRates: {},
      gstSplit: 'cgst_sgst',
      instantActivation: false,
      threshold: db.settings.threshold,
      certHeading: db.settings.certHeading,
      certSub: db.settings.certSub,
      certSigner: db.settings.certSigner,
      certFooter: db.settings.certFooter,
      certSignatureUrl: db.settings.certSignatureUrl,
      certSealText: db.settings.certSealText,
      requireTwoFactorForAdmins: Boolean(db.settings.requireTwoFactorForAdmins),
      enforceWhatsapp2FA: Boolean(db.settings.enforceWhatsapp2FA),
      whatsappCloudApiConfigured: wa.cloudApiReady,
    };
  }

  if (accessMode === 'student') {
    return {
      ...db.settings,
      emailConfigured,
      whatsappConfigured,
      whatsappCloudApiConfigured: wa.cloudApiReady,
      adminEmail: superAdmin?.email || '',
      adminWhatsapp: db.notifications.adminWhatsapp || '',
    };
  }

  return {
    ...db.settings,
    emailConfigured,
    whatsappConfigured,
    whatsappCloudApiConfigured: wa.cloudApiReady,
    whatsappBusinessAccountId: wa.businessAccountId,
    whatsappOtpTemplateName: wa.otpTemplateName,
    whatsappOtpTemplateLang: wa.otpTemplateLang,
    adminEmail: superAdmin?.email || '',
    adminWhatsapp: db.notifications.adminWhatsapp || '',
    smtpUser: resolvedSmtpUser,
    smtpPassSet: Boolean(db.notifications.smtpPass),
    senderName: db.notifications.senderName || db.settings.brand,
    whatsappWebhookUrl: wa.webhookUrl,
    whatsappPhoneNumberId: wa.phoneNumberId,
    whatsappTokenSet: Boolean(wa.accessToken),
  };
}

export function saveDb(db: DatabaseSchema): void {
  // Keep db.admin synced with SUPER_ADMIN in db.admins
  const superAdmin =
    db.admins.find((a) => a.adminRole === 'SUPER_ADMIN') || db.admin || null;
  if (superAdmin) {
    superAdmin.adminRole = 'SUPER_ADMIN';
    superAdmin.permissions = DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN;
    if (!db.admins.some((a) => a.id === superAdmin.id)) {
      db.admins.unshift(superAdmin);
    }
    db.admin = superAdmin;
  }

  cachedDb = db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = DB_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function replaceCachedDb(nextDb: DatabaseSchema): void {
  saveDb(nextDb);
  cachedDb = null;
  loadDb();
}

export function uid(): string {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export type SignedTokenPurpose =
  | 'auth'
  | '2fa_challenge'
  | 'whatsapp_2fa_challenge'
  | 'password_reset_challenge';

export interface SignedTokenPayload {
  sub: string;
  role: UserRole;
  sid?: string;
  tv?: number;
  purpose?: SignedTokenPurpose;
  extra?: string;
  exp?: number;
}

export function signToken(
  payload: {
    sub: string;
    role: UserRole;
    sid?: string;
    tv?: number;
    purpose?: SignedTokenPurpose;
    extra?: string;
  },
  secret: string,
  ttlMs = 1000 * 60 * 60 * 24 * 30
): string {
  const data: SignedTokenPayload = {
    sub: payload.sub,
    role: payload.role,
    sid: payload.sid,
    tv: payload.tv ?? 1,
    purpose: payload.purpose || 'auth',
    ...(payload.extra ? { extra: payload.extra } : {}),
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString(
    'base64url'
  );
  const sig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyToken(
  token: string,
  secret: string,
  expectedPurpose: SignedTokenPurpose = 'auth'
): { sub: string; role: UserRole; sid?: string; tv: number; extra?: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as SignedTokenPayload;
    if (!parsed.sub || !parsed.role || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    if ((parsed.purpose || 'auth') !== expectedPurpose) {
      return null;
    }
    return {
      sub: parsed.sub,
      role: parsed.role,
      sid: parsed.sid,
      tv: parsed.tv ?? 1,
      extra: parsed.extra,
    };
  } catch {
    return null;
  }
}

export function sanitizeUser(user: StoredUser): User {
  const adminRole =
    user.role === 'admin' ? user.adminRole || 'SUPER_ADMIN' : undefined;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    countryCode: user.countryCode || '+91',
    whatsappNumber: user.whatsappNumber || user.phone || '',
    whatsappVerified: Boolean(user.whatsappVerified),
    whatsappVerifiedAt: user.whatsappVerifiedAt || '',
    state: user.state || '',
    guardianName: user.guardianName || '',
    address: user.address || '',
    city: user.city || '',
    pincode: user.pincode || '',
    enrollmentNo: user.enrollmentNo || '',
    role: user.role,
    ...(adminRole
      ? {
          adminRole,
          requestedDesignation: user.requestedDesignation,
          accountStatus:
            user.accountStatus ||
            (user.suspended ? 'SUSPENDED' : user.active ? 'ACTIVE' : 'DEACTIVATED'),
          rejectionReason: user.rejectionReason || '',
          permissions:
            adminRole === 'SUPER_ADMIN'
              ? DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN
              : user.permissions || DEFAULT_ROLE_PERMISSIONS[adminRole] || [],
          assignedCourseIds: user.assignedCourseIds || [],
          coursePermissions: user.coursePermissions || {},
          suspended: Boolean(user.suspended),
          suspendedReason: user.suspendedReason || '',
          suspendedAt: user.suspendedAt || '',
          twoFactorEnabled: Boolean(user.twoFactorEnabled),
          backupCodesRemaining: Array.isArray(user.twoFactorBackupHashes)
            ? user.twoFactorBackupHashes.length
            : 0,
          hasRecoveryPin: Boolean(user.recoveryPinHash),
          mustChangePassword: Boolean(user.mustChangePassword),
          lastLoginAt: user.lastLoginAt || '',
          lastLoginIp: user.lastLoginIp || '',
        }
      : {
          hasRecoveryPin: Boolean(user.recoveryPinHash),
        }),
    active: user.active,
    grantedCourseIds: user.grantedCourseIds || [],
    createdAt: user.createdAt,
  };
}
