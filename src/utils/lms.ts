import type {
  Bundle,
  Coupon,
  Course,
  FlattenedLesson,
  Order,
  PaymentMethod,
  PortalSettings,
  ProgressMap,
  User,
} from '../types/lms';

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function money(n: number | undefined | null): string {
  return (
    '₹' +
    Number(n || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
    })
  );
}

export function normalizeVideoUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  // Extract src if user pasted a full <iframe> embed snippet
  const iframeMatch = trimmed.match(/src=["']([^"']+)["']/i);
  let candidate = iframeMatch ? iframeMatch[1].trim() : trimmed;
  // Extract URL if user pasted a YouTube share message with surrounding text
  if (!/^https?:\/\//i.test(candidate) && /\s/.test(candidate)) {
    const inlineUrl = candidate.match(/https?:\/\/[^\s"'<>]+/i);
    if (inlineUrl) candidate = inlineUrl[0];
  }
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^\/\//.test(candidate)) return `https:${candidate}`;
  if (/^[a-zA-Z0-9_-]{11}$/.test(candidate)) {
    return `https://www.youtube.com/watch?v=${candidate}`;
  }
  if (/^[\w.-]+\.[a-z]{2,}/i.test(candidate)) {
    return `https://${candidate}`;
  }
  return candidate;
}

export function youtubeId(url: string): string {
  const normalized = normalizeVideoUrl(url);
  if (!normalized) return '';
  try {
    const u = new URL(normalized);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) {
      const seg = u.pathname.replace(/^\/+/, '').split('/')[0] || '';
      return seg.replace(/[^a-zA-Z0-9_-].*$/, '');
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      if (u.pathname.includes('attribution_link')) {
        const inner = u.searchParams.get('u');
        if (inner) {
          const decoded = decodeURIComponent(inner);
          const innerId = youtubeId(`https://www.youtube.com${decoded.startsWith('/') ? '' : '/'}${decoded}`);
          if (innerId) return innerId;
        }
      }
      const v = u.searchParams.get('v');
      if (v) return v.replace(/[^a-zA-Z0-9_-].*$/, '');
      const parts = u.pathname.split('/').filter(Boolean);
      const markerIdx = parts.findIndex((p) =>
        ['embed', 'shorts', 'live', 'v', 'e', 'video'].includes(p)
      );
      if (markerIdx !== -1 && parts[markerIdx + 1]) {
        return parts[markerIdx + 1].replace(/[^a-zA-Z0-9_-].*$/, '');
      }
    }
  } catch {
    const m = normalized.match(
      /(?:youtu\.be\/|(?:studio\.)?youtube(?:-nocookie)?\.com\/(?:watch\?.*?v=|embed\/|shorts\/|live\/|video\/|v\/))([a-zA-Z0-9_-]{11})/i
    );
    return m ? m[1] : '';
  }
  return '';
}

export function getCourseLessons(course: Course): FlattenedLesson[] {
  return (course.chapters || []).flatMap((ch) =>
    (ch.lessons || []).map((l) => ({
      ...l,
      chapterId: ch.id,
      chapterTitle: ch.title,
    }))
  );
}

export function isOrderActiveAccess(order: Order): boolean {
  if (order.status !== 'PAID') return false;
  if (!order.expiresAt) return true;
  const exp = Date.parse(order.expiresAt);
  return Number.isNaN(exp) || exp > Date.now();
}

export function hasBoughtCourse(
  user: User | null,
  course: Course,
  orders: Order[]
): boolean {
  if (!user) return false;
  if ((user.grantedCourseIds || []).includes(course.id)) return true;
  return orders.some(
    (o) =>
      o.userId === user.id &&
      isOrderActiveAccess(o) &&
      (o.courseIds || []).includes(course.id)
  );
}

export function getCourseAccessExpiry(
  user: User | null,
  course: Course,
  orders: Order[]
): string | null {
  if (!user) return null;
  if ((user.grantedCourseIds || []).includes(course.id)) return null;
  const matching = orders.filter(
    (o) =>
      o.userId === user.id &&
      isOrderActiveAccess(o) &&
      (o.courseIds || []).includes(course.id)
  );
  if (!matching.length) return null;
  if (matching.some((o) => !o.expiresAt)) return null;
  const latest = matching.reduce((max, o) =>
    Date.parse(o.expiresAt!) > Date.parse(max.expiresAt!) ? o : max
  );
  return latest.expiresAt || null;
}

export function hasPendingOrderForCourse(
  user: User | null,
  courseId: string,
  orders: Order[]
): boolean {
  if (!user) return false;
  return orders.some(
    (o) =>
      o.userId === user.id &&
      o.status === 'PENDING' &&
      (o.courseIds || []).includes(courseId)
  );
}

export function getUserCourseProgress(
  userId: string | undefined,
  course: Course,
  progress: ProgressMap
): number {
  if (!userId) return 0;
  const ls = getCourseLessons(course);
  if (!ls.length) return 0;
  const total = ls.reduce(
    (acc, l) => acc + (progress[`${userId}_${course.id}_${l.id}`] || 0),
    0
  );
  return Math.round(total / ls.length);
}

export function getCompletedLessonCount(
  userId: string | undefined,
  course: Course,
  progress: ProgressMap
): number {
  if (!userId) return 0;
  const ls = getCourseLessons(course);
  return ls.filter(
    (l) => (progress[`${userId}_${course.id}_${l.id}`] || 0) >= 100
  ).length;
}

export function isCertificateEligible(
  userId: string | undefined,
  course: Course,
  progress: ProgressMap,
  threshold: number
): boolean {
  if (!userId) return false;
  const ls = getCourseLessons(course);
  if (!ls.length) return false;
  const completed = ls.filter(
    (l) => (progress[`${userId}_${course.id}_${l.id}`] || 0) >= 100
  ).length;
  return (completed / ls.length) * 100 >= Number(threshold || 75);
}

export interface IndianGstState {
  code: string;
  name: string;
}

export const INDIAN_GST_STATES: IndianGstState[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
];

export function normalizeIndianState(raw?: string): string {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  const codeMatch = clean.match(/^(\d{2})\b/);
  if (codeMatch) {
    const byCode = INDIAN_GST_STATES.find((s) => s.code === codeMatch[1]);
    if (byCode) return byCode.name;
  }
  const lower = clean.toLowerCase();
  const exact = INDIAN_GST_STATES.find((s) => s.name.toLowerCase() === lower);
  if (exact) return exact.name;
  const partial = INDIAN_GST_STATES.find((s) =>
    s.name.toLowerCase().includes(lower)
  );
  return partial ? partial.name : clean;
}

export function getGstStateCode(stateName?: string): string {
  const norm = normalizeIndianState(stateName);
  if (!norm) return '';
  return INDIAN_GST_STATES.find((s) => s.name === norm)?.code || '';
}

export function detectStateFromGstin(gstin?: string): string {
  const clean = String(gstin || '').trim().toUpperCase();
  if (!/^\d{2}/.test(clean)) return '';
  const code = clean.slice(0, 2);
  return INDIAN_GST_STATES.find((s) => s.code === code)?.name || '';
}

export interface ResolvedGstRule {
  adminState: string;
  buyerState: string;
  gstRate: number;
  gstSplit: 'cgst_sgst' | 'igst';
  supplyType: 'intra_state' | 'inter_state';
  autoApplied: boolean;
  rateSource: 'state_override' | 'default';
}

export function resolveStateGstRule(
  settings: PortalSettings,
  studentState?: string
): ResolvedGstRule {
  const adminState =
    normalizeIndianState(settings.gstState) ||
    detectStateFromGstin(settings.gstNumber);
  const buyerState = normalizeIndianState(studentState);
  const autoEnabled = settings.autoGstByState !== false;

  const stateRates = settings.stateGstRates || {};
  let gstRate = Math.max(0, Number(settings.gst || 0));
  let rateSource: 'state_override' | 'default' = 'default';

  if (autoEnabled && buyerState && Object.prototype.hasOwnProperty.call(stateRates, buyerState)) {
    const override = Number(stateRates[buyerState]);
    if (Number.isFinite(override) && override >= 0) {
      gstRate = override;
      rateSource = 'state_override';
    }
  }

  let gstSplit: 'cgst_sgst' | 'igst' =
    settings.gstSplit === 'igst' ? 'igst' : 'cgst_sgst';
  let autoApplied = false;

  if (autoEnabled && adminState && buyerState) {
    gstSplit = adminState === buyerState ? 'cgst_sgst' : 'igst';
    autoApplied = true;
  }

  return {
    adminState,
    buyerState,
    gstRate,
    gstSplit,
    supplyType: gstSplit === 'igst' ? 'inter_state' : 'intra_state',
    autoApplied,
    rateSource,
  };
}

export interface PriceBreakdown {
  base: number;
  discount: number;
  taxable: number;
  gst: number;
  gstRate: number;
  gstSplit: 'cgst_sgst' | 'igst';
  supplyType: 'intra_state' | 'inter_state';
  buyerState?: string;
  sellerState?: string;
  autoGstApplied?: boolean;
  rateSource?: 'state_override' | 'default';
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  couponApplied?: Coupon;
  couponError?: string;
}

export function calculatePriceBreakdown(
  basePrice: number,
  settings: PortalSettings,
  couponCode?: string,
  coupons: Coupon[] = [],
  studentState?: string
): PriceBreakdown {
  const base = Math.max(0, Number(basePrice) || 0);
  let discount = 0;
  let couponApplied: Coupon | undefined;
  let couponError: string | undefined;

  const trimmed = (couponCode || '').trim().toUpperCase();
  if (trimmed) {
    const found = coupons.find((c) => c.code === trimmed && c.active);
    if (!found) {
      couponError = 'Invalid or inactive coupon code';
    } else if (base < found.min) {
      couponError = `Minimum order value of ${money(found.min)} required`;
    } else {
      couponApplied = found;
      discount =
        found.type === 'percent' ? (base * found.value) / 100 : found.value;
      discount = Math.min(discount, base);
    }
  }

  const rule = resolveStateGstRule(settings, studentState);
  const afterDiscount = Math.max(0, base - discount);
  const gstRate = rule.gstRate;
  const rate = gstRate / 100;

  let taxable = afterDiscount;
  let gst = 0;
  let total = afterDiscount;

  if (settings.gstMode === 'inclusive') {
    gst = rate > 0 ? afterDiscount - afterDiscount / (1 + rate) : 0;
    taxable = afterDiscount - gst;
    total = afterDiscount;
  } else {
    gst = afterDiscount * rate;
    taxable = afterDiscount;
    total = afterDiscount + gst;
  }

  const roundedGst = Math.round(gst * 100) / 100;
  const gstSplit = rule.gstSplit;
  const cgst =
    gstSplit === 'cgst_sgst' ? Math.round((roundedGst / 2) * 100) / 100 : 0;
  const sgst =
    gstSplit === 'cgst_sgst'
      ? Math.round((roundedGst - cgst) * 100) / 100
      : 0;
  const igst = gstSplit === 'igst' ? roundedGst : 0;

  return {
    base: Math.round(base * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    taxable: Math.round(taxable * 100) / 100,
    gst: roundedGst,
    gstRate,
    gstSplit,
    supplyType: rule.supplyType,
    buyerState: rule.buyerState || undefined,
    sellerState: rule.adminState || undefined,
    autoGstApplied: rule.autoApplied,
    rateSource: rule.rateSource,
    cgst,
    sgst,
    igst,
    total: Math.round(total * 100) / 100,
    couponApplied,
    couponError,
  };
}

export function isValidHttpUrl(raw?: string): boolean {
  const s = (raw || '').trim();
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s);
}

const EMAIL_LIKE_DOMAINS = new Set([
  'gmail',
  'yahoo',
  'outlook',
  'hotmail',
  'icloud',
  'protonmail',
  'live',
  'msn',
  'aol',
  'rediffmail',
]);

export function extractUpiIdFromText(raw?: string): string {
  const text = (raw || '').trim();
  if (!text || /^https?:\/\//i.test(text)) return '';
  const matches = text.match(/[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9]{2,32}/g) || [];
  for (const candidate of matches) {
    const [local, handle] = candidate.split('@');
    if (!local || !handle) continue;
    // Skip standard web/email domains (contain dot after @ or match common email providers)
    const afterAtIdx = text.indexOf(candidate) + local.length + 1;
    const nextChar = text[afterAtIdx + handle.length] || '';
    if (nextChar === '.') continue;
    if (EMAIL_LIKE_DOMAINS.has(handle.toLowerCase())) continue;
    return candidate;
  }
  return '';
}

export function resolveMethodUpiId(method?: Partial<PaymentMethod> | null): string {
  if (!method) return '';
  const direct = (method.upiId || '').trim();
  if (direct && !/^https?:\/\//i.test(direct)) {
    return extractUpiIdFromText(direct) || direct;
  }
  const fromGateway = extractUpiIdFromText(method.gatewayUrl);
  if (fromGateway) return fromGateway;
  const fromInfo = extractUpiIdFromText(method.info);
  if (fromInfo) return fromInfo;
  return '';
}

export function buildUpiUri(params: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}): string {
  const pa = (params.upiId || '').trim();
  if (!pa) return '';
  const pn = encodeURIComponent((params.payeeName || 'ARYA TAX PATHSHALA').trim());
  const am = Math.max(0, Number(params.amount) || 0).toFixed(2);
  const tn = encodeURIComponent((params.note || 'Course Enrollment Fee').trim());
  return `upi://pay?pa=${encodeURIComponent(pa)}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}

export function buildGpayUpiUri(params: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}): string {
  const standard = buildUpiUri(params);
  if (!standard) return '';
  return standard.replace(/^upi:\/\/pay\?/, 'tez://upi/pay?');
}

export interface TransactionProofResult {
  valid: boolean;
  normalized: string;
  proofType: string;
  message: string;
}

export function validateTransactionProof(
  rawRef: string,
  studentPhone?: string
): TransactionProofResult {
  const normalized = (rawRef || '').trim().replace(/\s+/g, '');
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      proofType: 'Missing',
      message: 'Enter your 12-digit UPI UTR / Transaction ID or Gateway Payment ID.',
    };
  }
  if (normalized.includes('@')) {
    return {
      valid: false,
      normalized,
      proofType: 'UPI Handle (Not Transaction ID)',
      message:
        'You entered a UPI ID instead of a Transaction ID. Paste the 12-digit UPI UTR / Ref No (e.g. 412345678901).',
    };
  }
  if (/\s/.test((rawRef || '').trim()) || !/^[A-Za-z0-9_-]{8,40}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      proofType: 'Invalid Format',
      message:
        'Invalid Transaction ID. Enter 12-digit UPI UTR (e.g. 412345678901) or Gateway Payment ID (e.g. pay_...) without spaces.',
    };
  }

  const digitsOnly = normalized.replace(/\D/g, '');
  const phoneDigits = String(studentPhone || '').replace(/\D/g, '').slice(-10);
  if (
    phoneDigits.length === 10 &&
    (normalized === phoneDigits || normalized.endsWith(phoneDigits))
  ) {
    return {
      valid: false,
      normalized,
      proofType: 'Phone Number',
      message:
        'Phone number cannot be used as Transaction ID. Enter the actual 12-digit UTR / Ref number from your payment receipt.',
    };
  }

  if (/^\d{12}$/.test(normalized)) {
    return {
      valid: true,
      normalized,
      proofType: 'UPI 12-Digit UTR',
      message: 'Transaction ID verified (12-Digit UPI UTR format).',
    };
  }

  if (/^\d{10,16}$/.test(normalized) && normalized.length !== 10) {
    return {
      valid: true,
      normalized,
      proofType: 'Bank / UPI RRN',
      message: 'Transaction ID verified (UPI / Bank Reference number).',
    };
  }

  if (
    /^(pay_[A-Za-z0-9]{8,}|order_[A-Za-z0-9]{8,}|CF_[A-Za-z0-9]{6,}|TXN[A-Za-z0-9]{6,}|MOJO[A-Za-z0-9]{6,}|pi_[A-Za-z0-9]{10,})$/i.test(
      normalized
    )
  ) {
    return {
      valid: true,
      normalized,
      proofType: 'Gateway Payment ID',
      message: 'Gateway Payment ID verified.',
    };
  }

  if (
    /^(CICAg|T\d{12,}|UTR\d{8,}|UPI\d{8,}|OM\d{10,}|PTM\d{8,}|AX[A-Z0-9]{10,}|SBI[A-Z0-9]{10,}|HDFC[A-Z0-9]{10,}|ICICI[A-Z0-9]{10,})/i.test(
      normalized
    )
  ) {
    return {
      valid: true,
      normalized,
      proofType: 'UPI Transaction ID',
      message: 'UPI Transaction ID verified.',
    };
  }

  if (/^[A-Za-z0-9_-]{10,36}$/.test(normalized) && digitsOnly.length >= 4 && /[A-Za-z]/.test(normalized)) {
    return {
      valid: true,
      normalized,
      proofType: 'Bank / Gateway Reference',
      message: 'Payment reference format verified.',
    };
  }

  return {
    valid: false,
    normalized,
    proofType: 'Unrecognized Reference',
    message:
      'Enter a valid 12-digit UPI UTR (e.g. 412345678901), GPay/PhonePe Txn ID, or Gateway Payment ID (pay_...).',
  };
}

export function normalizeWhatsAppDigits(rawPhone?: string): string {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  return digits;
}

export function buildWhatsAppBillText(
  order: Order,
  settings: PortalSettings,
  studentName?: string
): string {
  const rate = order.gstRate ?? settings.gst ?? 0;
  const taxable = order.taxable ?? Math.max(0, order.base - order.discount);
  const gstLines =
    order.gstSplit === 'igst'
      ? `IGST (${rate}% Inter-State): ${money(order.igst ?? order.gst)}`
      : `CGST (${rate / 2}%): ${money(order.cgst ?? order.gst / 2)} | SGST (${rate / 2}%): ${money(order.sgst ?? order.gst / 2)}`;

  const sectionNote = order.gstSection
    ? `Tax Clause: ${order.gstSection}${order.sacCode ? ` (SAC ${order.sacCode})` : ''}`
    : '';

  return [
    `*${settings.brand} — GST TAX INVOICE & BILL OF SUPPLY*`,
    `Invoice No: ${order.invoiceNumber || order.id}`,
    `Date: ${new Date(order.paidAt || order.created).toLocaleDateString('en-IN')}`,
    `Student: ${order.buyerName || studentName || 'Student'}`,
    order.buyerEmail ? `Login ID / Gmail: ${order.buyerEmail}` : '',
    order.buyerPhone ? `Mobile / WhatsApp: ${order.buyerPhone}` : '',
    order.buyerState ? `Place of Supply (Student State): ${order.buyerState}` : '',
    order.sellerState ? `GST Payable From State: ${order.sellerState}` : '',
    (order.gstNumber || settings.gstNumber)
      ? `Supplier GSTIN: ${order.gstNumber || settings.gstNumber}`
      : '',
    `Course: ${order.itemName}`,
    `Course Fee: ${money(order.base)}`,
    `Discount${order.couponCode ? ` (${order.couponCode})` : ''}: ${order.discount > 0 ? `-${money(order.discount)}` : money(0)}`,
    `Taxable Value: ${money(taxable)}`,
    gstLines,
    sectionNote,
    `*Total Paid: ${money(order.total)}*`,
    order.reference ? `Ref / UTR: ${order.reference}` : '',
    `Status: ${order.status === 'PAID' ? 'PAID · Course Activated' : order.status}`,
    order.expiresAt
      ? `Valid Until: ${new Date(order.expiresAt).toLocaleDateString('en-IN')}`
      : '',
    `Thank you for learning with ${settings.brand}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildWhatsAppUrl(phone: string | undefined, message: string): string {
  const digits = normalizeWhatsAppDigits(phone);
  if (!digits) {
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildGmailComposeUrl(params: {
  to?: string;
  cc?: string;
  subject: string;
  body: string;
}): string {
  const to = encodeURIComponent((params.to || '').trim());
  const cc = (params.cc || '').trim();
  const su = encodeURIComponent(params.subject);
  const body = encodeURIComponent(params.body);
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}${cc ? `&cc=${encodeURIComponent(cc)}` : ''}&su=${su}&body=${body}`;
}

export function getOrderBillingMonthKey(order: Order): string {
  const dt = new Date(order.paidAt || order.created);
  if (Number.isNaN(dt.getTime())) return 'Unknown';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatBillingMonthLabel(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [y, m] = monthKey.split('-').map(Number);
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function getOrderInvoiceSerial(order: Order): number {
  if (order.invoiceSerial && order.invoiceSerial > 0) {
    return order.invoiceSerial;
  }
  if (order.invoiceNumber) {
    const match = order.invoiceNumber.match(/(\d+)$/);
    if (match) return Number(match[1]) || 0;
  }
  return 0;
}

export interface MonthlyGstSummary {
  monthKey: string;
  label: string;
  paidCount: number;
  pendingCount: number;
  rejectedCount: number;
  totalBase: number;
  totalDiscount: number;
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalGst: number;
  totalCollection: number;
}

export function buildMonthlyGstSummaries(orders: Order[]): MonthlyGstSummary[] {
  const map = new Map<string, MonthlyGstSummary>();
  for (const o of orders) {
    const key = getOrderBillingMonthKey(o);
    let cur = map.get(key);
    if (!cur) {
      cur = {
        monthKey: key,
        label: formatBillingMonthLabel(key),
        paidCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        totalBase: 0,
        totalDiscount: 0,
        totalTaxable: 0,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalGst: 0,
        totalCollection: 0,
      };
      map.set(key, cur);
    }
    if (o.status === 'PAID') {
      cur.paidCount += 1;
      const taxable = o.taxable ?? Math.max(0, o.base - o.discount);
      const isIgst = o.gstSplit === 'igst';
      const cgst = o.cgst ?? (isIgst ? 0 : Math.round((o.gst / 2) * 100) / 100);
      const sgst = o.sgst ?? (isIgst ? 0 : Math.round((o.gst - cgst) * 100) / 100);
      const igst = o.igst ?? (isIgst ? o.gst : 0);

      cur.totalBase += o.base || 0;
      cur.totalDiscount += o.discount || 0;
      cur.totalTaxable += taxable;
      cur.totalCgst += cgst;
      cur.totalSgst += sgst;
      cur.totalIgst += igst;
      cur.totalGst += o.gst || 0;
      cur.totalCollection += o.total || 0;
    } else if (o.status === 'PENDING') {
      cur.pendingCount += 1;
    } else {
      cur.rejectedCount += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    b.monthKey.localeCompare(a.monthKey)
  );
}

export function downloadGstComplianceCsv(params: {
  orders: Order[];
  settings: PortalSettings;
  monthKey?: string;
}): number {
  const { orders, settings, monthKey } = params;
  const scoped = orders
    .filter((o) => o.status === 'PAID')
    .filter((o) => !monthKey || monthKey === 'ALL' || getOrderBillingMonthKey(o) === monthKey)
    .slice()
    .sort((a, b) => {
      const sa = getOrderInvoiceSerial(a);
      const sb = getOrderInvoiceSerial(b);
      if (sa !== sb) return sa - sb;
      return Date.parse(a.paidAt || a.created) - Date.parse(b.paidAt || b.created);
    });

  const rows: (string | number)[][] = [
    [`${settings.brand} — GST COMPLIANCE & TAX INVOICE REGISTER`],
    [
      'Supplier GSTIN',
      settings.gstNumber || 'Unregistered',
      'GST Payable From State',
      settings.gstState || 'West Bengal',
      'SAC Code',
      settings.sacCode || '999293',
    ],
    [
      'Period Filter',
      !monthKey || monthKey === 'ALL'
        ? 'All Months'
        : formatBillingMonthLabel(monthKey),
      'Exported On',
      new Date().toLocaleString('en-IN'),
    ],
    [],
    [
      'Sl. No.',
      'Invoice Number',
      'Billing Month',
      'Payment Date',
      'Student Name',
      'Student Gmail / ID',
      'Mobile / Phone',
      'Place of Supply (State)',
      'State Code',
      'GST Payable From',
      'Supply Type',
      'Course / Plan',
      'SAC Code',
      'GST Clause',
      'Base Amount',
      'Discount',
      'Coupon',
      'Taxable Value',
      'GST Rate (%)',
      'CGST',
      'SGST',
      'IGST',
      'Total GST',
      'Total Paid',
      'Payment Method',
      'UTR / Reference',
      'Email Status',
    ],
  ];

  scoped.forEach((o, idx) => {
    const serial = getOrderInvoiceSerial(o) || idx + 1;
    const isIgst = o.gstSplit === 'igst';
    const cgst = o.cgst ?? (isIgst ? 0 : Math.round((o.gst / 2) * 100) / 100);
    const sgst = o.sgst ?? (isIgst ? 0 : Math.round((o.gst - cgst) * 100) / 100);
    const igst = o.igst ?? (isIgst ? o.gst : 0);
    const taxable = o.taxable ?? Math.max(0, o.base - o.discount);
    const stCode = getGstStateCode(o.buyerState);

    rows.push([
      serial,
      o.invoiceNumber || o.id,
      formatBillingMonthLabel(getOrderBillingMonthKey(o)),
      new Date(o.paidAt || o.created).toLocaleString('en-IN'),
      o.buyerName || '',
      o.buyerEmail || '',
      o.buyerPhone || '',
      o.buyerState || '',
      stCode,
      o.sellerState || settings.gstState || '',
      isIgst ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)',
      o.itemName,
      o.sacCode || settings.sacCode || '999293',
      o.gstSection || settings.gstSection || '',
      o.base,
      o.discount,
      o.couponCode || '',
      taxable,
      o.gstRate ?? settings.gst ?? 0,
      cgst,
      sgst,
      igst,
      o.gst,
      o.total,
      o.method,
      o.reference || '',
      o.emailDispatchStatus || 'pending',
    ]);
  });

  const csvContent =
    '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const suffix = !monthKey || monthKey === 'ALL' ? 'all-months' : monthKey;
  link.href = url;
  link.download = `gst-compliance-register-${suffix}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return scoped.length;
}

export function createSampleCatalog(): {
  courses: Course[];
  bundles: Bundle[];
  coupons: Coupon[];
} {
  const c1Id = uid();
  const c2Id = uid();
  const c3Id = uid();

  const courses: Course[] = [
    {
      id: c1Id,
      title: 'GST Practitioner & Return Filing Masterclass',
      category: 'GST & Indirect Tax',
      description:
        'Practical end-to-end training on GST Registration, GSTR-1, GSTR-3B reconciliation, ITC claims, and GSTR-9 annual return.',
      price: 2999,
      visibility: 'published',
      chapters: [
        {
          id: uid(),
          title: 'GST Fundamentals & Registration',
          lessons: [
            {
              id: uid(),
              title: 'Introduction to GST Framework & Thresholds',
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              notes:
                'Covers CGST, SGST, IGST structure, composition scheme limits, and mandatory registration rules under Section 24.',
              file: '',
            },
            {
              id: uid(),
              title: 'GSTR-1 & IFF Practical Walkthrough',
              url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
              notes:
                'B2B vs B2C invoice reporting, HSN summary requirements, and credit/debit note adjustments.',
              file: '',
            },
          ],
        },
        {
          id: uid(),
          title: 'Input Tax Credit & GSTR-2B Reconciliation',
          lessons: [
            {
              id: uid(),
              title: 'Rule 36(4) & Blocked Credit under Section 17(5)',
              url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
              notes:
                'How to reconcile purchase register with GSTR-2B and handle ineligible ITC reversals in GSTR-3B.',
              file: '',
            },
          ],
        },
      ],
    },
    {
      id: c2Id,
      title: 'Income Tax & ITR Filing (AY 2026-27)',
      category: 'Direct Tax',
      description:
        'Complete guide to Old vs New Tax Regime, ITR-1 to ITR-4 preparation, AIS/TIS verification, and capital gains computation.',
      price: 2499,
      visibility: 'published',
      chapters: [
        {
          id: uid(),
          title: 'Heads of Income & Regime Selection',
          lessons: [
            {
              id: uid(),
              title: 'Salary Exemptions, HRA & Section 115BAC',
              url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
              notes:
                'Comparison worksheet for Old vs New Tax Regime with standard deduction and Chapter VI-A limits.',
              file: '',
            },
          ],
        },
      ],
    },
    {
      id: c3Id,
      title: 'TDS & TCS Compliance Workshop',
      category: 'Compliance',
      description:
        'Sections 192, 194C, 194J, 194Q compliance, Form 24Q/26Q filing on TRACES, and Form 16/16A generation.',
      price: 1499,
      visibility: 'published',
      chapters: [
        {
          id: uid(),
          title: 'TDS Deduction & Challan 281',
          lessons: [
            {
              id: uid(),
              title: 'Key TDS Sections & Due Dates',
              url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
              notes:
                'Monthly deposit schedules, late fee under Section 234E, and interest calculation.',
              file: '',
            },
          ],
        },
      ],
    },
  ];

  const bundles: Bundle[] = [
    {
      id: uid(),
      name: 'Complete Tax Practitioner Combo (GST + ITR + TDS)',
      courseIds: [c1Id, c2Id, c3Id],
      price: 4999,
    },
  ];

  const coupons: Coupon[] = [
    {
      id: uid(),
      code: 'ARYA10',
      type: 'percent',
      value: 10,
      min: 1000,
      active: true,
    },
  ];

  return { courses, bundles, coupons };
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadProgressCsvReport(params: {
  user: User;
  courses: Course[];
  progress: ProgressMap;
  settings: PortalSettings;
}): { courseCount: number; completedLessons: number } {
  const { user, courses, progress, settings } = params;
  const rows: (string | number)[][] = [];
  const generatedAt = new Date().toISOString().slice(0, 10);

  rows.push(['ARYA TAX PATHSHALA - LEARNING PROGRESS REPORT']);
  rows.push(['Portal', settings.brand]);
  rows.push(['Learner Name', user.name]);
  rows.push(['Learner ID / Email', user.email]);
  rows.push(['Generated On', new Date().toLocaleString('en-IN')]);
  rows.push(['Certificate Threshold (%)', `${settings.threshold}%`]);
  rows.push([]);

  rows.push(['COURSE STATUS SUMMARY']);
  rows.push([
    'Course Title',
    'Category',
    'Completed Lessons',
    'Total Lessons',
    'Completion (%)',
    'Course Status',
    'Certificate Eligible',
  ]);

  let totalCompletedLessons = 0;

  for (const course of courses) {
    const ls = getCourseLessons(course);
    const done = getCompletedLessonCount(user.id, course, progress);
    const pct = getUserCourseProgress(user.id, course, progress);
    const certReady = isCertificateEligible(
      user.id,
      course,
      progress,
      settings.threshold
    );
    totalCompletedLessons += done;

    const status =
      ls.length === 0
        ? 'No Lessons Added'
        : done === ls.length
          ? 'Completed'
          : certReady
            ? 'Certificate Eligible'
            : pct > 0
              ? 'In Progress'
              : 'Not Started';

    rows.push([
      course.title,
      course.category || 'Tax & Finance',
      done,
      ls.length,
      `${pct}%`,
      status,
      certReady ? 'Yes' : 'No',
    ]);
  }

  rows.push([]);
  rows.push(['DETAILED LESSON PROGRESS']);
  rows.push([
    'Course Title',
    'Chapter',
    'Lesson Title',
    'Progress (%)',
    'Lesson Status',
  ]);

  for (const course of courses) {
    const ls = getCourseLessons(course);
    if (ls.length === 0) {
      rows.push([course.title, '—', 'No lessons added yet', '0%', 'Pending']);
      continue;
    }
    for (const lesson of ls) {
      const lp = Math.round(
        progress[`${user.id}_${course.id}_${lesson.id}`] || 0
      );
      const lStatus =
        lp >= 100 ? 'Completed' : lp > 0 ? 'In Progress' : 'Not Started';
      rows.push([
        course.title,
        lesson.chapterTitle,
        lesson.title,
        `${Math.min(100, lp)}%`,
        lStatus,
      ]);
    }
  }

  const csvContent =
    '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `my-learning-progress-${generatedAt}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return {
    courseCount: courses.length,
    completedLessons: totalCompletedLessons,
  };
}

