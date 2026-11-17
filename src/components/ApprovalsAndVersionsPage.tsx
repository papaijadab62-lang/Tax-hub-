import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Clock,
  FileCheck2,
  History,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
import type {
  Course,
  CourseApprovalStatus,
  CourseVersionRecord,
  User,
} from '../types/lms';
import {
  APPROVAL_STATUS_META,
  getCourseApprovalStatus,
  hasPermission,
  isSuperAdmin,
} from '../utils/rbac';

interface ApprovalsAndVersionsPageProps {
  currentUser: User;
  courses: Course[];
  onSubmitForApproval: (
    courseId: string,
    note?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onApproveCourse: (
    courseId: string,
    note?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onPublishCourse: (
    courseId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onRejectCourse: (
    courseId: string,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onRequestRevision: (
    courseId: string,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onArchiveCourse: (
    courseId: string,
    reason?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onFetchVersions: (
    courseId: string
  ) => Promise<
    { ok: true; data: { versions: CourseVersionRecord[] } } | { ok: false; error: string }
  >;
  onRestoreVersion: (
    courseId: string,
    versionId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function ApprovalsAndVersionsPage({
  currentUser,
  courses,
  onSubmitForApproval,
  onApproveCourse,
  onPublishCourse,
  onRejectCourse,
  onRequestRevision,
  onArchiveCourse,
  onFetchVersions,
  onRestoreVersion,
  onToast,
}: ApprovalsAndVersionsPageProps) {
  const owner = isSuperAdmin(currentUser);
  const [filter, setFilter] = useState<'ALL' | CourseApprovalStatus>('ALL');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    courses[0]?.id || ''
  );
  const [versions, setVersions] = useState<CourseVersionRecord[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [actionNote, setActionNote] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const selectedCourse =
    courses.find((c) => c.id === selectedCourseId) || courses[0] || null;

  const loadVersions = useCallback(
    async (courseId: string) => {
      if (!courseId) return;
      setLoadingVersions(true);
      try {
        const res = await onFetchVersions(courseId);
        if (res.ok) setVersions(res.data.versions);
        else setVersions([]);
      } finally {
        setLoadingVersions(false);
      }
    },
    [onFetchVersions]
  );

  useEffect(() => {
    if (selectedCourse?.id) {
      loadVersions(selectedCourse.id);
    } else {
      setVersions([]);
    }
  }, [selectedCourse?.id, loadVersions]);

  const filtered = courses.filter(
    (c) => filter === 'ALL' || getCourseApprovalStatus(c) === filter
  );

  const runAction = async (
    courseId: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string
  ) => {
    setBusyId(courseId);
    try {
      const res = await fn();
      if (!res.ok) {
        onToast('error', res.error || 'Action not permitted.');
        return;
      }
      onToast('success', successMsg);
      if (selectedCourse?.id === courseId) {
        loadVersions(courseId);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142746]">
            Course Approval Workflow &amp; Version History
          </h1>
          <p className="mt-1 text-sm text-[#718096]">
            Review course submissions, publish approved training modules, and restore timestamped course snapshots
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              'ALL',
              'PENDING_APPROVAL',
              'DRAFT',
              'NEEDS_REVISION',
              'APPROVED',
              'PUBLISHED',
              'REJECTED',
              'ARCHIVED',
            ] as const
          ).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilter(st)}
              className={`rounded-[8px] px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                filter === st
                  ? 'bg-[#142746] text-white'
                  : 'border border-[#e3e9f2] bg-white text-[#59677d] hover:bg-[#f3f6fb]'
              }`}
            >
              {st === 'ALL' ? `All (${courses.length})` : APPROVAL_STATUS_META[st].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: Course Approval Cards */}
        <div className="xl:col-span-7 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-[15px] border border-dashed border-[#d9e1ec] bg-white p-10 text-center text-sm text-[#718096]">
              No courses in this workflow stage.
            </div>
          ) : (
            filtered.map((c) => {
              const status = getCourseApprovalStatus(c);
              const meta = APPROVAL_STATUS_META[status];
              const noteVal = actionNote[c.id] || '';
              const canApprove =
                owner ||
                hasPermission(currentUser, 'content_approve') ||
                hasPermission(currentUser, 'content_approve', c.id);
              const canPublish =
                owner ||
                hasPermission(currentUser, 'course_publish') ||
                hasPermission(currentUser, 'course_publish', c.id);
              const canEdit = owner || hasPermission(currentUser, 'course_edit', c.id);
              const canArchive = owner || hasPermission(currentUser, 'course_delete', c.id);
              const isSelected = selectedCourse?.id === c.id;

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCourseId(c.id)}
                  className={`rounded-[15px] border bg-white p-4 transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#315b9b] shadow-sm'
                      : 'border-[#e3e9f2] hover:border-[#b7c8e0]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold" style={{ color: meta.color }}>
                        {meta.label} · Stages ({c.approvalHistory?.length || 1})
                        {c.category ? ` · ${c.category}` : ''}
                      </div>
                      <h3 className="mt-0.5 text-base font-extrabold text-[#142746]">
                        {c.title}
                      </h3>
                      {(c.reviewedByName || c.submittedByName || c.createdByName) && (
                        <div className="text-[11px] text-[#718096]">
                          Last updated by {c.reviewedByName || c.submittedByName || c.createdByName}
                          {c.updatedAt
                            ? ` on ${new Date(c.updatedAt).toLocaleDateString('en-IN')}`
                            : ''}
                        </div>
                      )}
                    </div>
                    <span className="font-mono text-[11px] font-bold text-[#59677d] tabular-nums">
                      {c.chapters.length} chapters
                    </span>
                  </div>

                  {c.approvalNote && (
                    <div className="mt-2.5 rounded-[9px] border border-[#f5c8ce] bg-[#fff5f6] px-3 py-2 text-xs text-[#c64b58]">
                      <strong>Reviewer Note:</strong> {c.approvalNote}
                    </div>
                  )}

                  <div
                    className="mt-3 pt-3 border-t border-[#f1f5f9] space-y-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      value={noteVal}
                      onChange={(e) =>
                        setActionNote((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      placeholder="Optional note or revision/rejection reason..."
                      className="w-full rounded-[8px] border border-[#e3e9f2] bg-[#f8fafd] px-2.5 py-1.5 text-xs outline-none focus:border-[#315b9b]"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      {canEdit &&
                        (status === 'DRAFT' ||
                          status === 'NEEDS_REVISION' ||
                          status === 'REJECTED') && (
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() =>
                              runAction(
                                c.id,
                                () => onSubmitForApproval(c.id, noteVal || undefined),
                                `"${c.title}" submitted for review.`
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-[8px] bg-[#315b9b] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#24487e] cursor-pointer"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span>Submit for Approval</span>
                          </button>
                        )}

                      {canApprove && status === 'PENDING_APPROVAL' && (
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() =>
                            runAction(
                              c.id,
                              () => onApproveCourse(c.id, noteVal || undefined),
                              `"${c.title}" marked Approved.`
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-[8px] bg-[#13845b] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Approve</span>
                        </button>
                      )}

                      {canPublish && status !== 'PUBLISHED' && status !== 'ARCHIVED' && (
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() =>
                            runAction(
                              c.id,
                              () => onPublishCourse(c.id),
                              `"${c.title}" is now Published & live for students.`
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-[8px] bg-[#142746] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                        >
                          <FileCheck2 className="h-3.5 w-3.5 text-[#d7a84b]" />
                          <span>Publish Live</span>
                        </button>
                      )}

                      {canApprove &&
                        (status === 'PENDING_APPROVAL' || status === 'PUBLISHED') && (
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() => {
                              if (!noteVal.trim()) {
                                onToast('error', 'Enter a revision note above first.');
                                return;
                              }
                              runAction(
                                c.id,
                                () => onRequestRevision(c.id, noteVal.trim()),
                                `Revision requested for "${c.title}".`
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-[8px] border border-[#f1dca7] bg-[#fffdf7] px-2.5 py-1.5 text-xs font-bold text-[#8c6826] hover:bg-[#faf4e4] cursor-pointer"
                          >
                            <Clock className="h-3.5 w-3.5" />
                            <span>Request Revision</span>
                          </button>
                        )}

                      {canApprove && status === 'PENDING_APPROVAL' && (
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => {
                            if (!noteVal.trim()) {
                              onToast('error', 'Enter a rejection reason above first.');
                              return;
                            }
                            runAction(
                              c.id,
                              () => onRejectCourse(c.id, noteVal.trim()),
                              `"${c.title}" marked Rejected.`
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded-[8px] border border-[#f5c8ce] bg-[#fff5f6] px-2.5 py-1.5 text-xs font-bold text-[#c64b58] hover:bg-[#ffe8eb] cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Reject</span>
                        </button>
                      )}

                      {canArchive && status !== 'ARCHIVED' && (
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() =>
                            runAction(
                              c.id,
                              () => onArchiveCourse(c.id, noteVal || undefined),
                              `"${c.title}" archived.`
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-[8px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#59677d] hover:bg-[#f3f6fb] cursor-pointer"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          <span>Archive</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Version History & Approval Timeline */}
        <div className="xl:col-span-5 space-y-4">
          {selectedCourse ? (
            <>
              <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-[#142746] flex items-center gap-2">
                    <History className="h-4 w-4 text-[#315b9b]" />
                    <span>Version Snapshots · {selectedCourse.title}</span>
                  </h2>
                  <span className="font-mono text-xs font-bold text-[#315b9b]">
                    {versions.length} snapshot{versions.length === 1 ? '' : 's'}
                  </span>
                </div>

                {loadingVersions ? (
                  <p className="text-xs text-[#718096]">Loading version history...</p>
                ) : versions.length === 0 ? (
                  <p className="text-xs text-[#718096]">
                    Snapshots are recorded automatically whenever course modules or lessons are modified.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {versions.map((v) => {
                      const canRestore =
                        owner || hasPermission(currentUser, 'version_restore', selectedCourse.id);
                      return (
                        <div
                          key={v.id}
                          className="flex items-start justify-between gap-2 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] p-3 text-xs"
                        >
                          <div>
                            <div className="font-bold text-[#142746]">
                              Version #{v.versionNumber} · {v.summary}
                            </div>
                            <div className="text-[11px] text-[#718096]">
                              By {v.editorName} ·{' '}
                              {new Date(v.createdAt).toLocaleString('en-IN')} ·{' '}
                              {v.snapshot.chapters.length} chapters
                            </div>
                          </div>
                          {canRestore && (
                            <button
                              type="button"
                              onClick={() =>
                                runAction(
                                  selectedCourse.id,
                                  () => onRestoreVersion(selectedCourse.id, v.id),
                                  `Restored "${selectedCourse.title}" to Version #${v.versionNumber}.`
                                )
                              }
                              className="inline-flex items-center gap-1 shrink-0 rounded-md border border-[#dce6f7] bg-white px-2.5 py-1 font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
                            >
                              <RotateCcw className="h-3 w-3 text-[#315b9b]" />
                              <span>Restore</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-2.5">
                <h2 className="text-sm font-extrabold text-[#142746]">
                  Approval Decision Timeline
                </h2>
                {!selectedCourse.approvalHistory?.length ? (
                  <p className="text-xs text-[#718096]">
                    No workflow state transitions recorded for this course yet.
                  </p>
                ) : (
                  <div className="space-y-2 text-xs">
                    {selectedCourse.approvalHistory.map((h) => (
                      <div
                        key={h.id}
                        className="border-b border-[#f1f5f9] pb-2 last:border-b-0"
                      >
                        <div className="font-bold text-[#142746]">
                          {APPROVAL_STATUS_META[h.status]?.label || h.status} · {h.actorName} ({h.actorRole})
                        </div>
                        {h.note && <div className="text-[#59677d] mt-0.5">{h.note}</div>}
                        <div className="font-mono text-[10px] text-[#718096]">
                          {new Date(h.timestamp).toLocaleString('en-IN')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 text-xs text-[#718096]">
              Select a course to inspect its version history and approval trail.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
