import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CheckCircle2,
  Copy,
  Database,
  Download,
  KeyRound,
  Lock,
  Monitor,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type {
  ActivityLogEntry,
  AdminSessionRecord,
  User,
} from '../types/lms';
import { ADMIN_ROLE_LABELS, hasPermission, isSuperAdmin } from '../utils/rbac';
import { VerifyWhatsappWidget } from './WhatsappSecurityPanel';

interface AuditAndSecurityPageProps {
  currentUser: User;
  whatsappCloudApiConfigured: boolean;
  onRegenerateBackupCodes: (password?: string) => Promise<
    | { ok: true; data: { ok: boolean; backupCodes: string[]; user: User } }
    | { ok: false; error: string }
  >;
  onUpdateRecoveryPin: (
    recoveryPin: string,
    currentPassword?: string
  ) => Promise<
    { ok: true; data: { ok: boolean; user: User } } | { ok: false; error: string }
  >;
  onSendWhatsappOtp: (payload: {
    countryCode: string;
    whatsappNumber: string;
    purpose: 'REGISTRATION' | 'PASSWORD_RECOVERY' | 'WHATSAPP_VERIFY';
    recipientName?: string;
  }) => Promise<
    | {
        ok: true;
        data: {
          ok: boolean;
          challengeId: string;
          maskedPhone: string;
          expiresAt: string;
          resendAvailableAt: string;
        };
      }
    | { ok: false; error: string; apiNotConfigured?: boolean }
  >;
  onVerifyWhatsappOtp: (payload: {
    challengeId: string;
    code: string;
    consumeImmediately?: boolean;
    countryCode?: string;
    whatsappNumber?: string;
  }) => Promise<
    | {
        ok: true;
        data: { ok: boolean; verified: boolean; challengeId: string; maskedPhone: string };
      }
    | { ok: false; error: string }
  >;
  onFetchSessions: () => Promise<
    { ok: true; data: { sessions: AdminSessionRecord[] } } | { ok: false; error: string }
  >;
  onRevokeSession: (sid: string) => Promise<
    { ok: true; data: { ok: boolean } } | { ok: false; error: string }
  >;
  onFetchAuditLogs: (params?: {
    search?: string;
    role?: string;
    category?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<
    | {
        ok: true;
        data: { logs: ActivityLogEntry[]; total: number; page: number; pageSize: number };
      }
    | { ok: false; error: string }
  >;
  onDownloadBackup: () => Promise<{ ok: true } | { ok: false; error: string }>;
  onRestoreBackup: (
    backup: unknown,
    twoFactorCode?: string
  ) => Promise<
    { ok: true; data: { ok: boolean } } | { ok: false; error: string; requiresStepUp2FA?: boolean }
  >;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function AuditAndSecurityPage({
  currentUser,
  whatsappCloudApiConfigured,
  onRegenerateBackupCodes,
  onUpdateRecoveryPin,
  onSendWhatsappOtp,
  onVerifyWhatsappOtp,
  onFetchSessions,
  onRevokeSession,
  onFetchAuditLogs,
  onDownloadBackup,
  onRestoreBackup,
  onToast,
}: AuditAndSecurityPageProps) {
  const owner = isSuperAdmin(currentUser);
  const canViewLogs = owner || hasPermission(currentUser, 'activity_log_view');
  const [tab, setTab] = useState<'security' | 'logs' | 'sessions' | 'backup'>(
    canViewLogs ? 'logs' : 'security'
  );

  // Offline Recovery PIN & Backup Codes State
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [regenPwd, setRegenPwd] = useState('');
  const [regenBusy, setRegenBusy] = useState(false);
  const [recoveryPinInput, setRecoveryPinInput] = useState('');
  const [recoveryPinConfirm, setRecoveryPinConfirm] = useState('');
  const [recoveryPinPwd, setRecoveryPinPwd] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  // Sessions State
  const [sessions, setSessions] = useState<AdminSessionRecord[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Audit Logs State
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Backup State
  const [restoring, setRestoring] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await onFetchSessions();
      if (res.ok) setSessions(res.data.sessions);
    } finally {
      setLoadingSessions(false);
    }
  }, [onFetchSessions]);

  const loadLogs = useCallback(async () => {
    if (!canViewLogs) return;
    setLoadingLogs(true);
    try {
      const res = await onFetchAuditLogs({
        search: search.trim() || undefined,
        role: roleFilter,
        category: categoryFilter,
        page,
        pageSize: 25,
      });
      if (res.ok) {
        setLogs(res.data.logs);
        setTotalLogs(res.data.total);
      }
    } finally {
      setLoadingLogs(false);
    }
  }, [canViewLogs, onFetchAuditLogs, search, roleFilter, categoryFilter, page]);

  useEffect(() => {
    if (tab === 'sessions') loadSessions();
    if (tab === 'logs') loadLogs();
  }, [tab, loadSessions, loadLogs]);

  const handleRegenerateBackupCodes = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setRegenBusy(true);
    try {
      const res = await onRegenerateBackupCodes(regenPwd || undefined);
      if (!res.ok) {
        onToast('error', res.error);
        return;
      }
      setBackupCodes(res.data.backupCodes);
      setRegenPwd('');
      onToast('success', 'Generated 6 fresh emergency backup recovery codes. Save them securely.');
    } finally {
      setRegenBusy(false);
    }
  };

  const handleSaveRecoveryPin = async (e: FormEvent) => {
    e.preventDefault();
    const pin = recoveryPinInput.trim();
    if (pin.length < 4) {
      onToast('error', 'Security Recovery PIN must be at least 4 characters.');
      return;
    }
    if (pin !== recoveryPinConfirm.trim()) {
      onToast('error', 'Security Recovery PIN and confirmation do not match.');
      return;
    }
    setPinBusy(true);
    try {
      const res = await onUpdateRecoveryPin(pin, recoveryPinPwd || undefined);
      if (!res.ok) {
        onToast('error', res.error);
        return;
      }
      setRecoveryPinInput('');
      setRecoveryPinConfirm('');
      setRecoveryPinPwd('');
      onToast('success', 'Security Recovery PIN saved for offline Admin ID & password recovery.');
    } finally {
      setPinBusy(false);
    }
  };

  const handleExportLogsCsv = () => {
    if (logs.length === 0) {
      onToast('info', 'No audit log entries on this page to export.');
      return;
    }
    const headers = [
      'Timestamp',
      'Actor Name',
      'Actor Email',
      'Actor Role',
      'Category',
      'Action',
      'Target',
      'IP Address',
    ];
    const escapeCell = (val: unknown) => {
      const s = String(val ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = logs.map((l) =>
      [
        l.timestamp,
        l.actorName,
        l.actorEmail,
        l.actorRole,
        l.category,
        l.action,
        l.targetLabel || l.targetId || '',
        l.ip || '',
      ]
        .map(escapeCell)
        .join(',')
    );
    const csv = [headers.map(escapeCell).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arya-lms-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('success', `Exported ${logs.length} audit log records.`);
  };

  const handleRestoreFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await onRestoreBackup(parsed);
      if (!res.ok) {
        onToast('error', res.error);
        return;
      }
      onToast('success', 'System database backup restored successfully.');
    } catch {
      onToast('error', 'Invalid backup JSON file.');
    } finally {
      setRestoring(false);
    }
  };

  const categoryOptions: Array<'ALL' | ActivityLogEntry['category']> = owner
    ? ['ALL', 'AUTH', 'ADMIN', 'COURSE', 'APPROVAL', 'FINANCE', 'CERTIFICATE', 'STUDENT', 'SYSTEM', 'SECURITY']
    : ['ALL', 'AUTH', 'ADMIN', 'COURSE', 'APPROVAL', 'CERTIFICATE', 'STUDENT', 'SYSTEM', 'SECURITY'];

  const totalPages = Math.max(1, Math.ceil(totalLogs / 25));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142746]">
            Audit Logs &amp; Security Governance
          </h1>
          <p className="mt-1 text-sm text-[#718096]">
            Two-factor authentication, verified WhatsApp ownership, active sessions, and tamper-resistant activity records
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {canViewLogs && (
            <button
              type="button"
              onClick={() => setTab('logs')}
              className={`rounded-[9px] px-3 py-2 text-xs font-bold whitespace-nowrap cursor-pointer ${
                tab === 'logs'
                  ? 'bg-[#142746] text-white'
                  : 'border border-[#e3e9f2] bg-white text-[#142746] hover:bg-[#f3f6fb]'
              }`}
            >
              Audit Logs
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('security')}
            className={`rounded-[9px] px-3 py-2 text-xs font-bold whitespace-nowrap cursor-pointer ${
              tab === 'security'
                ? 'bg-[#142746] text-white'
                : 'border border-[#e3e9f2] bg-white text-[#142746] hover:bg-[#f3f6fb]'
            }`}
          >
            2FA &amp; WhatsApp Security
          </button>
          <button
            type="button"
            onClick={() => setTab('sessions')}
            className={`rounded-[9px] px-3 py-2 text-xs font-bold whitespace-nowrap cursor-pointer ${
              tab === 'sessions'
                ? 'bg-[#142746] text-white'
                : 'border border-[#e3e9f2] bg-white text-[#142746] hover:bg-[#f3f6fb]'
            }`}
          >
            Active Sessions
          </button>
          {owner && (
            <button
              type="button"
              onClick={() => setTab('backup')}
              className={`rounded-[9px] px-3 py-2 text-xs font-bold whitespace-nowrap cursor-pointer ${
                tab === 'backup'
                  ? 'bg-[#142746] text-white'
                  : 'border border-[#e3e9f2] bg-white text-[#142746] hover:bg-[#f3f6fb]'
              }`}
            >
              DB Backup &amp; Restore
            </button>
          )}
        </div>
      </div>

      {/* TAB: AUDIT LOGS */}
      {tab === 'logs' && canViewLogs && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[13px] border border-[#e3e9f2] bg-white p-3.5">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#718096]" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search actor, action or target..."
                  className="w-full rounded-[9px] border border-[#e3e9f2] pl-8 pr-3 py-1.5 text-xs outline-none focus:border-[#315b9b]"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-[9px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#142746] outline-none"
              >
                <option value="ALL">All Roles</option>
                {Object.entries(ADMIN_ROLE_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
                <option value="STUDENT">Student</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-[9px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#142746] outline-none"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 no-print">
              <button
                type="button"
                onClick={loadLogs}
                className="inline-flex items-center gap-1 rounded-[9px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={handleExportLogsCsv}
                className="inline-flex items-center gap-1 rounded-[9px] bg-[#edf2fa] px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-[#13845b]" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 rounded-[9px] bg-[#142746] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5 text-[#d7a84b]" />
                <span>Print PDF</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-[13px] border border-[#e3e9f2] bg-white">
            <table className="w-full min-w-[780px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
                  <th className="px-4 py-3 font-bold">Timestamp</th>
                  <th className="px-4 py-3 font-bold">Actor &amp; Role</th>
                  <th className="px-4 py-3 font-bold">Category</th>
                  <th className="px-4 py-3 font-bold">Action</th>
                  <th className="px-4 py-3 font-bold">Target</th>
                  <th className="px-4 py-3 font-bold">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {loadingLogs ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#718096]">
                      Loading audit logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#718096]">
                      No activity records match the active filter.
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                    >
                      <td className="px-4 py-2.5 font-mono text-[11px] tabular-nums text-[#59677d] whitespace-nowrap">
                        {new Date(l.timestamp).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-[#142746]">{l.actorName}</div>
                        <div className="text-[11px] text-[#718096]">
                          {l.actorEmail} · {l.actorRole}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] font-bold text-[#315b9b]">
                        {l.category}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-[#142746]">
                        {l.action.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-2.5 text-[#59677d]">
                        {l.targetLabel || l.targetId || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-[#718096]">
                        {l.ip || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-[#718096]">
            <span>
              Showing page <strong className="text-[#142746]">{page}</strong> of{' '}
              <strong className="text-[#142746]">{totalPages}</strong> ({totalLogs} total records · read-only)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-[#e3e9f2] bg-white px-3 py-1 font-bold text-[#142746] disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-[#e3e9f2] bg-white px-3 py-1 font-bold text-[#142746] disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: PERSONAL SECURITY (PHONE / WHATSAPP OTP 2FA & RECOVERY) */}
      {tab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Phone / WhatsApp Ownership Verification */}
          <div className="lg:col-span-2 rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3">
            <h2 className="text-base font-extrabold text-[#142746]">
              Phone / WhatsApp Number &amp; 2FA Verification (Single OTP Only)
            </h2>
            <p className="text-xs text-[#718096]">
              All 2FA verification codes and password recovery OTPs go strictly to your verified phone number via WhatsApp — no authenticator app or email codes needed.
            </p>
            <VerifyWhatsappWidget
              user={currentUser}
              whatsappCloudApiConfigured={whatsappCloudApiConfigured}
              onSendOtp={onSendWhatsappOtp}
              onVerifyOtp={onVerifyWhatsappOtp}
              onToast={onToast}
            />
          </div>

          {/* Emergency Backup Codes & Offline Recovery PIN */}
          <div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-[#142746] flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#d7a84b]" />
                  <span>Emergency Backup Recovery Codes</span>
                </h2>
                <span
                  className={`text-xs font-bold ${
                    (currentUser.backupCodesRemaining ?? 0) > 0
                      ? 'text-[#13845b]'
                      : 'text-[#c64b58]'
                  }`}
                >
                  {currentUser.backupCodesRemaining ?? 0} remaining
                </span>
              </div>
              <p className="text-xs text-[#718096] leading-relaxed">
                Single-use offline recovery codes let you recover your forgotten Admin Login ID or reset your password even if WhatsApp OTP API is not configured.
              </p>
              <form onSubmit={handleRegenerateBackupCodes} className="space-y-2.5">
                <input
                  type="password"
                  value={regenPwd}
                  onChange={(e) => setRegenPwd(e.target.value)}
                  placeholder="Current password (optional verification)"
                  className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                />
                <button
                  type="submit"
                  disabled={regenBusy}
                  className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-[#d7a84b]" />
                  <span>
                    {regenBusy
                      ? 'Generating...'
                      : 'Generate 6 Fresh Emergency Backup Codes'}
                  </span>
                </button>
              </form>
              {backupCodes && backupCodes.length > 0 && (
                <div className="rounded-[11px] border border-[#f1dca7] bg-[#fffdf7] p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-extrabold text-[#8c6826]">
                      Save Your Single-Use Backup Recovery Codes Now
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(backupCodes.join('\n'));
                        onToast('info', 'Backup codes copied to clipboard.');
                      }}
                      className="inline-flex items-center gap-1 rounded border border-[#e3e9f2] bg-white px-2 py-1 text-[11px] font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy All</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-xs font-bold text-[#142746]">
                    {backupCodes.map((c) => (
                      <div
                        key={c}
                        className="rounded border border-[#e3e9f2] bg-white px-2.5 py-1 text-center"
                      >
                        {c}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-[#142746] flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#315b9b]" />
                  <span>Security Recovery PIN</span>
                </h2>
                <span
                  className={`text-xs font-bold ${
                    currentUser.hasRecoveryPin ? 'text-[#13845b]' : 'text-[#8c6826]'
                  }`}
                >
                  {currentUser.hasRecoveryPin ? 'Configured' : 'Not Set'}
                </span>
              </div>
              <p className="text-xs text-[#718096] leading-relaxed">
                Set a secret 4–12 character Security Recovery PIN to recover a forgotten Admin ID or reset your Main Super Admin password instantly offline.
              </p>
              <form onSubmit={handleSaveRecoveryPin} className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    required
                    minLength={4}
                    maxLength={24}
                    value={recoveryPinInput}
                    onChange={(e) => setRecoveryPinInput(e.target.value)}
                    placeholder={
                      currentUser.hasRecoveryPin
                        ? 'New Recovery PIN (min 4 chars)'
                        : 'Set Recovery PIN (min 4 chars)'
                    }
                    className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                  />
                  <input
                    type="password"
                    required
                    minLength={4}
                    maxLength={24}
                    value={recoveryPinConfirm}
                    onChange={(e) => setRecoveryPinConfirm(e.target.value)}
                    placeholder="Confirm Recovery PIN"
                    className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                  />
                </div>
                <input
                  type="password"
                  value={recoveryPinPwd}
                  onChange={(e) => setRecoveryPinPwd(e.target.value)}
                  placeholder="Current password (optional verification)"
                  className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                />
                <button
                  type="submit"
                  disabled={pinBusy}
                  className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#13845b] px-4 py-2 text-xs font-bold text-white hover:bg-[#0f6c4a] disabled:opacity-60 cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>
                    {pinBusy
                      ? 'Saving...'
                      : currentUser.hasRecoveryPin
                        ? 'Update Recovery PIN'
                        : 'Save Recovery PIN'}
                  </span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB: ACTIVE SESSIONS */}
      {tab === 'sessions' && (
        <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-[#142746] flex items-center gap-2">
                <Monitor className="h-4 w-4 text-[#315b9b]" />
                <span>{owner ? 'All Active Portal Sessions' : 'Your Active Sessions'}</span>
              </h2>
              <p className="text-xs text-[#718096]">
                Revoke lost or unrecognized device tokens immediately.
              </p>
            </div>
            <button
              type="button"
              onClick={loadSessions}
              className="rounded-[9px] border border-[#e3e9f2] px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
            >
              Refresh
            </button>
          </div>

          {loadingSessions ? (
            <p className="text-xs text-[#718096]">Loading sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-[#718096]">No active sessions tracked.</p>
          ) : (
            <div className="divide-y divide-[#e3e9f2] rounded-[11px] border border-[#e3e9f2]">
              {sessions.map((s) => (
                <div
                  key={s.sid}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-[#142746]">
                      {s.userName || s.userId}
                    </div>
                    <div className="text-[11px] text-[#718096]">
                      {s.userEmail} · {s.adminRole || 'ADMIN'} · IP {s.ip || 'N/A'} · Active{' '}
                      {new Date(s.lastActiveAt || s.createdAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await onRevokeSession(s.sid);
                      if (res.ok) {
                        onToast('success', 'Session token revoked.');
                        loadSessions();
                      } else {
                        onToast('error', res.error);
                      }
                    }}
                    className="rounded-md border border-[#e3e9f2] px-3 py-1 font-bold text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer"
                  >
                    Revoke Session
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: SUPER ADMIN BACKUP & RESTORE */}
      {tab === 'backup' && owner && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3">
            <h2 className="text-base font-extrabold text-[#142746] flex items-center gap-2">
              <Database className="h-4 w-4 text-[#315b9b]" />
              <span>Export Complete LMS Backup</span>
            </h2>
            <p className="text-xs text-[#718096] leading-relaxed">
              Downloads a complete snapshot of courses, students, admin hierarchy, payment records, GST settings, progress, and audit logs.
            </p>
            <button
              type="button"
              onClick={async () => {
                const res = await onDownloadBackup();
                if (res.ok) onToast('success', 'Full LMS backup downloaded.');
                else onToast('error', res.error);
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#142746] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
            >
              <Download className="h-4 w-4 text-[#d7a84b]" />
              <span>Download JSON Backup</span>
            </button>
          </div>

          <div className="rounded-[15px] border border-[#f5c8ce] bg-[#fffafa] p-5 space-y-3">
            <h2 className="text-base font-extrabold text-[#142746] flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#c64b58]" />
              <span>Restore From Backup (Super Admin Only)</span>
            </h2>
            <p className="text-xs text-[#718096] leading-relaxed">
              Replaces current database collections with a validated backup file. Always download a fresh backup before restoring.
            </p>
            <label className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#f5c8ce] bg-white px-4 py-2 text-xs font-bold text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer">
              <Upload className="h-4 w-4" />
              <span>{restoring ? 'Restoring...' : 'Select Backup JSON & Restore'}</span>
              <input
                type="file"
                accept="application/json,.json"
                disabled={restoring}
                onChange={handleRestoreFile}
                className="sr-only"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
