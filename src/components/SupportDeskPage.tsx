import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Award,
  CheckCircle2,
  LifeBuoy,
  MessageSquare,
  Plus,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react';
import type {
  Course,
  IssuedCertificateMeta,
  SupportTicket,
  User,
} from '../types/lms';
import { hasPermission, isSuperAdmin } from '../utils/rbac';

interface SupportDeskPageProps {
  currentUser: User;
  courses: Course[];
  onFetchTickets: () => Promise<
    { ok: true; data: { tickets: SupportTicket[] } } | { ok: false; error: string }
  >;
  onCreateTicket: (payload: {
    subject: string;
    message: string;
    category: SupportTicket['category'];
    courseId?: string;
    priority?: SupportTicket['priority'];
  }) => Promise<
    { ok: true; data: { ticket: SupportTicket } } | { ok: false; error: string }
  >;
  onReplyTicket: (
    ticketId: string,
    message: string
  ) => Promise<
    { ok: true; data: { ticket: SupportTicket } } | { ok: false; error: string }
  >;
  onUpdateTicketStatus: (
    ticketId: string,
    status: SupportTicket['status']
  ) => Promise<
    { ok: true; data: { ticket: SupportTicket } } | { ok: false; error: string }
  >;
  onVerifyCertificate: (certNo: string) => Promise<
    | {
        ok: true;
        data: {
          found: boolean;
          certificate?: {
            certificateNo: string;
            studentName: string;
            studentEmail: string;
            targetTitle: string;
            targetType: 'course' | 'bundle';
            issuedDate: string;
            status: 'ACTIVE' | 'REVOKED';
            revokedReason?: string;
            source?: string;
          };
        };
      }
    | { ok: false; error: string }
  >;
  onFetchCertificateRegistry: () => Promise<
    | { ok: true; data: { registry: IssuedCertificateMeta[] } }
    | { ok: false; error: string }
  >;
  onRevokeCertificate: (
    certNo: string,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onReinstateCertificate: (
    certNo: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function SupportDeskPage({
  currentUser,
  courses,
  onFetchTickets,
  onCreateTicket,
  onReplyTicket,
  onUpdateTicketStatus,
  onVerifyCertificate,
  onFetchCertificateRegistry,
  onRevokeCertificate,
  onReinstateCertificate,
  onToast,
}: SupportDeskPageProps) {
  const isStudent = currentUser.role === 'student';
  const owner = isSuperAdmin(currentUser);
  const canVerifyCerts = owner || hasPermission(currentUser, 'certificate_verify');
  const canSupportStaff =
    owner || hasPermission(currentUser, 'student_support_manage');

  const [tab, setTab] = useState<'tickets' | 'certificates'>('tickets');

  // Support Tickets State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | SupportTicket['status']>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | SupportTicket['category']>('ALL');
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [replyText, setReplyText] = useState('');
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Student Ticket Form State
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicket['category']>('COURSE_QUERY');
  const [courseId, setCourseId] = useState('');
  const [priority, setPriority] = useState<SupportTicket['priority']>('MEDIUM');
  const [message, setMessage] = useState('');
  const [submittingTicket, setSubmittingTicket] = useState(false);

  // Certificate Lookup & Registry State
  const [certQuery, setCertQuery] = useState('');
  const [certResult, setCertResult] = useState<{
    checked: boolean;
    found: boolean;
    certificate?: {
      certificateNo: string;
      studentName: string;
      studentEmail: string;
      targetTitle: string;
      targetType: 'course' | 'bundle';
      issuedDate: string;
      status: 'ACTIVE' | 'REVOKED';
      revokedReason?: string;
    };
  } | null>(null);
  const [registry, setRegistry] = useState<IssuedCertificateMeta[]>([]);
  const [revokeReason, setRevokeReason] = useState<Record<string, string>>({});

  const loadTickets = useCallback(async () => {
    if (!isStudent && !canSupportStaff) return;
    setLoadingTickets(true);
    try {
      const res = await onFetchTickets();
      if (res.ok) {
        setTickets(res.data.tickets);
        if (!selectedTicketId && res.data.tickets[0]) {
          setSelectedTicketId(res.data.tickets[0].id);
        }
      }
    } finally {
      setLoadingTickets(false);
    }
  }, [isStudent, canSupportStaff, onFetchTickets, selectedTicketId]);

  const loadRegistry = useCallback(async () => {
    if (!canVerifyCerts) return;
    const res = await onFetchCertificateRegistry();
    if (res.ok) setRegistry(res.data.registry);
  }, [canVerifyCerts, onFetchCertificateRegistry]);

  useEffect(() => {
    if (tab === 'tickets') loadTickets();
    if (tab === 'certificates' && canVerifyCerts) loadRegistry();
  }, [tab, loadTickets, loadRegistry, canVerifyCerts]);

  const handleCreateTicket = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingTicket(true);
    try {
      const res = await onCreateTicket({
        subject: subject.trim(),
        message: message.trim(),
        category,
        courseId: courseId || undefined,
        priority,
      });
      if (!res.ok) {
        onToast('error', res.error);
        return;
      }
      setSubject('');
      setMessage('');
      setTickets((prev) => [res.data.ticket, ...prev]);
      setSelectedTicketId(res.data.ticket.id);
      onToast('success', 'Support ticket submitted. Our support team has been notified.');
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !replyText.trim()) return;
    const res = await onReplyTicket(selectedTicketId, replyText.trim());
    if (!res.ok) {
      onToast('error', res.error);
      return;
    }
    setReplyText('');
    setTickets((prev) =>
      prev.map((t) => (t.id === res.data.ticket.id ? res.data.ticket : t))
    );
  };

  const handleLookupCert = async (e: FormEvent) => {
    e.preventDefault();
    if (!certQuery.trim()) return;
    const res = await onVerifyCertificate(certQuery.trim());
    if (!res.ok) {
      onToast('error', res.error);
      return;
    }
    setCertResult({
      checked: true,
      found: res.data.found,
      certificate: res.data.certificate,
    });
  };

  const filteredTickets = tickets
    .filter((t) => statusFilter === 'ALL' || t.status === statusFilter)
    .filter((t) => categoryFilter === 'ALL' || t.category === categoryFilter);

  const selectedTicket =
    filteredTickets.find((t) => t.id === selectedTicketId) ||
    filteredTickets[0] ||
    null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142746]">
            Support Desk &amp; Certificate Verification
          </h1>
          <p className="mt-1 text-sm text-[#718096]">
            {isStudent
              ? 'Ask course or login questions and verify certificate authenticity'
              : 'Resolve student support queries, login help requests, and verify issued certificates'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {(isStudent || canSupportStaff) && (
            <button
              type="button"
              onClick={() => setTab('tickets')}
              className={`inline-flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-xs font-bold whitespace-nowrap cursor-pointer ${
                tab === 'tickets'
                  ? 'bg-[#142746] text-white'
                  : 'border border-[#e3e9f2] bg-white text-[#142746] hover:bg-[#f3f6fb]'
              }`}
            >
              <LifeBuoy className="h-3.5 w-3.5" />
              <span>Support Tickets</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('certificates')}
            className={`inline-flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-xs font-bold whitespace-nowrap cursor-pointer ${
              tab === 'certificates'
                ? 'bg-[#142746] text-white'
                : 'border border-[#e3e9f2] bg-white text-[#142746] hover:bg-[#f3f6fb]'
            }`}
          >
            <Award className="h-3.5 w-3.5 text-[#d7a84b]" />
            <span>Certificate Verification</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SUPPORT TICKETS */}
      {tab === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 space-y-4">
            {isStudent && (
              <form
                onSubmit={handleCreateTicket}
                className="rounded-[15px] border border-[#e3e9f2] bg-white p-4 space-y-3"
              >
                <div className="text-sm font-extrabold text-[#142746] flex items-center gap-1.5">
                  <Plus className="h-4 w-4 text-[#d7a84b]" />
                  <span>Raise a New Support Query</span>
                </div>
                <input
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Short summary (e.g. Unable to open Chapter 3 notes)"
                  className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as SupportTicket['category'])
                    }
                    className="rounded-[9px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs outline-none"
                  >
                    <option value="COURSE_QUERY">Course Query</option>
                    <option value="LOGIN_ISSUE">Login Issue</option>
                    <option value="CERTIFICATE">Certificate Help</option>
                    <option value="TECHNICAL">Technical Issue</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <select
                    value={priority}
                    onChange={(e) =>
                      setPriority(e.target.value as SupportTicket['priority'])
                    }
                    className="rounded-[9px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs outline-none"
                  >
                    <option value="LOW">Priority: Low</option>
                    <option value="MEDIUM">Priority: Medium</option>
                    <option value="HIGH">Priority: High</option>
                  </select>
                </div>
                {courses.length > 0 && (
                  <select
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs outline-none"
                  >
                    <option value="">Related course (optional)</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                )}
                <textarea
                  required
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your question..."
                  className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                />
                <button
                  type="submit"
                  disabled={submittingTicket}
                  className="rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                >
                  {submittingTicket ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </form>
            )}

            <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#142746]">
                  Ticket Queue ({filteredTickets.length})
                </span>
                <div className="flex gap-1.5">
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(
                        e.target.value as 'ALL' | SupportTicket['status']
                      )
                    }
                    className="rounded-md border border-[#e3e9f2] bg-white px-2 py-1 text-[11px] font-semibold"
                  >
                    <option value="ALL">All Status</option>
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                  <select
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(
                        e.target.value as 'ALL' | SupportTicket['category']
                      )
                    }
                    className="rounded-md border border-[#e3e9f2] bg-white px-2 py-1 text-[11px] font-semibold"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="LOGIN_ISSUE">Login Issue</option>
                    <option value="COURSE_QUERY">Course Query</option>
                    <option value="CERTIFICATE">Certificate</option>
                    <option value="TECHNICAL">Technical</option>
                  </select>
                </div>
              </div>

              {loadingTickets ? (
                <p className="text-xs text-[#718096]">Loading tickets...</p>
              ) : filteredTickets.length === 0 ? (
                <p className="text-xs text-[#718096]">No support tickets in this view.</p>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredTickets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`w-full text-left rounded-[10px] border p-3 text-xs transition-colors cursor-pointer ${
                        selectedTicket?.id === t.id
                          ? 'border-[#315b9b] bg-[#f8fafd]'
                          : 'border-[#e3e9f2] bg-white hover:bg-[#f8fafd]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#142746] truncate">
                          {t.subject}
                        </span>
                        <span
                          className={`text-[10px] font-bold shrink-0 ${
                            t.status === 'RESOLVED' || t.status === 'CLOSED'
                              ? 'text-[#13845b]'
                              : t.status === 'OPEN'
                                ? 'text-[#c64b58]'
                                : 'text-[#8c6826]'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[#718096]">
                        {t.studentName} · {t.category} · {t.priority}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            {selectedTicket ? (
              <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e3e9f2] pb-3">
                  <div>
                    <div className="text-xs font-bold text-[#315b9b]">
                      {selectedTicket.category} · Priority {selectedTicket.priority}
                      {selectedTicket.courseTitle ? ` · ${selectedTicket.courseTitle}` : ''}
                    </div>
                    <h2 className="text-base font-extrabold text-[#142746] mt-0.5">
                      {selectedTicket.subject}
                    </h2>
                    <div className="text-[11px] text-[#718096] mt-0.5">
                      From {selectedTicket.studentName} ({selectedTicket.studentEmail}) ·{' '}
                      {new Date(selectedTicket.createdAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                  {canSupportStaff && (
                    <select
                      value={selectedTicket.status}
                      onChange={async (e) => {
                        const st = e.target.value as SupportTicket['status'];
                        const res = await onUpdateTicketStatus(selectedTicket.id, st);
                        if (res.ok) {
                          setTickets((prev) =>
                            prev.map((t) => (t.id === res.data.ticket.id ? res.data.ticket : t))
                          );
                          onToast('success', `Ticket marked ${st}.`);
                        } else {
                          onToast('error', res.error);
                        }
                      }}
                      className="rounded-lg border border-[#e3e9f2] bg-[#f8fafd] px-2.5 py-1.5 text-xs font-bold text-[#142746]"
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="IN_PROGRESS">IN PROGRESS</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  )}
                </div>

                <div className="rounded-[11px] border border-[#e3e9f2] bg-[#f8fafd] p-3.5 text-xs text-[#1d2940] whitespace-pre-wrap">
                  {selectedTicket.message}
                </div>

                <div className="space-y-2.5 max-h-64 overflow-y-auto">
                  {selectedTicket.replies.map((r) => (
                    <div
                      key={r.id}
                      className={`rounded-[11px] border p-3 text-xs ${
                        r.authorRole === 'STUDENT'
                          ? 'border-[#e3e9f2] bg-white'
                          : 'border-[#dce6f7] bg-[#f4f8ff]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#718096] mb-1">
                        <span className="font-bold text-[#142746]">
                          <MessageSquare className="inline h-3 w-3 mr-1" />
                          {r.authorName} ({r.authorRole})
                        </span>
                        <span>{new Date(r.createdAt).toLocaleString('en-IN')}</span>
                      </div>
                      <p className="text-[#1d2940] whitespace-pre-wrap">{r.message}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleReply} className="flex gap-2 pt-2 border-t border-[#e3e9f2]">
                  <input
                    required
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a reply..."
                    className="flex-1 rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5 text-[#d7a84b]" />
                    <span>Send Reply</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-8 text-center text-xs text-[#718096]">
                Select a ticket on the left to read the conversation and respond.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CERTIFICATE VERIFICATION & REGISTRY */}
      {tab === 'certificates' && (
        <div className="space-y-5">
          <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3">
            <h2 className="text-base font-extrabold text-[#142746]">
              Verify Certificate Authenticity by ID
            </h2>
            <form onSubmit={handleLookupCert} className="flex flex-wrap gap-2 max-w-lg">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#718096]" />
                <input
                  required
                  value={certQuery}
                  onChange={(e) => setCertQuery(e.target.value)}
                  placeholder="Enter Certificate No. (e.g. ARYA-XXXXXX-XXXX)"
                  className="w-full rounded-[9px] border border-[#e3e9f2] pl-8 pr-3 py-2 text-xs font-mono uppercase outline-none focus:border-[#315b9b]"
                />
              </div>
              <button
                type="submit"
                className="rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
              >
                Verify Certificate
              </button>
            </form>

            {certResult?.checked && (
              <div
                className={`rounded-[11px] border p-4 text-xs ${
                  !certResult.found
                    ? 'border-[#e3e9f2] bg-[#f8fafd] text-[#718096]'
                    : certResult.certificate?.status === 'REVOKED'
                      ? 'border-[#f5c8ce] bg-[#fff5f6] text-[#c64b58]'
                      : 'border-[#bfe6d5] bg-[#eefaf4] text-[#13845b]'
                }`}
              >
                {!certResult.found ? (
                  <span>No issued certificate matched that ID.</span>
                ) : (
                  <div className="space-y-1">
                    <div className="font-extrabold flex items-center gap-1.5">
                      {certResult.certificate?.status === 'REVOKED' ? (
                        <ShieldAlert className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span>
                        Certificate {certResult.certificate?.certificateNo} ·{' '}
                        {certResult.certificate?.status}
                      </span>
                    </div>
                    <div className="text-[#142746]">
                      Student: <strong>{certResult.certificate?.studentName}</strong> · Course:{' '}
                      <strong>{certResult.certificate?.targetTitle}</strong> · Issued:{' '}
                      {certResult.certificate?.issuedDate}
                    </div>
                    {certResult.certificate?.revokedReason && (
                      <div>Reason: {certResult.certificate.revokedReason}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {canVerifyCerts && (
            <div className="overflow-x-auto rounded-[15px] border border-[#e3e9f2] bg-white">
              <div className="border-b border-[#e3e9f2] px-5 py-3 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#142746]">
                  Issued Certificate Registry ({registry.length})
                </h3>
                <span className="text-[11px] text-[#718096]">
                  Includes custom uploads &amp; 75% auto-earned course certificates
                </span>
              </div>
              <table className="w-full min-w-[740px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
                    <th className="px-4 py-2.5 font-bold">Certificate No.</th>
                    <th className="px-4 py-2.5 font-bold">Student</th>
                    <th className="px-4 py-2.5 font-bold">Course / Bundle</th>
                    <th className="px-4 py-2.5 font-bold">Status</th>
                    {owner && <th className="px-4 py-2.5 font-bold text-right">Owner Control</th>}
                  </tr>
                </thead>
                <tbody>
                  {registry.length === 0 ? (
                    <tr>
                      <td colSpan={owner ? 5 : 4} className="px-4 py-6 text-center text-[#718096]">
                        No certificates issued yet.
                      </td>
                    </tr>
                  ) : (
                    registry.map((r) => (
                      <tr
                        key={r.certificateNo}
                        className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                      >
                        <td className="px-4 py-2.5 font-mono font-bold text-[#142746]">
                          {r.certificateNo}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-[#142746]">{r.studentName}</div>
                          <div className="text-[11px] text-[#718096]">{r.studentEmail}</div>
                        </td>
                        <td className="px-4 py-2.5 text-[#59677d]">{r.targetTitle}</td>
                        <td className="px-4 py-2.5 font-bold">
                          <span
                            className={
                              r.status === 'REVOKED' ? 'text-[#c64b58]' : 'text-[#13845b]'
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                        {owner && (
                          <td className="px-4 py-2.5 text-right">
                            {r.status === 'REVOKED' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await onReinstateCertificate(r.certificateNo);
                                  if (res.ok) {
                                    onToast('success', 'Certificate reinstated.');
                                    loadRegistry();
                                  } else {
                                    onToast('error', res.error || 'Could not reinstate.');
                                  }
                                }}
                                className="rounded-md bg-[#eefaf4] px-2.5 py-1 font-bold text-[#13845b] hover:bg-[#dcf4e8] cursor-pointer"
                              >
                                Reinstate
                              </button>
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                <input
                                  value={revokeReason[r.certificateNo] || ''}
                                  onChange={(e) =>
                                    setRevokeReason((prev) => ({
                                      ...prev,
                                      [r.certificateNo]: e.target.value,
                                    }))
                                  }
                                  placeholder="Revoke reason"
                                  className="w-32 rounded-md border border-[#e3e9f2] px-2 py-1 text-[11px]"
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const res = await onRevokeCertificate(
                                      r.certificateNo,
                                      revokeReason[r.certificateNo] || 'Revoked by Super Admin'
                                    );
                                    if (res.ok) {
                                      onToast('info', 'Certificate revoked.');
                                      loadRegistry();
                                    } else {
                                      onToast('error', res.error || 'Could not revoke.');
                                    }
                                  }}
                                  className="rounded-md border border-[#f5c8ce] bg-[#fff5f6] px-2.5 py-1 font-bold text-[#c64b58] hover:bg-[#ffe8eb] cursor-pointer"
                                >
                                  Revoke
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
