import {
  Award,
  BookOpen,
  CreditCard,
  FileCheck2,
  Home,
  LifeBuoy,
  Percent,
  PlayCircle,
  Settings,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import type { PageId, User } from '../types/lms';
import { getEffectiveAdminRole, hasPermission, isSuperAdmin } from '../utils/rbac';

interface SidebarProps {
  activePage: PageId;
  user: User;
  brandName: string;
  open: boolean;
  pendingOrdersCount: number;
  onNavigate: (page: PageId) => void;
  onClose: () => void;
}

interface NavItem {
  id: PageId;
  label: string;
  visible: boolean;
  icon: typeof Home;
  count?: number;
}

export function Sidebar({
  activePage,
  user,
  brandName,
  open,
  pendingOrdersCount,
  onNavigate,
  onClose,
}: SidebarProps) {
  const isAdmin = user.role === 'admin';
  const owner = isSuperAdmin(user);
  const adminRole = getEffectiveAdminRole(user);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', visible: true, icon: Home },
    {
      id: 'courses',
      label: 'All Courses',
      visible: !isAdmin || adminRole !== 'STUDENT_SUPPORT',
      icon: BookOpen,
    },
    {
      id: 'mycourses',
      label: isAdmin ? 'Curriculum Editor' : 'My Learning',
      visible: !isAdmin || owner || adminRole !== 'STUDENT_SUPPORT',
      icon: PlayCircle,
    },
    {
      id: 'approvals',
      label: 'Approvals & Versions',
      visible:
        isAdmin &&
        (owner ||
          hasPermission(user, 'content_approve') ||
          hasPermission(user, 'course_create') ||
          hasPermission(user, 'course_edit') ||
          hasPermission(user, 'course_publish') ||
          hasPermission(user, 'version_restore')),
      icon: FileCheck2,
    },
    {
      id: 'students',
      label: 'Students',
      visible: isAdmin && (owner || hasPermission(user, 'student_view')),
      icon: Users,
    },
    // STRICT FINANCIAL ISOLATION: Orders, Promos & Portal Settings visible to MAIN SUPER ADMIN ONLY
    {
      id: 'orders',
      label: 'Payments & Orders',
      visible: isAdmin && owner,
      icon: CreditCard,
      count: pendingOrdersCount,
    },
    {
      id: 'promos',
      label: 'Coupons & Bundles',
      visible: isAdmin && owner,
      icon: Percent,
    },
    {
      id: 'admin_team',
      label: 'Admin Team & RBAC',
      visible: isAdmin && (owner || hasPermission(user, 'admin_manage')),
      icon: ShieldCheck,
    },
    {
      id: 'audit_logs',
      label: 'Audit & Security',
      visible: isAdmin,
      icon: ShieldAlert,
    },
    {
      id: 'support',
      label: 'Support & Cert Verify',
      visible:
        !isAdmin ||
        owner ||
        hasPermission(user, 'student_support_manage') ||
        hasPermission(user, 'certificate_verify'),
      icon: LifeBuoy,
    },
    {
      id: 'certificates',
      label: 'Certificates',
      visible:
        !isAdmin || owner || hasPermission(user, 'certificate_verify'),
      icon: Award,
    },
    {
      id: 'settings',
      label: 'Portal Settings',
      visible: isAdmin && owner,
      icon: Settings,
    },
    { id: 'profile', label: 'Profile', visible: true, icon: UserIcon },
  ];

  const visibleItems = navItems.filter((item) => item.visible);

  return (
    <>
      {open && (
        <div
          className="no-print fixed inset-0 z-20 bg-[#101a2d]/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-30 flex w-[252px] shrink-0 flex-col bg-[#142746] px-3.5 py-5 text-white transition-transform duration-200 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-2 pb-6">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#263e63] text-lg font-extrabold text-[#d7a84b]">
              A
            </span>
            <span className="font-display text-[15px] font-extrabold leading-tight tracking-tight text-white">
              {brandName || 'ARYA TAX PATHSHALA'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#a8b8d0] hover:bg-[#29466f] hover:text-white md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 overflow-y-auto" aria-label="Portal Navigation">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activePage === item.id ||
              (activePage === 'learning' && item.id === 'mycourses');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex w-full items-center justify-between gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-[#29466f] text-white'
                    : 'text-[#d6dfed] hover:bg-[#223b63] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="h-4 w-4 shrink-0 opacity-85" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && item.count > 0 && (
                  <span className="font-mono text-xs font-bold text-[#d7a84b] tabular-nums">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-3 pt-6 text-[11px] text-[#a8b8d0]">
          {brandName || 'ARYA TAX PATHSHALA'} · Learning Portal
        </div>
      </aside>
    </>
  );
}
