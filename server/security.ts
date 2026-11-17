import crypto from 'node:crypto';
import type { Request } from 'express';
import type {
  ActivityLogEntry,
  AdminRole,
  AdminSessionRecord,
  Course,
  CourseVersionRecord,
  InternalNotification,
  PageId,
} from '../src/types/lms.ts';
import { getEffectiveAdminRole } from '../src/utils/rbac.ts';
import {
  getSuperAdmin,
  uid,
  type DatabaseSchema,
  type StoredUser,
} from './db.ts';

// ---- RFC 6238 TOTP (Google Authenticator / Authy Compatible) ----
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(byteLen = 20): string {
  const bytes = crypto.randomBytes(byteLen);
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpCode(secret: string, stepOffset = 0): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const buf = Buffer.alloc(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, token: string): boolean {
  const clean = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean) || !secret) return false;
  for (const offset of [-1, 0, 1]) {
    const candidate = generateTotpCode(secret, offset);
    if (
      crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))
    ) {
      return true;
    }
  }
  return false;
}

export function buildOtpAuthUri(accountEmail: string, issuer: string, secret: string): string {
  const cleanIssuer = encodeURIComponent(issuer || 'ARYA TAX PATHSHALA');
  const label = encodeURIComponent(`${issuer || 'ARYA TAX PATHSHALA'}:${accountEmail}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateBackupCodes(count = 6): {
  plain: string[];
  hashes: string[];
} {
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    plain.push(code);
    hashes.push(hashBackupCode(code));
  }
  return { plain, hashes };
}

export function hashBackupCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code.trim().toUpperCase())
    .digest('hex');
}

export function verifyBackupCodeMatch(
  user: StoredUser,
  code: string
): { matched: boolean; index: number } {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return { matched: false, index: -1 };
  const hashes = user.twoFactorBackupHashes || [];
  if (hashes.length === 0) return { matched: false, index: -1 };
  const candidates = [clean];
  if (!clean.includes('-') && /^[A-F0-9]{8}$/.test(clean)) {
    candidates.push(`${clean.slice(0, 4)}-${clean.slice(4)}`);
  }
  for (const cand of candidates) {
    const targetHash = hashBackupCode(cand);
    const idx = hashes.findIndex((h) => h === targetHash);
    if (idx !== -1) return { matched: true, index: idx };
  }
  return { matched: false, index: -1 };
}

export function verifyAndConsumeTwoFactorCode(
  user: StoredUser,
  code: string
): { valid: boolean; usedBackupCode: boolean } {
  const clean = String(code || '').trim();
  if (!clean) {
    return { valid: false, usedBackupCode: false };
  }
  if (user.twoFactorSecret && verifyTotpCode(user.twoFactorSecret, clean)) {
    return { valid: true, usedBackupCode: false };
  }
  const backupMatch = verifyBackupCodeMatch(user, clean);
  if (backupMatch.matched) {
    const hashes = user.twoFactorBackupHashes || [];
    user.twoFactorBackupHashes = hashes.filter((_, i) => i !== backupMatch.index);
    return { valid: true, usedBackupCode: true };
  }
  return { valid: false, usedBackupCode: false };
}

// ---- Request Metadata & Rate Tracking ----
export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function getUserAgent(req: Request): string {
  return String(req.headers['user-agent'] || 'Unknown Device').slice(0, 180);
}

export function createSessionRecord(params: {
  db: DatabaseSchema;
  user: StoredUser;
  req: Request;
  ttlMs?: number;
}): AdminSessionRecord {
  const sid = uid();
  const now = Date.now();
  const ttlMs = params.ttlMs ?? 1000 * 60 * 60 * 24 * 14;
  const session: AdminSessionRecord = {
    sid,
    userId: params.user.id,
    userName: params.user.name,
    userEmail: params.user.email,
    adminRole: params.user.role === 'admin' ? params.user.adminRole || 'SUPER_ADMIN' : undefined,
    ip: getClientIp(params.req),
    userAgent: getUserAgent(params.req),
    createdAt: new Date(now).toISOString(),
    lastActiveAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    revoked: false,
  };
  params.db.sessions.unshift(session);
  if (params.db.sessions.length > 500) {
    params.db.sessions = params.db.sessions.slice(0, 500);
  }
  return session;
}

export function revokeUserSessions(
  db: DatabaseSchema,
  user: StoredUser,
  reason: string
): number {
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  let count = 0;
  for (const s of db.sessions) {
    if (s.userId === user.id && !s.revoked) {
      s.revoked = true;
      s.revokedReason = reason;
      count += 1;
    }
  }
  return count;
}

// ---- Tamper-Resistant Audit Logging ----
export function appendAuditLog(params: {
  db: DatabaseSchema;
  actor: StoredUser | { id: string; name: string; email: string; role: 'SYSTEM' | 'STUDENT'; adminRole?: AdminRole };
  action: string;
  category: ActivityLogEntry['category'];
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  courseId?: string;
  previousValue?: unknown;
  updatedValue?: unknown;
  ip?: string;
}): ActivityLogEntry {
  const actorRole: ActivityLogEntry['actorRole'] =
    params.actor.role === 'admin'
      ? (params.actor as StoredUser).adminRole || 'SUPER_ADMIN'
      : params.actor.role === 'student'
        ? 'STUDENT'
        : params.actor.role;

  const entry: ActivityLogEntry = {
    id: uid(),
    userId: params.actor.id,
    actorName: params.actor.name,
    actorEmail: params.actor.email,
    actorRole,
    action: params.action,
    category: params.category,
    targetType: params.targetType,
    targetId: params.targetId,
    targetLabel: params.targetLabel,
    courseId: params.courseId,
    previousValue:
      params.previousValue !== undefined
        ? typeof params.previousValue === 'string'
          ? params.previousValue.slice(0, 400)
          : JSON.stringify(params.previousValue).slice(0, 400)
        : undefined,
    updatedValue:
      params.updatedValue !== undefined
        ? typeof params.updatedValue === 'string'
          ? params.updatedValue.slice(0, 400)
          : JSON.stringify(params.updatedValue).slice(0, 400)
        : undefined,
    ip: params.ip,
    timestamp: new Date().toISOString(),
  };

  params.db.auditLogs.unshift(entry);
  if (params.db.auditLogs.length > 2000) {
    params.db.auditLogs = params.db.auditLogs.slice(0, 2000);
  }
  return entry;
}

// ---- Notifications ----
export function pushNotification(params: {
  db: DatabaseSchema;
  recipientUserId?: string;
  recipientRole?: InternalNotification['recipientRole'];
  type: InternalNotification['type'];
  title: string;
  message: string;
  actionPage?: PageId;
  relatedId?: string;
}): InternalNotification {
  const notif: InternalNotification = {
    id: uid(),
    recipientUserId: params.recipientUserId,
    recipientRole: params.recipientRole,
    type: params.type,
    title: params.title,
    message: params.message,
    actionPage: params.actionPage,
    relatedId: params.relatedId,
    readByUserIds: [],
    createdAt: new Date().toISOString(),
  };
  params.db.internalNotifications.unshift(notif);
  if (params.db.internalNotifications.length > 500) {
    params.db.internalNotifications = params.db.internalNotifications.slice(0, 500);
  }
  return notif;
}

// ---- Course Version History Snapshots ----
export function snapshotCourseVersion(params: {
  db: DatabaseSchema;
  course: Course;
  editor: StoredUser;
  summary: string;
}): CourseVersionRecord {
  const existingForCourse = params.db.courseVersions.filter(
    (v) => v.courseId === params.course.id
  );
  const nextNumber =
    existingForCourse.length > 0
      ? Math.max(...existingForCourse.map((v) => v.versionNumber)) + 1
      : 1;

  const snapshot: Course = JSON.parse(JSON.stringify(params.course));
  const record: CourseVersionRecord = {
    id: uid(),
    courseId: params.course.id,
    courseTitle: params.course.title,
    versionNumber: nextNumber,
    editorId: params.editor.id,
    editorName: params.editor.name,
    editorRole: getEffectiveAdminRole(params.editor as never) || 'ADMIN',
    summary: params.summary,
    createdAt: new Date().toISOString(),
    snapshot,
  };

  params.db.courseVersions.unshift(record);
  if (params.db.courseVersions.length > 600) {
    params.db.courseVersions = params.db.courseVersions.slice(0, 600);
  }
  return record;
}

// ---- Login Attempt & Suspicious Activity Tracking ----
export function recordLoginAttemptAndCheckBruteForce(params: {
  db: DatabaseSchema;
  email: string;
  ip: string;
  success: boolean;
  reason?: string;
}): { recentFailures: number; isLockedOut: boolean } {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  params.db.loginAttempts.unshift({
    id: uid(),
    email: params.email,
    ip: params.ip,
    success: params.success,
    reason: params.reason,
    timestamp: new Date(now).toISOString(),
  });
  if (params.db.loginAttempts.length > 1000) {
    params.db.loginAttempts = params.db.loginAttempts.slice(0, 1000);
  }

  const recentFailures = params.db.loginAttempts.filter(
    (a) =>
      !a.success &&
      (a.email === params.email || a.ip === params.ip) &&
      now - Date.parse(a.timestamp) < windowMs
  ).length;

  if (!params.success && recentFailures >= 3) {
    const superAdmin = getSuperAdmin(params.db);
    appendAuditLog({
      db: params.db,
      actor: {
        id: 'system',
        name: 'Security Monitor',
        email: params.email,
        role: 'SYSTEM',
      },
      action: 'SUSPICIOUS_LOGIN_ACTIVITY',
      category: 'SECURITY',
      targetType: 'account',
      targetLabel: params.email,
      updatedValue: `${recentFailures} failed login attempts in 15m from IP ${params.ip}`,
      ip: params.ip,
    });
    if (superAdmin) {
      pushNotification({
        db: params.db,
        recipientUserId: superAdmin.id,
        type: 'SECURITY_ALERT',
        title: 'Suspicious Login Alert',
        message: `${recentFailures} failed login attempts detected for "${params.email}" from IP ${params.ip}.`,
        actionPage: 'audit_logs',
      });
    }
  }

  return {
    recentFailures,
    isLockedOut: !params.success && recentFailures >= 8,
  };
}

// ---- Media / File Upload Validation ----
export function validateSafeMediaUrlOrDataUrl(
  raw: string,
  allowedKinds: Array<'image' | 'pdf' | 'http'>,
  maxBytes = 10 * 1024 * 1024
): { valid: boolean; value: string; error?: string } {
  const val = String(raw || '').trim();
  if (!val) return { valid: true, value: '' };

  if (val.startsWith('data:')) {
    const match = val.match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      return { valid: false, value: '', error: 'Malformed base64 data upload.' };
    }
    const mime = match[1].toLowerCase();
    const byteSize = Math.floor((match[2].length * 3) / 4);
    if (byteSize > maxBytes) {
      return {
        valid: false,
        value: '',
        error: `Uploaded file exceeds maximum allowed size (${Math.round(maxBytes / (1024 * 1024))}MB).`,
      };
    }
    if (mime.includes('svg') || mime.includes('html') || mime.includes('javascript')) {
      return {
        valid: false,
        value: '',
        error: 'SVG/HTML/script files are blocked for security reasons.',
      };
    }
    const isImg = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(mime);
    const isPdf = mime === 'application/pdf';
    if (isImg && allowedKinds.includes('image')) {
      return { valid: true, value: val };
    }
    if (isPdf && allowedKinds.includes('pdf')) {
      return { valid: true, value: val };
    }
    return {
      valid: false,
      value: '',
      error: `File type "${mime}" is not permitted here.`,
    };
  }

  if (allowedKinds.includes('http')) {
    if (/^https?:\/\//i.test(val) || val.startsWith('/assets/')) {
      return { valid: true, value: val };
    }
    return {
      valid: false,
      value: '',
      error: 'URL must start with https:// or http://.',
    };
  }

  return { valid: false, value: '', error: 'Invalid upload reference.' };
}
