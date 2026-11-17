export type UserRole = 'admin' | 'student';

export type AdminRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CO_ADMIN'
  | 'COURSE_MANAGER'
  | 'CONTENT_EDITOR'
  | 'STUDENT_SUPPORT';

export type AdminPermission =
  | 'course_create'
  | 'course_edit'
  | 'course_delete'
  | 'course_publish'
  | 'video_upload'
  | 'pdf_upload'
  | 'module_manage'
  | 'lesson_manage'
  | 'quiz_manage'
  | 'assignment_manage'
  | 'student_view'
  | 'student_manage'
  | 'student_support_manage'
  | 'certificate_verify'
  | 'certificate_approve'
  | 'content_approve'
  | 'admin_manage'
  | 'activity_log_view'
  | 'report_export'
  | 'version_restore'
  | 'announcement_manage';

export type CourseApprovalStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'NEEDS_REVISION'
  | 'ARCHIVED';

export interface CourseApprovalEntry {
  id: string;
  status: CourseApprovalStatus;
  actorId: string;
  actorName: string;
  actorRole: AdminRole;
  note?: string;
  timestamp: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface CourseQuiz {
  id: string;
  title: string;
  passingPercent: number;
  questions: QuizQuestion[];
  updatedAt?: string;
}

export interface CourseAssignment {
  id: string;
  title: string;
  description: string;
  dueLabel?: string;
  maxMarks: number;
  attachmentUrl?: string;
  updatedAt?: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  courseId: string;
  studentId: string;
  answers: number[];
  scorePercent: number;
  passed: boolean;
  submittedAt: string;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  submissionText: string;
  attachmentUrl?: string;
  status: 'SUBMITTED' | 'REVIEWED';
  marks?: number;
  feedback?: string;
  submittedAt: string;
  reviewedAt?: string;
}

export type AdminAccountStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'DEACTIVATED';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  countryCode?: string;
  whatsappNumber?: string;
  whatsappVerified?: boolean;
  whatsappVerifiedAt?: string;
  state?: string;
  guardianName?: string;
  address?: string;
  city?: string;
  pincode?: string;
  enrollmentNo?: string;
  password?: string;
  role: UserRole;
  adminRole?: AdminRole;
  requestedDesignation?: Exclude<AdminRole, 'SUPER_ADMIN'>;
  accountStatus?: AdminAccountStatus;
  rejectionReason?: string;
  permissions?: AdminPermission[];
  assignedCourseIds?: string[];
  coursePermissions?: Record<string, AdminPermission[]>;
  active: boolean;
  suspended?: boolean;
  suspendedReason?: string;
  suspendedAt?: string;
  twoFactorEnabled?: boolean;
  backupCodesRemaining?: number;
  hasRecoveryPin?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  lastLoginIp?: string;
  grantedCourseIds?: string[];
  createdAt?: string;
}

export interface CertificateTemplateConfig {
  enabled?: boolean;
  mode?: 'template' | 'uploaded';
  heading?: string;
  certificateTitle?: string;
  subtitle?: string;
  signerName?: string;
  footerText?: string;
  customTemplateUrl?: string;
  customTemplateName?: string;
}

export interface CustomCertificateRecord {
  id: string;
  studentId: string;
  targetType: 'course' | 'bundle';
  targetId: string;
  targetTitle: string;
  certificateNo: string;
  issuedDate: string;
  mode: 'template' | 'uploaded';
  fileUrl?: string;
  fileName?: string;
  customHeading?: string;
  customSubtitle?: string;
  notes?: string;
  status?: 'ACTIVE' | 'REVOKED';
  revokedReason?: string;
  revokedAt?: string;
  updatedAt: string;
}

export interface IssuedCertificateMeta {
  id: string;
  certificateNo: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  targetType: 'course' | 'bundle';
  targetId: string;
  targetTitle: string;
  issuedDate: string;
  source: 'auto_threshold' | 'manual_override' | 'custom_upload';
  status: 'ACTIVE' | 'REVOKED';
  revokedAt?: string;
  revokedBy?: string;
  revokedReason?: string;
  approvedBy?: string;
}

export interface Lesson {
  id: string;
  title: string;
  url: string;
  notes: string;
  file?: string;
}

export interface Chapter {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface CoursePaymentPlan {
  id: string;
  label: string;
  months: number;
  price: number;
}

export interface Course {
  id: string;
  title: string;
  category: string;
  description: string;
  thumbnailUrl?: string;
  price: number;
  paymentPlans?: CoursePaymentPlan[];
  certificateConfig?: CertificateTemplateConfig;
  visibility: 'draft' | 'published';
  approvalStatus?: CourseApprovalStatus;
  approvalNote?: string;
  submittedById?: string;
  submittedByName?: string;
  submittedAt?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  approvalHistory?: CourseApprovalEntry[];
  createdById?: string;
  createdByName?: string;
  updatedAt?: string;
  chapters: Chapter[];
  quizzes?: CourseQuiz[];
  assignments?: CourseAssignment[];
}

export interface FlattenedLesson extends Lesson {
  chapterId: string;
  chapterTitle: string;
}

export type OrderStatus = 'PENDING' | 'PAID' | 'REJECTED' | 'REFUNDED';

export type GstSplitType = 'cgst_sgst' | 'igst';

export interface Order {
  id: string;
  invoiceNumber?: string;
  invoiceSerial?: number;
  userId: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  buyerState?: string;
  sellerState?: string;
  supplyType?: 'intra_state' | 'inter_state';
  itemName: string;
  courseIds: string[];
  planId?: string;
  planLabel?: string;
  planMonths?: number;
  expiresAt?: string;
  base: number;
  discount: number;
  taxable?: number;
  gst: number;
  gstRate?: number;
  gstMode?: 'exclusive' | 'inclusive';
  gstSection?: string;
  sacCode?: string;
  gstNumber?: string;
  gstSplit?: GstSplitType;
  cgst?: number;
  sgst?: number;
  igst?: number;
  total: number;
  method: string;
  reference: string;
  couponCode?: string;
  status: OrderStatus;
  verificationStatus?: 'verified' | 'pending_verification' | 'rejected' | 'refunded';
  verificationNote?: string;
  proofType?: string;
  proofScreenshotUrl?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  refundedAt?: string;
  refundReason?: string;
  refundAmount?: number;
  created: string;
  paidAt?: string;
  emailDispatchStatus?: 'sent' | 'not_configured' | 'failed';
  emailDispatchNote?: string;
  lastDispatchedAt?: string;
  whatsappDispatchStatus?: 'sent' | 'manual_ready' | 'failed';
  whatsappMessage?: string;
  whatsappUrl?: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'flat';
  value: number;
  min: number;
  active: boolean;
}

export interface Bundle {
  id: string;
  name: string;
  courseIds: string[];
  price: number;
  thumbnailUrl?: string;
  certificateConfig?: CertificateTemplateConfig;
}

export type PaymentMethodType = 'upi_qr' | 'gateway' | 'bank';

export interface PaymentMethod {
  id: string;
  name: string;
  type?: PaymentMethodType;
  upiId?: string;
  qrCodeUrl?: string;
  gatewayProvider?: string;
  gatewayUrl?: string;
  gatewayKeyId?: string;
  info: string;
  active: boolean;
}

export interface PortalSettings {
  brand: string;
  gst: number;
  gstMode: 'exclusive' | 'inclusive';
  gstSection: string;
  sacCode: string;
  gstNumber: string;
  gstState?: string;
  autoGstByState?: boolean;
  stateGstRates?: Record<string, number>;
  gstSplit: GstSplitType;
  instantActivation: boolean;
  threshold: number;
  certHeading: string;
  certSub: string;
  certSigner: string;
  certFooter: string;
  certSignatureUrl?: string;
  certSealText?: string;
  requireTwoFactorForAdmins?: boolean;
  enforceWhatsapp2FA?: boolean;
  emailConfigured?: boolean;
  whatsappConfigured?: boolean;
  whatsappCloudApiConfigured?: boolean;
  whatsappBusinessAccountId?: string;
  whatsappOtpTemplateName?: string;
  whatsappOtpTemplateLang?: string;
  adminEmail?: string;
  adminWhatsapp?: string;
  smtpUser?: string;
  smtpPassSet?: boolean;
  senderName?: string;
  whatsappWebhookUrl?: string;
  whatsappPhoneNumberId?: string;
  whatsappTokenSet?: boolean;
}

export interface PasswordRecoveryRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: 'STUDENT' | AdminRole;
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'EXPIRED';
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  deliveryChannel?: 'WHATSAPP' | 'EMAIL' | 'MANUAL_PORTAL_TOKEN';
  expiresAt?: string;
  completedAt?: string;
}

export interface WhatsappDeliveryLog {
  id: string;
  recipientMasked: string;
  purpose: 'REGISTRATION_OTP' | 'LOGIN_2FA' | 'PASSWORD_RECOVERY' | 'TEST_MESSAGE' | 'INVOICE';
  provider: 'META_CLOUD_API' | 'WEBHOOK';
  providerMessageId?: string;
  templateName?: string;
  status: 'ACCEPTED' | 'FAILED';
  errorDetail?: string;
  timestamp: string;
}

export type ProgressMap = Record<string, number>;

export type PageId =
  | 'dashboard'
  | 'courses'
  | 'mycourses'
  | 'learning'
  | 'students'
  | 'orders'
  | 'promos'
  | 'settings'
  | 'certificates'
  | 'profile'
  | 'admin_team'
  | 'approvals'
  | 'audit_logs'
  | 'support';

export type AnnouncementCategory = 'update' | 'exam' | 'course';

export interface Announcement {
  id: string;
  active: boolean;
  category: AnnouncementCategory;
  title: string;
  message: string;
  actionLabel?: string;
  actionPage?: 'courses' | 'mycourses' | 'certificates';
  updatedAt: string;
}

export interface WelcomeShowcase {
  active: boolean;
  title: string;
  subtitle: string;
  videoUrl: string;
  mentorName: string;
  mentorRole: string;
  photoUrl: string;
  autoplay: boolean;
  loop: boolean;
  updatedAt: string;
}

export type SocialPlatformType =
  | 'whatsapp'
  | 'youtube'
  | 'telegram'
  | 'instagram'
  | 'facebook'
  | 'website'
  | 'other';

export interface PlatformLink {
  id: string;
  platform: SocialPlatformType;
  label: string;
  subtitle?: string;
  url: string;
  active: boolean;
}

export interface PlatformLinksConfig {
  heading: string;
  subtitle: string;
  links: PlatformLink[];
  updatedAt: string;
}

export type LivePlatformType = 'zoom' | 'meet' | 'teams' | 'other';

export interface LiveClassSession {
  active: boolean;
  platform: LivePlatformType;
  title: string;
  instructorName: string;
  courseTitle?: string;
  meetingUrl: string;
  meetingId?: string;
  passcode?: string;
  scheduledAt: string;
  durationMinutes: number;
  notes?: string;
  updatedAt: string;
}

export interface AdminInvitation {
  id: string;
  token: string;
  name: string;
  email: string;
  adminRole: Exclude<AdminRole, 'SUPER_ADMIN'>;
  permissions: AdminPermission[];
  assignedCourseIds: string[];
  coursePermissions?: Record<string, AdminPermission[]>;
  status: 'PENDING' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';
  invitedById: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
}

export interface AdminSessionRecord {
  sid: string;
  userId: string;
  userName: string;
  userEmail: string;
  adminRole?: AdminRole;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  revoked: boolean;
  revokedReason?: string;
}

export interface ActivityLogEntry {
  id: string;
  userId: string;
  actorName: string;
  actorEmail: string;
  actorRole: AdminRole | 'STUDENT' | 'SYSTEM';
  action: string;
  category:
    | 'AUTH'
    | 'SECURITY'
    | 'ADMIN'
    | 'COURSE'
    | 'APPROVAL'
    | 'STUDENT'
    | 'CERTIFICATE'
    | 'FINANCE'
    | 'SYSTEM';
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  courseId?: string;
  previousValue?: string;
  updatedValue?: string;
  ip?: string;
  timestamp: string;
}

export interface CourseVersionRecord {
  id: string;
  courseId: string;
  courseTitle: string;
  versionNumber: number;
  editorId: string;
  editorName: string;
  editorRole: AdminRole;
  summary: string;
  createdAt: string;
  snapshot: Course;
}

export interface CourseAssignmentHistoryEntry {
  id: string;
  courseId: string;
  courseTitle: string;
  adminId: string;
  adminName: string;
  adminRole: AdminRole;
  action: 'ASSIGNED' | 'REASSIGNED' | 'REMOVED' | 'PERMISSIONS_UPDATED';
  permissions: AdminPermission[];
  actorId: string;
  actorName: string;
  note?: string;
  timestamp: string;
}

export interface InternalNotification {
  id: string;
  recipientUserId?: string;
  recipientRole?: AdminRole | 'ALL_ADMINS' | 'STUDENT';
  type:
    | 'INVITATION'
    | 'ADMIN_REGISTRATION'
    | 'PASSWORD_RECOVERY'
    | 'COURSE_ASSIGNMENT'
    | 'APPROVAL_REQUEST'
    | 'APPROVAL_DECISION'
    | 'SUPPORT_TICKET'
    | 'SECURITY_ALERT'
    | 'ACCOUNT_STATUS'
    | 'CERTIFICATE';
  title: string;
  message: string;
  actionPage?: PageId;
  relatedId?: string;
  readByUserIds: string[];
  createdAt: string;
}

export interface SupportTicketReply {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  message: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  studentId?: string;
  studentName: string;
  studentEmail: string;
  category: 'COURSE_QUERY' | 'LOGIN_ISSUE' | 'CERTIFICATE' | 'TECHNICAL' | 'OTHER';
  subject: string;
  message: string;
  courseId?: string;
  courseTitle?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  assignedToId?: string;
  assignedToName?: string;
  replies: SupportTicketReply[];
  createdAt: string;
  updatedAt: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
