import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Mail,
  MessageCircle,
  Plus,
  QrCode,
  Search,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  Bundle,
  Coupon,
  Course,
  GstSplitType,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentMethodType,
  PortalSettings,
  User,
  WhatsappDeliveryLog,
} from '../types/lms';
import { WhatsappSecurityPanel } from './WhatsappSecurityPanel';
import {
  INDIAN_GST_STATES,
  buildGmailComposeUrl,
  buildMonthlyGstSummaries,
  buildUpiUri,
  buildWhatsAppBillText,
  calculatePriceBreakdown,
  detectStateFromGstin,
  downloadGstComplianceCsv,
  formatBillingMonthLabel,
  getGstStateCode,
  getOrderBillingMonthKey,
  getOrderInvoiceSerial,
  money,
  resolveMethodUpiId,
} from '../utils/lms';
import { compressQrImageFile, generateQrDataUrl } from '../utils/qr';
import { compressSignatureImage, compressThumbnail16x9 } from '../utils/media';

/* 1. Students Management Page */
export function StudentsPage({
  users,
  orders,
  canManage = true,
  onOpenAddStudent,
  onToggleStudent,
  onManageAccess,
}: {
  users: User[];
  orders: Order[];
  canManage?: boolean;
  onOpenAddStudent: () => void;
  onToggleStudent: (studentId: string) => void;
  onManageAccess: (student: User) => void;
}) {
  const [query, setQuery] = useState('');
  const students = users.filter((u) => u.role === 'student');
  const filtered = students.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.email.toLowerCase().includes(query.toLowerCase()) ||
      (s.phone || '').toLowerCase().includes(query.toLowerCase()) ||
      (s.state || '').toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142746]">
            Student Management
          </h1>
          <p className="mt-1 text-sm text-[#718096]">
            Student account তৈরি, course access নিয়ন্ত্রণ ও enable/disable করুন
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={onOpenAddStudent}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#d7a84b] px-4 py-2.5 text-xs font-bold text-[#18243a] hover:bg-[#cca042] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add Student</span>
          </button>
        )}
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#718096]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search student by name, email or phone..."
          className="w-full rounded-[10px] border border-[#e3e9f2] bg-white pl-9 pr-3.5 py-2 text-sm outline-none focus:border-[#315b9b]"
        />
      </div>

      <div className="overflow-x-auto rounded-[13px] border border-[#e3e9f2] bg-white">
        <table className="w-full min-w-[660px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Email / Phone</th>
              <th className="px-4 py-3 font-bold">Unlocked Courses</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-[#718096]"
                >
                  {students.length === 0
                    ? 'No students registered yet. Students can sign up themselves or be added here.'
                    : 'No matching students found.'}
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const unlockedCourses = new Set([
                  ...(s.grantedCourseIds || []),
                  ...orders
                    .filter((o) => o.userId === s.id && o.status === 'PAID')
                    .flatMap((o) => o.courseIds || []),
                ]);
                return (
                  <tr
                    key={s.id}
                    className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                  >
                    <td className="px-4 py-3 font-semibold text-[#142746]">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-[#59677d]">
                      <div>{s.email}</div>
                      {s.phone && (
                        <div className="font-mono text-[11px] text-[#718096]">
                          {s.phone}
                        </div>
                      )}
                      {s.state && (
                        <div className="text-[11px] font-semibold text-[#315b9b]">
                          State: {getGstStateCode(s.state) ? `${getGstStateCode(s.state)} - ` : ''}{s.state}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-[#142746]">
                      {unlockedCourses.size}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          s.active ? 'text-[#13845b]' : 'text-[#c64b58]'
                        }`}
                      >
                        {s.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onManageAccess(s)}
                            className="rounded-lg bg-[#edf2fa] px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] whitespace-nowrap cursor-pointer"
                          >
                            Manage Access
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleStudent(s.id)}
                            className="rounded-lg border border-[#e3e9f2] bg-white px-3 py-1.5 text-xs font-semibold text-[#142746] hover:bg-[#f3f6fb] whitespace-nowrap cursor-pointer"
                          >
                            {s.active ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-[#718096]">
                          View Only
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
  );
}

/* 2. Payments, GST Compliance Ledger & Orders Page */
export function OrdersPage({
  orders,
  users,
  methods,
  settings,
  initialMonthFilter,
  onApprove,
  onReject,
  onRefund,
  onViewInvoice,
  onSendInvoice,
  onToast,
}: {
  orders: Order[];
  users: User[];
  methods: PaymentMethod[];
  settings: PortalSettings;
  initialMonthFilter?: string;
  onApprove: (orderId: string) => void;
  onReject: (orderId: string) => void;
  onRefund?: (
    orderId: string,
    reason: string,
    amount?: number
  ) => Promise<void> | void;
  onViewInvoice: (order: Order) => void;
  onSendInvoice: (
    orderId: string
  ) => Promise<{ ok: boolean; data?: { note: string }; error?: string }>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>(
    initialMonthFilter || 'ALL'
  );
  const [sortOrder, setSortOrder] = useState<
    'serial_asc' | 'serial_desc' | 'newest'
  >('serial_asc');
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialMonthFilter) {
      setMonthFilter(initialMonthFilter);
    }
  }, [initialMonthFilter]);

  const monthlySummaries = buildMonthlyGstSummaries(orders);

  const filtered = orders
    .filter((o) => statusFilter === 'ALL' || o.status === statusFilter)
    .filter(
      (o) => monthFilter === 'ALL' || getOrderBillingMonthKey(o) === monthFilter
    )
    .slice()
    .sort((a, b) => {
      if (sortOrder === 'newest') {
        return (
          Date.parse(b.paidAt || b.created) - Date.parse(a.paidAt || a.created)
        );
      }
      const sa = a.status === 'PAID' ? getOrderInvoiceSerial(a) : 0;
      const sb = b.status === 'PAID' ? getOrderInvoiceSerial(b) : 0;
      if (sortOrder === 'serial_asc') {
        if (sa > 0 && sb > 0 && sa !== sb) return sa - sb;
        if (sa > 0 && sb === 0) return -1;
        if (sb > 0 && sa === 0) return 1;
        return (
          Date.parse(a.paidAt || a.created) - Date.parse(b.paidAt || b.created)
        );
      }
      // serial_desc
      if (sa > 0 && sb > 0 && sa !== sb) return sb - sa;
      if (sa > 0 && sb === 0) return -1;
      if (sb > 0 && sa === 0) return 1;
      return (
        Date.parse(b.paidAt || b.created) - Date.parse(a.paidAt || a.created)
      );
    });

  const paidInScope = filtered.filter((o) => o.status === 'PAID');
  const scopeTaxable = paidInScope.reduce(
    (acc, o) => acc + (o.taxable ?? Math.max(0, o.base - o.discount)),
    0
  );
  const scopeCgst = paidInScope.reduce(
    (acc, o) =>
      acc +
      (o.cgst ??
        (o.gstSplit === 'igst' ? 0 : Math.round((o.gst / 2) * 100) / 100)),
    0
  );
  const scopeSgst = paidInScope.reduce(
    (acc, o) =>
      acc +
      (o.sgst ??
        (o.gstSplit === 'igst'
          ? 0
          : Math.round((o.gst - Math.round((o.gst / 2) * 100) / 100) * 100) /
            100)),
    0
  );
  const scopeIgst = paidInScope.reduce(
    (acc, o) => acc + (o.igst ?? (o.gstSplit === 'igst' ? o.gst : 0)),
    0
  );
  const scopeTotal = paidInScope.reduce((acc, o) => acc + (o.total || 0), 0);

  const handleSendInvoice = async (order: Order) => {
    setSendingId(order.id);
    try {
      const res = await onSendInvoice(order.id);
      if (res.ok && res.data) {
        onToast('success', res.data.note);
      } else {
        onToast('error', res.error || 'Could not dispatch invoice.');
      }
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142746]">
            Payments, Serial Ledger &amp; GST Compliance
          </h1>
          <p className="mt-1 text-sm text-[#718096]">
            Month-wise &amp; Serial-wise sequential Tax Invoices · Invoices generate only after payment · Auto-locked Student &amp; Admin Gmail dispatch
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            const count = downloadGstComplianceCsv({
              orders,
              settings,
              monthKey: monthFilter,
            });
            onToast(
              count > 0 ? 'success' : 'info',
              count > 0
                ? `GST Compliance CSV exported (${count} paid invoices).`
                : 'No paid invoices found for the selected month.'
            );
          }}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5 text-[#d7a84b]" />
          <span>Export GST Compliance CSV</span>
        </button>
      </div>

      {/* Filters Toolbar: Month-Wise, Serial Sort & Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[13px] border border-[#e3e9f2] bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            aria-label="Filter by billing month"
            className="rounded-[9px] border border-[#dce6f7] bg-[#f8fafd] px-3 py-1.5 text-xs font-bold text-[#142746] outline-none focus:border-[#315b9b]"
          >
            <option value="ALL">All Months ({orders.length} orders)</option>
            {monthlySummaries.map((m) => (
              <option key={m.monthKey} value={m.monthKey}>
                {m.label} ({m.paidCount} Paid{m.pendingCount > 0 ? `, ${m.pendingCount} Pending` : ''})
              </option>
            ))}
          </select>

          <select
            value={sortOrder}
            onChange={(e) =>
              setSortOrder(
                e.target.value as 'serial_asc' | 'serial_desc' | 'newest'
              )
            }
            aria-label="Sort orders"
            className="rounded-[9px] border border-[#dce6f7] bg-[#f8fafd] px-3 py-1.5 text-xs font-bold text-[#142746] outline-none focus:border-[#315b9b]"
          >
            <option value="serial_asc">Sort: Invoice Serial (1 → N)</option>
            <option value="serial_desc">Sort: Invoice Serial (N → 1)</option>
            <option value="newest">Sort: Latest Date First</option>
          </select>
        </div>

        <div className="flex items-center gap-1 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] p-1">
          {(['ALL', 'PENDING', 'PAID', 'REJECTED'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === status
                  ? 'bg-[#142746] text-white'
                  : 'text-[#59677d] hover:text-[#142746]'
              }`}
            >
              {status === 'ALL' ? 'All' : status}
            </button>
          ))}
        </div>
      </div>

      {/* GST Accountability KPI Strip for Scope */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-[12px] border border-[#e3e9f2] bg-white p-3.5">
          <div className="text-[11px] font-semibold text-[#718096]">
            Paid Tax Invoices
          </div>
          <div className="mt-1 font-mono text-lg font-extrabold text-[#142746] tabular-nums">
            {paidInScope.length}
          </div>
        </div>
        <div className="rounded-[12px] border border-[#e3e9f2] bg-white p-3.5">
          <div className="text-[11px] font-semibold text-[#718096]">
            Taxable Value
          </div>
          <div className="mt-1 font-mono text-lg font-extrabold text-[#142746] tabular-nums">
            {money(scopeTaxable)}
          </div>
        </div>
        <div className="rounded-[12px] border border-[#e3e9f2] bg-white p-3.5">
          <div className="text-[11px] font-semibold text-[#718096]">
            CGST + SGST (Intra)
          </div>
          <div className="mt-1 font-mono text-base font-extrabold text-[#315b9b] tabular-nums">
            {money(scopeCgst + scopeSgst)}
          </div>
          <div className="text-[10px] font-mono text-[#718096] tabular-nums">
            C: {money(scopeCgst)} · S: {money(scopeSgst)}
          </div>
        </div>
        <div className="rounded-[12px] border border-[#e3e9f2] bg-white p-3.5">
          <div className="text-[11px] font-semibold text-[#718096]">
            IGST (Inter-State)
          </div>
          <div className="mt-1 font-mono text-lg font-extrabold text-[#8c6826] tabular-nums">
            {money(scopeIgst)}
          </div>
        </div>
        <div className="rounded-[12px] border border-[#bfe6d5] bg-[#eefaf4] p-3.5">
          <div className="text-[11px] font-semibold text-[#0f6c4a]">
            Total Paid Collection
          </div>
          <div className="mt-1 font-mono text-lg font-extrabold text-[#13845b] tabular-nums">
            {money(scopeTotal)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[13px] border border-[#e3e9f2] bg-white">
        <table className="w-full min-w-[920px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
              <th className="px-4 py-3 font-bold">Sl. &amp; Invoice #</th>
              <th className="px-4 py-3 font-bold">Student &amp; Place of Supply</th>
              <th className="px-4 py-3 font-bold">Course / Plan &amp; SAC</th>
              <th className="px-4 py-3 font-bold">Taxable &amp; GST Breakup</th>
              <th className="px-4 py-3 font-bold">Total &amp; Ref</th>
              <th className="px-4 py-3 font-bold">Status &amp; Dispatch</th>
              <th className="px-4 py-3 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-[#718096]"
                >
                  No orders found for this filter.
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const student = users.find((u) => u.id === o.userId);
                const methodName =
                  methods.find((m) => m.id === o.method)?.name || o.method;
                const phone = o.buyerPhone || student?.phone;
                const email = o.buyerEmail || student?.email || '';
                const serial = o.status === 'PAID' ? getOrderInvoiceSerial(o) : 0;
                const monthLabel = formatBillingMonthLabel(
                  getOrderBillingMonthKey(o)
                );
                const taxable = o.taxable ?? Math.max(0, o.base - o.discount);
                const isIgst = o.gstSplit === 'igst';
                const cgst =
                  o.cgst ?? (isIgst ? 0 : Math.round((o.gst / 2) * 100) / 100);
                const sgst =
                  o.sgst ?? (isIgst ? 0 : Math.round((o.gst - cgst) * 100) / 100);
                const igst = o.igst ?? (isIgst ? o.gst : 0);
                const adminCopy = settings.adminEmail || settings.smtpUser || '';
                const gmailComposeHref = buildGmailComposeUrl({
                  to: email,
                  cc: adminCopy,
                  subject: `GST Tax Invoice ${o.invoiceNumber || o.id} · ${o.itemName}`,
                  body:
                    o.whatsappMessage ||
                    buildWhatsAppBillText(o, settings, student?.name),
                });

                return (
                  <tr
                    key={o.id}
                    className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                  >
                    <td className="px-4 py-3 font-mono tabular-nums align-top">
                      {o.status === 'PAID' && o.invoiceNumber ? (
                        <>
                          <div className="font-bold text-[#142746]">
                            {serial > 0 ? `#${serial} · ` : ''}
                            {o.invoiceNumber}
                          </div>
                          <div className="text-[11px] font-sans font-semibold text-[#315b9b]">
                            {monthLabel}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-semibold text-[#8c6826]">
                            No Invoice (Unpaid)
                          </div>
                          <div className="text-[11px] font-sans text-[#718096]">
                            {monthLabel}
                          </div>
                        </>
                      )}
                      <div className="text-[10px] font-sans text-[#718096]">
                        {new Date(o.paidAt || o.created).toLocaleDateString(
                          'en-IN'
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-[#142746]">
                        {o.buyerName || student?.name || 'Unknown'}
                      </div>
                      <div className="text-[#59677d]">{email}</div>
                      {phone && (
                        <div className="font-mono text-[11px] text-[#59677d]">
                          {phone}
                        </div>
                      )}
                      {(o.buyerState || student?.state) && (
                        <div className="text-[11px] font-semibold text-[#315b9b]">
                          {getGstStateCode(o.buyerState || student?.state)
                            ? `${getGstStateCode(o.buyerState || student?.state)} - `
                            : ''}
                          {o.buyerState || student?.state}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 font-medium text-[#1d2940] align-top">
                      <div className="font-semibold">{o.itemName}</div>
                      <div className="font-mono text-[11px] text-[#718096]">
                        SAC {o.sacCode || settings.sacCode || '999293'} ·{' '}
                        {isIgst ? 'Inter-State IGST' : 'Intra-State CGST+SGST'}
                      </div>
                      {o.expiresAt && (
                        <div className="text-[11px] font-semibold text-[#315b9b] tabular-nums">
                          Valid till{' '}
                          {new Date(o.expiresAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 font-mono tabular-nums align-top text-[#59677d]">
                      <div>
                        Base: <strong className="text-[#142746]">{money(o.base)}</strong>
                        {o.discount > 0 && (
                          <span className="text-[#13845b]">
                            {' '}
                            (-{money(o.discount)}
                            {o.couponCode ? ` ${o.couponCode}` : ''})
                          </span>
                        )}
                      </div>
                      <div>Taxable: {money(taxable)}</div>
                      <div className="text-[11px]">
                        {isIgst
                          ? `IGST (${o.gstRate ?? 0}%): ${money(igst)}`
                          : `CGST ${money(cgst)} + SGST ${money(sgst)} (${o.gstRate ?? 0}%)`}
                      </div>
                    </td>

                    <td className="px-4 py-3 font-mono tabular-nums align-top">
                      <div className="font-bold text-[#142746] text-sm">
                        {money(o.total)}
                      </div>
                      <div className="font-sans text-[11px] text-[#1d2940]">
                        {methodName}
                      </div>
                      <div className="text-[11px] text-[#718096]">
                        {o.reference || 'No ref'}
                      </div>
                      {o.proofType && o.total > 0 && (
                        <div className="font-sans text-[10px] font-semibold text-[#315b9b]">
                          {o.proofType}
                        </div>
                      )}
                      {o.proofScreenshotUrl && (
                        <a
                          href={o.proofScreenshotUrl}
                          download={`payment-proof-${o.id}.png`}
                          className="mt-1 inline-flex items-center gap-1 font-sans text-[10px] font-bold text-[#13845b] hover:underline"
                          title="Download uploaded payment receipt screenshot"
                        >
                          Download Receipt Proof
                        </a>
                      )}
                    </td>

                    <td className="px-4 py-3 align-top">
                      <span
                        className={`font-bold ${
                          o.status === 'PAID'
                            ? 'text-[#13845b]'
                            : o.status === 'REJECTED'
                              ? 'text-[#c64b58]'
                              : 'text-[#8c6826]'
                        }`}
                      >
                        {o.status === 'PAID'
                          ? 'VERIFIED · PAID'
                          : o.status === 'PENDING'
                            ? 'PENDING VERIFICATION'
                            : o.status}
                      </span>
                      {o.verifiedBy && o.status === 'PAID' && (
                        <div className="text-[10px] text-[#718096] mt-0.5">
                          By {o.verifiedBy}
                        </div>
                      )}
                      {o.status === 'PAID' && o.emailDispatchStatus === 'sent' && (
                        <div className="text-[10px] font-semibold text-[#13845b] mt-0.5">
                          Gmail Sent
                        </div>
                      )}
                      {o.status === 'PAID' && o.whatsappDispatchStatus === 'sent' && (
                        <div className="text-[10px] font-semibold text-[#13845b]">
                          WhatsApp Sent
                        </div>
                      )}
                      {o.lastDispatchedAt && (
                        <div className="text-[10px] text-[#718096]">
                          Last:{' '}
                          {new Date(o.lastDispatchedAt).toLocaleTimeString(
                            'en-IN',
                            { hour: '2-digit', minute: '2-digit' }
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right align-top">
                      {o.status === 'PENDING' ? (
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onApprove(o.id)}
                            className="rounded-lg bg-[#13845b] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
                          >
                            Verify &amp; Activate Course
                          </button>
                          <button
                            type="button"
                            onClick={() => onReject(o.id)}
                            className="rounded-lg border border-[#e3e9f2] bg-white px-3 py-1.5 text-xs font-bold text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      ) : o.status === 'PAID' ? (
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewInvoice(o)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#edf2fa] px-2.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] cursor-pointer"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>Tax Invoice</span>
                          </button>
                          <button
                            type="button"
                            disabled={sendingId === o.id}
                            onClick={() => handleSendInvoice(o)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#142746] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
                            title={`Auto-send to ${email}${adminCopy ? ` & CC ${adminCopy}` : ''}`}
                          >
                            <Send className="h-3 w-3 text-[#d7a84b]" />
                            <span>
                              {sendingId === o.id
                                ? 'Sending...'
                                : 'Send Invoice'}
                            </span>
                          </button>
                          {!settings.emailConfigured && email.includes('@') && (
                            <a
                              href={gmailComposeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb]"
                              title={`Open pre-addressed Gmail (${email})`}
                            >
                              <Mail className="h-3.5 w-3.5 text-[#315b9b]" />
                            </a>
                          )}
                          {onRefund && (
                            <button
                              type="button"
                              onClick={() =>
                                onRefund(o.id, 'Refund processed by Main Super Admin', o.total)
                              }
                              className="rounded-lg border border-[#f5c8ce] bg-[#fff5f6] px-2.5 py-1.5 text-xs font-bold text-[#c64b58] hover:bg-[#ffe8eb] cursor-pointer"
                            >
                              Mark Refunded
                            </button>
                          )}
                        </div>
                      ) : o.status === 'REFUNDED' ? (
                        <span className="text-[11px] font-bold text-[#c64b58]">
                          Refunded {o.refundAmount ? money(o.refundAmount) : ''}
                        </span>
                      ) : (
                        <span className="text-[#94a3b8]">—</span>
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
  );
}

/* 3. Coupons & Bundles Page */
export function PromosPage({
  courses,
  coupons,
  bundles,
  onSaveCoupon,
  onToggleCoupon,
  onDeleteCoupon,
  onSaveBundle,
  onUpdateBundle,
  onDeleteBundle,
  onToast,
}: {
  courses: Course[];
  coupons: Coupon[];
  bundles: Bundle[];
  onSaveCoupon: (payload: {
    code: string;
    type: 'percent' | 'flat';
    value: number;
    min: number;
  }) => void;
  onToggleCoupon: (id: string) => void;
  onDeleteCoupon: (id: string) => void;
  onSaveBundle: (
    name: string,
    courseIds: string[],
    price: number,
    extra?: { thumbnailUrl?: string }
  ) => Promise<void> | void;
  onUpdateBundle?: (
    bundleId: string,
    payload: Partial<Omit<Bundle, 'id'>>
  ) => Promise<void> | void;
  onDeleteBundle: (id: string) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'flat'>('percent');
  const [value, setValue] = useState('');
  const [min, setMin] = useState('0');

  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [bundleName, setBundleName] = useState('');
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [bundlePrice, setBundlePrice] = useState('');
  const [bundleThumbUrl, setBundleThumbUrl] = useState('');

  const handleCouponSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSaveCoupon({
      code,
      type,
      value: Number(value) || 1,
      min: Number(min) || 0,
    });
    setCode('');
    setValue('');
    setMin('0');
    onToast('success', 'Coupon saved.');
  };

  const toggleCourseSelection = (courseId: string) => {
    setSelectedCourses((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
  };

  const handleBundleThumbUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressThumbnail16x9(file);
      setBundleThumbUrl(dataUrl);
      onToast('success', '16:9 Bundle thumbnail ready.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Could not load bundle thumbnail.'
      );
    }
    e.target.value = '';
  };

  const resetBundleForm = () => {
    setEditingBundleId(null);
    setBundleName('');
    setSelectedCourses([]);
    setBundlePrice('');
    setBundleThumbUrl('');
  };

  const handleBundleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedCourses.length < 2) {
      onToast('error', 'Bundle-এর জন্য কমপক্ষে ২টি Course নির্বাচন করুন');
      return;
    }
    if (editingBundleId && onUpdateBundle) {
      await onUpdateBundle(editingBundleId, {
        name: bundleName.trim(),
        courseIds: selectedCourses,
        price: Number(bundlePrice) || 0,
        thumbnailUrl: bundleThumbUrl.trim(),
      });
      onToast('success', 'Bundle updated.');
    } else {
      await onSaveBundle(bundleName, selectedCourses, Number(bundlePrice) || 0, {
        thumbnailUrl: bundleThumbUrl.trim(),
      });
      onToast('success', 'Bundle created.');
    }
    resetBundleForm();
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-[#142746]">
          Coupons &amp; Bundles
        </h1>
        <p className="mt-1 text-sm text-[#718096]">
          Offer code ও একাধিক course-এর package তৈরি করুন
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coupon Management */}
        <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
          <h3 className="text-base font-bold text-[#142746] mb-4">
            Coupon Management
          </h3>
          <form onSubmit={handleCouponSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Coupon code *
              </label>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ARYA10"
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm uppercase outline-none focus:border-[#315b9b]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Discount type
                </label>
                <select
                  value={type}
                  onChange={(e) =>
                    setType(e.target.value as 'percent' | 'flat')
                  }
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
                >
                  <option value="percent">Percentage (%)</option>
                  <option value="flat">Flat amount (₹)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Discount value *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono tabular-nums outline-none focus:border-[#315b9b]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Minimum cart value (₹)
              </label>
              <input
                type="number"
                min={0}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono tabular-nums outline-none focus:border-[#315b9b]"
              />
            </div>

            <button
              type="submit"
              className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
            >
              Save Coupon
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-[#e3e9f2] space-y-2">
            {coupons.length === 0 ? (
              <p className="text-xs text-[#718096]">No coupons created yet.</p>
            ) : (
              coupons.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[#e3e9f2] px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-[#142746]">
                      {c.code}
                    </span>
                    <span className="mx-1.5 text-[#cbd5e1]">·</span>
                    <span className="font-mono tabular-nums text-[#59677d]">
                      {c.type === 'percent' ? `${c.value}%` : money(c.value)}{' '}
                      off
                    </span>
                    {c.min > 0 && (
                      <>
                        <span className="mx-1.5 text-[#cbd5e1]">·</span>
                        <span className="text-[#718096] tabular-nums">
                          Min {money(c.min)}
                        </span>
                      </>
                    )}
                    <span className="mx-1.5 text-[#cbd5e1]">·</span>
                    <span
                      className={
                        c.active
                          ? 'text-[#13845b] font-semibold'
                          : 'text-[#c64b58] font-semibold'
                      }
                    >
                      {c.active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleCoupon(c.id)}
                      className="rounded-md border border-[#e3e9f2] px-2.5 py-1 font-semibold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
                    >
                      {c.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCoupon(c.id)}
                      className="rounded-md p-1 text-[#718096] hover:bg-[#fff0f1] hover:text-[#c64b58]"
                      aria-label="Delete coupon"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bundle Management */}
        <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
          <h3 className="text-base font-bold text-[#142746] mb-4">
            Bundle Management
          </h3>
          <form onSubmit={handleBundleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Bundle name *
              </label>
              <input
                required
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                placeholder="e.g. Complete Tax Practitioner Pack"
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                Select courses (minimum 2)
              </label>
              {courses.length === 0 ? (
                <p className="text-xs text-[#718096] rounded-lg border border-dashed border-[#e3e9f2] p-3">
                  Create at least 2 courses first to build a bundle.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-[10px] border border-[#e3e9f2] p-2.5">
                  {courses.map((c) => {
                    const checked = selectedCourses.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-[#f8fafd] cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCourseSelection(c.id)}
                            className="rounded border-[#cbd5e1]"
                          />
                          <span className="truncate font-medium text-[#1d2940]">
                            {c.title}
                          </span>
                        </span>
                        <span className="font-mono text-[#718096] tabular-nums shrink-0">
                          {money(c.price)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Bundle price (₹) *
              </label>
              <input
                type="number"
                min={0}
                required
                value={bundlePrice}
                onChange={(e) => setBundlePrice(e.target.value)}
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono tabular-nums outline-none focus:border-[#315b9b]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Bundle 16:9 Thumbnail (YouTube Ratio · optional)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#dce6f7] bg-[#f8fafd] px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer">
                  <Upload className="h-3.5 w-3.5 text-[#315b9b]" />
                  <span>Upload 16:9 Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBundleThumbUpload}
                    className="sr-only"
                  />
                </label>
                {bundleThumbUrl && (
                  <button
                    type="button"
                    onClick={() => setBundleThumbUrl('')}
                    className="text-xs font-bold text-[#c64b58] hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
              {!bundleThumbUrl.startsWith('data:') && (
                <input
                  type="url"
                  value={bundleThumbUrl}
                  onChange={(e) => setBundleThumbUrl(e.target.value)}
                  placeholder="Or paste 16:9 thumbnail URL (https://...)"
                  className="mt-2 w-full rounded-[10px] border border-[#e3e9f2] px-3 py-1.5 text-xs outline-none focus:border-[#315b9b]"
                />
              )}
              {bundleThumbUrl && (
                <div className="mt-2 aspect-video w-48 overflow-hidden rounded-lg border border-[#e3e9f2]">
                  <img
                    src={bundleThumbUrl}
                    alt="Bundle preview"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
              >
                {editingBundleId ? 'Update Bundle' : 'Save Bundle'}
              </button>
              {editingBundleId && (
                <button
                  type="button"
                  onClick={resetBundleForm}
                  className="rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2 text-xs font-bold text-[#59677d] hover:bg-[#f3f6fb] cursor-pointer"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <div className="mt-5 pt-4 border-t border-[#e3e9f2] space-y-2">
            {bundles.length === 0 ? (
              <p className="text-xs text-[#718096]">No bundles created yet.</p>
            ) : (
              bundles.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[#e3e9f2] px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {b.thumbnailUrl && (
                      <img
                        src={b.thumbnailUrl}
                        alt={b.name}
                        referrerPolicy="no-referrer"
                        className="h-9 w-16 shrink-0 rounded border border-[#e3e9f2] object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-[#142746] truncate">
                        {b.name}
                      </div>
                      <div className="text-[#718096] tabular-nums">
                        <span className="font-mono font-semibold text-[#142746]">
                          {money(b.price)}
                        </span>
                        <span className="mx-1.5">·</span>
                        <span>{b.courseIds.length} courses included</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onUpdateBundle && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBundleId(b.id);
                          setBundleName(b.name);
                          setSelectedCourses(b.courseIds || []);
                          setBundlePrice(String(b.price));
                          setBundleThumbUrl(b.thumbnailUrl || '');
                        }}
                        className="rounded-md bg-[#edf2fa] px-2.5 py-1 font-bold text-[#142746] hover:bg-[#dce6f7] cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteBundle(b.id)}
                      className="rounded-md border border-[#e3e9f2] px-2.5 py-1 font-semibold text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* 4. Portal Settings Page */
export function SettingsPage({
  settings,
  methods,
  onSaveSettings,
  onAddMethod,
  onToggleMethod,
  onEditMethod,
  onDeleteMethod,
  onTestEmail,
  onSaveWhatsappConfig,
  onFetchWhatsappLogs,
  onTestWhatsapp,
  onSendWhatsappOtp,
  onVerifyWhatsappOtp,
  onToast,
}: {
  settings: PortalSettings;
  methods: PaymentMethod[];
  onSaveSettings: (
    partial: Partial<PortalSettings> & {
      smtpPass?: string;
      clearSmtpPass?: boolean;
      whatsappApiToken?: string;
      clearWhatsappToken?: boolean;
    }
  ) => Promise<void> | void;
  onAddMethod: (
    payload: Omit<PaymentMethod, 'id' | 'active'>
  ) => Promise<void> | void;
  onToggleMethod: (id: string) => void;
  onEditMethod: (method: PaymentMethod) => void;
  onDeleteMethod: (id: string) => void;
  onTestEmail: (to: string) => Promise<{ ok: boolean; data?: { note: string }; error?: string }>;
  onSaveWhatsappConfig: (payload: {
    whatsappBusinessAccountId?: string;
    whatsappPhoneNumberId?: string;
    whatsappApiToken?: string;
    clearWhatsappToken?: boolean;
    whatsappOtpTemplateName?: string;
    whatsappOtpTemplateLang?: string;
    whatsappWebhookUrl?: string;
    adminWhatsapp?: string;
    enforceWhatsapp2FA?: boolean;
  }) => Promise<{ ok: true; data: { settings: PortalSettings } } | { ok: false; error: string }>;
  onFetchWhatsappLogs: () => Promise<
    | {
        ok: true;
        data: {
          logs: WhatsappDeliveryLog[];
          status: {
            cloudApiReady: boolean;
            webhookConfigured: boolean;
            templateConfigured: boolean;
            hasWabaId: boolean;
            hasPhoneNumberId: boolean;
            hasAccessToken: boolean;
            envOverrideActive: boolean;
          };
        };
      }
    | { ok: false; error: string }
  >;
  onTestWhatsapp: (
    phone: string,
    countryCode?: string
  ) => Promise<
    | { ok: true; data: { ok: boolean; providerMessageId?: string; maskedPhone?: string } }
    | { ok: false; error: string }
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
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [brand, setBrand] = useState(settings.brand);
  const [gst, setGst] = useState(String(settings.gst));
  const [gstMode, setGstMode] = useState<'exclusive' | 'inclusive'>(
    settings.gstMode
  );
  const [gstSection, setGstSection] = useState(
    settings.gstSection || 'Section 9(1) CGST/SGST Act · Educational & Tax Training'
  );
  const [sacCode, setSacCode] = useState(settings.sacCode || '999293');
  const [gstNumber, setGstNumber] = useState(settings.gstNumber || '');
  const [gstState, setGstState] = useState(
    settings.gstState || detectStateFromGstin(settings.gstNumber) || 'West Bengal'
  );
  const [autoGstByState, setAutoGstByState] = useState(
    settings.autoGstByState !== false
  );
  const [stateGstRates, setStateGstRates] = useState<Record<string, number>>(
    settings.stateGstRates || {}
  );
  const [overrideState, setOverrideState] = useState('Maharashtra');
  const [overrideRate, setOverrideRate] = useState('18');
  const [simStudentState, setSimStudentState] = useState(
    settings.gstState || 'West Bengal'
  );
  const [gstSplit, setGstSplit] = useState<GstSplitType>(
    settings.gstSplit || 'cgst_sgst'
  );
  const [instantActivation, setInstantActivation] = useState(
    settings.instantActivation !== false
  );
  const [threshold, setThreshold] = useState(String(settings.threshold));

  // Auto-Email (Gmail SMTP) & WhatsApp Billing settings
  const [smtpUser, setSmtpUser] = useState(settings.smtpUser || '');
  const [smtpPass, setSmtpPass] = useState('');
  const [senderName, setSenderName] = useState(
    settings.senderName || settings.brand
  );
  const [adminWhatsapp, setAdminWhatsapp] = useState(
    settings.adminWhatsapp || ''
  );
  const [whatsappWebhookUrl, setWhatsappWebhookUrl] = useState(
    settings.whatsappWebhookUrl || ''
  );
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState(
    settings.whatsappPhoneNumberId || ''
  );
  const [whatsappApiToken, setWhatsappApiToken] = useState('');
  const [testEmailTarget, setTestEmailTarget] = useState(settings.smtpUser || '');
  const [testingEmail, setTestingEmail] = useState(false);

  // Payment Method / QR / Gateway add form
  const [methodType, setMethodType] = useState<PaymentMethodType>('upi_qr');
  const [methodName, setMethodName] = useState('');
  const [methodUpiId, setMethodUpiId] = useState('');
  const [methodQrUrl, setMethodQrUrl] = useState('');
  const [methodGatewayProvider, setMethodGatewayProvider] = useState('Razorpay');
  const [methodGatewayUrl, setMethodGatewayUrl] = useState('');
  const [methodInfo, setMethodInfo] = useState('');
  const [previewQrDataUrl, setPreviewQrDataUrl] = useState('');
  const [methodQrMap, setMethodQrMap] = useState<Record<string, string>>({});

  // Certificate settings
  const [certHeading, setCertHeading] = useState(settings.certHeading);
  const [certSub, setCertSub] = useState(settings.certSub);
  const [certSigner, setCertSigner] = useState(settings.certSigner);
  const [certFooter, setCertFooter] = useState(settings.certFooter);
  const [certSignatureUrl, setCertSignatureUrl] = useState(
    settings.certSignatureUrl || ''
  );
  const [certSealText, setCertSealText] = useState(
    settings.certSealText || 'CERTIFIED'
  );

  useEffect(() => {
    setBrand(settings.brand);
    setGst(String(settings.gst));
    setGstMode(settings.gstMode);
    setGstSection(
      settings.gstSection ||
        'Section 9(1) CGST/SGST Act · Educational & Tax Training'
    );
    setSacCode(settings.sacCode || '999293');
    setGstNumber(settings.gstNumber || '');
    setGstState(
      settings.gstState || detectStateFromGstin(settings.gstNumber) || 'West Bengal'
    );
    setAutoGstByState(settings.autoGstByState !== false);
    setStateGstRates(settings.stateGstRates || {});
    setGstSplit(settings.gstSplit || 'cgst_sgst');
    setInstantActivation(settings.instantActivation !== false);
    setThreshold(String(settings.threshold));
    setSmtpUser(settings.smtpUser || '');
    setSenderName(settings.senderName || settings.brand);
    setAdminWhatsapp(settings.adminWhatsapp || '');
    setWhatsappWebhookUrl(settings.whatsappWebhookUrl || '');
    setWhatsappPhoneNumberId(settings.whatsappPhoneNumberId || '');
    if (settings.smtpUser && !testEmailTarget) {
      setTestEmailTarget(settings.smtpUser);
    }
    setCertHeading(settings.certHeading);
    setCertSub(settings.certSub);
    setCertSigner(settings.certSigner);
    setCertFooter(settings.certFooter);
    setCertSignatureUrl(settings.certSignatureUrl || '');
    setCertSealText(settings.certSealText || 'CERTIFIED');
  }, [settings]);

  // Live QR preview for UPI ID in add form
  useEffect(() => {
    let active = true;
    if (!methodUpiId.trim()) {
      setPreviewQrDataUrl('');
      return;
    }
    const uri = buildUpiUri({
      upiId: methodUpiId.trim(),
      payeeName: brand || 'ARYA TAX PATHSHALA',
      amount: 100,
      note: 'Course Fee',
    });
    generateQrDataUrl(uri)
      .then((url) => {
        if (active) setPreviewQrDataUrl(url);
      })
      .catch(() => {
        if (active) setPreviewQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [methodUpiId, brand]);

  // Generate QR thumbnails for saved methods that have upiId without uploaded image
  useEffect(() => {
    let active = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const m of methods) {
        const upi = resolveMethodUpiId(m);
        if (m.qrCodeUrl) {
          next[m.id] = m.qrCodeUrl;
        } else if (upi) {
          try {
            next[m.id] = await generateQrDataUrl(
              buildUpiUri({
                upiId: upi,
                payeeName: brand || 'ARYA TAX PATHSHALA',
                amount: 100,
              })
            );
          } catch {
            // ignore
          }
        }
      }
      if (active) setMethodQrMap(next);
    })();
    return () => {
      active = false;
    };
  }, [methods, brand]);

  const sampleBreakdown = calculatePriceBreakdown(
    1000,
    {
      ...settings,
      gst: Math.min(100, Math.max(0, Number(gst) || 0)),
      gstMode,
      gstNumber: gstNumber.trim().toUpperCase(),
      gstState,
      autoGstByState,
      stateGstRates,
      gstSplit,
    },
    '',
    [],
    simStudentState
  );

  const handleGstinChange = (raw: string) => {
    const upper = raw.toUpperCase();
    setGstNumber(upper);
    const detected = detectStateFromGstin(upper);
    if (detected) {
      setGstState(detected);
    }
  };

  const handleAddStateRate = () => {
    if (!overrideState) return;
    const rate = Math.min(100, Math.max(0, Number(overrideRate) || 0));
    setStateGstRates((prev) => ({
      ...prev,
      [overrideState]: Math.round(rate * 100) / 100,
    }));
  };

  const handleRemoveStateRate = (stName: string) => {
    setStateGstRates((prev) => {
      const next = { ...prev };
      delete next[stName];
      return next;
    });
  };

  const handleBusinessSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSaveSettings({
      brand: brand.trim() || 'ARYA TAX PATHSHALA',
      gst: Math.min(100, Math.max(0, Number(gst) || 0)),
      gstMode,
      gstSection: gstSection.trim(),
      sacCode: sacCode.trim() || '999293',
      gstNumber: gstNumber.trim().toUpperCase(),
      gstState,
      autoGstByState,
      stateGstRates,
      gstSplit,
      instantActivation,
      threshold: Math.min(100, Math.max(1, Number(threshold) || 75)),
    });
    onToast('success', 'Admin GSTIN, Payable State & Auto State-GST rules saved.');
  };

  const handleNotificationsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSaveSettings({
      smtpUser: smtpUser.trim(),
      ...(smtpPass.trim() ? { smtpPass: smtpPass.trim() } : {}),
      senderName: senderName.trim() || brand.trim() || 'ARYA TAX PATHSHALA',
      adminWhatsapp: adminWhatsapp.trim(),
      whatsappWebhookUrl: whatsappWebhookUrl.trim(),
      whatsappPhoneNumberId: whatsappPhoneNumberId.trim(),
      ...(whatsappApiToken.trim()
        ? { whatsappApiToken: whatsappApiToken.trim() }
        : {}),
    });
    setSmtpPass('');
    setWhatsappApiToken('');
    onToast('success', 'Gmail Invoice & WhatsApp billing settings saved.');
  };

  const handleQrFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressQrImageFile(file);
      setMethodQrUrl(compressed);
      onToast('success', 'Admin QR code image loaded. Click Add Payment Method to save.');
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Could not load QR image.'
      );
    }
    e.target.value = '';
  };

  const handleMethodSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!methodName.trim()) return;
    await onAddMethod({
      name: methodName.trim(),
      type: methodType,
      upiId: methodUpiId.trim(),
      qrCodeUrl: methodQrUrl.trim(),
      gatewayProvider:
        methodType === 'gateway' ? methodGatewayProvider.trim() : '',
      gatewayUrl: methodType === 'gateway' ? methodGatewayUrl.trim() : '',
      info: methodInfo.trim(),
    });
    setMethodName('');
    setMethodUpiId('');
    setMethodQrUrl('');
    setMethodGatewayUrl('');
    setMethodInfo('');
    onToast('success', 'Payment method & QR saved for student checkout.');
  };

  const handleSignatureFileChange = async (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const pngDataUrl = await compressSignatureImage(file);
      setCertSignatureUrl(pngDataUrl);
      onToast(
        'success',
        'Authorized Signature photo loaded. Click Save Certificate Template to apply across all certificates.'
      );
    } catch (err) {
      onToast(
        'error',
        err instanceof Error ? err.message : 'Could not load signature image.'
      );
    }
    e.target.value = '';
  };

  const handleCertSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSaveSettings({
      certHeading: certHeading.trim(),
      certSub: certSub.trim(),
      certSigner: certSigner.trim(),
      certFooter: certFooter.trim(),
      certSignatureUrl: certSignatureUrl.trim(),
      certSealText: certSealText.trim() || 'CERTIFIED',
    });
    onToast('success', 'A4 Certificate design & Authorized Signature saved.');
  };

  return (
    <div className="space-y-5">
      <div className="mb-2">
        <h1 className="text-2xl font-extrabold text-[#142746]">
          Portal Settings · GST, Payment QR &amp; Billing
        </h1>
        <p className="mt-1 text-sm text-[#718096]">
          Configure inbuilt GST rates &amp; tax sections (ধারা), Admin QR codes, payment gateways, and Gmail/WhatsApp invoicing
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: Inbuilt GST & Tax Section (ধারা) */}
        <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
          <h3 className="text-base font-bold text-[#142746] mb-1">
            Business, Inbuilt GST &amp; Tax Section (ধারা)
          </h3>
          <p className="text-xs text-[#718096] mb-4">
            Automatically added to every course fee and printed on student GST Tax Invoices.
          </p>

          <form onSubmit={handleBusinessSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Portal / Institute Name
              </label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-xs font-bold text-[#59677d]">
                  GST Rate (%)
                </label>
                <div className="flex flex-wrap gap-1">
                  {[0, 5, 12, 18, 28].map((slab) => (
                    <button
                      key={slab}
                      type="button"
                      onClick={() => setGst(String(slab))}
                      className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold cursor-pointer ${
                        Number(gst) === slab
                          ? 'border-[#142746] bg-[#142746] text-white'
                          : 'border-[#e3e9f2] bg-[#f8fafd] text-[#142746] hover:bg-[#edf2fa]'
                      }`}
                    >
                      {slab}%
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={gst}
                onChange={(e) => setGst(e.target.value)}
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono tabular-nums outline-none focus:border-[#315b9b]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  GST Calculation Mode
                </label>
                <select
                  value={gstMode}
                  onChange={(e) =>
                    setGstMode(e.target.value as 'exclusive' | 'inclusive')
                  }
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
                >
                  <option value="exclusive">Exclusive (Add GST on Fee)</option>
                  <option value="inclusive">Inclusive (Fee includes GST)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  GST Tax Split
                </label>
                <select
                  value={gstSplit}
                  onChange={(e) =>
                    setGstSplit(e.target.value as GstSplitType)
                  }
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
                >
                  <option value="cgst_sgst">CGST + SGST (Intra-State 50/50)</option>
                  <option value="igst">IGST (Inter-State Full Rate)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Custom Tax Section / Act Clause (জিএসটি ধারা)
              </label>
              <input
                value={gstSection}
                onChange={(e) => setGstSection(e.target.value)}
                placeholder="e.g. Section 9(1) CGST/SGST Act · Notification 11/2017 CT(R)"
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Admin Institute GSTIN (auto-detects State)
                </label>
                <input
                  value={gstNumber}
                  onChange={(e) => handleGstinChange(e.target.value)}
                  placeholder="e.g. 19ABCDE1234F1Z5"
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono uppercase outline-none focus:border-[#315b9b]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  GST Payable From State (Admin Origin State) *
                </label>
                <select
                  value={gstState}
                  onChange={(e) => setGstState(e.target.value)}
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-sm font-semibold text-[#142746] outline-none focus:border-[#315b9b]"
                >
                  {INDIAN_GST_STATES.map((st) => (
                    <option key={st.code} value={st.name}>
                      {st.code} - {st.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  SAC / HSN Code
                </label>
                <input
                  value={sacCode}
                  onChange={(e) => setSacCode(e.target.value)}
                  placeholder="999293"
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono outline-none focus:border-[#315b9b]"
                />
              </div>
              <label className="mt-4 flex items-center gap-2 rounded-[10px] border border-[#bfe6d5] bg-[#eefaf4] px-3 py-2 text-xs font-bold text-[#142746] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoGstByState}
                  onChange={(e) => setAutoGstByState(e.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1]"
                />
                <span>Auto CGST+SGST / IGST by Student State</span>
              </label>
            </div>

            {/* State-Wise Custom GST Rate Overrides */}
            <div className="rounded-[11px] border border-[#e3e9f2] bg-[#f8fafd] p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[#142746]">
                    State-Wise GST Rate Rules (optional)
                  </div>
                  <div className="text-[11px] text-[#718096]">
                    Override default {gst}% GST for specific student states (or leave empty to use {gst}% for all states).
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={overrideState}
                  onChange={(e) => setOverrideState(e.target.value)}
                  className="flex-1 min-w-[160px] rounded-[8px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#315b9b]"
                >
                  {INDIAN_GST_STATES.map((st) => (
                    <option key={st.code} value={st.name}>
                      {st.code} - {st.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={overrideRate}
                  onChange={(e) => setOverrideRate(e.target.value)}
                  className="w-20 rounded-[8px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-mono outline-none focus:border-[#315b9b]"
                  placeholder="%"
                />
                <button
                  type="button"
                  onClick={handleAddStateRate}
                  className="rounded-[8px] bg-[#edf2fa] px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] cursor-pointer"
                >
                  Set Rate
                </button>
              </div>
              {Object.keys(stateGstRates).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Object.entries(stateGstRates).map(([stName, rate]) => (
                    <span
                      key={stName}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#dce6f7] bg-white px-2 py-1 text-[11px] font-semibold text-[#142746]"
                    >
                      <span>
                        {getGstStateCode(stName) ? `${getGstStateCode(stName)} ` : ''}
                        {stName}: <strong className="font-mono text-[#315b9b]">{rate}%</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveStateRate(stName)}
                        className="text-[#c64b58] hover:underline font-bold cursor-pointer"
                        aria-label={`Remove ${stName} rate`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Sample Live GST Calculation & Student State Simulator */}
            <div className="rounded-[11px] border border-[#dce6f5] bg-[#f8fafd] p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-[#142746]">
                  Live Auto-GST Simulator (₹1,000 fee)
                </div>
                <select
                  value={simStudentState}
                  onChange={(e) => setSimStudentState(e.target.value)}
                  aria-label="Simulate Student State"
                  className="rounded-md border border-[#dce6f7] bg-white px-2 py-1 text-[11px] font-semibold text-[#142746] outline-none"
                >
                  {INDIAN_GST_STATES.map((st) => (
                    <option key={st.code} value={st.name}>
                      Student: {st.code} - {st.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-[11px] text-[#59677d]">
                Payable From: <strong className="text-[#142746]">{gstState}</strong> &rarr; Student:{' '}
                <strong className="text-[#142746]">{simStudentState}</strong> ·{' '}
                <strong className="text-[#315b9b]">
                  {sampleBreakdown.gstSplit === 'igst'
                    ? `Inter-State IGST (${sampleBreakdown.gstRate}%)`
                    : `Intra-State CGST+SGST (${sampleBreakdown.gstRate}%)`}
                </strong>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums text-[#59677d]">
                <span>Taxable: {money(sampleBreakdown.taxable)}</span>
                {sampleBreakdown.gstSplit === 'igst' ? (
                  <span>IGST: {money(sampleBreakdown.igst)}</span>
                ) : (
                  <span>
                    CGST: {money(sampleBreakdown.cgst)} + SGST:{' '}
                    {money(sampleBreakdown.sgst)}
                  </span>
                )}
                <span className="font-bold text-[#13845b]">
                  Final Payable: {money(sampleBreakdown.total)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Certificate Unlock Threshold (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono tabular-nums outline-none focus:border-[#315b9b]"
                />
              </div>
              <div className="mt-4 rounded-[10px] border border-[#dce6f7] bg-[#f8fafd] px-3 py-2 text-[11px] text-[#142746]">
                <div className="font-bold">Strict Payment Verification Active</div>
                <div className="text-[#59677d]">
                  Paid QR / UPI / Bank orders remain locked in <strong>Pending Verification</strong> until Owner / Admin verifies payment receipt in Orders &amp; Billing.
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
            >
              Save Business &amp; GST Settings
            </button>
          </form>
        </div>

        {/* Card 2: Admin QR Codes, UPI & Payment Gateways */}
        <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
          <h3 className="text-base font-bold text-[#142746] mb-1">
            Payment Methods · Admin QR &amp; Gateways
          </h3>
          <p className="text-xs text-[#718096] mb-4 leading-relaxed">
            Upload your QR Code, add a UPI ID for dynamic amount QR, or add a Payment Gateway (Razorpay, Cashfree, PhonePe PG). Students choose from active methods at checkout.
          </p>

          <form onSubmit={handleMethodSubmit} className="space-y-3 rounded-[12px] border border-[#e3e9f2] bg-[#f8fafd] p-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Method Type
                </label>
                <select
                  value={methodType}
                  onChange={(e) =>
                    setMethodType(e.target.value as PaymentMethodType)
                  }
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-bold text-[#142746] outline-none focus:border-[#315b9b]"
                >
                  <option value="upi_qr">UPI &amp; Admin QR Code</option>
                  <option value="gateway">Payment Gateway (Razorpay / Link)</option>
                  <option value="bank">Bank Transfer (NEFT / IMPS)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Method Title *
                </label>
                <input
                  required
                  value={methodName}
                  onChange={(e) => setMethodName(e.target.value)}
                  placeholder={
                    methodType === 'gateway'
                      ? 'e.g. Razorpay Instant Checkout'
                      : methodType === 'bank'
                        ? 'e.g. HDFC Current Account'
                        : 'e.g. Google Pay / PhonePe QR'
                  }
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                />
              </div>
            </div>

            {methodType === 'upi_qr' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1">
                    UPI ID (auto-generates scannable QR with exact fee)
                  </label>
                  <input
                    value={methodUpiId}
                    onChange={(e) => setMethodUpiId(e.target.value)}
                    placeholder="e.g. aryatax@okaxis or 9876543210@ybl"
                    className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1">
                    Upload Admin QR Code Image (optional if UPI ID entered)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#dce6f7] bg-white px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer">
                      <Upload className="h-3.5 w-3.5 text-[#315b9b]" />
                      <span>Upload QR Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleQrFileChange}
                        className="sr-only"
                      />
                    </label>
                    <input
                      value={
                        methodQrUrl.startsWith('data:')
                          ? 'Uploaded QR image ready'
                          : methodQrUrl
                      }
                      onChange={(e) => setMethodQrUrl(e.target.value)}
                      readOnly={methodQrUrl.startsWith('data:')}
                      placeholder="Or paste QR image URL (https://...)"
                      className="flex-1 min-w-[160px] rounded-[9px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#315b9b]"
                    />
                    {methodQrUrl && (
                      <button
                        type="button"
                        onClick={() => setMethodQrUrl('')}
                        className="text-xs font-bold text-[#c64b58] hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {(methodQrUrl || previewQrDataUrl) && (
                    <div className="mt-2 flex items-center gap-3 rounded-lg border border-[#e3e9f2] bg-white p-2">
                      <img
                        src={methodQrUrl || previewQrDataUrl}
                        alt="QR Preview"
                        className="h-16 w-16 rounded border border-[#e3e9f2] object-contain bg-white"
                      />
                      <div className="text-[11px] text-[#59677d]">
                        <div className="font-bold text-[#142746]">
                          QR Code Preview Ready
                        </div>
                        <div>
                          {methodQrUrl
                            ? 'Uploaded Admin QR will be shown directly at checkout.'
                            : 'Dynamic UPI QR will encode exact course fee + GST.'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {methodType === 'gateway' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1">
                    Gateway Provider
                  </label>
                  <select
                    value={methodGatewayProvider}
                    onChange={(e) => setMethodGatewayProvider(e.target.value)}
                    className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                  >
                    <option value="Razorpay">Razorpay</option>
                    <option value="Cashfree">Cashfree Payments</option>
                    <option value="PhonePe PG">PhonePe Payment Gateway</option>
                    <option value="PayU">PayU India</option>
                    <option value="Stripe">Stripe</option>
                    <option value="Custom Gateway">Custom Gateway</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1">
                    Gateway Checkout / Payment Page URL *
                  </label>
                  <input
                    required
                    value={methodGatewayUrl}
                    onChange={(e) => setMethodGatewayUrl(e.target.value)}
                    placeholder="https://rzp.io/l/... or https://pages.razorpay.com/..."
                    className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Instructions / Bank Details
              </label>
              <textarea
                rows={2}
                value={methodInfo}
                onChange={(e) => setMethodInfo(e.target.value)}
                placeholder="Instructions shown to student during payment..."
                className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Payment Method / QR</span>
            </button>
          </form>

          {/* Existing methods list */}
          <div className="mt-4 space-y-2.5">
            {methods.map((m) => {
              const qrSrc = m.qrCodeUrl || methodQrMap[m.id];
              return (
                <div
                  key={m.id}
                  className="flex items-start justify-between gap-3 rounded-[12px] border border-[#e3e9f2] bg-white p-3 text-xs"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {qrSrc ? (
                      <img
                        src={qrSrc}
                        alt={m.name}
                        className="h-12 w-12 shrink-0 rounded-lg border border-[#e3e9f2] object-contain bg-white"
                      />
                    ) : (
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-dashed border-[#cbd5e1] bg-[#f8fafd] text-[#718096]">
                        {m.type === 'gateway' ? (
                          <ExternalLink className="h-4 w-4 text-[#315b9b]" />
                        ) : (
                          <QrCode className="h-4 w-4" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#142746] flex flex-wrap items-center gap-1.5">
                        <span>{m.name}</span>
                        <span className="text-[11px] font-semibold text-[#718096]">
                          ·{' '}
                          {m.type === 'gateway'
                            ? m.gatewayProvider || 'Gateway'
                            : m.type === 'bank'
                              ? 'Bank Transfer'
                              : 'UPI & QR'}
                        </span>
                        <span
                          className={`text-[11px] font-bold ${
                            m.active ? 'text-[#13845b]' : 'text-[#c64b58]'
                          }`}
                        >
                          · {m.active ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      {m.upiId && (
                        <div className="font-mono text-[11px] text-[#315b9b] mt-0.5">
                          UPI: {m.upiId}
                        </div>
                      )}
                      {m.gatewayUrl && (
                        <div className="font-mono text-[11px] text-[#315b9b] truncate mt-0.5">
                          {m.gatewayUrl}
                        </div>
                      )}
                      {m.info && (
                        <div className="text-[#718096] truncate mt-0.5">
                          {m.info}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleMethod(m.id)}
                      className="rounded-md border border-[#e3e9f2] px-2.5 py-1 font-semibold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
                    >
                      {m.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditMethod(m)}
                      className="rounded-md bg-[#edf2fa] px-2.5 py-1 font-bold text-[#142746] hover:bg-[#dce6f7] cursor-pointer"
                    >
                      Edit QR &amp; Info
                    </button>
                    {methods.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteMethod(m.id)}
                        className="rounded-md p-1 text-[#718096] hover:bg-[#fff0f1] hover:text-[#c64b58] cursor-pointer"
                        aria-label="Delete method"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Card 3: Auto Gmail Tax Invoice & WhatsApp Billing */}
      <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-bold text-[#142746]">
              Automatic Gmail Tax Invoice &amp; WhatsApp Bill Delivery
            </h3>
            <p className="text-xs text-[#718096] mt-0.5">
              Students receive a complete GST Tax Invoice on payment &amp; login. Configure Gmail App Password below for automatic background email delivery.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span
              className={`inline-flex items-center gap-1 ${
                settings.emailConfigured ? 'text-[#13845b]' : 'text-[#8c6826]'
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              <span>
                {settings.emailConfigured
                  ? 'Gmail SMTP Ready'
                  : 'Gmail Manual / Preview'}
              </span>
            </span>
            <span className="text-[#cbd5e1]">·</span>
            <span className="inline-flex items-center gap-1 text-[#13845b]">
              <MessageCircle className="h-3.5 w-3.5" />
              <span>
                {settings.whatsappConfigured
                  ? 'WhatsApp API Connected'
                  : 'WhatsApp 1-Click Bill Ready'}
              </span>
            </span>
          </div>
        </div>

        <div className="mb-4 rounded-[11px] border border-[#dce6f5] bg-[#f8fafd] px-3.5 py-2.5 text-xs text-[#59677d]">
          <strong className="text-[#142746]">Auto-Locked Recipients:</strong> Student&apos;s registered Gmail + Admin Gmail (
          <span className="font-mono font-bold text-[#315b9b]">
            {settings.adminEmail || settings.smtpUser || 'Set Sender Gmail below'}
          </span>
          ) are automatically locked on every invoice dispatch — no manual recipient picker is required.
        </div>

        <form onSubmit={handleNotificationsSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-[12px] border border-[#e3e9f2] bg-[#f8fafd] p-4 space-y-3">
            <div className="text-xs font-bold text-[#142746] flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-[#315b9b]" />
              <span>Gmail Auto-Invoice (SMTP)</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Sender Gmail Address
              </label>
              <input
                type="email"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="yourinstitute@gmail.com"
                className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Gmail App Password {settings.smtpPassSet && '✓ Saved'}
                </label>
                <input
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder={
                    settings.smtpPassSet
                      ? '•••••••••••• (leave blank to keep)'
                      : '16-char Google App Password'
                  }
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Sender Name on Email
                </label>
                <input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="ARYA TAX PATHSHALA"
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                />
              </div>
            </div>
            <p className="text-[11px] text-[#718096] leading-relaxed">
              Use a Google Account <strong>App Password</strong> (Google Account &rarr; Security &rarr; 2-Step Verification &rarr; App Passwords). Stored securely on the server only.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="email"
                value={testEmailTarget}
                onChange={(e) => setTestEmailTarget(e.target.value)}
                placeholder="Test email recipient..."
                className="flex-1 min-w-[160px] rounded-[9px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#315b9b]"
              />
              <button
                type="button"
                disabled={testingEmail || !settings.emailConfigured}
                onClick={async () => {
                  setTestingEmail(true);
                  try {
                    const res = await onTestEmail(testEmailTarget);
                    if (res.ok && res.data) {
                      onToast('success', res.data.note);
                    } else {
                      onToast('error', res.error || 'Email test failed.');
                    }
                  } finally {
                    setTestingEmail(false);
                  }
                }}
                className="rounded-[9px] border border-[#dce6f7] bg-white px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] disabled:opacity-50 cursor-pointer"
              >
                {testingEmail ? 'Sending...' : 'Send Test Invoice'}
              </button>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#e3e9f2] bg-[#f8fafd] p-4 space-y-3">
            <div className="text-xs font-bold text-[#142746] flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4 text-[#13845b]" />
              <span>WhatsApp Payment Bill Settings</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Admin / Institute WhatsApp Number (with country code)
              </label>
              <input
                value={adminWhatsapp}
                onChange={(e) => setAdminWhatsapp(e.target.value)}
                placeholder="e.g. 919876543210"
                className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-sm font-mono outline-none focus:border-[#315b9b]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  WhatsApp Cloud Phone ID (optional)
                </label>
                <input
                  value={whatsappPhoneNumberId}
                  onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                  placeholder="Meta Phone Number ID"
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  WhatsApp API Token {settings.whatsappTokenSet && '✓ Saved'}
                </label>
                <input
                  type="password"
                  value={whatsappApiToken}
                  onChange={(e) => setWhatsappApiToken(e.target.value)}
                  placeholder="Optional Meta Bearer Token"
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Or WhatsApp Automation Webhook URL (optional)
              </label>
              <input
                value={whatsappWebhookUrl}
                onChange={(e) => setWhatsappWebhookUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
              />
            </div>
            <div className="flex items-start gap-2 text-[11px] text-[#13845b] font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Student receives a formatted GST Bill for WhatsApp immediately after paying, even without Cloud API tokens.
              </span>
            </div>
          </div>

          <div className="lg:col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-[10px] bg-[#142746] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
            >
              Save Gmail &amp; WhatsApp Settings
            </button>
          </div>
        </form>
      </div>

      {/* Card 4: A4 Certificate Design, Authorized Signature & Text */}
      <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
        <div className="mb-4">
          <h3 className="text-base font-bold text-[#142746]">
            A4 Certificate Design, Authorized Signature &amp; Seal
          </h3>
          <p className="mt-0.5 text-xs text-[#718096]">
            Upload your Authorized Signature photo (transparent PNG supported). It appears cleanly on every auto-generated A4 Landscape e-certificate.
          </p>
        </div>

        <form onSubmit={handleCertSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Certificate heading
            </label>
            <input
              value={certHeading}
              onChange={(e) => setCertHeading(e.target.value)}
              placeholder="Certificate of Achievement"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Authorized signatory name
            </label>
            <input
              value={certSigner}
              onChange={(e) => setCertSigner(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Subtitle / completion wording
            </label>
            <input
              value={certSub}
              onChange={(e) => setCertSub(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Gold Rosette Seal Label
            </label>
            <input
              value={certSealText}
              onChange={(e) => setCertSealText(e.target.value)}
              placeholder="CERTIFIED"
              maxLength={14}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm uppercase outline-none focus:border-[#315b9b]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Footer text
            </label>
            <input
              value={certFooter}
              onChange={(e) => setCertFooter(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>

          <div className="sm:col-span-2 rounded-[12px] border border-[#dce6f5] bg-[#f8fafd] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#142746]">
                  Authorized Signatory Signature Photo
                </div>
                <div className="text-[11px] text-[#718096]">
                  Upload PNG / JPG / WebP of your signature. Transparent PNG looks sharpest above the signatory line.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#dce6f7] bg-white px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer">
                  <Upload className="h-3.5 w-3.5 text-[#315b9b]" />
                  <span>{certSignatureUrl ? 'Replace Signature' : 'Upload Signature Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureFileChange}
                    className="sr-only"
                  />
                </label>
                {certSignatureUrl && (
                  <button
                    type="button"
                    onClick={() => setCertSignatureUrl('')}
                    className="text-xs font-bold text-[#c64b58] hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {certSignatureUrl && (
              <div className="mt-3 inline-flex flex-col items-center rounded-lg border border-[#e3e9f2] bg-[#fdfcf8] px-6 py-3">
                <img
                  src={certSignatureUrl}
                  alt="Authorized Signature Preview"
                  className="max-h-14 max-w-[200px] object-contain"
                />
                <div className="mt-1 w-40 border-t border-[#475569] pt-1 text-center text-[11px] font-bold text-[#142746]">
                  {certSigner || 'Authorized Signatory'}
                </div>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
            >
              Save Certificate Design &amp; Signature
            </button>
          </div>
        </form>
      </div>
      {/* Card 5: Official WhatsApp Business Cloud API & 2FA Governance */}
      <WhatsappSecurityPanel
        settings={settings}
        onSaveConfig={onSaveWhatsappConfig}
        onFetchLogs={onFetchWhatsappLogs}
        onTestDelivery={onTestWhatsapp}
        onToast={onToast}
      />
    </div>
  );
}
