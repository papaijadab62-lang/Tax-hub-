import type { Course, Order, ProgressMap, User } from '../types/lms';
import {
  getCompletedLessonCount,
  getCourseAccessExpiry,
  getCourseLessons,
  getUserCourseProgress,
  hasBoughtCourse,
  hasPendingOrderForCourse,
  money,
} from '../utils/lms';
import {
  APPROVAL_STATUS_META,
  getCourseApprovalStatus,
  hasPermission,
  isSuperAdmin,
} from '../utils/rbac';

interface CourseCardProps {
  course: Course;
  user: User;
  orders: Order[];
  progress: ProgressMap;
  showCompletionBar?: boolean;
  onEditCourse: (course: Course) => void;
  onAddChapter: (courseId: string) => void;
  onDeleteCourse: (course: Course) => void;
  onManageCourse: (courseId: string) => void;
  onOpenLearning: (courseId: string) => void;
  onCheckout: (courseId: string) => void;
  onSubmitApproval?: (courseId: string) => void;
  onPublishCourse?: (courseId: string) => void;
}

export function CourseCard({
  course,
  user,
  orders,
  progress,
  showCompletionBar = false,
  onEditCourse,
  onAddChapter,
  onDeleteCourse,
  onManageCourse,
  onOpenLearning,
  onCheckout,
  onSubmitApproval,
  onPublishCourse,
}: CourseCardProps) {
  const isAdmin = user.role === 'admin';
  const owner = isSuperAdmin(user);
  const canEdit = owner || hasPermission(user, 'course_edit', course.id);
  const canModule = owner || hasPermission(user, 'module_manage', course.id);
  const canDelete = owner || hasPermission(user, 'course_delete', course.id);
  const canPublish =
    owner ||
    hasPermission(user, 'course_publish') ||
    hasPermission(user, 'course_publish', course.id);
  const canApprove =
    owner ||
    hasPermission(user, 'content_approve') ||
    hasPermission(user, 'content_approve', course.id);
  const showFinancialPrice = !isAdmin || owner;

  const owned = !isAdmin && hasBoughtCourse(user, course, orders);
  const accessExpiry = owned ? getCourseAccessExpiry(user, course, orders) : null;
  const pending = !isAdmin && !owned && hasPendingOrderForCourse(user, course.id, orders);
  const lessons = getCourseLessons(course);
  const completedCount = getCompletedLessonCount(user.id, course, progress);
  const pct =
    owned || showCompletionBar ? getUserCourseProgress(user.id, course, progress) : 0;
  const plans = course.paymentPlans || [];
  const lowestPlan = plans.length
    ? plans.reduce((min, p) => (p.price < min.price ? p : min), plans[0])
    : null;

  const approvalStatus = getCourseApprovalStatus(course);
  const approvalMeta = APPROVAL_STATUS_META[approvalStatus];

  const statusText = isAdmin
    ? approvalStatus === 'PUBLISHED'
      ? 'Published · Live for Students'
      : `${approvalMeta.label} · Hidden from Students`
    : owned
      ? `${pct}% complete`
      : pending
        ? 'Verification in progress · Locked'
        : 'Not purchased';

  return (
    <article className="rounded-[15px] border border-[#e3e9f2] bg-white p-4 sm:p-5 shadow-[0_5px_22px_rgba(23,43,72,0.03)]">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        {/* YouTube-ratio 16:9 Course Thumbnail */}
        <div className="aspect-video w-full md:w-[250px] lg:w-[272px] shrink-0 overflow-hidden rounded-[12px] border border-[#e3e9f2] bg-[#142746] relative">
          {course.thumbnailUrl ? (
            <img
              src={course.thumbnailUrl}
              alt={`${course.title} thumbnail`}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-[#142746] via-[#1c355e] to-[#0f1d34] p-4 text-white">
              <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#d7a84b]">
                {course.category || 'Tax & Compliance'}
              </div>
              <div className="text-sm font-extrabold leading-snug text-white line-clamp-2 text-balance">
                {course.title}
              </div>
              <div className="text-[11px] font-semibold text-[#cbd5e1] tabular-nums">
                {(course.chapters || []).length} Chapters · {lessons.length} Lessons
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#718096]">
            <span className="font-bold text-[#8c6826]">
              {course.category || 'Tax & Finance'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {(course.chapters || []).length}{' '}
              {(course.chapters || []).length === 1 ? 'chapter' : 'chapters'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={`tabular-nums ${
                isAdmin
                  ? 'font-semibold'
                  : owned
                    ? 'text-[#13845b] font-semibold'
                    : pending
                      ? 'text-[#8c6826] font-semibold'
                      : ''
              }`}
              style={isAdmin ? { color: approvalMeta.color } : undefined}
            >
              {statusText}
            </span>
            {accessExpiry && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#315b9b] tabular-nums">
                  Valid till{' '}
                  {new Date(accessExpiry).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </>
            )}
          </div>

          <h3 className="mt-1.5 text-base font-bold text-[#142746] leading-snug">
            {course.title}
          </h3>
          {course.description && (
            <p className="mt-1 text-xs text-[#718096] line-clamp-2 max-w-2xl leading-relaxed">
              {course.description}
            </p>
          )}

          {owned && !showCompletionBar && (
            <div className="mt-3 max-w-md">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#e9edf4]">
                <div
                  className="h-full bg-[#13845b] transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          {showFinancialPrice && (
            <div className="text-left sm:text-right">
              <div className="font-mono text-lg font-extrabold text-[#142746] tabular-nums">
                {money(course.price)}
              </div>
              {lowestPlan && (
                <div className="text-[11px] font-semibold text-[#315b9b] tabular-nums">
                  Or from {money(lowestPlan.price)} / {lowestPlan.months}{' '}
                  {lowestPlan.months === 1 ? 'mo' : 'mos'}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onEditCourse(course)}
                    className="rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-1.5 text-xs font-semibold text-[#142746] hover:bg-[#f3f6fb] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Edit
                  </button>
                )}
                {canModule && (
                  <button
                    type="button"
                    onClick={() => onAddChapter(course.id)}
                    className="rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-1.5 text-xs font-semibold text-[#142746] hover:bg-[#f3f6fb] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    + Chapter
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onDeleteCourse(course)}
                    className="rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-1.5 text-xs font-semibold text-[#c64b58] hover:bg-[#fff0f1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Delete
                  </button>
                )}
                {canEdit &&
                  onSubmitApproval &&
                  (approvalStatus === 'DRAFT' || approvalStatus === 'NEEDS_REVISION') && (
                    <button
                      type="button"
                      onClick={() => onSubmitApproval(course.id)}
                      className="rounded-[9px] border border-[#f1dca7] bg-[#fffaf0] px-3 py-1.5 text-xs font-bold text-[#8c6826] hover:bg-[#fef3d6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Submit for Review
                    </button>
                  )}
                {canPublish &&
                  onPublishCourse &&
                  approvalStatus !== 'PUBLISHED' &&
                  (approvalStatus === 'APPROVED' || canApprove) && (
                    <button
                      type="button"
                      onClick={() => onPublishCourse(course.id)}
                      className="rounded-[9px] bg-[#13845b] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f6c4a] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Publish Live
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => onManageCourse(course.id)}
                  className="rounded-[9px] bg-[#edf2fa] px-3.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Curriculum
                </button>
              </>
            ) : owned ? (
              <button
                type="button"
                onClick={() => onOpenLearning(course.id)}
                className="rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Continue learning
              </button>
            ) : pending ? (
              <button
                type="button"
                disabled
                title="Payment proof submitted — course unlocks automatically once Owner verifies payment"
                className="rounded-[9px] border border-[#f1dca7] bg-[#fffaf0] px-4 py-2 text-xs font-bold text-[#8c6826] whitespace-nowrap shrink-0 cursor-not-allowed"
              >
                Verification in Progress
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onCheckout(course.id)}
                className="rounded-[9px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#18243a] hover:bg-[#cca042] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Buy course
              </button>
            )}
          </div>
        </div>
      </div>

      {showCompletionBar && (
        <div className="mt-4 border-t border-[#e3e9f2] pt-3.5">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-[#59677d]">
              <span className="font-semibold text-[#142746]">Course Progress</span>
              <span className="text-[#94a3b8]" aria-hidden="true">
                ·
              </span>
              <span className="tabular-nums text-[#718096]">
                {completedCount} of {lessons.length}{' '}
                {lessons.length === 1 ? 'lesson' : 'lessons'} completed
              </span>
            </div>
            <span
              className={`font-mono font-bold tabular-nums ${
                pct >= 100
                  ? 'text-[#13845b]'
                  : pct > 0
                    ? 'text-[#142746]'
                    : 'text-[#718096]'
              }`}
            >
              {pct}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${course.title} completion ${pct}%`}
            className="h-2.5 w-full overflow-hidden rounded-full bg-[#e9edf4]"
          >
            <div
              className="h-full rounded-full bg-[#13845b] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </article>
  );
}
