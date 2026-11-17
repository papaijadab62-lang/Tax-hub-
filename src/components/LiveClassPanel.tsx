import { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Pencil,
  Trash2,
  Video,
} from 'lucide-react';
import type { LiveClassSession, LivePlatformType } from '../types/lms';
import { normalizeExternalUrl } from './PlatformLinksPanel';

const PLATFORM_LABELS: Record<
  LivePlatformType,
  { name: string; accentClass: string; iconBgClass: string }
> = {
  zoom: {
    name: 'Zoom Live Class',
    accentClass: 'text-[#2563eb]',
    iconBgClass: 'bg-[#2563eb] text-white',
  },
  meet: {
    name: 'Google Meet Class',
    accentClass: 'text-[#13845b]',
    iconBgClass: 'bg-[#13845b] text-white',
  },
  teams: {
    name: 'Microsoft Teams Class',
    accentClass: 'text-[#4f46e5]',
    iconBgClass: 'bg-[#4f46e5] text-white',
  },
  other: {
    name: 'Live Webinar Session',
    accentClass: 'text-[#142746]',
    iconBgClass: 'bg-[#142746] text-[#d7a84b]',
  },
};

function formatScheduleLabel(scheduledAt: string): string {
  if (!scheduledAt) return 'Scheduled session';
  const dt = new Date(scheduledAt);
  if (Number.isNaN(dt.getTime())) return scheduledAt;
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function computeTimingState(
  scheduledAt: string,
  durationMinutes: number,
  nowMs: number
): { label: string; toneClass: string } {
  if (!scheduledAt) {
    return { label: 'Join Link Active', toneClass: 'text-[#13845b]' };
  }
  const startMs = Date.parse(scheduledAt);
  if (Number.isNaN(startMs)) {
    return { label: 'Scheduled', toneClass: 'text-[#315b9b]' };
  }
  const endMs = startMs + Math.max(15, durationMinutes || 60) * 60_000;
  const diffMin = Math.round((startMs - nowMs) / 60_000);

  if (nowMs >= startMs - 10 * 60_000 && nowMs <= endMs) {
    return { label: 'Live Now', toneClass: 'text-[#13845b]' };
  }
  if (diffMin > 0 && diffMin < 60) {
    return { label: `Starts in ${diffMin}m`, toneClass: 'text-[#8c6826]' };
  }
  if (diffMin >= 60 && diffMin < 24 * 60) {
    const hrs = Math.round(diffMin / 60);
    return { label: `Starts in ${hrs}h`, toneClass: 'text-[#315b9b]' };
  }
  if (nowMs > endMs) {
    return { label: 'Session Window Passed', toneClass: 'text-[#718096]' };
  }
  return { label: 'Upcoming Class', toneClass: 'text-[#315b9b]' };
}

export function LiveClassPanel({
  session,
  isAdmin,
  onEdit,
  onClear,
}: {
  session: LiveClassSession | null;
  isAdmin: boolean;
  onEdit: () => void;
  onClear: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const hasPublishedClass = Boolean(
    session && session.active && session.meetingUrl.trim()
  );

  // Students only see this panel when a live class is scheduled & active
  if (!isAdmin && !hasPublishedClass) {
    return null;
  }

  const copyValue = async (key: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch {
      // ignore clipboard errors if blocked
    }
  };

  if (!session || !session.meetingUrl.trim()) {
    return (
      <section
        aria-label="Live Zoom or Google Meet class scheduler"
        className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-dashed border-[#c7d6ec] bg-white px-5 py-4"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-[#edf2fa] text-[#142746]">
            <Video className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#8c6826]">
              Live Classroom Schedule
            </div>
            <h2 className="text-sm font-extrabold text-[#142746]">
              No Live Zoom or Google Meet Class Scheduled
            </h2>
            <p className="mt-0.5 text-xs text-[#718096]">
              Schedule a live session link here — it appears automatically on the student Dashboard across all devices.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Video className="h-3.5 w-3.5 text-[#d7a84b]" />
          <span>Schedule Live Class</span>
        </button>
      </section>
    );
  }

  const meta = PLATFORM_LABELS[session.platform] || PLATFORM_LABELS.other;
  const timing = computeTimingState(
    session.scheduledAt,
    session.durationMinutes,
    nowMs
  );
  const href = normalizeExternalUrl(session.meetingUrl);

  return (
    <section
      aria-label="Scheduled live class"
      className={`mb-6 rounded-[16px] border bg-white p-4 sm:p-5 shadow-[0_6px_22px_rgba(20,39,70,0.05)] ${
        session.active ? 'border-[#b9d6c8]' : 'border-[#e3e9f2] opacity-85'
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-[12px] shadow-sm ${meta.iconBgClass}`}
          >
            <Video className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold">
              <span className={meta.accentClass}>{meta.name}</span>
              <span className="text-[#cbd5e1]" aria-hidden="true">
                ·
              </span>
              <span className={timing.toneClass}>{timing.label}</span>
              {session.courseTitle && (
                <>
                  <span className="text-[#cbd5e1]" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[#59677d]">{session.courseTitle}</span>
                </>
              )}
              {!session.active && isAdmin && (
                <>
                  <span className="text-[#cbd5e1]" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[#c64b58]">
                    Hidden from Students
                  </span>
                </>
              )}
            </div>

            <h2 className="mt-1 text-base sm:text-lg font-extrabold text-[#142746] text-balance">
              {session.title}
            </h2>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#59677d]">
              <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                <Calendar className="h-3.5 w-3.5 text-[#315b9b]" />
                <span>{formatScheduleLabel(session.scheduledAt)}</span>
              </span>
              <span className="text-[#cbd5e1]" aria-hidden="true">
                ·
              </span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Clock className="h-3.5 w-3.5 text-[#8c6826]" />
                <span>{session.durationMinutes} min</span>
              </span>
              {session.instructorName && (
                <>
                  <span className="text-[#cbd5e1]" aria-hidden="true">
                    ·
                  </span>
                  <span>Host: {session.instructorName}</span>
                </>
              )}
            </div>

            {(session.meetingId || session.passcode) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#59677d]">
                {session.meetingId && (
                  <button
                    type="button"
                    onClick={() => copyValue('id', session.meetingId!)}
                    className="inline-flex items-center gap-1.5 font-mono tabular-nums text-[#142746] hover:text-[#315b9b] cursor-pointer"
                    title="Copy Meeting ID"
                  >
                    <span>ID: {session.meetingId}</span>
                    {copiedKey === 'id' ? (
                      <Check className="h-3.5 w-3.5 text-[#13845b]" />
                    ) : (
                      <Copy className="h-3 w-3 text-[#718096]" />
                    )}
                  </button>
                )}
                {session.passcode && (
                  <button
                    type="button"
                    onClick={() => copyValue('pass', session.passcode!)}
                    className="inline-flex items-center gap-1.5 font-mono tabular-nums text-[#142746] hover:text-[#315b9b] cursor-pointer"
                    title="Copy Passcode"
                  >
                    <span>Passcode: {session.passcode}</span>
                    {copiedKey === 'pass' ? (
                      <Check className="h-3.5 w-3.5 text-[#13845b]" />
                    ) : (
                      <Copy className="h-3 w-3 text-[#718096]" />
                    )}
                  </button>
                )}
              </div>
            )}

            {session.notes && (
              <p className="mt-2 text-xs leading-relaxed text-[#59677d] max-w-2xl">
                {session.notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#13845b] px-4 py-2 text-xs font-bold text-white hover:bg-[#0f6d4b] transition-colors whitespace-nowrap shrink-0"
          >
            <span>Join Live Class</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <button
            type="button"
            onClick={() => copyValue('link', href)}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] px-3 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedKey === 'link' ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#13845b]" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-[#718096]" />
                <span>Copy Link</span>
              </>
            )}
          </button>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#dce6f7] bg-white px-3 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5 text-[#8c6826]" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={onClear}
                aria-label="Remove live class schedule"
                title="Remove live class"
                className="inline-flex items-center gap-1 rounded-[10px] border border-[#f3bcc2] bg-[#fff0f1] px-2.5 py-2 text-xs font-bold text-[#c64b58] hover:bg-[#ffe2e5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
