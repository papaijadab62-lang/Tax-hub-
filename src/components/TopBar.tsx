import { useState } from 'react';
import { Bell, LogOut, Menu } from 'lucide-react';
import type { InternalNotification, PageId, User } from '../types/lms';
import { ADMIN_ROLE_LABELS, getEffectiveAdminRole } from '../utils/rbac';

interface TopBarProps {
  user: User;
  notifications: InternalNotification[];
  unreadCount: number;
  onOpenMenu: () => void;
  onNavigate: (page: PageId) => void;
  onMarkNotificationRead: (id: string) => void;
  onMarkAllRead: () => void;
  onLogout: () => void;
}

export function TopBar({
  user,
  notifications,
  unreadCount,
  onOpenMenu,
  onNavigate,
  onMarkNotificationRead,
  onMarkAllRead,
  onLogout,
}: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const initial = (user.name || 'A').charAt(0).toUpperCase();
  const adminRole = getEffectiveAdminRole(user);
  const roleLabel =
    user.role === 'admin'
      ? ADMIN_ROLE_LABELS[adminRole || 'ADMIN']
      : 'Student';

  return (
    <header className="no-print sticky top-0 z-20 flex h-[64px] items-center justify-between gap-6 border-b border-[#e3e9f2] bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-lg border border-[#e3e9f2] bg-white p-2 text-[#142746] hover:bg-[#f3f6fb] md:hidden shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0 truncate">
          <span className="font-bold text-[#142746] truncate">
            Welcome, {user.name}
          </span>
          <span className="text-[#cbd5e1]" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-semibold text-[#718096] whitespace-nowrap shrink-0">
            {roleLabel}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 relative">
        <button
          type="button"
          onClick={() => setNotifOpen((v) => !v)}
          className="relative rounded-lg border border-[#e3e9f2] bg-white p-2 text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-[#c64b58] px-1 font-mono text-[10px] font-bold text-white tabular-nums">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-12 z-30 w-80 max-w-[90vw] rounded-[14px] border border-[#e3e9f2] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e3e9f2] px-4 py-2.5 text-xs">
              <span className="font-extrabold text-[#142746]">
                Notifications ({unreadCount} unread)
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="font-bold text-[#315b9b] hover:underline cursor-pointer"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-[#f1f5f9]">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-[#718096]">
                  No notifications yet.
                </p>
              ) : (
                notifications.slice(0, 15).map((n) => {
                  const isUnread = !n.readByUserIds.includes(user.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        if (isUnread) onMarkNotificationRead(n.id);
                        if (n.actionPage) onNavigate(n.actionPage);
                        setNotifOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-xs hover:bg-[#f8fafd] cursor-pointer ${
                        isUnread ? 'bg-[#f4f8ff]' : 'bg-white'
                      }`}
                    >
                      <div className="font-bold text-[#142746]">{n.title}</div>
                      <div className="text-[#59677d] mt-0.5 line-clamp-2">
                        {n.message}
                      </div>
                      <div className="text-[10px] text-[#718096] mt-0.5">
                        {new Date(n.createdAt).toLocaleString('en-IN')}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div
          className="grid h-8 w-8 place-items-center rounded-full bg-[#e9eef7] text-xs font-extrabold text-[#142746]"
          aria-hidden="true"
        >
          {initial}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-lg border border-[#e3e9f2] bg-white px-3 py-1.5 text-xs font-semibold text-[#142746] hover:bg-[#f3f6fb] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Log out</span>
        </button>
      </div>
    </header>
  );
}
