import type { ReactNode } from 'react';
import {
  ExternalLink,
  Globe,
  Instagram,
  Link2,
  MessageCircle,
  Pencil,
  Send,
  Share2,
  Youtube,
} from 'lucide-react';
import type {
  PlatformLink,
  PlatformLinksConfig,
  SocialPlatformType,
} from '../types/lms';

export function normalizeExternalUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '#';
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

const PLATFORM_META: Record<
  SocialPlatformType,
  {
    name: string;
    cardClass: string;
    iconBgClass: string;
    icon: ReactNode;
  }
> = {
  whatsapp: {
    name: 'WhatsApp',
    cardClass:
      'border-[#bbf7d0] bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7]/70 hover:border-[#16a34a]',
    iconBgClass: 'bg-[#16a34a] text-white',
    icon: <MessageCircle className="h-4.5 w-4.5" />,
  },
  youtube: {
    name: 'YouTube',
    cardClass:
      'border-[#fecaca] bg-gradient-to-br from-[#fef2f2] to-[#fee2e2]/70 hover:border-[#dc2626]',
    iconBgClass: 'bg-[#dc2626] text-white',
    icon: <Youtube className="h-4.5 w-4.5" />,
  },
  telegram: {
    name: 'Telegram',
    cardClass:
      'border-[#bae6fd] bg-gradient-to-br from-[#f0f9ff] to-[#e0f2fe]/70 hover:border-[#0284c7]',
    iconBgClass: 'bg-[#0284c7] text-white',
    icon: <Send className="h-4 w-4" />,
  },
  instagram: {
    name: 'Instagram',
    cardClass:
      'border-[#fecdd3] bg-gradient-to-br from-[#fff1f2] via-[#ffe4e6]/70 to-[#fef3c7]/60 hover:border-[#e11d48]',
    iconBgClass: 'bg-gradient-to-tr from-[#f59e0b] via-[#e11d48] to-[#9333ea] text-white',
    icon: <Instagram className="h-4.5 w-4.5" />,
  },
  facebook: {
    name: 'Facebook',
    cardClass:
      'border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-[#dbeafe]/70 hover:border-[#2563eb]',
    iconBgClass: 'bg-[#2563eb] text-white',
    icon: <Share2 className="h-4 w-4" />,
  },
  website: {
    name: 'Official Link',
    cardClass:
      'border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-[#fef3c7]/70 hover:border-[#b45309]',
    iconBgClass: 'bg-[#142746] text-[#f3cf7a]',
    icon: <Globe className="h-4.5 w-4.5" />,
  },
  other: {
    name: 'Platform Link',
    cardClass:
      'border-[#d3dff2] bg-gradient-to-br from-[#f8fafd] to-[#edf2fa] hover:border-[#315b9b]',
    iconBgClass: 'bg-[#315b9b] text-white',
    icon: <Link2 className="h-4.5 w-4.5" />,
  },
};

export function PlatformLinksPanel({
  config,
  isAdmin,
  onEdit,
}: {
  config: PlatformLinksConfig;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  const visibleLinks: PlatformLink[] = (config.links || []).filter((link) =>
    isAdmin ? Boolean(link.label || link.url) : link.active && Boolean(link.url.trim())
  );

  if (!isAdmin && visibleLinks.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Important Platform and Social Media Links"
      className="mb-6 rounded-[16px] border border-[#dce6f5] bg-white p-4 sm:p-5 shadow-[0_6px_22px_rgba(20,39,70,0.05)]"
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-[#142746]">
            {config.heading || 'Important Links & Student Community'}
          </h2>
          {config.subtitle && (
            <p className="mt-0.5 text-xs text-[#718096]">{config.subtitle}</p>
          )}
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#142746] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#1e3761] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5 text-[#d7a84b]" />
            <span>
              {visibleLinks.length > 0
                ? 'Edit Social & WhatsApp Links'
                : 'Add WhatsApp & Social Links'}
            </span>
          </button>
        )}
      </div>

      {visibleLinks.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#cbd5e1] bg-[#f8fafd] p-5 text-center">
          <p className="text-xs text-[#59677d]">
            Add WhatsApp support groups, YouTube channel, Telegram, Instagram,
            Facebook, or important portal links so students can connect directly
            from their Dashboard.
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="mt-3 rounded-[9px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#cca042] cursor-pointer"
          >
            Configure Platform Links
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleLinks.map((item) => {
            const meta = PLATFORM_META[item.platform] || PLATFORM_META.other;
            const href = normalizeExternalUrl(item.url);
            const hasUrl = Boolean(item.url.trim());

            return (
              <a
                key={item.id}
                href={hasUrl ? href : undefined}
                target={hasUrl ? '_blank' : undefined}
                rel={hasUrl ? 'noopener noreferrer' : undefined}
                onClick={(e) => {
                  if (!hasUrl) {
                    e.preventDefault();
                    if (isAdmin) onEdit();
                  }
                }}
                className={`group flex items-center justify-between gap-3 rounded-[13px] border p-3.5 transition-all ${meta.cardClass} ${
                  !item.active ? 'opacity-60' : ''
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-[11px] shadow-sm ${meta.iconBgClass}`}
                  >
                    {meta.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#59677d]">
                      <span>{meta.name}</span>
                      {!item.active && isAdmin && (
                        <span className="text-[#c64b58]">· Hidden</span>
                      )}
                    </div>
                    <div className="truncate text-sm font-extrabold text-[#142746]">
                      {item.label}
                    </div>
                    {item.subtitle && (
                      <div className="truncate text-[11px] text-[#59677d]">
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-[#59677d] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#142746]" />
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
