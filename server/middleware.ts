import type { NextFunction, Request, Response } from 'express';
import type { AdminPermission } from '../src/types/lms.ts';
import {
  canAccessCourse,
  getEffectiveAdminRole,
  hasPermission,
  isSuperAdmin,
} from '../src/utils/rbac.ts';
import {
  findAdminById,
  loadDb,
  saveDb,
  verifyToken,
  type StoredUser,
} from './db.ts';
import { appendAuditLog, getClientIp } from './security.ts';

export interface AuthedRequest extends Request {
  authUser?: StoredUser;
  authSessionId?: string;
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const db = loadDb();
  const payload = verifyToken(token, db.authSecret, 'auth');
  if (!payload) {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  let user: StoredUser | undefined;
  if (payload.role === 'admin') {
    user = findAdminById(db, payload.sub);
  } else if (payload.role === 'student') {
    user = db.students.find((s) => s.id === payload.sub);
  }

  if (!user) {
    res.status(401).json({ error: 'Account not found.' });
    return;
  }

  const currentTv = user.tokenVersion || 1;
  if (payload.tv !== currentTv) {
    res.status(401).json({
      error: 'Session was terminated or credentials changed. Please sign in again.',
    });
    return;
  }

  if (payload.sid) {
    const sess = db.sessions.find((s) => s.sid === payload.sid);
    if (sess) {
      if (sess.revoked || Date.parse(sess.expiresAt) < Date.now()) {
        res.status(401).json({
          error: 'This session has been revoked or expired. Please sign in again.',
        });
        return;
      }
      sess.lastActiveAt = new Date().toISOString();
    }
  }

  if (user.suspended) {
    res.status(403).json({
      error: user.suspendedReason
        ? `Your account is suspended: ${user.suspendedReason}`
        : 'Your account has been suspended by the Super Admin.',
    });
    return;
  }

  if (!user.active) {
    res
      .status(403)
      .json({ error: 'Your account has been deactivated by the administrator.' });
    return;
  }

  req.authUser = user;
  req.authSessionId = payload.sid;
  next();
}

export function requireAnyAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  requireAuth(req, res, () => {
    if (!req.authUser || req.authUser.role !== 'admin') {
      res.status(403).json({ error: 'Administrator access required.' });
      return;
    }
    next();
  });
}

export function requireSuperAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  requireAnyAdmin(req, res, () => {
    const user = req.authUser!;
    if (!isSuperAdmin(user as never)) {
      const db = loadDb();
      appendAuditLog({
        db,
        actor: user,
        action: 'UNAUTHORIZED_SUPER_ADMIN_OR_FINANCIAL_ACCESS',
        category: 'SECURITY',
        targetType: 'route',
        targetLabel: `${req.method} ${req.originalUrl}`,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.status(403).json({
        error:
          'Restricted: Only Super Admin (Owner) is authorized for financial and owner controls.',
      });
      return;
    }
    next();
  });
}

export function requirePermission(permission: AdminPermission) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    requireAnyAdmin(req, res, () => {
      const user = req.authUser!;
      if (!hasPermission(user as never, permission)) {
        const db = loadDb();
        appendAuditLog({
          db,
          actor: user,
          action: 'UNAUTHORIZED_PERMISSION_ATTEMPT',
          category: 'SECURITY',
          targetType: 'permission',
          targetLabel: `${permission} on ${req.method} ${req.originalUrl}`,
          ip: getClientIp(req),
        });
        saveDb(db);
        res.status(403).json({
          error: `Permission denied: "${permission}" privilege is required for this action.`,
        });
        return;
      }
      next();
    });
  };
}

export function requireCourseAccess(permission?: AdminPermission) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    requireAnyAdmin(req, res, () => {
      const user = req.authUser!;
      const courseId = String(req.params.id || req.params.courseId || '');
      if (!courseId) {
        res.status(400).json({ error: 'Course ID is required.' });
        return;
      }
      if (!isSuperAdmin(user as never)) {
        if (!canAccessCourse(user as never, courseId)) {
          const db = loadDb();
          appendAuditLog({
            db,
            actor: user,
            action: 'UNAUTHORIZED_COURSE_ACCESS_ATTEMPT',
            category: 'SECURITY',
            targetType: 'course',
            targetId: courseId,
            targetLabel: `${req.method} ${req.originalUrl}`,
            courseId,
            ip: getClientIp(req),
          });
          saveDb(db);
          res.status(403).json({
            error:
              'Access denied: This course is not assigned to your administrator account.',
          });
          return;
        }
        if (permission && !hasPermission(user as never, permission, courseId)) {
          const db = loadDb();
          appendAuditLog({
            db,
            actor: user,
            action: 'UNAUTHORIZED_COURSE_ACTION_ATTEMPT',
            category: 'SECURITY',
            targetType: 'course',
            targetId: courseId,
            targetLabel: `${permission} on ${req.method} ${req.originalUrl}`,
            courseId,
            ip: getClientIp(req),
          });
          saveDb(db);
          res.status(403).json({
            error: `Permission denied: "${permission}" is required for this course action.`,
          });
          return;
        }
      }
      next();
    });
  };
}

export function assertStepUp2FA(
  req: AuthedRequest,
  _res: Response
): boolean {
  return Boolean(req.authUser);
}

export function getAccessMode(user?: StoredUser | null): 'super_admin' | 'sub_admin' | 'student' {
  if (!user || user.role !== 'admin') return 'student';
  return getEffectiveAdminRole(user as never) === 'SUPER_ADMIN'
    ? 'super_admin'
    : 'sub_admin';
}
