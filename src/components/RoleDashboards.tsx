import { useEffect, useState } from 'react';
import {
  BookOpen,
  Download,
  FileCheck2,
  KeyRound,
  LifeBuoy,
  Lock,
  Megaphone,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';
import type {
  ActivityLogEntry,
  Course,
  CustomCertificateRecord,
  Order,
  PageId,
  PasswordRecoveryRequest,
  PortalSettings,
  User,
} from '../types/lms';
import { buildMonthlyGstSummaries, downloadGstComplianceCsv, money } from '../utils/lms';
import {
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
  getCourseApprovalStatus,
  getEffectiveAdminRole,
  hasPermission,
  isSuperAdmin,
} from '../utils/rbac';

interface RoleDashboardsProps {
  currentUser: User;
  users: User[];
  courses: Course[];
  orders: Order[];
  certificates: CustomCertificateRecord[];
  settings: PortalSettings;
  whatsappCloudApiConfigured: boolean;
  onNavigate: (page: PageId) => void;
  onSelectOrdersMonth: (monthKey: string) => void;
  onOpenAddCourse: () => void;
  onOpenLiveClass: () => void;
  onOpenBroadcast: () => void;
  onSeedCatalog: () => void;
  onFetchAuditLogs: (params?: { pageSize?: number }) => Promise<
    { ok: true; data: { logs: ActivityLogEntry[]; total: number } } | { ok: false; error: string }
  >;
  onFetchRegistrations?: () => Promise<
    { ok: true; data: { registrations: User[] } } | { ok: false; error: string }
  >;
  onFetchRecoveryRequests?: () => Promise<
    { ok: true; data: { requests: PasswordRecoveryRequest[] } } | { ok: false; error: string }
  >;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function RoleDashboards({
  currentUser,
  users,
  courses,
  orders,
  certificates,
  settings,
  whatsappCloudApiConfigured,
  onNavigate,
  onSelectOrdersMonth,
  onOpenAddCourse,
  onOpenLiveClass,
  onOpenBroadcast,
  onSeedCatalog,
  onFetchAuditLogs,
  onFetchRegistrations,
  onFetchRecoveryRequests,
  onToast,
}: RoleDashboardsProps) {
  const owner = isSuperAdmin(currentUser);
  const role = getEffectiveAdminRole(currentUser) || 'ADMIN';
  const [recentLogs, setRecentLogs] = useState<ActivityLogEntry[]>([]);
  const [pendingRegsCount, setPendingRegsCount] = useState(0);
  const [pendingRecoveryCount, setPendingRecoveryCount] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const logRes = await onFetchAuditLogs({ pageSize: 8 });
      if (active && logRes.ok) {
        setRecentLogs(logRes.data.logs);
      }
      if (owner && onFetchRegistrations) {
        const regRes = await onFetchRegistrations();
        if (active && regRes.ok) {
          setPendingRegsCount(
            regRes.data.registrations.filter(
              (r) =>
                r.accountStatus === 'PENDING_APPROVAL' ||
                r.accountStatus === 'APPROVED'
            ).length
          );
        }
      }
      if (owner && onFetchRecoveryRequests) {
        const recRes = await onFetchRecoveryRequests();
        if (active && recRes.ok) {
          setPendingRecoveryCount(
            recRes.data.requests.filter((r) => r.status === 'PENDING').length
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [owner, onFetchAuditLogs, onFetchRegistrations, onFetchRecoveryRequests]);

  const students = users.filter((u) => u.role === 'student');
  const admins = users.filter((u) => u.role === 'admin');
  const activeAdminsCount = admins.filter((a) => a.active && !a.suspended).length;
  const suspendedAdminsCount = admins.filter(
    (a) => a.suspended || a.accountStatus === 'SUSPENDED'
  ).length;
  const pendingCourseApprovals = courses.filter(
    (c) => getCourseApprovalStatus(c) === 'PENDING_APPROVAL'
  );
  const publishedCourses = courses.filter(
    (c) => getCourseApprovalStatus(c) === 'PUBLISHED'
  );
  const securityAlerts = recentLogs.filter(
    (l) =>
      l.category === 'SECURITY' ||
      l.action.includes('FAILED') ||
      l.action.includes('SUSPEND') ||
      l.action.includes('LOCKED')
  );

  // MAIN SUPER ADMIN (OWNER) DASHBOARD
  if (owner) {
    const paidOrders = orders.filter((o) => o.status === 'PAID');
    const paidRevenue = paidOrders.reduce((acc, o) => acc + o.total, 0);
    const pendingOrdersCount = orders.filter((o) => o.status === 'PENDING').length;
    const monthlyLedger = buildMonthlyGstSummaries(orders);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-[#8c6826]">
              {ADMIN_ROLE_LABELS.SUPER_ADMIN} · Complete Portal Authority
            </div>
            <h1 className="mt-0.5 text-2xl font-extrabold text-[#142746]">
              Main Super Admin Control Center
            </h1>
            <p className="mt-1 text-sm text-[#718096]">
              {ADMIN_ROLE_DESCRIPTIONS.SUPER_ADMIN}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {courses.length === 0 && (
              <button
                type="button"
                onClick={onSeedCatalog}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#8c6826]" />
                <span>Load Sample Courses</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenLiveClass}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] whitespace-nowrap cursor-pointer"
            >
              <Video className="h-3.5 w-3.5 text-[#13845b]" />
              <span>Live Zoom / Meet</span>
            </button>
            <button
              type="button"
              onClick={onOpenBroadcast}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] whitespace-nowrap cursor-pointer"
            >
              <Megaphone className="h-3.5 w-3.5 text-[#315b9b]" />
              <span>Broadcast</span>
            </button>
            <button
              type="button"
              onClick={onOpenAddCourse}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#18243a] hover:bg-[#cca042] whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add Course</span>
            </button>
          </div>
        </div>

        {/* Owner KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <MetricBox label="Total Students" value={String(students.length)} />
          <MetricBox
            label="Admin Team"
            value={String(admins.length)}
            sub={`${activeAdminsCount} active · ${suspendedAdminsCount} suspended`}
            onClick={() => onNavigate('admin_team')}
          />
          <MetricBox
            label="Pending Admin Approvals"
            value={String(pendingRegsCount)}
            sub={pendingRegsCount > 0 ? 'Review registrations' : 'Queue clear'}
            highlight={pendingRegsCount > 0}
            onClick={() => onNavigate('admin_team')}
          />
          <MetricBox
            label="Password Recovery Queue"
            value={String(pendingRecoveryCount)}
            sub={
              pendingRecoveryCount > 0
                ? 'Awaiting Super Admin approval'
                : 'No pending resets'
            }
            highlight={pendingRecoveryCount > 0}
            onClick={() => onNavigate('admin_team')}
          />
          <MetricBox
            label="Courses & Approvals"
            value={String(courses.length)}
            sub={`${publishedCourses.length} published · ${pendingCourseApprovals.length} pending review`}
            onClick={() => onNavigate('approvals')}
          />
          <MetricBox
            label="Issued Certificates"
            value={String(certificates.length)}
            sub="Custom & registry records"
            onClick={() => onNavigate('certificates')}
          />
          <MetricBox
            label="WhatsApp Cloud API 2FA"
            value={whatsappCloudApiConfigured ? 'Connected' : 'Setup Needed'}
            sub={
              settings.enforceWhatsapp2FA
                ? 'Mandatory Login OTP On'
                : 'Enforce in Settings'
            }
            onClick={() => onNavigate('settings')}
          />
          <MetricBox
            label="Total Revenue (Owner Only)"
            value={money(paidRevenue)}
            sub={
              pendingOrdersCount > 0
                ? `${pendingOrdersCount} pending order approvals`
                : `${paidOrders.length} verified paid orders`
            }
            onClick={() => onNavigate('orders')}
          />
        </div>

        {/* Quick Governance & Security Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-extrabold text-[#142746] flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[#b45309]" />
                <span>Security &amp; Audit Activity</span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('audit_logs')}
                className="text-xs font-bold text-[#315b9b] hover:underline cursor-pointer"
              >
                Full Audit Logs →
              </button>
            </div>
            {recentLogs.length === 0 ? (
              <p className="text-xs text-[#718096]">No audit events recorded yet.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {recentLogs.slice(0, 6).map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-2 border-b border-[#f1f5f9] pb-1.5 last:border-b-0"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-bold text-[#142746]">{l.actorName}</span>{' '}
                      <span className="text-[#718096]">· {l.action.replace(/_/g, ' ')}</span>
                      {l.targetLabel ? ` (${l.targetLabel})` : ''}
                    </div>
                    <span className="font-mono text-[11px] text-[#718096] tabular-nums shrink-0">
                      {new Date(l.timestamp).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3">
            <h2 className="text-sm font-extrabold text-[#142746] flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#13845b]" />
              <span>Owner Quick Actions</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <button
                type="button"
                onClick={() => onNavigate('admin_team')}
                className="flex items-center gap-2 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] px-3.5 py-2.5 font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer text-left"
              >
                <Users className="h-4 w-4 text-[#315b9b]" />
                <span>Manage Admins &amp; Approvals</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="flex items-center gap-2 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] px-3.5 py-2.5 font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer text-left"
              >
                <Lock className="h-4 w-4 text-[#13845b]" />
                <span>WhatsApp Cloud API &amp; 2FA</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('approvals')}
                className="flex items-center gap-2 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] px-3.5 py-2.5 font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer text-left"
              >
                <FileCheck2 className="h-4 w-4 text-[#8c6826]" />
                <span>Review Courses ({pendingCourseApprovals.length})</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('support')}
                className="flex items-center gap-2 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] px-3.5 py-2.5 font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer text-left"
              >
                <LifeBuoy className="h-4 w-4 text-[#315b9b]" />
                <span>Support &amp; Cert Lookup</span>
              </button>
            </div>
            {securityAlerts.length > 0 && (
              <div className="text-[11px] font-semibold text-[#b45309]">
                {securityAlerts.length} recent security event(s) logged in Audit &amp; Security.
              </div>
            )}
          </div>
        </div>

        {/* Owner-Only Month-Wise GST Compliance Ledger */}
        <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[#142746]">
                Month-Wise Payment &amp; GST Compliance Ledger (Super Admin Exclusive)
              </h2>
              <p className="text-xs text-[#718096]">
                Sequential invoice accountability by billing month (Taxable, CGST, SGST, IGST &amp; Collection)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const cnt = downloadGstComplianceCsv({
                    orders,
                    settings,
                    monthKey: 'ALL',
                  });
                  onToast(
                    cnt > 0 ? 'success' : 'info',
                    cnt > 0
                      ? `Exported GST Compliance Register (${cnt} paid invoices).`
                      : 'No paid invoices available to export yet.'
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#e3e9f2] bg-[#f8fafd] px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-[#13845b]" />
                <span>All Months CSV</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectOrdersMonth('ALL');
                  onNavigate('orders');
                }}
                className="rounded-[9px] bg-[#142746] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
              >
                Full Serial Ledger →
              </button>
            </div>
          </div>

          {monthlyLedger.length === 0 ? (
            <p className="text-xs text-[#718096] py-2">
              No student payment orders recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[11px] border border-[#e3e9f2]">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
                    <th className="px-3.5 py-2.5 font-bold">Billing Month</th>
                    <th className="px-3.5 py-2.5 font-bold">Paid Invoices</th>
                    <th className="px-3.5 py-2.5 font-bold">Taxable Value</th>
                    <th className="px-3.5 py-2.5 font-bold">CGST</th>
                    <th className="px-3.5 py-2.5 font-bold">SGST</th>
                    <th className="px-3.5 py-2.5 font-bold">IGST</th>
                    <th className="px-3.5 py-2.5 font-bold">Total Collected</th>
                    <th className="px-3.5 py-2.5 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyLedger.map((m) => (
                    <tr
                      key={m.monthKey}
                      className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                    >
                      <td className="px-3.5 py-2.5 font-bold text-[#142746]">
                        {m.label}
                        {m.pendingCount > 0 && (
                          <span className="ml-2 text-[11px] font-semibold text-[#8c6826]">
                            · {m.pendingCount} pending
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono font-bold text-[#142746] tabular-nums">
                        {m.paidCount}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono tabular-nums text-[#59677d]">
                        {money(m.totalTaxable)}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono tabular-nums text-[#59677d]">
                        {money(m.totalCgst)}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono tabular-nums text-[#59677d]">
                        {money(m.totalSgst)}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono tabular-nums text-[#59677d]">
                        {money(m.totalIgst)}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono font-bold text-[#13845b] tabular-nums">
                        {money(m.totalCollection)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectOrdersMonth(m.monthKey);
                            onNavigate('orders');
                          }}
                          className="rounded-md bg-[#edf2fa] px-2.5 py-1 text-[11px] font-bold text-[#142746] hover:bg-[#dce6f7] cursor-pointer"
                        >
                          Serial View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // SUB-ADMIN ROLE-TAILORED DASHBOARD (STRICTLY ZERO FINANCIAL / ORDER / PAYMENT METRICS)
  const canCreateCourse = hasPermission(currentUser, 'course_create');
  const canApprove = hasPermission(currentUser, 'content_approve');
  const canBroadcast = hasPermission(currentUser, 'announcement_manage');
  const canViewStudents = hasPermission(currentUser, 'student_view');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-[#315b9b]">
            {ADMIN_ROLE_LABELS[role]} Workspace · Scoped Non-Financial Access
          </div>
          <h1 className="mt-0.5 text-2xl font-extrabold text-[#142746]">
            {ADMIN_ROLE_LABELS[role]} Dashboard
          </h1>
          <p className="mt-1 text-sm text-[#718096]">
            {ADMIN_ROLE_DESCRIPTIONS[role]}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canBroadcast && (
            <>
              <button
                type="button"
                onClick={onOpenLiveClass}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
              >
                <Video className="h-3.5 w-3.5 text-[#13845b]" />
                <span>Live Class</span>
              </button>
              <button
                type="button"
                onClick={onOpenBroadcast}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
              >
                <Megaphone className="h-3.5 w-3.5 text-[#315b9b]" />
                <span>Broadcast</span>
              </button>
            </>
          )}
          {canCreateCourse && (
            <button
              type="button"
              onClick={onOpenAddCourse}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#18243a] hover:bg-[#cca042] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Create Draft Course</span>
            </button>
          )}
        </div>
      </div>

      {/* Role-Specific Non-Financial Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MetricBox
          label="Assigned Courses"
          value={String(courses.length)}
          sub={
            role === 'STUDENT_SUPPORT'
              ? 'Not course-scoped'
              : `${publishedCourses.length} published`
          }
          onClick={() => onNavigate('courses')}
        />
        <MetricBox
          label="Pending Approvals"
          value={String(pendingCourseApprovals.length)}
          sub={canApprove ? 'Review queue' : 'Submitted drafts'}
          onClick={() => onNavigate('approvals')}
        />
        {canViewStudents && (
          <MetricBox
            label="Students in Directory"
            value={String(students.length)}
            sub={`${students.filter((s) => s.active).length} active`}
            onClick={() => onNavigate('students')}
          />
        )}
        <MetricBox
          label="Account Security"
          value={currentUser.twoFactorEnabled ? 'TOTP Active' : 'Standard'}
          sub={
            currentUser.whatsappVerified
              ? 'WhatsApp 2FA Verified'
              : 'Verify WhatsApp in Profile'
          }
          onClick={() => onNavigate('audit_logs')}
        />
      </div>

      <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
        <h2 className="text-sm font-extrabold text-[#142746] mb-3">
          Permitted Actions for {ADMIN_ROLE_LABELS[role]}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          {role !== 'STUDENT_SUPPORT' && (
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="flex items-center gap-2 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] px-3.5 py-2.5 font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer text-left"
            >
              <BookOpen className="h-4 w-4 text-[#315b9b]" />
              <span>Open Assigned Courses</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('approvals')}
            className="flex items-center gap-2 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] px-3.5 py-2.5 font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer text-left"
          >
            <FileCheck2 className="h-4 w-4 text-[#8c6826]" />
            <span>Approvals &amp; Versions</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('support')}
            className="flex items-center gap-2 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] px-3.5 py-2.5 font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer text-left"
          >
            <LifeBuoy className="h-4 w-4 text-[#13845b]" />
            <span>Support &amp; Cert Verify</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('audit_logs')}
            className="flex items-center gap-2 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] px-3.5 py-2.5 font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer text-left"
          >
            <KeyRound className="h-4 w-4 text-[#315b9b]" />
            <span>2FA &amp; Security</span>
          </button>
        </div>
        <p className="mt-3 text-[11px] text-[#718096]">
          Financial transactions, revenue reports, bank details, gateway credentials, and refunds remain strictly restricted to the Main Super Admin.
        </p>
      </div>
    </div>
  );
}

function MetricBox({
  label,
  value,
  sub,
  highlight = false,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left rounded-[15px] border p-4 sm:p-5 transition-colors ${
        highlight
          ? 'border-[#f1dca7] bg-[#fffdf7]'
          : 'border-[#e3e9f2] bg-white'
      } ${onClick ? 'hover:border-[#aabbd4] cursor-pointer' : 'cursor-default'}`}
    >
      <div className="text-xs font-medium text-[#718096]">{label}</div>
      <div className="mt-1.5 font-mono text-xl sm:text-2xl font-extrabold text-[#142746] tabular-nums">
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px] font-semibold text-[#8c6826]">
          {sub}
        </div>
      )}
    </button>
  );
}
