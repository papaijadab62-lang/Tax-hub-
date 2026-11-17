import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import type {
  AdminInvitation,
  AdminPermission,
  AdminRole,
  AdminSessionRecord,
  Course,
  CourseAssignmentHistoryEntry,
  PasswordRecoveryRequest,
  User,
} from '../types/lms';
import {
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
  ALL_ADMIN_PERMISSIONS,
  ASSIGNABLE_ADMIN_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectiveAdminRole,
  isSuperAdmin,
} from '../utils/rbac';

interface AdminTeamPageProps {
  currentUser: User;
  courses: Course[];
  onFetchTeam: () => Promise<
    | {
        ok: true;
        data: {
          admins: User[];
          invitations: AdminInvitation[];
          assignmentHistory: CourseAssignmentHistoryEntry[];
        };
      }
    | { ok: false; error: string }
  >;
  onCreateSubAdmin: (payload: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    adminRole: Exclude<AdminRole, 'SUPER_ADMIN'>;
    permissions: AdminPermission[];
    assignedCourseIds: string[];
    mustChangePassword?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onInviteAdmin: (payload: {
    name: string;
    email: string;
    adminRole: Exclude<AdminRole, 'SUPER_ADMIN'>;
    permissions: AdminPermission[];
    assignedCourseIds: string[];
  }) => Promise<
    | { ok: true; data: { invitation: AdminInvitation; inviteUrl: string; emailNote: string } }
    | { ok: false; error: string }
  >;
  onCancelInvitation: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onUpdateSubAdmin: (
    adminId: string,
    payload: {
      name?: string;
      phone?: string;
      adminRole?: Exclude<AdminRole, 'SUPER_ADMIN'>;
      permissions?: AdminPermission[];
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onAssignCourses: (
    adminId: string,
    assignedCourseIds: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  onUpdateStatus: (
    adminId: string,
    status: 'ACTIVATE' | 'DEACTIVATE' | 'SUSPEND',
    reason?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onResetPassword: (
    adminId: string,
    newPassword: string,
    twoFactorCode?: string
  ) => Promise<
    | { ok: true; data: { ok: boolean; temporaryPassword: string } }
    | { ok: false; error: string; requiresStepUp2FA?: boolean }
  >;
  onDeleteAdmin: (
    adminId: string,
    twoFactorCode?: string
  ) => Promise<{ ok: boolean; error?: string; requiresStepUp2FA?: boolean }>;
  onTerminateUserSessions: (
    userId: string
  ) => Promise<{ ok: true; data: { revokedCount: number } } | { ok: false; error: string }>;
  onFetchRegistrations: () => Promise<
    { ok: true; data: { registrations: User[] } } | { ok: false; error: string }
  >;
  onApproveRegistration: (
    adminId: string,
    payload: {
      adminRole: Exclude<AdminRole, 'SUPER_ADMIN'>;
      permissions: AdminPermission[];
      assignedCourseIds: string[];
      activateNow?: boolean;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onActivateRegistration: (adminId: string) => Promise<{ ok: boolean; error?: string }>;
  onRejectRegistration: (
    adminId: string,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onFetchRecoveryRequests: () => Promise<
    { ok: true; data: { requests: PasswordRecoveryRequest[] } } | { ok: false; error: string }
  >;
  onApproveRecoveryRequest: (
    requestId: string
  ) => Promise<
    | {
        ok: true;
        data: {
          ok: boolean;
          request: PasswordRecoveryRequest;
          oneTimeResetToken: string;
        };
      }
    | { ok: false; error: string }
  >;
  onRejectRecoveryRequest: (
    requestId: string,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onFetchSessions: () => Promise<
    { ok: true; data: { sessions: AdminSessionRecord[] } } | { ok: false; error: string }
  >;
  onRevokeSession: (sid: string) => Promise<{ ok: boolean; error?: string }>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function AdminTeamPage(props: AdminTeamPageProps) {
  const {
    currentUser,
    courses,
    onFetchTeam,
    onCreateSubAdmin,
    onInviteAdmin,
    onCancelInvitation,
    onUpdateSubAdmin,
    onAssignCourses,
    onUpdateStatus,
    onResetPassword,
    onDeleteAdmin,
    onTerminateUserSessions,
    onFetchRegistrations,
    onApproveRegistration,
    onActivateRegistration,
    onRejectRegistration,
    onFetchRecoveryRequests,
    onApproveRecoveryRequest,
    onRejectRecoveryRequest,
    onFetchSessions,
    onRevokeSession,
    onToast,
  } = props;

  const ownerAccess = isSuperAdmin(currentUser);
  const [tab, setTab] = useState<
    'roster' | 'registrations' | 'recovery' | 'sessions'
  >('roster');

  const [admins, setAdmins] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<
    CourseAssignmentHistoryEntry[]
  >([]);
  const [registrations, setRegistrations] = useState<User[]>([]);
  const [recoveryRequests, setRecoveryRequests] = useState<
    PasswordRecoveryRequest[]
  >([]);
  const [sessions, setSessions] = useState<AdminSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Invite modal state
  const [createMode, setCreateMode] = useState<'none' | 'create' | 'invite'>(
    'none'
  );
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] =
    useState<Exclude<AdminRole, 'SUPER_ADMIN'>>('COURSE_MANAGER');
  const [newPerms, setNewPerms] = useState<AdminPermission[]>(
    DEFAULT_ROLE_PERMISSIONS.COURSE_MANAGER
  );
  const [newCourses, setNewCourses] = useState<string[]>([]);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');

  // Edit Admin RBAC / Courses panel
  const [editingAdmin, setEditingAdmin] = useState<User | null>(null);
  const [editRole, setEditRole] =
    useState<Exclude<AdminRole, 'SUPER_ADMIN'>>('COURSE_MANAGER');
  const [editPerms, setEditPerms] = useState<AdminPermission[]>([]);
  const [editCourseIds, setEditCourseIds] = useState<string[]>([]);

  // Registration Approval Modal
  const [reviewingReg, setReviewingReg] = useState<User | null>(null);
  const [regRole, setRegRole] =
    useState<Exclude<AdminRole, 'SUPER_ADMIN'>>('COURSE_MANAGER');
  const [regPerms, setRegPerms] = useState<AdminPermission[]>([]);
  const [regCourseIds, setRegCourseIds] = useState<string[]>([]);
  const [regActivateNow, setRegActivateNow] = useState(true);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>(
    {}
  );

  // Revealed one-time recovery token for Main Super Admin
  const [issuedRecoveryTokens, setIssuedRecoveryTokens] = useState<
    Record<string, string>
  >({});

  // Password reset / Delete target state
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const teamRes = await onFetchTeam();
      if (teamRes.ok) {
        setAdmins(teamRes.data.admins);
        setInvitations(teamRes.data.invitations);
        setAssignmentHistory(teamRes.data.assignmentHistory);
      }
      if (ownerAccess) {
        const [regRes, recRes, sessRes] = await Promise.all([
          onFetchRegistrations(),
          onFetchRecoveryRequests(),
          onFetchSessions(),
        ]);
        if (regRes.ok) setRegistrations(regRes.data.registrations);
        if (recRes.ok) setRecoveryRequests(recRes.data.requests);
        if (sessRes.ok) setSessions(sessRes.data.sessions);
      }
    } finally {
      setLoading(false);
    }
  }, [
    ownerAccess,
    onFetchTeam,
    onFetchRegistrations,
    onFetchRecoveryRequests,
    onFetchSessions,
  ]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const pendingRegistrationsCount = registrations.filter(
    (r) => r.accountStatus === 'PENDING_APPROVAL' || r.accountStatus === 'APPROVED'
  ).length;
  const pendingRecoveryCount = recoveryRequests.filter(
    (r) => r.status === 'PENDING'
  ).length;

  const openEditor = (adm: User) => {
    const r = (getEffectiveAdminRole(adm) ||
      'COURSE_MANAGER') as Exclude<AdminRole, 'SUPER_ADMIN'>;
    setEditingAdmin(adm);
    setEditRole(r);
    setEditPerms([...(adm.permissions || DEFAULT_ROLE_PERMISSIONS[r] || [])]);
    setEditCourseIds([...(adm.assignedCourseIds || [])]);
  };

  const handleSaveEditor = async () => {
    if (!editingAdmin) return;
    const r1 = await onUpdateSubAdmin(editingAdmin.id, {
      adminRole: editRole,
      permissions: editPerms,
    });
    if (!r1.ok) {
      onToast('error', r1.error || 'Could not update role & permissions.');
      return;
    }
    const r2 = await onAssignCourses(editingAdmin.id, editCourseIds);
    if (!r2.ok) {
      onToast('error', r2.error || 'Could not update assigned courses.');
      return;
    }
    setEditingAdmin(null);
    onToast('success', `${editingAdmin.name}'s role, permissions, and course access updated.`);
    loadAll();
  };

  const handleCreateOrInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (createMode === 'create') {
      const res = await onCreateSubAdmin({
        name: newName,
        email: newEmail,
        phone: newPhone,
        password: newPassword,
        adminRole: newRole,
        permissions: newPerms,
        assignedCourseIds: newCourses,
      });
      if (!res.ok) {
        onToast('error', res.error || 'Could not create admin.');
        return;
      }
      setCreateMode('none');
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewPassword('');
      onToast('success', 'Sub-Admin account created and assigned.');
      loadAll();
    } else if (createMode === 'invite') {
      const res = await onInviteAdmin({
        name: newName,
        email: newEmail,
        adminRole: newRole,
        permissions: newPerms,
        assignedCourseIds: newCourses,
      });
      if (!res.ok) {
        onToast('error', res.error || 'Could not create invitation.');
        return;
      }
      setGeneratedInviteUrl(res.data.inviteUrl);
      onToast('success', res.data.emailNote);
      loadAll();
    }
  };

  const openRegReviewer = (reg: User) => {
    const r = (reg.requestedDesignation ||
      reg.adminRole ||
      'COURSE_MANAGER') as Exclude<AdminRole, 'SUPER_ADMIN'>;
    setReviewingReg(reg);
    setRegRole(r);
    setRegPerms([...(DEFAULT_ROLE_PERMISSIONS[r] || [])]);
    setRegCourseIds([...(reg.assignedCourseIds || [])]);
    setRegActivateNow(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142746]">
            Multi-Level Admin Governance &amp; Approvals
          </h1>
          <p className="mt-1 text-sm text-[#718096]">
            Role-based access control, pending admin registrations, course scoping, and password recovery approvals.
          </p>
        </div>

        {ownerAccess && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setGeneratedInviteUrl('');
                setCreateMode('invite');
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#dce6f7] bg-white px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5 text-[#315b9b]" />
              <span>Send Admin Invite</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGeneratedInviteUrl('');
                setCreateMode('create');
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#18243a] hover:bg-[#cca042] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Create Sub-Admin</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-[11px] border border-[#e3e9f2] bg-white p-1.5">
        <button
          type="button"
          onClick={() => setTab('roster')}
          className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            tab === 'roster'
              ? 'bg-[#142746] text-white'
              : 'text-[#59677d] hover:text-[#142746]'
          }`}
        >
          Admin Hierarchy ({admins.length})
        </button>
        {ownerAccess && (
          <>
            <button
              type="button"
              onClick={() => setTab('registrations')}
              className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === 'registrations'
                  ? 'bg-[#142746] text-white'
                  : 'text-[#59677d] hover:text-[#142746]'
              }`}
            >
              Admin Registrations
              {pendingRegistrationsCount > 0 ? ` (${pendingRegistrationsCount})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setTab('recovery')}
              className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === 'recovery'
                  ? 'bg-[#142746] text-white'
                  : 'text-[#59677d] hover:text-[#142746]'
              }`}
            >
              Password Recovery Queue
              {pendingRecoveryCount > 0 ? ` (${pendingRecoveryCount})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setTab('sessions')}
              className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === 'sessions'
                  ? 'bg-[#142746] text-white'
                  : 'text-[#59677d] hover:text-[#142746]'
              }`}
            >
              Invites &amp; Active Sessions
            </button>
          </>
        )}
        <button
          type="button"
          onClick={loadAll}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#59677d] hover:bg-[#f3f6fb] cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Create / Invite Sub-Admin Form */}
      {createMode !== 'none' && ownerAccess && (
        <form
          onSubmit={handleCreateOrInvite}
          className="rounded-[15px] border border-[#dce6f7] bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#e3e9f2] pb-3">
            <div>
              <h2 className="text-base font-extrabold text-[#142746]">
                {createMode === 'create'
                  ? 'Create New Sub-Admin Account'
                  : 'Invite Administrator via Secure Link'}
              </h2>
              <p className="text-xs text-[#718096]">
                Financial &amp; Gateway routes remain strictly restricted to Main Super Admin only.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateMode('none')}
              className="text-xs font-semibold text-[#718096] hover:text-[#142746] cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Full Name *
              </label>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Ananya Roy"
                className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Email / Login ID *
              </label>
              <input
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="staff@aryatax.in"
                className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Admin Role *
              </label>
              <select
                value={newRole}
                onChange={(e) => {
                  const r = e.target.value as Exclude<AdminRole, 'SUPER_ADMIN'>;
                  setNewRole(r);
                  setNewPerms([...DEFAULT_ROLE_PERMISSIONS[r]]);
                }}
                className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-bold text-[#142746] outline-none focus:border-[#315b9b]"
              >
                {ASSIGNABLE_ADMIN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ADMIN_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            {createMode === 'create' ? (
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Initial Password (min 8 chars) *
                </label>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Phone (optional)
                </label>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="10-digit WhatsApp"
                  className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                />
              </div>
            )}
          </div>

          {/* Assign Specific Courses */}
          {newRole !== 'STUDENT_SUPPORT' && courses.length > 0 && (
            <div>
              <div className="text-xs font-bold text-[#142746] mb-1.5">
                Assign Courses (Scoped Access — {newCourses.length} selected)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-36 overflow-y-auto rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] p-2.5">
                {courses.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 text-xs text-[#1d2940] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={newCourses.includes(c.id)}
                      onChange={(e) =>
                        setNewCourses((prev) =>
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter((id) => id !== c.id)
                        )
                      }
                      className="accent-[#142746]"
                    />
                    <span className="truncate">{c.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Custom Permissions */}
          <div>
            <div className="text-xs font-bold text-[#142746] mb-1.5">
              Explicit Permissions ({newPerms.length} enabled)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] p-2.5">
              {ALL_ADMIN_PERMISSIONS.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-start gap-2 text-xs text-[#1d2940] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={newPerms.includes(perm.key)}
                    onChange={(e) =>
                      setNewPerms((prev) =>
                        e.target.checked
                          ? [...prev, perm.key]
                          : prev.filter((p) => p !== perm.key)
                      )
                    }
                    className="mt-0.5 accent-[#142746]"
                  />
                  <span>
                    <span className="font-semibold">{perm.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {generatedInviteUrl && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#bfe6d5] bg-[#eefaf4] px-3.5 py-2.5 text-xs">
              <div className="min-w-0">
                <span className="font-bold text-[#0f6c4a]">
                  Secure Activation Link Ready:{' '}
                </span>
                <span className="font-mono text-[#142746] break-all">
                  {generatedInviteUrl}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(generatedInviteUrl);
                  onToast('success', 'Invitation URL copied.');
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-[#142746] px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Link</span>
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateMode('none')}
              className="rounded-[9px] border border-[#e3e9f2] px-4 py-2 text-xs font-bold text-[#142746] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-[9px] bg-[#142746] px-5 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
            >
              {createMode === 'create' ? 'Create Account' : 'Generate Invitation'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 1: ADMIN HIERARCHY & RBAC */}
      {tab === 'roster' && (
        <div className="space-y-4">
          {editingAdmin && ownerAccess && (
            <div className="rounded-[15px] border border-[#315b9b] bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#e3e9f2] pb-3">
                <div>
                  <h2 className="text-base font-extrabold text-[#142746]">
                    Edit Access · {editingAdmin.name} ({editingAdmin.email})
                  </h2>
                  <p className="text-xs text-[#718096]">
                    Customize role, granular permissions, and course scope.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="text-xs font-semibold text-[#718096] cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1">
                    Assigned Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => {
                      const r = e.target.value as Exclude<AdminRole, 'SUPER_ADMIN'>;
                      setEditRole(r);
                      setEditPerms([...DEFAULT_ROLE_PERMISSIONS[r]]);
                    }}
                    className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-bold text-[#142746]"
                  >
                    {ASSIGNABLE_ADMIN_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ADMIN_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-[#718096]">
                    {ADMIN_ROLE_DESCRIPTIONS[editRole]}
                  </p>
                </div>

                <div>
                  <div className="text-xs font-bold text-[#59677d] mb-1">
                    Assigned Courses ({editCourseIds.length})
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-[9px] border border-[#e3e9f2] bg-[#f8fafd] p-2.5 space-y-1.5">
                    {courses.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={editCourseIds.includes(c.id)}
                          onChange={(e) =>
                            setEditCourseIds((prev) =>
                              e.target.checked
                                ? [...prev, c.id]
                                : prev.filter((id) => id !== c.id)
                            )
                          }
                          className="accent-[#142746]"
                        />
                        <span className="truncate">{c.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-[#59677d] mb-1.5">
                  Granular Permissions ({editPerms.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] p-3">
                  {ALL_ADMIN_PERMISSIONS.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex items-start gap-2 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={editPerms.includes(perm.key)}
                        onChange={(e) =>
                          setEditPerms((prev) =>
                            e.target.checked
                              ? [...prev, perm.key]
                              : prev.filter((p) => p !== perm.key)
                          )
                        }
                        className="mt-0.5 accent-[#142746]"
                      />
                      <span>
                        <span className="font-semibold text-[#142746]">
                          {perm.label}
                        </span>
                        <span className="block text-[10px] text-[#718096]">
                          {perm.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="rounded-[9px] border border-[#e3e9f2] px-4 py-2 text-xs font-bold text-[#142746] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditor}
                  className="rounded-[9px] bg-[#142746] px-5 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                >
                  Save RBAC &amp; Course Scope
                </button>
              </div>
            </div>
          )}

          {/* Password Reset Modal inline */}
          {resetTarget && ownerAccess && (
            <div className="rounded-[15px] border border-[#f1dca7] bg-[#fffdf7] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-[#142746]">
                  Reset Password for {resetTarget.name} ({resetTarget.email})
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setResetTarget(null);
                    setResetPasswordVal('');
                  }}
                  className="text-xs font-semibold text-[#718096] cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  placeholder="New temporary password (min 8 chars)"
                  className="w-64 rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onResetPassword(
                      resetTarget.id,
                      resetPasswordVal
                    );
                    if (!res.ok) {
                      onToast('error', res.error);
                      return;
                    }
                    onToast(
                      'success',
                      `Password reset. Active sessions terminated for ${resetTarget.email}.`
                    );
                    setResetTarget(null);
                    setResetPasswordVal('');
                  }}
                  className="rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white cursor-pointer"
                >
                  Confirm Reset
                </button>
              </div>
            </div>
          )}

          {/* Delete Confirm inline */}
          {deleteTarget && ownerAccess && (
            <div className="rounded-[15px] border border-[#f5c2c7] bg-[#fff5f6] p-4 space-y-3">
              <div className="text-sm font-bold text-[#c64b58]">
                Permanently Delete Admin: {deleteTarget.name} ({deleteTarget.email})?
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onDeleteAdmin(deleteTarget.id);
                    if (!res.ok) {
                      onToast('error', res.error || 'Could not delete admin.');
                      return;
                    }
                    onToast('info', `Deleted admin ${deleteTarget.email}.`);
                    setDeleteTarget(null);
                    loadAll();
                  }}
                  className="rounded-[9px] bg-[#c64b58] px-4 py-2 text-xs font-bold text-white cursor-pointer"
                >
                  Delete Permanently
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-bold text-[#142746] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-[13px] border border-[#e3e9f2] bg-white">
            <table className="w-full min-w-[820px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
                  <th className="px-4 py-3 font-bold">Administrator</th>
                  <th className="px-4 py-3 font-bold">Role &amp; Security</th>
                  <th className="px-4 py-3 font-bold">Course Scope</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => {
                  const role = getEffectiveAdminRole(a) || 'ADMIN';
                  const ownerRow = role === 'SUPER_ADMIN';
                  const statusLabel = a.accountStatus
                    ? a.accountStatus.replace(/_/g, ' ')
                    : a.suspended
                      ? 'SUSPENDED'
                      : a.active
                        ? 'ACTIVE'
                        : 'DEACTIVATED';
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-[#142746]">{a.name}</div>
                        <div className="text-[#59677d]">{a.email}</div>
                        {(a.whatsappNumber || a.phone) && (
                          <div className="font-mono text-[11px] text-[#718096]">
                            {a.countryCode || '+91'} {a.whatsappNumber || a.phone} ·{' '}
                            {a.whatsappVerified ? (
                              <span className="text-[#13845b] font-semibold">
                                WA Verified
                              </span>
                            ) : (
                              <span>WA Unverified</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-[#142746]">
                          {ADMIN_ROLE_LABELS[role]}
                        </div>
                        <div className="text-[11px] text-[#718096] tabular-nums">
                          {(a.permissions || []).length} permissions ·{' '}
                          {a.whatsappVerified ? 'Phone OTP 2FA On' : 'Phone OTP Pending'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#59677d] tabular-nums">
                        {ownerRow
                          ? 'All Courses & Financials'
                          : role === 'STUDENT_SUPPORT'
                            ? 'Support Desk Only'
                            : `${(a.assignedCourseIds || []).length} assigned course(s)`}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-bold ${
                            statusLabel === 'ACTIVE'
                              ? 'text-[#13845b]'
                              : statusLabel === 'SUSPENDED' || statusLabel === 'REJECTED'
                                ? 'text-[#c64b58]'
                                : 'text-[#b45309]'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {ownerRow || !ownerAccess ? (
                          <span className="text-[11px] font-semibold text-[#8c6826]">
                            {ownerRow ? 'Owner Protected' : 'View Only'}
                          </span>
                        ) : (
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditor(a)}
                              className="rounded-lg bg-[#edf2fa] px-2.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] cursor-pointer"
                            >
                              Role / Courses
                            </button>
                            <button
                              type="button"
                              onClick={() => setResetTarget(a)}
                              className="rounded-lg border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
                              title="Reset admin password"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                            {a.active && !a.suspended ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  await onUpdateStatus(a.id, 'SUSPEND', 'Suspended by Super Admin');
                                  onToast('info', `${a.name} suspended.`);
                                  loadAll();
                                }}
                                className="rounded-lg border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#b45309] hover:bg-[#fffaf0] cursor-pointer"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  await onUpdateStatus(a.id, 'ACTIVATE');
                                  onToast('success', `${a.name} activated.`);
                                  loadAll();
                                }}
                                className="rounded-lg bg-[#13845b] px-2.5 py-1.5 text-xs font-bold text-white cursor-pointer"
                              >
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                const r = await onTerminateUserSessions(a.id);
                                if (r.ok) {
                                  onToast('info', `Terminated ${r.data.revokedCount} active session(s).`);
                                }
                              }}
                              className="rounded-lg border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#59677d] hover:bg-[#f3f6fb] cursor-pointer"
                              title="Force log out all sessions"
                            >
                              Kill Sessions
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(a)}
                              className="rounded-lg border border-[#e3e9f2] bg-white px-2 py-1.5 text-xs font-semibold text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer"
                              title="Delete sub-admin"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {assignmentHistory.length > 0 && (
            <div className="rounded-[13px] border border-[#e3e9f2] bg-white p-4">
              <h3 className="text-sm font-extrabold text-[#142746] mb-2">
                Recent Course Assignment History ({assignmentHistory.length})
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
                {assignmentHistory.slice(0, 20).map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f5f9] pb-1.5 last:border-b-0"
                  >
                    <div>
                      <span className="font-bold text-[#142746]">{h.adminName}</span>{' '}
                      <span className="text-[#718096]">({h.adminRole})</span> ·{' '}
                      <span
                        className={`font-semibold ${
                          h.action === 'REMOVED' ? 'text-[#c64b58]' : 'text-[#13845b]'
                        }`}
                      >
                        {h.action}
                      </span>{' '}
                      · <span className="font-semibold text-[#315b9b]">{h.courseTitle}</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#718096] tabular-nums">
                      By {h.actorName} · {new Date(h.timestamp).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ADMIN SELF-REGISTRATIONS APPROVAL */}
      {tab === 'registrations' && ownerAccess && (
        <div className="space-y-4">
          {reviewingReg && (
            <div className="rounded-[15px] border border-[#13845b] bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#e3e9f2] pb-3">
                <div>
                  <h2 className="text-base font-extrabold text-[#142746]">
                    Approve Registration · {reviewingReg.name}
                  </h2>
                  <p className="text-xs text-[#718096]">
                    Requested Designation: {reviewingReg.requestedDesignation || 'COURSE_MANAGER'} · Email: {reviewingReg.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewingReg(null)}
                  className="text-xs font-semibold text-[#718096] cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1">
                    Confirm Assigned Role
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => {
                      const r = e.target.value as Exclude<AdminRole, 'SUPER_ADMIN'>;
                      setRegRole(r);
                      setRegPerms([...DEFAULT_ROLE_PERMISSIONS[r]]);
                    }}
                    className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-bold text-[#142746]"
                  >
                    {ASSIGNABLE_ADMIN_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ADMIN_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs font-bold text-[#59677d] mb-1">
                    Assign Specific Courses ({regCourseIds.length})
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-[9px] border border-[#e3e9f2] bg-[#f8fafd] p-2.5 space-y-1">
                    {courses.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={regCourseIds.includes(c.id)}
                          onChange={(e) =>
                            setRegCourseIds((prev) =>
                              e.target.checked
                                ? [...prev, c.id]
                                : prev.filter((id) => id !== c.id)
                            )
                          }
                        />
                        <span className="truncate">{c.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-[#59677d] mb-1.5">
                  Permissions ({regPerms.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] p-3">
                  {ALL_ADMIN_PERMISSIONS.map((perm) => (
                    <label key={perm.key} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={regPerms.includes(perm.key)}
                        onChange={(e) =>
                          setRegPerms((prev) =>
                            e.target.checked
                              ? [...prev, perm.key]
                              : prev.filter((p) => p !== perm.key)
                          )
                        }
                      />
                      <span>{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-[#142746] cursor-pointer">
                <input
                  type="checkbox"
                  checked={regActivateNow}
                  onChange={(e) => setRegActivateNow(e.target.checked)}
                />
                <span>Activate account immediately (allow Admin Dashboard sign-in right away)</span>
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onApproveRegistration(reviewingReg.id, {
                      adminRole: regRole,
                      permissions: regPerms,
                      assignedCourseIds: regCourseIds,
                      activateNow: regActivateNow,
                    });
                    if (!res.ok) {
                      onToast('error', res.error || 'Could not approve registration.');
                      return;
                    }
                    setReviewingReg(null);
                    onToast(
                      'success',
                      regActivateNow
                        ? 'Admin approved and activated.'
                        : 'Admin approved (ready for final activation).'
                    );
                    loadAll();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#13845b] px-4 py-2 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>
                    {regActivateNow ? 'Approve & Activate' : 'Approve Only'}
                  </span>
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-[13px] border border-[#e3e9f2] bg-white">
            <table className="w-full min-w-[780px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
                  <th className="px-4 py-3 font-bold">Applicant &amp; Contact</th>
                  <th className="px-4 py-3 font-bold">Requested Designation</th>
                  <th className="px-4 py-3 font-bold">WhatsApp Ownership</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {registrations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-xs text-[#718096]"
                    >
                      No self-registered admin applications yet.
                    </td>
                  </tr>
                ) : (
                  registrations.map((reg) => {
                    const st = reg.accountStatus || (reg.active ? 'ACTIVE' : 'PENDING_APPROVAL');
                    return (
                      <tr
                        key={reg.id}
                        className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                      >
                        <td className="px-4 py-3">
                          <div className="font-bold text-[#142746]">{reg.name}</div>
                          <div className="text-[#59677d]">{reg.email}</div>
                          {reg.createdAt && (
                            <div className="text-[11px] text-[#718096] tabular-nums">
                              Applied {new Date(reg.createdAt).toLocaleString('en-IN')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#142746]">
                          {(reg.requestedDesignation || reg.adminRole || '').replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <div>
                            {reg.countryCode || '+91'} {reg.whatsappNumber || reg.phone}
                          </div>
                          <div
                            className={
                              reg.whatsappVerified
                                ? 'font-sans font-bold text-[#13845b]'
                                : 'font-sans text-[#b45309]'
                            }
                          >
                            {reg.whatsappVerified ? 'OTP Verified' : 'Unverified'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-bold ${
                              st === 'ACTIVE'
                                ? 'text-[#13845b]'
                                : st === 'REJECTED' || st === 'SUSPENDED'
                                  ? 'text-[#c64b58]'
                                  : 'text-[#b45309]'
                            }`}
                          >
                            {st.replace(/_/g, ' ')}
                          </span>
                          {reg.rejectionReason && (
                            <div className="text-[11px] text-[#c64b58]">
                              {reg.rejectionReason}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            {st === 'PENDING_APPROVAL' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openRegReviewer(reg)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#13845b] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
                                >
                                  <UserCheck className="h-3.5 w-3.5" />
                                  <span>Review &amp; Approve</span>
                                </button>
                                <input
                                  value={rejectReasons[reg.id] || ''}
                                  onChange={(e) =>
                                    setRejectReasons((p) => ({
                                      ...p,
                                      [reg.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Reject reason..."
                                  className="w-32 rounded-lg border border-[#e3e9f2] px-2 py-1 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onRejectRegistration(
                                      reg.id,
                                      rejectReasons[reg.id] || 'Declined by Main Super Admin'
                                    );
                                    onToast('info', `${reg.name} registration rejected.`);
                                    loadAll();
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[#e3e9f2] px-2.5 py-1.5 text-xs font-bold text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}
                            {st === 'APPROVED' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await onActivateRegistration(reg.id);
                                  if (res.ok) {
                                    onToast('success', `${reg.name} activated.`);
                                    loadAll();
                                  }
                                }}
                                className="rounded-lg bg-[#142746] px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                              >
                                Final Activate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PASSWORD RECOVERY APPROVALS (MAIN SUPER ADMIN ONLY) */}
      {tab === 'recovery' && ownerAccess && (
        <div className="space-y-4">
          <div className="rounded-[13px] border border-[#dce6f7] bg-white p-4 text-xs text-[#59677d]">
            <strong className="text-[#142746] block mb-0.5">
              Strict Sub-Admin Recovery Governance
            </strong>
            Admins, Co-Admins, Course Managers, Content Editors, and Student Support Staff cannot reset their passwords independently. A single-use reset token is generated ONLY after Main Super Admin approval.
          </div>

          <div className="overflow-x-auto rounded-[13px] border border-[#e3e9f2] bg-white">
            <table className="w-full min-w-[780px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
                  <th className="px-4 py-3 font-bold">Date &amp; Time</th>
                  <th className="px-4 py-3 font-bold">Admin User</th>
                  <th className="px-4 py-3 font-bold">Role</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recoveryRequests.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-xs text-[#718096]"
                    >
                      No staff password recovery requests recorded.
                    </td>
                  </tr>
                ) : (
                  recoveryRequests.map((reqRec) => {
                    const dt = new Date(reqRec.requestedAt);
                    const revealedToken = issuedRecoveryTokens[reqRec.id];
                    return (
                      <tr
                        key={reqRec.id}
                        className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                      >
                        <td className="px-4 py-3 font-mono text-[11px] text-[#59677d] tabular-nums whitespace-nowrap">
                          <div>{dt.toLocaleDateString('en-IN')}</div>
                          <div>{dt.toLocaleTimeString('en-IN')}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-[#142746]">
                            {reqRec.userName}
                          </div>
                          <div className="text-[#59677d]">{reqRec.userEmail}</div>
                          {revealedToken && (
                            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-[#bfe6d5] bg-[#eefaf4] px-2.5 py-1.5 font-mono text-[11px] font-bold text-[#0f6c4a]">
                              <span>One-Time Token: {revealedToken}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(revealedToken);
                                  onToast('success', 'Reset token copied.');
                                }}
                                className="text-[#142746] hover:underline cursor-pointer"
                              >
                                Copy
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#142746]">
                          {reqRec.userRole.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-bold ${
                              reqRec.status === 'COMPLETED'
                                ? 'text-[#13845b]'
                                : reqRec.status === 'APPROVED'
                                  ? 'text-[#315b9b]'
                                  : reqRec.status === 'REJECTED' || reqRec.status === 'EXPIRED'
                                    ? 'text-[#c64b58]'
                                    : 'text-[#b45309]'
                            }`}
                          >
                            {reqRec.status}
                          </span>
                          {reqRec.deliveryChannel && (
                            <div className="text-[11px] text-[#718096]">
                              Channel: {reqRec.deliveryChannel.replace(/_/g, ' ')}
                            </div>
                          )}
                          {reqRec.rejectionReason && (
                            <div className="text-[11px] text-[#c64b58]">
                              {reqRec.rejectionReason}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {reqRec.status === 'PENDING' ? (
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await onApproveRecoveryRequest(reqRec.id);
                                  if (!res.ok) {
                                    onToast('error', res.error);
                                    return;
                                  }
                                  setIssuedRecoveryTokens((p) => ({
                                    ...p,
                                    [reqRec.id]: res.data.oneTimeResetToken,
                                  }));
                                  onToast(
                                    'success',
                                    'Recovery approved & one-time reset token generated.'
                                  );
                                  loadAll();
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#13845b] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await onRejectRecoveryRequest(
                                    reqRec.id,
                                    'Rejected by Main Super Admin'
                                  );
                                  if (res.ok) {
                                    onToast('info', 'Recovery request rejected.');
                                    loadAll();
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-bold text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer"
                              >
                                <ShieldAlert className="h-3.5 w-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#718096]">
                              Reviewed by {reqRec.reviewedByName || 'Super Admin'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: INVITATIONS & SESSIONS */}
      {tab === 'sessions' && ownerAccess && (
        <div className="space-y-5">
          <div className="rounded-[13px] border border-[#e3e9f2] bg-white p-4">
            <h3 className="text-sm font-extrabold text-[#142746] mb-2">
              Admin Invitations ({invitations.length})
            </h3>
            {invitations.length === 0 ? (
              <p className="text-xs text-[#718096]">No invitations sent yet.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e3e9f2] px-3 py-2"
                  >
                    <div>
                      <span className="font-bold text-[#142746]">{inv.name}</span> ·{' '}
                      <span className="text-[#59677d]">{inv.email}</span> ·{' '}
                      <span className="font-semibold text-[#315b9b]">{inv.adminRole}</span> ·{' '}
                      <span className="font-bold text-[#8c6826]">{inv.status}</span>
                    </div>
                    {inv.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await onCancelInvitation(inv.id);
                          onToast('info', 'Invitation cancelled.');
                          loadAll();
                        }}
                        className="text-xs font-bold text-[#c64b58] hover:underline cursor-pointer"
                      >
                        Cancel Invite
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-[13px] border border-[#e3e9f2] bg-white">
            <table className="w-full min-w-[740px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
                  <th className="px-4 py-3 font-bold">Account</th>
                  <th className="px-4 py-3 font-bold">IP &amp; Device</th>
                  <th className="px-4 py-3 font-bold">Last Active</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 40).map((s) => (
                  <tr
                    key={s.sid}
                    className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-[#142746]">{s.userName}</div>
                      <div className="text-[#59677d]">{s.userEmail}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[#59677d]">
                      <div className="font-mono text-[11px]">{s.ip}</div>
                      <div className="max-w-[260px] truncate text-[11px] text-[#718096]">
                        {s.userAgent}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] tabular-nums text-[#59677d]">
                      {new Date(s.lastActiveAt).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`font-bold ${
                          s.revoked ? 'text-[#c64b58]' : 'text-[#13845b]'
                        }`}
                      >
                        {s.revoked ? `Revoked (${s.revokedReason || ''})` : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!s.revoked && (
                        <button
                          type="button"
                          onClick={async () => {
                            await onRevokeSession(s.sid);
                            onToast('info', 'Session terminated.');
                            loadAll();
                          }}
                          className="rounded-lg border border-[#e3e9f2] px-2.5 py-1 text-xs font-bold text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
