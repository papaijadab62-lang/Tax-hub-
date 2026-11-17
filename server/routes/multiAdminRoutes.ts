import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import type {
  AdminInvitation,
  AdminPermission,
  AdminRole,
  CourseApprovalStatus,
  CourseAssignment,
  CourseQuiz,
  IssuedCertificateMeta,
  QuizQuestion,
  SupportTicket,
} from '../../src/types/lms.ts';
import {
  ASSIGNABLE_ADMIN_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  canAccessCourse,
  getCourseApprovalStatus,
  getEffectiveAdminRole,
  hasPermission,
  isSuperAdmin,
} from '../../src/utils/rbac.ts';
import {
  findAdminByEmail,
  findAdminById,
  getSuperAdmin,
  hashPassword,
  loadDb,
  replaceCachedDb,
  sanitizeUser,
  saveDb,
  signToken,
  uid,
  verifyPassword,
  verifyToken,
  type DatabaseSchema,
  type StoredUser,
} from '../db.ts';
import {
  assertStepUp2FA,
  requireAnyAdmin,
  requireAuth,
  requireCourseAccess,
  requirePermission,
  requireSuperAdmin,
  type AuthedRequest,
} from '../middleware.ts';
import {
  appendAuditLog,
  createSessionRecord,
  generateBackupCodes,
  getClientIp,
  pushNotification,
  revokeUserSessions,
  snapshotCourseVersion,
  validateSafeMediaUrlOrDataUrl,
} from '../security.ts';

function sanitizeQuizQuestions(raw: unknown): QuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: QuizQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const question = String(obj.question || '').trim();
    const options = Array.isArray(obj.options)
      ? obj.options.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    if (!question || options.length < 2) continue;
    const idx = Math.max(
      0,
      Math.min(options.length - 1, Math.round(Number(obj.correctIndex) || 0))
    );
    out.push({
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : uid(),
      question,
      options,
      correctIndex: idx,
      explanation: String(obj.explanation || '').trim() || undefined,
    });
  }
  return out;
}

function getCourseEligibleProgressPct(
  studentId: string,
  course: DatabaseSchema['courses'][number],
  progress: Record<string, number>
): number {
  const lessons = (course.chapters || []).flatMap((ch) => ch.lessons || []);
  if (!lessons.length) return 0;
  const done = lessons.filter(
    (l) => (progress[`${studentId}_${course.id}_${l.id}`] || 0) >= 100
  ).length;
  return Math.round((done / lessons.length) * 100);
}

async function sendAdminInviteEmail(params: {
  db: DatabaseSchema;
  invite: AdminInvitation;
  inviteUrl: string;
}): Promise<{ sent: boolean; note: string }> {
  const superAdmin = getSuperAdmin(params.db);
  const smtpUser =
    params.db.notifications.smtpUser ||
    (superAdmin?.email?.includes('@') ? superAdmin.email : '');
  const smtpPass = params.db.notifications.smtpPass;
  if (!smtpUser || !smtpPass || !params.invite.email.includes('@')) {
    return {
      sent: false,
      note: 'Invitation link ready to share (SMTP email credentials not configured).',
    };
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: `"${params.db.notifications.senderName || params.db.settings.brand}" <${smtpUser}>`,
      to: params.invite.email,
      subject: `Admin Invitation — ${params.db.settings.brand} (${params.invite.adminRole})`,
      text: [
        `Hello ${params.invite.name},`,
        '',
        `You have been invited by ${params.invite.invitedByName} to join ${params.db.settings.brand} as ${params.invite.adminRole}.`,
        `Activate your account using this secure link (expires ${new Date(params.invite.expiresAt).toLocaleString('en-IN')}):`,
        params.inviteUrl,
        '',
        `Or enter Invitation Token: ${params.invite.token}`,
      ].join('\n'),
    });
    return { sent: true, note: `Invitation email sent to ${params.invite.email}.` };
  } catch (err) {
    return {
      sent: false,
      note: `Email delivery skipped (${err instanceof Error ? err.message : 'SMTP error'}). Share the invitation link directly.`,
    };
  }
}

export function registerMultiAdminRoutes(app: Express): void {
  // ---- LOGOUT (IMMEDIATE SESSION TERMINATION) ----
  app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const user = req.authUser!;
    if (req.authSessionId) {
      const sess = db.sessions.find((s) => s.sid === req.authSessionId);
      if (sess) {
        sess.revoked = true;
        sess.revokedReason = 'Signed out by user';
      }
    }
    appendAuditLog({
      db,
      actor: user,
      action: 'LOGOUT',
      category: 'AUTH',
      targetType: 'session',
      targetId: req.authSessionId,
      ip: getClientIp(req),
    });
    saveDb(db);
    res.json({ ok: true });
  });

  // (Authenticator TOTP 2FA disabled — only Phone / WhatsApp OTP is used for 2FA verification)
  app.post(
    '/api/admin/security/2fa/disable',
    requireAnyAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      user.twoFactorEnabled = false;
      user.twoFactorSecret = undefined;
      saveDb(db);
      res.json({ ok: true, user: sanitizeUser(user) });
    }
  );

  // ---- EMERGENCY BACKUP CODES & SECURITY RECOVERY PIN ----
  app.post(
    '/api/admin/security/backup-codes/regenerate',
    requireAnyAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const password = String(req.body?.password || '');
      if (password && !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }
      const backup = generateBackupCodes(6);
      user.twoFactorBackupHashes = backup.hashes;
      appendAuditLog({
        db,
        actor: user,
        action: 'EMERGENCY_BACKUP_CODES_REGENERATED',
        category: 'SECURITY',
        targetType: 'admin',
        targetId: user.id,
        targetLabel: user.email,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({
        ok: true,
        backupCodes: backup.plain,
        user: sanitizeUser(user),
      });
    }
  );

  app.post(
    '/api/admin/security/recovery-pin',
    requireAnyAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const recoveryPin = String(req.body?.recoveryPin || '').trim();
      const currentPassword = String(req.body?.currentPassword || '');
      if (recoveryPin.length < 4) {
        res.status(400).json({
          error: 'Security Recovery PIN must be at least 4 characters.',
        });
        return;
      }
      if (currentPassword && !verifyPassword(currentPassword, user.passwordHash)) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }
      user.recoveryPinHash = hashPassword(recoveryPin);
      appendAuditLog({
        db,
        actor: user,
        action: 'SECURITY_RECOVERY_PIN_UPDATED',
        category: 'SECURITY',
        targetType: 'admin',
        targetId: user.id,
        targetLabel: user.email,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ ok: true, user: sanitizeUser(user) });
    }
  );

  // ---- ACTIVE SESSIONS ----
  app.get(
    '/api/admin/security/sessions',
    requireAnyAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const sessions = isSuperAdmin(user as never)
        ? db.sessions
        : db.sessions.filter((s) => s.userId === user.id);
      res.json({ sessions: sessions.slice(0, 100) });
    }
  );

  app.post(
    '/api/admin/security/sessions/:sid/revoke',
    requireAnyAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const sess = db.sessions.find((s) => s.sid === req.params.sid);
      if (!sess) {
        res.status(404).json({ error: 'Session not found.' });
        return;
      }
      if (!isSuperAdmin(user as never) && sess.userId !== user.id) {
        res.status(403).json({ error: 'Only Super Admin can revoke another account session.' });
        return;
      }
      sess.revoked = true;
      sess.revokedReason = `Terminated by ${user.name}`;
      appendAuditLog({
        db,
        actor: user,
        action: 'SESSION_TERMINATED',
        category: 'SECURITY',
        targetType: 'session',
        targetId: sess.sid,
        targetLabel: sess.userEmail,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ ok: true });
    }
  );

  app.post(
    '/api/admin/security/users/:id/terminate-sessions',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const target =
        findAdminById(db, req.params.id) ||
        db.students.find((s) => s.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      const revokedCount = revokeUserSessions(
        db,
        target,
        `Terminated by Super Admin (${req.authUser!.name})`
      );
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'ALL_SESSIONS_TERMINATED',
        category: 'SECURITY',
        targetType: target.role,
        targetId: target.id,
        targetLabel: target.email,
        updatedValue: `${revokedCount} active session(s) invalidated`,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ ok: true, revokedCount });
    }
  );

  // ---- INVITATION PUBLIC VERIFY & ACCEPTANCE ----
  app.get('/api/auth/admin/invite/:token', (req: Request, res: Response) => {
    const db = loadDb();
    const token = String(req.params.token || '').trim();
    const invite = db.invitations.find((i) => i.token === token);
    if (!invite) {
      res.status(404).json({ error: 'Invitation not found or invalid link.' });
      return;
    }
    if (invite.status === 'PENDING' && Date.parse(invite.expiresAt) < Date.now()) {
      invite.status = 'EXPIRED';
      saveDb(db);
    }
    if (invite.status !== 'PENDING') {
      res.status(410).json({
        error: `This invitation is ${invite.status.toLowerCase()}. Request a new invite from the Super Admin.`,
      });
      return;
    }
    res.json({
      invitation: {
        name: invite.name,
        email: invite.email,
        adminRole: invite.adminRole,
        invitedByName: invite.invitedByName,
        expiresAt: invite.expiresAt,
        brand: db.settings.brand,
      },
    });
  });

  app.post('/api/auth/admin/invite/:token/accept', (req: Request, res: Response) => {
    const db = loadDb();
    const token = String(req.params.token || '').trim();
    const invite = db.invitations.find((i) => i.token === token);
    if (!invite) {
      res.status(404).json({ error: 'Invitation not found.' });
      return;
    }
    if (invite.status === 'PENDING' && Date.parse(invite.expiresAt) < Date.now()) {
      invite.status = 'EXPIRED';
      saveDb(db);
    }
    if (invite.status !== 'PENDING') {
      res.status(410).json({
        error: `Invitation has already been ${invite.status.toLowerCase()}.`,
      });
      return;
    }

    const password = String(req.body?.password || '');
    const nameOverride = String(req.body?.name || '').trim();
    if (password.length < 8) {
      res.status(400).json({
        error: 'Password must be at least 8 characters long.',
      });
      return;
    }
    if (
      findAdminByEmail(db, invite.email) ||
      db.students.some((s) => s.email === invite.email)
    ) {
      res.status(409).json({
        error: 'An account with this email already exists.',
      });
      return;
    }

    const newAdmin: StoredUser = {
      id: uid(),
      name: nameOverride || invite.name,
      email: invite.email,
      passwordHash: hashPassword(password),
      role: 'admin',
      adminRole: invite.adminRole,
      permissions: invite.permissions,
      assignedCourseIds: invite.assignedCourseIds,
      coursePermissions: invite.coursePermissions || {},
      active: true,
      suspended: false,
      accountStatus: 'ACTIVE',
      tokenVersion: 1,
      twoFactorEnabled: false,
      grantedCourseIds: [],
      createdAt: new Date().toISOString(),
    };
    db.admins.push(newAdmin);
    invite.status = 'ACCEPTED';
    invite.acceptedAt = new Date().toISOString();

    const session = createSessionRecord({ db, user: newAdmin, req });
    newAdmin.lastLoginAt = new Date().toISOString();
    newAdmin.lastLoginIp = getClientIp(req);

    appendAuditLog({
      db,
      actor: newAdmin,
      action: 'ADMIN_INVITATION_ACCEPTED',
      category: 'ADMIN',
      targetType: 'admin',
      targetId: newAdmin.id,
      targetLabel: `${newAdmin.email} (${newAdmin.adminRole})`,
      ip: getClientIp(req),
    });

    const superAdmin = getSuperAdmin(db);
    if (superAdmin) {
      pushNotification({
        db,
        recipientUserId: superAdmin.id,
        type: 'INVITATION',
        title: 'Admin Invitation Accepted',
        message: `${newAdmin.name} (${newAdmin.email}) activated their ${newAdmin.adminRole} account.`,
        actionPage: 'admin_team',
      });
    }

    saveDb(db);

    const authToken = signToken(
      { sub: newAdmin.id, role: 'admin', sid: session.sid, tv: 1 },
      db.authSecret
    );
    res.status(201).json({ token: authToken, user: sanitizeUser(newAdmin) });
  });

  // ---- SUPER ADMIN: ADMIN ROSTER, INVITE, CREATE, EDIT, COURSE ASSIGN, SUSPEND, RESET PASSWORD ----
  app.get('/api/admin/team', requireAnyAdmin, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const user = req.authUser!;
    if (!isSuperAdmin(user as never) && !hasPermission(user as never, 'admin_manage')) {
      res.status(403).json({ error: 'Not authorized to view admin team management.' });
      return;
    }

    // Expire outdated invites cleanly
    let dirty = false;
    for (const inv of db.invitations) {
      if (inv.status === 'PENDING' && Date.parse(inv.expiresAt) < Date.now()) {
        inv.status = 'EXPIRED';
        dirty = true;
      }
    }
    if (dirty) saveDb(db);

    res.json({
      admins: db.admins.map(sanitizeUser),
      invitations: isSuperAdmin(user as never) ? db.invitations : [],
      assignmentHistory: db.assignmentHistory.slice(0, 150),
    });
  });

  app.post(
    '/api/admin/team/invite',
    requireSuperAdmin,
    async (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const rawRole = String(req.body?.adminRole || 'COURSE_MANAGER');
      if (!ASSIGNABLE_ADMIN_ROLES.includes(rawRole as Exclude<AdminRole, 'SUPER_ADMIN'>)) {
        res.status(400).json({ error: 'Invalid admin role selected.' });
        return;
      }
      const adminRole = rawRole as Exclude<AdminRole, 'SUPER_ADMIN'>;

      if (!name || !email) {
        res.status(400).json({ error: 'Name and Admin email/ID are required.' });
        return;
      }
      if (
        findAdminByEmail(db, email) ||
        db.students.some((s) => s.email === email)
      ) {
        res.status(409).json({
          error: 'This email/ID already belongs to an existing user.',
        });
        return;
      }

      const permissions: AdminPermission[] = Array.isArray(req.body?.permissions)
        ? req.body.permissions.filter((p: unknown) => typeof p === 'string')
        : [...DEFAULT_ROLE_PERMISSIONS[adminRole]];
      const assignedCourseIds: string[] = Array.isArray(req.body?.assignedCourseIds)
        ? Array.from(new Set(req.body.assignedCourseIds.filter((c: unknown) => typeof c === 'string')))
        : [];
      const hours = Math.max(1, Math.min(720, Number(req.body?.expiresInHours) || 72));

      // Mark any prior pending invite to the same email cancelled
      for (const oldInv of db.invitations) {
        if (oldInv.email === email && oldInv.status === 'PENDING') {
          oldInv.status = 'CANCELLED';
        }
      }

      const token = crypto.randomBytes(24).toString('hex');
      const invite: AdminInvitation = {
        id: uid(),
        token,
        name,
        email,
        adminRole,
        permissions,
        assignedCourseIds,
        status: 'PENDING',
        invitedById: actor.id,
        invitedByName: actor.name,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
      };
      db.invitations.unshift(invite);

      appendAuditLog({
        db,
        actor,
        action: 'ADMIN_INVITED',
        category: 'ADMIN',
        targetType: 'invitation',
        targetId: invite.id,
        targetLabel: `${email} -> ${adminRole}`,
        updatedValue: { permissionsCount: permissions.length, assignedCourses: assignedCourseIds.length },
        ip: getClientIp(req),
      });
      saveDb(db);

      const origin = `${req.protocol}://${req.get('host')}`;
      const inviteUrl = `${origin}/?invite=${token}`;
      const emailRes = await sendAdminInviteEmail({ db, invite, inviteUrl });

      res.status(201).json({
        invitation: invite,
        inviteUrl,
        emailNote: emailRes.note,
      });
    }
  );

  app.post(
    '/api/admin/team/create',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const rawRole = String(req.body?.adminRole || 'COURSE_MANAGER');
      if (!ASSIGNABLE_ADMIN_ROLES.includes(rawRole as Exclude<AdminRole, 'SUPER_ADMIN'>)) {
        res.status(400).json({ error: 'Invalid assignable admin role.' });
        return;
      }
      const adminRole = rawRole as Exclude<AdminRole, 'SUPER_ADMIN'>;

      if (!name || !email || password.length < 8) {
        res.status(400).json({
          error: 'Name, email/ID, and password (minimum 8 characters) are required.',
        });
        return;
      }
      if (
        findAdminByEmail(db, email) ||
        db.students.some((s) => s.email === email)
      ) {
        res.status(409).json({
          error: 'An account with this email/ID already exists.',
        });
        return;
      }

      const permissions: AdminPermission[] = Array.isArray(req.body?.permissions)
        ? req.body.permissions.filter((p: unknown) => typeof p === 'string')
        : [...DEFAULT_ROLE_PERMISSIONS[adminRole]];
      const assignedCourseIds: string[] = Array.isArray(req.body?.assignedCourseIds)
        ? Array.from(new Set(req.body.assignedCourseIds.filter((c: unknown) => typeof c === 'string')))
        : [];

      const newAdmin: StoredUser = {
        id: uid(),
        name,
        email,
        phone: String(req.body?.phone || '').trim(),
        passwordHash: hashPassword(password),
        role: 'admin',
        adminRole,
        permissions,
        assignedCourseIds,
        coursePermissions: {},
        active: true,
        suspended: false,
        accountStatus: 'ACTIVE',
        tokenVersion: 1,
        twoFactorEnabled: false,
        mustChangePassword: Boolean(req.body?.mustChangePassword),
        grantedCourseIds: [],
        createdAt: new Date().toISOString(),
      };
      db.admins.push(newAdmin);

      for (const cid of assignedCourseIds) {
        const c = db.courses.find((course) => course.id === cid);
        db.assignmentHistory.unshift({
          id: uid(),
          courseId: cid,
          courseTitle: c?.title || cid,
          adminId: newAdmin.id,
          adminName: newAdmin.name,
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
        recipientUserId: newAdmin.id,
        type: 'INVITATION',
        title: `Welcome as ${adminRole}`,
        message: `Your administrator account has been provisioned by ${actor.name} with ${assignedCourseIds.length} assigned course(s).`,
        actionPage: 'dashboard',
      });

      appendAuditLog({
        db,
        actor,
        action: 'ADMIN_CREATED',
        category: 'ADMIN',
        targetType: 'admin',
        targetId: newAdmin.id,
        targetLabel: `${newAdmin.email} (${adminRole})`,
        updatedValue: { adminRole, assignedCourseIds, permissionsCount: permissions.length },
        ip: getClientIp(req),
      });
      saveDb(db);
      res.status(201).json({ admin: sanitizeUser(newAdmin) });
    }
  );

  app.delete(
    '/api/admin/team/invitations/:id',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const inv = db.invitations.find((i) => i.id === req.params.id);
      if (!inv) {
        res.status(404).json({ error: 'Invitation not found.' });
        return;
      }
      inv.status = 'CANCELLED';
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'ADMIN_INVITATION_CANCELLED',
        category: 'ADMIN',
        targetType: 'invitation',
        targetId: inv.id,
        targetLabel: inv.email,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ ok: true });
    }
  );

  app.put(
    '/api/admin/team/:id',
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
        res.status(403).json({
          error:
            'Super Admin (Owner) role and ownership cannot be modified or replaced.',
        });
        return;
      }

      const prevSnapshot = {
        name: target.name,
        adminRole: target.adminRole,
        permissions: target.permissions,
      };

      const name = String(req.body?.name || '').trim();
      if (name) target.name = name;
      if (req.body?.phone !== undefined) {
        target.phone = String(req.body.phone || '').trim();
      }

      if (req.body?.adminRole !== undefined) {
        const nextRole = String(req.body.adminRole);
        if (!ASSIGNABLE_ADMIN_ROLES.includes(nextRole as Exclude<AdminRole, 'SUPER_ADMIN'>)) {
          res.status(400).json({ error: 'Cannot assign invalid or Super Admin role.' });
          return;
        }
        target.adminRole = nextRole as AdminRole;
      }

      if (Array.isArray(req.body?.permissions)) {
        target.permissions = Array.from(
          new Set(req.body.permissions.filter((p: unknown) => typeof p === 'string'))
        );
      }

      appendAuditLog({
        db,
        actor,
        action:
          prevSnapshot.adminRole !== target.adminRole
            ? 'ADMIN_ROLE_OR_PERMISSIONS_CHANGED'
            : 'ADMIN_PROFILE_UPDATED',
        category: 'ADMIN',
        targetType: 'admin',
        targetId: target.id,
        targetLabel: target.email,
        previousValue: prevSnapshot,
        updatedValue: {
          name: target.name,
          adminRole: target.adminRole,
          permissions: target.permissions,
        },
        ip: getClientIp(req),
      });

      pushNotification({
        db,
        recipientUserId: target.id,
        type: 'ACCOUNT_STATUS',
        title: 'Role / Permissions Updated',
        message: `Super Admin updated your role to ${target.adminRole} with ${(target.permissions || []).length} permission(s).`,
        actionPage: 'dashboard',
      });

      saveDb(db);
      res.json({ admin: sanitizeUser(target) });
    }
  );

  app.put(
    '/api/admin/team/:id/courses',
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
        res.status(400).json({ error: 'Super Admin automatically has access to all courses.' });
        return;
      }

      const prevCourseIds = [...(target.assignedCourseIds || [])];
      const nextCourseIds: string[] = Array.isArray(req.body?.assignedCourseIds)
        ? Array.from(
            new Set(
              req.body.assignedCourseIds.filter(
                (cid: unknown) =>
                  typeof cid === 'string' && db.courses.some((c) => c.id === cid)
              )
            )
          )
        : [];
      const nextCoursePermissions: Record<string, AdminPermission[]> =
        req.body?.coursePermissions && typeof req.body.coursePermissions === 'object'
          ? (req.body.coursePermissions as Record<string, AdminPermission[]>)
          : target.coursePermissions || {};

      target.assignedCourseIds = nextCourseIds;
      target.coursePermissions = nextCoursePermissions;

      // Record additions & removals in assignment history
      const added = nextCourseIds.filter((id) => !prevCourseIds.includes(id));
      const removed = prevCourseIds.filter((id) => !nextCourseIds.includes(id));

      for (const cid of added) {
        const c = db.courses.find((x) => x.id === cid);
        db.assignmentHistory.unshift({
          id: uid(),
          courseId: cid,
          courseTitle: c?.title || cid,
          adminId: target.id,
          adminName: target.name,
          adminRole: target.adminRole || 'COURSE_MANAGER',
          action: 'ASSIGNED',
          permissions: nextCoursePermissions[cid] || target.permissions || [],
          actorId: actor.id,
          actorName: actor.name,
          timestamp: new Date().toISOString(),
        });
      }
      for (const cid of removed) {
        const c = db.courses.find((x) => x.id === cid);
        db.assignmentHistory.unshift({
          id: uid(),
          courseId: cid,
          courseTitle: c?.title || cid,
          adminId: target.id,
          adminName: target.name,
          adminRole: target.adminRole || 'COURSE_MANAGER',
          action: 'REMOVED',
          permissions: [],
          actorId: actor.id,
          actorName: actor.name,
          timestamp: new Date().toISOString(),
        });
      }
      if (added.length === 0 && removed.length === 0) {
        for (const cid of nextCourseIds) {
          const c = db.courses.find((x) => x.id === cid);
          db.assignmentHistory.unshift({
            id: uid(),
            courseId: cid,
            courseTitle: c?.title || cid,
            adminId: target.id,
            adminName: target.name,
            adminRole: target.adminRole || 'COURSE_MANAGER',
            action: 'PERMISSIONS_UPDATED',
            permissions: nextCoursePermissions[cid] || target.permissions || [],
            actorId: actor.id,
            actorName: actor.name,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (db.assignmentHistory.length > 500) {
        db.assignmentHistory = db.assignmentHistory.slice(0, 500);
      }

      pushNotification({
        db,
        recipientUserId: target.id,
        type: 'COURSE_ASSIGNMENT',
        title: 'Course Assignments Updated',
        message: `You now have access to ${nextCourseIds.length} assigned course(s) (${added.length} added, ${removed.length} removed).`,
        actionPage: 'courses',
      });

      appendAuditLog({
        db,
        actor,
        action: 'COURSE_ASSIGNMENTS_UPDATED',
        category: 'ADMIN',
        targetType: 'admin',
        targetId: target.id,
        targetLabel: target.email,
        previousValue: prevCourseIds,
        updatedValue: nextCourseIds,
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ admin: sanitizeUser(target) });
    }
  );

  app.patch(
    '/api/admin/team/:id/status',
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
        res.status(403).json({ error: 'Super Admin cannot be suspended or deactivated.' });
        return;
      }

      const mode = String(req.body?.status || '').toUpperCase();
      const reason = String(req.body?.reason || '').trim();
      const prev = { active: target.active, suspended: Boolean(target.suspended) };

      if (mode === 'SUSPEND') {
        target.suspended = true;
        target.active = false;
        target.accountStatus = 'SUSPENDED';
        target.suspendedReason = reason || 'Suspended by Super Admin';
        target.suspendedAt = new Date().toISOString();
        revokeUserSessions(db, target, target.suspendedReason);
      } else if (mode === 'DEACTIVATE') {
        target.active = false;
        target.accountStatus = 'DEACTIVATED';
        revokeUserSessions(db, target, 'Deactivated by Super Admin');
      } else if (mode === 'ACTIVATE') {
        target.active = true;
        target.suspended = false;
        target.accountStatus = 'ACTIVE';
        target.suspendedReason = '';
        target.suspendedAt = '';
      } else {
        res.status(400).json({ error: 'Status must be ACTIVATE, DEACTIVATE, or SUSPEND.' });
        return;
      }

      appendAuditLog({
        db,
        actor,
        action: `ADMIN_STATUS_${mode}`,
        category: 'SECURITY',
        targetType: 'admin',
        targetId: target.id,
        targetLabel: target.email,
        previousValue: prev,
        updatedValue: {
          active: target.active,
          suspended: target.suspended,
          accountStatus: target.accountStatus,
          reason: target.suspendedReason,
        },
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ admin: sanitizeUser(target) });
    }
  );

  app.post(
    '/api/admin/team/:id/reset-password',
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
        res.status(403).json({ error: 'Use the Super Admin password change flow in Security settings.' });
        return;
      }
      if (!assertStepUp2FA(req, res)) return;

      const newPassword =
        String(req.body?.newPassword || '').trim() ||
        `Arya@${crypto.randomBytes(4).toString('hex')}`;
      if (newPassword.length < 8) {
        res.status(400).json({ error: 'Reset password must be at least 8 characters.' });
        return;
      }

      target.passwordHash = hashPassword(newPassword);
      target.mustChangePassword = true;
      revokeUserSessions(db, target, 'Password reset by Super Admin');

      appendAuditLog({
        db,
        actor,
        action: 'ADMIN_PASSWORD_RESET',
        category: 'SECURITY',
        targetType: 'admin',
        targetId: target.id,
        targetLabel: target.email,
        updatedValue: 'Password reset & all active sessions terminated',
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ ok: true, temporaryPassword: newPassword });
    }
  );

  app.delete(
    '/api/admin/team/:id',
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
        res.status(403).json({
          error: 'Super Admin (Owner) account cannot be deleted.',
        });
        return;
      }
      if (!assertStepUp2FA(req, res)) return;

      revokeUserSessions(db, target, 'Admin account deleted');
      db.admins = db.admins.filter((a) => a.id !== target.id);

      appendAuditLog({
        db,
        actor,
        action: 'ADMIN_DELETED',
        category: 'ADMIN',
        targetType: 'admin',
        targetId: target.id,
        targetLabel: `${target.name} (${target.email}, ${target.adminRole})`,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ ok: true });
    }
  );

  // ---- COURSE APPROVAL WORKFLOW ----
  app.post(
    '/api/admin/courses/:id/submit-approval',
    requireCourseAccess('course_edit'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const prevStatus = getCourseApprovalStatus(course);
      const note = String(req.body?.note || '').trim() || 'Submitted for review';
      course.approvalStatus = 'PENDING_APPROVAL';
      course.visibility = 'draft';
      course.submittedById = actor.id;
      course.submittedByName = actor.name;
      course.submittedAt = new Date().toISOString();
      course.approvalNote = note;
      course.approvalHistory = [
        {
          id: uid(),
          status: 'PENDING_APPROVAL',
          actorId: actor.id,
          actorName: actor.name,
          actorRole: getEffectiveAdminRole(actor as never) || 'COURSE_MANAGER',
          note,
          timestamp: new Date().toISOString(),
        },
        ...(course.approvalHistory || []),
      ];

      // Notify Super Admin & Reviewers
      for (const adm of db.admins) {
        if (adm.id !== actor.id && (isSuperAdmin(adm as never) || hasPermission(adm as never, 'content_approve'))) {
          pushNotification({
            db,
            recipientUserId: adm.id,
            type: 'APPROVAL_REQUEST',
            title: 'Course Approval Request',
            message: `${actor.name} submitted "${course.title}" for content review and approval.`,
            actionPage: 'approvals',
            relatedId: course.id,
          });
        }
      }

      appendAuditLog({
        db,
        actor,
        action: 'COURSE_SUBMITTED_FOR_APPROVAL',
        category: 'APPROVAL',
        targetType: 'course',
        targetId: course.id,
        targetLabel: course.title,
        courseId: course.id,
        previousValue: prevStatus,
        updatedValue: 'PENDING_APPROVAL',
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ course });
    }
  );

  const handleReviewAction = (
    nextStatus: CourseApprovalStatus,
    requireReason: boolean
  ) => [
    requirePermission('content_approve'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      if (
        !isSuperAdmin(actor as never) &&
        !hasPermission(actor as never, 'content_approve') &&
        !hasPermission(actor as never, 'content_approve', course.id)
      ) {
        res.status(403).json({ error: 'Permission "content_approve" is required to review this course.' });
        return;
      }
      if (
        nextStatus === 'PUBLISHED' &&
        !isSuperAdmin(actor as never) &&
        !hasPermission(actor as never, 'course_publish') &&
        !hasPermission(actor as never, 'course_publish', course.id)
      ) {
        res.status(403).json({ error: 'Explicit "course_publish" permission is required to publish.' });
        return;
      }

      const reason = String(req.body?.reason || req.body?.note || '').trim();
      if (requireReason && !reason) {
        res.status(400).json({ error: 'A detailed reason or modification note is required.' });
        return;
      }

      const prevStatus = getCourseApprovalStatus(course);
      snapshotCourseVersion({
        db,
        course,
        editor: actor,
        summary: `Before status change: ${prevStatus} -> ${nextStatus}`,
      });

      course.approvalStatus = nextStatus;
      course.visibility = nextStatus === 'PUBLISHED' ? 'published' : 'draft';
      course.approvalNote = reason || course.approvalNote;
      course.reviewedById = actor.id;
      course.reviewedByName = actor.name;
      course.reviewedAt = new Date().toISOString();
      course.approvalHistory = [
        {
          id: uid(),
          status: nextStatus,
          actorId: actor.id,
          actorName: actor.name,
          actorRole: getEffectiveAdminRole(actor as never) || 'ADMIN',
          note: reason || `Moved to ${nextStatus}`,
          timestamp: new Date().toISOString(),
        },
        ...(course.approvalHistory || []),
      ];

      // Notify assigned managers / editors & submitter
      const notifyIds = new Set<string>();
      if (course.submittedById && course.submittedById !== actor.id) {
        notifyIds.add(course.submittedById);
      }
      for (const adm of db.admins) {
        if (adm.id !== actor.id && (adm.assignedCourseIds || []).includes(course.id)) {
          notifyIds.add(adm.id);
        }
      }
      for (const rid of notifyIds) {
        pushNotification({
          db,
          recipientUserId: rid,
          type: 'APPROVAL_DECISION',
          title: `Course ${nextStatus.replace('_', ' ')}`,
          message: `"${course.title}" was marked ${nextStatus} by ${actor.name}${reason ? `: ${reason}` : '.'}`,
          actionPage: 'approvals',
          relatedId: course.id,
        });
      }

      appendAuditLog({
        db,
        actor,
        action: `COURSE_${nextStatus}`,
        category: 'APPROVAL',
        targetType: 'course',
        targetId: course.id,
        targetLabel: course.title,
        courseId: course.id,
        previousValue: prevStatus,
        updatedValue: { status: nextStatus, note: reason },
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ course });
    },
  ];

  app.post('/api/admin/courses/:id/approve', ...handleReviewAction('APPROVED', false));
  app.post('/api/admin/courses/:id/reject', ...handleReviewAction('REJECTED', true));
  app.post('/api/admin/courses/:id/request-revision', ...handleReviewAction('NEEDS_REVISION', true));
  app.post('/api/admin/courses/:id/archive', ...handleReviewAction('ARCHIVED', false));
  app.post(
    '/api/admin/courses/:id/publish',
    requireAnyAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      if (
        !isSuperAdmin(actor as never) &&
        !hasPermission(actor as never, 'course_publish') &&
        !hasPermission(actor as never, 'course_publish', course.id)
      ) {
        res.status(403).json({ error: 'Permission "course_publish" is required to publish courses.' });
        return;
      }
      const prevStatus = getCourseApprovalStatus(course);
      if (
        !isSuperAdmin(actor as never) &&
        !hasPermission(actor as never, 'content_approve') &&
        !hasPermission(actor as never, 'content_approve', course.id) &&
        prevStatus !== 'APPROVED'
      ) {
        res.status(400).json({
          error: 'Course must be Approved before publishing to students.',
        });
        return;
      }

      snapshotCourseVersion({
        db,
        course,
        editor: actor,
        summary: `Published course (${prevStatus} -> PUBLISHED)`,
      });

      course.approvalStatus = 'PUBLISHED';
      course.visibility = 'published';
      course.reviewedById = actor.id;
      course.reviewedByName = actor.name;
      course.reviewedAt = new Date().toISOString();
      course.approvalHistory = [
        {
          id: uid(),
          status: 'PUBLISHED',
          actorId: actor.id,
          actorName: actor.name,
          actorRole: getEffectiveAdminRole(actor as never) || 'ADMIN',
          note: 'Published to Student Portal',
          timestamp: new Date().toISOString(),
        },
        ...(course.approvalHistory || []),
      ];

      appendAuditLog({
        db,
        actor,
        action: 'COURSE_PUBLISHED',
        category: 'APPROVAL',
        targetType: 'course',
        targetId: course.id,
        targetLabel: course.title,
        courseId: course.id,
        previousValue: prevStatus,
        updatedValue: 'PUBLISHED',
        ip: getClientIp(req),
      });

      saveDb(db);
      res.json({ course });
    }
  );

  // ---- QUIZZES & ASSIGNMENTS (AUTHORIZED STAFF + STUDENT SUBMISSION) ----
  app.post(
    '/api/admin/courses/:id/quizzes',
    requireCourseAccess('quiz_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const title = String(req.body?.title || '').trim();
      const questions = sanitizeQuizQuestions(req.body?.questions);
      if (!title || questions.length === 0) {
        res.status(400).json({
          error: 'Quiz title and at least one question with 2+ options are required.',
        });
        return;
      }
      snapshotCourseVersion({
        db,
        course,
        editor: actor,
        summary: `Added/updated quiz "${title}"`,
      });
      const quizId = typeof req.body?.id === 'string' && req.body.id ? req.body.id : uid();
      const quiz: CourseQuiz = {
        id: quizId,
        title,
        passingPercent: Math.max(10, Math.min(100, Number(req.body?.passingPercent) || 60)),
        questions,
        updatedAt: new Date().toISOString(),
      };
      course.quizzes = [...(course.quizzes || []).filter((q) => q.id !== quizId), quiz];
      appendAuditLog({
        db,
        actor,
        action: 'QUIZ_SAVED',
        category: 'COURSE',
        targetType: 'quiz',
        targetId: quiz.id,
        targetLabel: `${course.title} · ${quiz.title}`,
        courseId: course.id,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.status(201).json({ quiz, course });
    }
  );

  app.delete(
    '/api/admin/courses/:id/quizzes/:quizId',
    requireCourseAccess('quiz_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      snapshotCourseVersion({
        db,
        course,
        editor: req.authUser!,
        summary: 'Removed quiz',
      });
      course.quizzes = (course.quizzes || []).filter((q) => q.id !== req.params.quizId);
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'QUIZ_DELETED',
        category: 'COURSE',
        targetType: 'quiz',
        targetId: req.params.quizId,
        courseId: course.id,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ ok: true, course });
    }
  );

  app.post(
    '/api/admin/courses/:id/assignments',
    requireCourseAccess('assignment_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      if (!title || !description) {
        res.status(400).json({ error: 'Assignment title and instructions are required.' });
        return;
      }
      const mediaCheck = validateSafeMediaUrlOrDataUrl(
        String(req.body?.attachmentUrl || ''),
        ['pdf', 'image', 'http']
      );
      if (!mediaCheck.valid) {
        res.status(400).json({ error: mediaCheck.error });
        return;
      }
      snapshotCourseVersion({
        db,
        course,
        editor: actor,
        summary: `Saved assignment "${title}"`,
      });
      const assignmentId = typeof req.body?.id === 'string' && req.body.id ? req.body.id : uid();
      const assignment: CourseAssignment = {
        id: assignmentId,
        title,
        description,
        dueLabel: String(req.body?.dueLabel || '').trim() || undefined,
        maxMarks: Math.max(1, Math.min(1000, Number(req.body?.maxMarks) || 100)),
        attachmentUrl: mediaCheck.value || undefined,
        updatedAt: new Date().toISOString(),
      };
      course.assignments = [
        ...(course.assignments || []).filter((a) => a.id !== assignmentId),
        assignment,
      ];
      appendAuditLog({
        db,
        actor,
        action: 'ASSIGNMENT_SAVED',
        category: 'COURSE',
        targetType: 'assignment',
        targetId: assignment.id,
        targetLabel: `${course.title} · ${assignment.title}`,
        courseId: course.id,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.status(201).json({ assignment, course });
    }
  );

  app.delete(
    '/api/admin/courses/:id/assignments/:assignmentId',
    requireCourseAccess('assignment_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      snapshotCourseVersion({
        db,
        course,
        editor: req.authUser!,
        summary: 'Removed assignment',
      });
      course.assignments = (course.assignments || []).filter(
        (a) => a.id !== req.params.assignmentId
      );
      saveDb(db);
      res.json({ ok: true, course });
    }
  );

  app.post(
    '/api/student/courses/:id/quizzes/:quizId/attempt',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      const quiz = course?.quizzes?.find((q) => q.id === req.params.quizId);
      if (!course || !quiz) {
        res.status(404).json({ error: 'Quiz not found.' });
        return;
      }
      if (user.role === 'student') {
        const hasGranted = (user.grantedCourseIds || []).includes(course.id);
        const hasPaid = db.orders.some(
          (o) =>
            o.userId === user.id &&
            o.status === 'PAID' &&
            (o.courseIds || []).includes(course.id)
        );
        if (!hasGranted && !hasPaid) {
          res.status(403).json({ error: 'Course enrollment required.' });
          return;
        }
      }
      const answers = Array.isArray(req.body?.answers)
        ? req.body.answers.map((x: unknown) => Number(x))
        : [];
      let correct = 0;
      quiz.questions.forEach((q, idx) => {
        if (answers[idx] === q.correctIndex) correct += 1;
      });
      const scorePercent = quiz.questions.length
        ? Math.round((correct / quiz.questions.length) * 100)
        : 0;
      const attempt = {
        id: uid(),
        quizId: quiz.id,
        courseId: course.id,
        studentId: user.id,
        answers,
        scorePercent,
        passed: scorePercent >= quiz.passingPercent,
        submittedAt: new Date().toISOString(),
      };
      db.quizAttempts.unshift(attempt);
      saveDb(db);
      res.status(201).json({ attempt });
    }
  );

  app.post(
    '/api/student/courses/:id/assignments/:assignmentId/submit',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      const assignment = course?.assignments?.find(
        (a) => a.id === req.params.assignmentId
      );
      if (!course || !assignment) {
        res.status(404).json({ error: 'Assignment not found.' });
        return;
      }
      const submissionText = String(req.body?.submissionText || '').trim();
      if (!submissionText) {
        res.status(400).json({ error: 'Please write your assignment response.' });
        return;
      }
      const submission = {
        id: uid(),
        assignmentId: assignment.id,
        courseId: course.id,
        studentId: user.id,
        studentName: user.name,
        submissionText,
        attachmentUrl: String(req.body?.attachmentUrl || '').trim() || undefined,
        status: 'SUBMITTED' as const,
        submittedAt: new Date().toISOString(),
      };
      db.assignmentSubmissions.unshift(submission);
      saveDb(db);
      res.status(201).json({ submission });
    }
  );

  app.post(
    '/api/admin/courses/:id/assignments/:assignmentId/review/:submissionId',
    requireCourseAccess('assignment_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const sub = db.assignmentSubmissions.find(
        (s) =>
          s.id === req.params.submissionId &&
          s.courseId === req.params.id &&
          s.assignmentId === req.params.assignmentId
      );
      if (!sub) {
        res.status(404).json({ error: 'Submission not found.' });
        return;
      }
      sub.status = 'REVIEWED';
      sub.marks = Math.max(0, Number(req.body?.marks) || 0);
      sub.feedback = String(req.body?.feedback || '').trim();
      sub.reviewedAt = new Date().toISOString();
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'ASSIGNMENT_SUBMISSION_REVIEWED',
        category: 'COURSE',
        targetType: 'assignment_submission',
        targetId: sub.id,
        targetLabel: `${sub.studentName} (${sub.marks} marks)`,
        courseId: sub.courseId,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ submission: sub });
    }
  );

  // ---- VERSION HISTORY & RESTORE ----
  app.get(
    '/api/admin/courses/:id/versions',
    requireAnyAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const allowed =
        isSuperAdmin(actor as never) ||
        canAccessCourse(actor as never, req.params.id) ||
        hasPermission(actor as never, 'content_approve') ||
        hasPermission(actor as never, 'course_publish');
      if (!allowed) {
        res.status(403).json({ error: 'You do not have access to this course version history.' });
        return;
      }
      const versions = db.courseVersions.filter(
        (v) => v.courseId === req.params.id
      );
      res.json({ versions });
    }
  );

  app.post(
    '/api/admin/courses/:id/versions/:versionId/restore',
    requireCourseAccess('version_restore'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const courseIdx = db.courses.findIndex((c) => c.id === req.params.id);
      if (courseIdx === -1) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const version = db.courseVersions.find(
        (v) => v.id === req.params.versionId && v.courseId === req.params.id
      );
      if (!version) {
        res.status(404).json({ error: 'Version snapshot not found.' });
        return;
      }

      const currentCourse = db.courses[courseIdx];
      snapshotCourseVersion({
        db,
        course: currentCourse,
        editor: actor,
        summary: `Auto-backup before restoring Version #${version.versionNumber}`,
      });

      const restored: typeof currentCourse = JSON.parse(
        JSON.stringify(version.snapshot)
      );
      // Sub-admins cannot bypass approval status by restoring an old PUBLISHED snapshot if lacking publish/approve
      if (
        restored.visibility === 'published' &&
        !isSuperAdmin(actor as never) &&
        !hasPermission(actor as never, 'course_publish', restored.id)
      ) {
        restored.approvalStatus = 'DRAFT';
        restored.visibility = 'draft';
      }
      restored.updatedAt = new Date().toISOString();
      db.courses[courseIdx] = restored;

      appendAuditLog({
        db,
        actor,
        action: 'COURSE_VERSION_RESTORED',
        category: 'COURSE',
        targetType: 'course',
        targetId: restored.id,
        targetLabel: `${restored.title} -> Version #${version.versionNumber}`,
        courseId: restored.id,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ course: restored });
    }
  );

  // ---- TAMPER-RESISTANT ACTIVITY LOGS (READ-ONLY) ----
  app.get(
    '/api/admin/audit-logs',
    requirePermission('activity_log_view'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const search = String(req.query.search || '').trim().toLowerCase();
      const role = String(req.query.role || 'ALL').trim();
      const category = String(req.query.category || 'ALL').trim();
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.max(5, Math.min(100, Number(req.query.pageSize) || 25));

      let logs = db.auditLogs;
      // Strict Financial Isolation: sub-admins cannot see FINANCE logs even with activity_log_view
      if (!isSuperAdmin(actor as never)) {
        logs = logs.filter((l) => l.category !== 'FINANCE');
      }
      if (role !== 'ALL') {
        logs = logs.filter((l) => l.actorRole === role);
      }
      if (category !== 'ALL') {
        logs = logs.filter((l) => l.category === category);
      }
      if (search) {
        logs = logs.filter(
          (l) =>
            l.action.toLowerCase().includes(search) ||
            l.actorName.toLowerCase().includes(search) ||
            l.actorEmail.toLowerCase().includes(search) ||
            (l.targetLabel || '').toLowerCase().includes(search)
        );
      }

      const total = logs.length;
      const start = (page - 1) * pageSize;
      res.json({
        logs: logs.slice(start, start + pageSize),
        total,
        page,
        pageSize,
      });
    }
  );

  // ---- NOTIFICATIONS ----
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const user = req.authUser!;
    const role = getEffectiveAdminRole(user as never);
    const items = db.internalNotifications.filter((n) => {
      if (n.recipientUserId && n.recipientUserId === user.id) return true;
      if (user.role === 'admin' && n.recipientRole === 'ALL_ADMINS') return true;
      if (role && n.recipientRole === role) return true;
      if (user.role === 'student' && n.recipientRole === 'STUDENT') return true;
      return false;
    });
    res.json({
      notifications: items.slice(0, 60),
      unreadCount: items.filter((n) => !n.readByUserIds.includes(user.id)).length,
    });
  });

  app.post(
    '/api/notifications/:id/read',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const item = db.internalNotifications.find((n) => n.id === req.params.id);
      if (item && !item.readByUserIds.includes(user.id)) {
        item.readByUserIds.push(user.id);
        saveDb(db);
      }
      res.json({ ok: true });
    }
  );

  app.post(
    '/api/notifications/read-all',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      for (const n of db.internalNotifications) {
        if (!n.readByUserIds.includes(user.id)) {
          n.readByUserIds.push(user.id);
        }
      }
      saveDb(db);
      res.json({ ok: true });
    }
  );

  // ---- CERTIFICATE REGISTRY, VERIFICATION & REVOCATION ----
  app.get(
    '/api/certificates/verify/:certNo',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const certNo = String(req.params.certNo || '').trim().toUpperCase();
      if (!certNo) {
        res.status(400).json({ error: 'Certificate number is required.' });
        return;
      }

      const customRec = (db.certificates || []).find(
        (c) => c.certificateNo.toUpperCase() === certNo
      );
      if (customRec) {
        const student = db.students.find((s) => s.id === customRec.studentId);
        res.json({
          found: true,
          certificate: {
            certificateNo: customRec.certificateNo,
            studentName: student?.name || 'Student',
            studentEmail: student?.email || '',
            targetTitle: customRec.targetTitle,
            targetType: customRec.targetType,
            issuedDate: customRec.issuedDate,
            status: customRec.status || 'ACTIVE',
            revokedReason: customRec.revokedReason,
            source: 'custom_upload',
          },
        });
        return;
      }

      const issued = (db.issuedCertificates || []).find(
        (c) => c.certificateNo.toUpperCase() === certNo
      );
      if (issued) {
        res.json({ found: true, certificate: issued });
        return;
      }

      // Check auto-generated deterministic IDs (e.g. ARYA-{studentPrefix}-{coursePrefix})
      for (const student of db.students) {
        for (const course of db.courses) {
          const pct = getCourseEligibleProgressPct(student.id, course, db.progress);
          const autoNo = `ARYA-${student.id.slice(0, 6).toUpperCase()}-${course.id.slice(0, 4).toUpperCase()}`;
          if (certNo === autoNo && pct >= (db.settings.threshold || 75)) {
            res.json({
              found: true,
              certificate: {
                certificateNo: autoNo,
                studentName: student.name,
                studentEmail: student.email,
                targetTitle: course.title,
                targetType: 'course',
                issuedDate: new Date().toISOString().slice(0, 10),
                status: 'ACTIVE',
                source: 'auto_threshold',
              },
            });
            return;
          }
        }
      }

      res.json({ found: false });
    }
  );

  app.get(
    '/api/admin/certificates/registry',
    requirePermission('certificate_verify'),
    (_req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const rows: IssuedCertificateMeta[] = [...(db.issuedCertificates || [])];
      const existingNos = new Set(rows.map((r) => r.certificateNo.toUpperCase()));

      // Include custom certificates
      for (const c of db.certificates || []) {
        if (existingNos.has(c.certificateNo.toUpperCase())) continue;
        const st = db.students.find((s) => s.id === c.studentId);
        rows.push({
          id: c.id,
          certificateNo: c.certificateNo,
          studentId: c.studentId,
          studentName: st?.name || 'Student',
          studentEmail: st?.email || '',
          targetType: c.targetType,
          targetId: c.targetId,
          targetTitle: c.targetTitle,
          issuedDate: c.issuedDate,
          source: 'custom_upload',
          status: c.status || 'ACTIVE',
          revokedAt: c.revokedAt,
          revokedReason: c.revokedReason,
        });
        existingNos.add(c.certificateNo.toUpperCase());
      }

      // Dynamically surface auto-earned 75% completion certificates (preserving existing rule)
      const threshold = Number(db.settings.threshold || 75);
      for (const student of db.students) {
        for (const course of db.courses) {
          const pct = getCourseEligibleProgressPct(student.id, course, db.progress);
          if (pct >= threshold) {
            const autoNo = `ARYA-${student.id.slice(0, 6).toUpperCase()}-${course.id.slice(0, 4).toUpperCase()}`;
            if (!existingNos.has(autoNo)) {
              rows.push({
                id: `auto_${student.id}_${course.id}`,
                certificateNo: autoNo,
                studentId: student.id,
                studentName: student.name,
                studentEmail: student.email,
                targetType: 'course',
                targetId: course.id,
                targetTitle: course.title,
                issuedDate: new Date().toISOString().slice(0, 10),
                source: 'auto_threshold',
                status: 'ACTIVE',
              });
              existingNos.add(autoNo);
            }
          }
        }
      }

      res.json({ registry: rows });
    }
  );

  app.post(
    '/api/admin/certificates/:certNo/revoke',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const actor = req.authUser!;
      const certNo = String(req.params.certNo || '').trim().toUpperCase();
      const reason =
        String(req.body?.reason || '').trim() || 'Revoked by Super Admin';
      const now = new Date().toISOString();

      let updated = false;
      for (const rec of db.certificates || []) {
        if (rec.certificateNo.toUpperCase() === certNo) {
          rec.status = 'REVOKED';
          rec.revokedAt = now;
          rec.revokedReason = reason;
          updated = true;
        }
      }

      let meta = db.issuedCertificates.find(
        (m) => m.certificateNo.toUpperCase() === certNo
      );
      if (meta) {
        meta.status = 'REVOKED';
        meta.revokedAt = now;
        meta.revokedBy = actor.name;
        meta.revokedReason = reason;
        updated = true;
      } else {
        // Persist auto certificate into issuedCertificates as REVOKED if matching student/course
        for (const student of db.students) {
          for (const course of db.courses) {
            const autoNo = `ARYA-${student.id.slice(0, 6).toUpperCase()}-${course.id.slice(0, 4).toUpperCase()}`;
            if (autoNo === certNo) {
              meta = {
                id: uid(),
                certificateNo: autoNo,
                studentId: student.id,
                studentName: student.name,
                studentEmail: student.email,
                targetType: 'course',
                targetId: course.id,
                targetTitle: course.title,
                issuedDate: now.slice(0, 10),
                source: 'auto_threshold',
                status: 'REVOKED',
                revokedAt: now,
                revokedBy: actor.name,
                revokedReason: reason,
              };
              db.issuedCertificates.unshift(meta);
              updated = true;
              break;
            }
          }
          if (updated) break;
        }
      }

      if (!updated) {
        res.status(404).json({ error: 'Certificate record not found.' });
        return;
      }

      appendAuditLog({
        db,
        actor,
        action: 'CERTIFICATE_REVOKED',
        category: 'CERTIFICATE',
        targetType: 'certificate',
        targetId: certNo,
        targetLabel: certNo,
        updatedValue: { status: 'REVOKED', reason },
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ ok: true });
    }
  );

  app.post(
    '/api/admin/certificates/:certNo/reinstate',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const certNo = String(req.params.certNo || '').trim().toUpperCase();
      let found = false;
      for (const rec of db.certificates || []) {
        if (rec.certificateNo.toUpperCase() === certNo) {
          rec.status = 'ACTIVE';
          rec.revokedReason = '';
          rec.revokedAt = '';
          found = true;
        }
      }
      for (const meta of db.issuedCertificates || []) {
        if (meta.certificateNo.toUpperCase() === certNo) {
          meta.status = 'ACTIVE';
          meta.revokedReason = undefined;
          meta.revokedAt = undefined;
          found = true;
        }
      }
      if (!found) {
        res.status(404).json({ error: 'Certificate not found.' });
        return;
      }
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'CERTIFICATE_REINSTATED',
        category: 'CERTIFICATE',
        targetType: 'certificate',
        targetId: certNo,
        targetLabel: certNo,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ ok: true });
    }
  );

  // ---- SUPPORT TICKETS & LOGIN ASSISTANCE ----
  app.post('/api/support/public-login-help', (req: Request, res: Response) => {
    const db = loadDb();
    const studentName = String(req.body?.name || '').trim();
    const studentEmail = String(req.body?.email || '').trim().toLowerCase();
    const message = String(req.body?.message || '').trim();
    if (!studentName || !studentEmail || !message) {
      res.status(400).json({ error: 'Name, email/ID, and issue details are required.' });
      return;
    }
    const existingStudent = db.students.find((s) => s.email === studentEmail);
    const ticket: SupportTicket = {
      id: uid(),
      studentId: existingStudent?.id,
      studentName,
      studentEmail,
      category: 'LOGIN_ISSUE',
      subject: 'Student Login Assistance Request',
      message,
      priority: 'HIGH',
      status: 'OPEN',
      replies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.supportTickets.unshift(ticket);
    pushNotification({
      db,
      recipientRole: 'STUDENT_SUPPORT',
      type: 'SUPPORT_TICKET',
      title: 'New Login Assistance Request',
      message: `${studentName} (${studentEmail}) requested login help.`,
      actionPage: 'support',
      relatedId: ticket.id,
    });
    const superAdmin = getSuperAdmin(db);
    if (superAdmin) {
      pushNotification({
        db,
        recipientUserId: superAdmin.id,
        type: 'SUPPORT_TICKET',
        title: 'Login Assistance Request',
        message: `${studentName} (${studentEmail}) requested login help.`,
        actionPage: 'support',
        relatedId: ticket.id,
      });
    }
    saveDb(db);
    res.status(201).json({ ok: true, ticketId: ticket.id });
  });

  app.get('/api/support/tickets', requireAuth, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const user = req.authUser!;
    if (user.role === 'student') {
      res.json({
        tickets: db.supportTickets.filter(
          (t) => t.studentId === user.id || t.studentEmail === user.email
        ),
      });
      return;
    }
    if (!isSuperAdmin(user as never) && !hasPermission(user as never, 'student_support_manage')) {
      res.status(403).json({ error: 'Support desk permission required.' });
      return;
    }
    res.json({ tickets: db.supportTickets });
  });

  app.post('/api/support/tickets', requireAuth, (req: AuthedRequest, res: Response) => {
    const db = loadDb();
    const user = req.authUser!;
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();
    if (!subject || !message) {
      res.status(400).json({ error: 'Subject and detailed query are required.' });
      return;
    }
    const rawCat = String(req.body?.category || 'COURSE_QUERY');
    const category: SupportTicket['category'] =
      rawCat === 'LOGIN_ISSUE' ||
      rawCat === 'CERTIFICATE' ||
      rawCat === 'TECHNICAL' ||
      rawCat === 'OTHER'
        ? rawCat
        : 'COURSE_QUERY';
    const courseId = String(req.body?.courseId || '').trim() || undefined;
    const courseObj = courseId ? db.courses.find((c) => c.id === courseId) : undefined;

    const ticket: SupportTicket = {
      id: uid(),
      studentId: user.id,
      studentName: user.name,
      studentEmail: user.email,
      category,
      subject,
      message,
      courseId,
      courseTitle: courseObj?.title,
      priority: req.body?.priority === 'HIGH' ? 'HIGH' : req.body?.priority === 'LOW' ? 'LOW' : 'MEDIUM',
      status: 'OPEN',
      replies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.supportTickets.unshift(ticket);
    pushNotification({
      db,
      recipientRole: 'STUDENT_SUPPORT',
      type: 'SUPPORT_TICKET',
      title: 'New Student Query',
      message: `${user.name}: ${subject}`,
      actionPage: 'support',
      relatedId: ticket.id,
    });
    saveDb(db);
    res.status(201).json({ ticket });
  });

  app.post(
    '/api/support/tickets/:id/reply',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const user = req.authUser!;
      const ticket = db.supportTickets.find((t) => t.id === req.params.id);
      if (!ticket) {
        res.status(404).json({ error: 'Support ticket not found.' });
        return;
      }
      const isOwnerStudent =
        user.role === 'student' &&
        (ticket.studentId === user.id || ticket.studentEmail === user.email);
      const isSupportStaff =
        user.role === 'admin' &&
        (isSuperAdmin(user as never) || hasPermission(user as never, 'student_support_manage'));

      if (!isOwnerStudent && !isSupportStaff) {
        res.status(403).json({ error: 'Not authorized to reply to this ticket.' });
        return;
      }
      const message = String(req.body?.message || '').trim();
      if (!message) {
        res.status(400).json({ error: 'Reply message cannot be empty.' });
        return;
      }

      ticket.replies.push({
        id: uid(),
        authorId: user.id,
        authorName: user.name,
        authorRole:
          user.role === 'admin'
            ? getEffectiveAdminRole(user as never) || 'SUPPORT'
            : 'STUDENT',
        message,
        createdAt: new Date().toISOString(),
      });
      ticket.updatedAt = new Date().toISOString();
      if (isSupportStaff && ticket.status === 'OPEN') {
        ticket.status = 'IN_PROGRESS';
        ticket.assignedToId = user.id;
        ticket.assignedToName = user.name;
      }
      if (isSupportStaff && ticket.studentId) {
        pushNotification({
          db,
          recipientUserId: ticket.studentId,
          type: 'SUPPORT_TICKET',
          title: 'Support Reply Received',
          message: `${user.name} replied to "${ticket.subject}".`,
          actionPage: 'support',
          relatedId: ticket.id,
        });
      }
      if (isSupportStaff) {
        appendAuditLog({
          db,
          actor: user,
          action: 'SUPPORT_TICKET_REPLIED',
          category: 'STUDENT',
          targetType: 'support_ticket',
          targetId: ticket.id,
          targetLabel: ticket.subject,
          ip: getClientIp(req),
        });
      }
      saveDb(db);
      res.json({ ticket });
    }
  );

  app.patch(
    '/api/support/tickets/:id/status',
    requirePermission('student_support_manage'),
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const ticket = db.supportTickets.find((t) => t.id === req.params.id);
      if (!ticket) {
        res.status(404).json({ error: 'Support ticket not found.' });
        return;
      }
      const raw = String(req.body?.status || '').toUpperCase();
      if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(raw)) {
        res.status(400).json({ error: 'Invalid ticket status.' });
        return;
      }
      const prevStatus = ticket.status;
      ticket.status = raw as SupportTicket['status'];
      ticket.assignedToId = req.authUser!.id;
      ticket.assignedToName = req.authUser!.name;
      ticket.updatedAt = new Date().toISOString();
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'SUPPORT_TICKET_STATUS_UPDATED',
        category: 'STUDENT',
        targetType: 'support_ticket',
        targetId: ticket.id,
        targetLabel: ticket.subject,
        previousValue: prevStatus,
        updatedValue: ticket.status,
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ ticket });
    }
  );

  // ---- SUPER ADMIN: ORDER REFUND MANAGEMENT ----
  app.post(
    '/api/admin/orders/:id/refund',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      const order = db.orders.find((o) => o.id === req.params.id);
      if (!order) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      if (order.status !== 'PAID') {
        res.status(400).json({ error: 'Only PAID orders can be marked refunded.' });
        return;
      }
      const reason =
        String(req.body?.reason || '').trim() || 'Refund processed by Super Admin';
      const amount = Math.max(
        0,
        Math.min(order.total, Number(req.body?.amount ?? order.total))
      );
      order.status = 'REFUNDED';
      order.verificationStatus = 'refunded';
      order.refundedAt = new Date().toISOString();
      order.refundReason = reason;
      order.refundAmount = amount;
      order.verificationNote = `Refunded ₹${amount}: ${reason}`;

      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'ORDER_REFUNDED',
        category: 'FINANCE',
        targetType: 'order',
        targetId: order.id,
        targetLabel: order.invoiceNumber || order.id,
        updatedValue: { refundAmount: amount, reason },
        ip: getClientIp(req),
      });
      saveDb(db);
      res.json({ order });
    }
  );

  // ---- SUPER ADMIN: DATABASE BACKUP & RESTORE ----
  app.get(
    '/api/admin/system/backup',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      const db = loadDb();
      appendAuditLog({
        db,
        actor: req.authUser!,
        action: 'DATABASE_BACKUP_DOWNLOADED',
        category: 'SYSTEM',
        targetType: 'database',
        targetLabel: 'Full LMS JSON Backup',
        ip: getClientIp(req),
      });
      saveDb(db);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="arya-lms-backup-${new Date().toISOString().slice(0, 10)}.json"`
      );
      res.send(JSON.stringify(db, null, 2));
    }
  );

  app.post(
    '/api/admin/system/restore',
    requireSuperAdmin,
    (req: AuthedRequest, res: Response) => {
      if (!assertStepUp2FA(req, res)) return;
      const incoming = req.body?.backup as Partial<DatabaseSchema> | undefined;
      if (
        !incoming ||
        typeof incoming !== 'object' ||
        !Array.isArray(incoming.courses) ||
        !Array.isArray(incoming.students) ||
        !Array.isArray(incoming.orders)
      ) {
        res.status(400).json({
          error:
            'Invalid backup file. Backup JSON must include courses, students, and orders arrays.',
        });
        return;
      }
      const currentDb = loadDb();
      const restoredDb: DatabaseSchema = {
        ...currentDb,
        ...incoming,
        authSecret: incoming.authSecret || currentDb.authSecret,
        admins: Array.isArray(incoming.admins) && incoming.admins.length > 0
          ? incoming.admins
          : currentDb.admins,
      };
      appendAuditLog({
        db: restoredDb,
        actor: req.authUser!,
        action: 'DATABASE_RESTORED',
        category: 'SYSTEM',
        targetType: 'database',
        targetLabel: `${restoredDb.courses.length} courses, ${restoredDb.students.length} students`,
        ip: getClientIp(req),
      });
      replaceCachedDb(restoredDb);
      res.json({ ok: true });
    }
  );
}
