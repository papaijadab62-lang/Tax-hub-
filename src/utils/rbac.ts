import type {
  AdminPermission,
  AdminRole,
  Course,
  CourseApprovalStatus,
  User,
} from '../types/lms.ts';

export const ADMIN_ROLES: AdminRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'CO_ADMIN',
  'COURSE_MANAGER',
  'CONTENT_EDITOR',
  'STUDENT_SUPPORT',
];

export const ASSIGNABLE_ADMIN_ROLES: Exclude<AdminRole, 'SUPER_ADMIN'>[] = [
  'ADMIN',
  'CO_ADMIN',
  'COURSE_MANAGER',
  'CONTENT_EDITOR',
  'STUDENT_SUPPORT',
];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Main Super Admin (Owner)',
  ADMIN: 'Admin',
  CO_ADMIN: 'Co-Admin',
  COURSE_MANAGER: 'Course Manager',
  CONTENT_EDITOR: 'Content Editor',
  STUDENT_SUPPORT: 'Student Support Staff',
};

export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  SUPER_ADMIN:
    'Complete portal ownership, financial & GST ledger authority, RBAC governance, 2FA & security oversight.',
  ADMIN:
    'Operational oversight across assigned courses, student management, approvals, and team workflows (zero financial access).',
  CO_ADMIN:
    'Assists with assigned course management, content review, and student support (zero financial access).',
  COURSE_MANAGER:
    'Creates, organizes, updates quizzes/assignments, and submits assigned courses for approval.',
  CONTENT_EDITOR:
    'Edits lessons, study materials, PDFs, thumbnails, and video embeds on assigned courses.',
  STUDENT_SUPPORT:
    'Assists students with profile & login issues, progress monitoring, queries, and certificate verification.',
};

export interface PermissionMeta {
  key: AdminPermission;
  label: string;
  group: 'Courses & Content' | 'Approval & Governance' | 'Students & Certificates' | 'Logs & Communication';
  description: string;
}

export const ALL_ADMIN_PERMISSIONS: PermissionMeta[] = [
  {
    key: 'course_create',
    label: 'Course Create',
    group: 'Courses & Content',
    description: 'Create new draft courses (auto-assigned to creator)',
  },
  {
    key: 'course_edit',
    label: 'Course Edit',
    group: 'Courses & Content',
    description: 'Edit course title, description, category, and thumbnails',
  },
  {
    key: 'course_delete',
    label: 'Course Delete',
    group: 'Courses & Content',
    description: 'Permanently remove assigned courses',
  },
  {
    key: 'course_publish',
    label: 'Course Publish',
    group: 'Approval & Governance',
    description: 'Move approved courses to Published status',
  },
  {
    key: 'video_upload',
    label: 'Video Upload / Embed',
    group: 'Courses & Content',
    description: 'Add or update video URLs and orientation showcases',
  },
  {
    key: 'pdf_upload',
    label: 'PDF / Material Upload',
    group: 'Courses & Content',
    description: 'Attach downloadable PDFs and study notes',
  },
  {
    key: 'module_manage',
    label: 'Module Management',
    group: 'Courses & Content',
    description: 'Add, rename, or remove chapters/modules',
  },
  {
    key: 'lesson_manage',
    label: 'Lesson Management',
    group: 'Courses & Content',
    description: 'Create, edit, or delete lessons inside modules',
  },
  {
    key: 'quiz_manage',
    label: 'Quiz Management',
    group: 'Courses & Content',
    description: 'Create and edit MCQ quizzes on assigned courses',
  },
  {
    key: 'assignment_manage',
    label: 'Assignment Management',
    group: 'Courses & Content',
    description: 'Create assignments and review student submissions',
  },
  {
    key: 'content_approve',
    label: 'Content Approval',
    group: 'Approval & Governance',
    description: 'Review pending courses, approve, reject, or request revisions',
  },
  {
    key: 'version_restore',
    label: 'Version History Restore',
    group: 'Approval & Governance',
    description: 'Inspect snapshots and restore prior course versions',
  },
  {
    key: 'student_view',
    label: 'Student View',
    group: 'Students & Certificates',
    description: 'Search student directory, view enrolled courses and progress',
  },
  {
    key: 'student_manage',
    label: 'Student Management',
    group: 'Students & Certificates',
    description: 'Create students, toggle active access, grant course access',
  },
  {
    key: 'student_support_manage',
    label: 'Support & Login Desk',
    group: 'Students & Certificates',
    description: 'Respond to student queries and resolve login requests',
  },
  {
    key: 'certificate_verify',
    label: 'Certificate Verification',
    group: 'Students & Certificates',
    description: 'Verify authenticity of issued certificates by ID',
  },
  {
    key: 'certificate_approve',
    label: 'Certificate Approval',
    group: 'Students & Certificates',
    description: 'Assist with certificate issuance readiness checks',
  },
  {
    key: 'admin_manage',
    label: 'Admin Team View',
    group: 'Approval & Governance',
    description: 'View non-owner admin roster and course assignments',
  },
  {
    key: 'activity_log_view',
    label: 'Activity Log Access',
    group: 'Logs & Communication',
    description: 'Inspect scoped activity & audit logs',
  },
  {
    key: 'report_export',
    label: 'Report Export',
    group: 'Logs & Communication',
    description: 'Export non-financial operational CSV reports',
  },
  {
    key: 'announcement_manage',
    label: 'Broadcasts & Live Class',
    group: 'Logs & Communication',
    description: 'Publish portal announcements and live class links',
  },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  SUPER_ADMIN: ALL_ADMIN_PERMISSIONS.map((p) => p.key),
  ADMIN: [
    'course_create',
    'course_edit',
    'course_publish',
    'video_upload',
    'pdf_upload',
    'module_manage',
    'lesson_manage',
    'quiz_manage',
    'assignment_manage',
    'student_view',
    'student_manage',
    'student_support_manage',
    'certificate_verify',
    'content_approve',
    'version_restore',
    'activity_log_view',
    'report_export',
    'announcement_manage',
  ],
  CO_ADMIN: [
    'course_edit',
    'video_upload',
    'pdf_upload',
    'module_manage',
    'lesson_manage',
    'quiz_manage',
    'assignment_manage',
    'student_view',
    'student_support_manage',
    'certificate_verify',
    'content_approve',
    'version_restore',
    'announcement_manage',
  ],
  COURSE_MANAGER: [
    'course_create',
    'course_edit',
    'video_upload',
    'pdf_upload',
    'module_manage',
    'lesson_manage',
    'quiz_manage',
    'assignment_manage',
    'version_restore',
  ],
  CONTENT_EDITOR: [
    'course_edit',
    'video_upload',
    'pdf_upload',
    'module_manage',
    'lesson_manage',
    'quiz_manage',
    'assignment_manage',
  ],
  STUDENT_SUPPORT: [
    'student_view',
    'student_support_manage',
    'certificate_verify',
  ],
};

export function getEffectiveAdminRole(user?: User | null): AdminRole | null {
  if (!user || user.role !== 'admin') return null;
  return user.adminRole || 'SUPER_ADMIN';
}

export function isSuperAdmin(user?: User | null): boolean {
  return getEffectiveAdminRole(user) === 'SUPER_ADMIN';
}

export function isAnyAdmin(user?: User | null): boolean {
  return Boolean(user && user.role === 'admin');
}

export function isCourseScopedRole(role?: AdminRole | null): boolean {
  return (
    role === 'ADMIN' ||
    role === 'CO_ADMIN' ||
    role === 'COURSE_MANAGER' ||
    role === 'CONTENT_EDITOR'
  );
}

export function getEffectivePermissions(
  user?: User | null,
  courseId?: string
): AdminPermission[] {
  const role = getEffectiveAdminRole(user);
  if (!role || !user) return [];
  if (role === 'SUPER_ADMIN') {
    return DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN;
  }
  const base = Array.isArray(user.permissions)
    ? user.permissions
    : DEFAULT_ROLE_PERMISSIONS[role] || [];
  if (courseId && user.coursePermissions && Array.isArray(user.coursePermissions[courseId])) {
    return Array.from(new Set([...base, ...user.coursePermissions[courseId]]));
  }
  return base;
}

export function hasPermission(
  user: User | null | undefined,
  permission: AdminPermission,
  courseId?: string
): boolean {
  const role = getEffectiveAdminRole(user);
  if (!role || !user) return false;
  if (role === 'SUPER_ADMIN') return true;
  if (!user.active || user.suspended) return false;
  if (courseId && !canAccessCourse(user, courseId)) {
    return false;
  }
  const perms = getEffectivePermissions(user, courseId);
  return perms.includes(permission);
}

export function hasAnyPermission(
  user: User | null | undefined,
  permissions: AdminPermission[]
): boolean {
  return permissions.some((p) => hasPermission(user, p));
}

export function canAccessCourse(
  user: User | null | undefined,
  courseId: string
): boolean {
  const role = getEffectiveAdminRole(user);
  if (!role || !user) return false;
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'STUDENT_SUPPORT') return false;
  return (user.assignedCourseIds || []).includes(courseId);
}

export function getCourseApprovalStatus(course: Pick<Course, 'approvalStatus' | 'visibility'>): CourseApprovalStatus {
  if (course.approvalStatus) return course.approvalStatus;
  return course.visibility === 'published' ? 'PUBLISHED' : 'DRAFT';
}

export const APPROVAL_STATUS_META: Record<
  CourseApprovalStatus,
  { label: string; textClass: string; color: string }
> = {
  DRAFT: { label: 'Draft', textClass: 'text-[#59677d]', color: '#59677d' },
  PENDING_APPROVAL: {
    label: 'Pending Approval',
    textClass: 'text-[#b45309]',
    color: '#b45309',
  },
  APPROVED: {
    label: 'Approved (Ready)',
    textClass: 'text-[#1d4ed8]',
    color: '#1d4ed8',
  },
  PUBLISHED: { label: 'Published', textClass: 'text-[#13845b]', color: '#13845b' },
  REJECTED: { label: 'Rejected', textClass: 'text-[#c64b58]', color: '#c64b58' },
  NEEDS_REVISION: {
    label: 'Needs Revision',
    textClass: 'text-[#b45309]',
    color: '#b45309',
  },
  ARCHIVED: { label: 'Archived', textClass: 'text-[#718096]', color: '#718096' },
};
