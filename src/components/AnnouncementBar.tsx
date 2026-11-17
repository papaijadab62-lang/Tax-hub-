import { ArrowRight, BookOpen, CalendarClock, Megaphone, X } from 'lucide-react';
import type { Announcement, AnnouncementCategory, PageId } from '../types/lms';

const CATEGORY_META: Record<
  AnnouncementCategory,
  {
    label: string;
    containerClass: string;
    iconWrapClass: string;
    labelClass: string;
  }
> = {
  update: {
    label: 'Important Update',
    containerClass: 'border-[#d3dff2] bg-[#f4f8ff]',
    iconWrapClass: 'bg-[#e6eefc] text-[#142746]',
    labelClass: 'text-[#315b9b]',
  },
  exam: {
    label: 'Exam Schedule',
    containerClass: 'border-[#ebd6a7] bg-[#fefaf0]',
    iconWrapClass: 'bg-[#f8eccb] text-[#7a5818]',
    labelClass: 'text-[#8c6826]',
  },
  course: {
    label: 'New Course',
    containerClass: 'border-[#bfe5d5] bg-[#f2fbf7]',
    iconWrapClass: 'bg-[#dcf5ea] text-[#13845b]',
    labelClass: 'text-[#13845b]',
  },
};

export function AnnouncementBar({
  announcement,
  isAdmin,
  onDismiss,
  onNavigate,
  onEdit,
}: {
  announcement: Announcement;
  isAdmin: boolean;
  onDismiss: () => void;
  onNavigate: (page: PageId) => void;
  onEdit?: () => void;
}) {
  const meta = CATEGORY_META[announcement.category] || CATEGORY_META.update;
  const Icon =
    announcement.category === 'exam'
      ? CalendarClock
      : announcement.category === 'course'
        ? BookOpen
        : Megaphone;

  const formattedDate = (() => {
    try {
      return new Date(announcement.updatedAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return '';
    }
  })();

  return (
    <section
      aria-label="Portal announcement"
      className={`mb-5 rounded-[14px] border px-4 py-3.5 transition-opacity ${meta.containerClass}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${meta.iconWrapClass}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <span className={meta.labelClass}>{meta.label}</span>
              {formattedDate && (
                <>
                  <span className="text-[#94a3b8]" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[#718096] tabular-nums">
                    Updated {formattedDate}
                  </span>
                </>
              )}
              {announcement.title && (
                <>
                  <span className="text-[#94a3b8]" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-bold text-[#142746]">
                    {announcement.title}
                  </span>
                </>
              )}
            </div>
            <p className="mt-1 text-sm font-medium leading-relaxed text-[#1d2940]">
              {announcement.message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          {announcement.actionPage && announcement.actionLabel && (
            <button
              type="button"
              onClick={() => onNavigate(announcement.actionPage!)}
              className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#142746] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#1e3761] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{announcement.actionLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {isAdmin && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-[9px] border border-[#d0dae8] bg-white px-3 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Edit Broadcast
            </button>
          )}

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss announcement"
            title="Dismiss announcement"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-[#59677d] hover:bg-black/5 hover:text-[#142746] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
