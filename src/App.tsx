import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Award,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Lock,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { AdminTeamPage } from './components/AdminTeamPage';
import { AnnouncementBar } from './components/AnnouncementBar';
import { ApprovalsAndVersionsPage } from './components/ApprovalsAndVersionsPage';
import { AuditAndSecurityPage } from './components/AuditAndSecurityPage';
import { AuthScreen } from './components/AuthScreen';
import {
  OrdersPage,
  PromosPage,
  SettingsPage,
  StudentsPage,
} from './components/AdminPages';
import { ConfirmModal } from './components/ConfirmModal';
import { CourseCard } from './components/CourseCard';
import { LearningView } from './components/LearningView';
import { LiveClassPanel } from './components/LiveClassPanel';
import {
  AnnouncementModal,
  CertificateModal,
  CertificateTemplateModal,
  ChapterModal,
  CheckoutModal,
  CourseModal,
  LessonModal,
  LiveClassModal,
  PaymentMethodModal,
  PlatformLinksModal,
  StudentAccessModal,
  StudentModal,
  TaxInvoiceModal,
  WelcomeVideoModal,
} from './components/Modals';
import { PlatformLinksPanel } from './components/PlatformLinksPanel';
import { RoleDashboards } from './components/RoleDashboards';
import { Sidebar } from './components/Sidebar';
import { StudentAchievements } from './components/StudentAchievements';
import { SupportDeskPage } from './components/SupportDeskPage';
import { ToastContainer } from './components/ToastContainer';
import { TopBar } from './components/TopBar';
import { WelcomeVideoPanel } from './components/WelcomeVideoPanel';
import { VerifyWhatsappWidget } from './components/WhatsappSecurityPanel';
import { useLmsStore } from './hooks/useLmsStore';
import type {
  Bundle,
  Chapter,
  Course,
  Lesson,
  Order,
  PageId,
  PaymentMethod,
  ToastMessage,
  User,
} from './types/lms';
import {
  INDIAN_GST_STATES,
  downloadProgressCsvReport,
  getOrderInvoiceSerial,
  getUserCourseProgress,
  hasBoughtCourse,
  isCertificateEligible,
  money,
  uid,
} from './utils/lms';
import { readCertificateAssetFile } from './utils/media';
import {
  ADMIN_ROLE_LABELS,
  getEffectiveAdminRole,
  hasPermission,
  isSuperAdmin,
} from './utils/rbac';

export default function App() {
  const store = useLmsStore();
  const {
    initializing,
    adminExists,
    authBrand,
    whatsappCloudApiConfigured,
    pendingWhatsappOtp,
    currentUser,
    users,
    courses,
    orders,
    coupons,
    bundles,
    methods,
    settings,
    announcement,
    liveClass,
    welcomeVideo,
    platformLinks,
    certificates,
    progress,
    quizAttempts,
    assignmentSubmissions,
    notifications,
    unreadNotificationCount,
  } = store;

  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('invite');
    } catch {
      return null;
    }
  });

  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('ALL');
  const [ordersMonthFilter, setOrdersMonthFilter] = useState<string>('ALL');

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = useCallback(
    (type: ToastMessage['type'], message: string) => {
      const id = uid();
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  // Modals state
  const [courseModal, setCourseModal] = useState<{
    open: boolean;
    course: Course | null;
  }>({ open: false, course: null });

  const [chapterModal, setChapterModal] = useState<{
    open: boolean;
    courseId: string;
    chapter: Chapter | null;
  }>({ open: false, courseId: '', chapter: null });

  const [lessonModal, setLessonModal] = useState<{
    open: boolean;
    courseId: string;
    chapterId: string;
    lesson: Lesson | null;
  }>({ open: false, courseId: '', chapterId: '', lesson: null });

  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [accessModalStudent, setAccessModalStudent] = useState<User | null>(
    null
  );

  const [checkoutItem, setCheckoutItem] = useState<
    { type: 'course'; data: Course } | { type: 'bundle'; data: Bundle } | null
  >(null);

  const [methodModal, setMethodModal] = useState<PaymentMethod | null>(null);
  const [certTarget, setCertTarget] = useState<
    | { type: 'course'; course: Course }
    | { type: 'bundle'; bundle: Bundle }
    | null
  >(null);
  const [certTemplateEditTarget, setCertTemplateEditTarget] = useState<
    | { type: 'course'; course: Course }
    | { type: 'bundle'; bundle: Bundle }
    | null
  >(null);

  // Admin custom student certificate upload form state
  const [customCertStudentId, setCustomCertStudentId] = useState('');
  const [customCertTargetKey, setCustomCertTargetKey] = useState('');
  const [customCertNo, setCustomCertNo] = useState('');
  const [customCertIssuedDate, setCustomCertIssuedDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [customCertFileUrl, setCustomCertFileUrl] = useState('');
  const [customCertFileName, setCustomCertFileName] = useState('');
  const [customCertNotes, setCustomCertNotes] = useState('');
  const [savingCustomCert, setSavingCustomCert] = useState(false);

  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [liveClassModalOpen, setLiveClassModalOpen] = useState(false);
  const [welcomeVideoModalOpen, setWelcomeVideoModalOpen] = useState(false);
  const [platformLinksModalOpen, setPlatformLinksModalOpen] = useState(false);
  const [dismissedAnnouncementKey, setDismissedAnnouncementKey] =
    useState<string>('');

  useEffect(() => {
    if (!currentUser) {
      setDismissedAnnouncementKey('');
      return;
    }
    try {
      setDismissedAnnouncementKey(
        localStorage.getItem(
          `arya_dismissed_announcement_${currentUser.id}`
        ) || ''
      );
    } catch {
      setDismissedAnnouncementKey('');
    }
  }, [currentUser?.id]);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void> | void;
  }>({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    onConfirm: () => {},
  });

  const [ownerRecoveryKit, setOwnerRecoveryKit] = useState<{
    email: string;
    codes: string[];
  } | null>(null);

  // Profile form state
  const [profileNameDraft, setProfileNameDraft] = useState<string | null>(null);
  const [profileEmailDraft, setProfileEmailDraft] = useState<string | null>(
    null
  );
  const [profilePhoneDraft, setProfilePhoneDraft] = useState<string | null>(
    null
  );
  const [profileStateDraft, setProfileStateDraft] = useState<string | null>(
    null
  );
  const [profileGuardianDraft, setProfileGuardianDraft] = useState<
    string | null
  >(null);
  const [profileAddressDraft, setProfileAddressDraft] = useState<string | null>(
    null
  );
  const [profileCityDraft, setProfileCityDraft] = useState<string | null>(null);
  const [profilePincodeDraft, setProfilePincodeDraft] = useState<string | null>(
    null
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Ensure a student viewing a course immediately exits if Admin unpublishes, deletes, or revokes access
  useEffect(() => {
    if (
      currentUser &&
      currentUser.role !== 'admin' &&
      activePage === 'learning' &&
      activeCourseId
    ) {
      const course = courses.find((c) => c.id === activeCourseId);
      if (!course || !hasBoughtCourse(currentUser, course, orders)) {
        setActiveCourseId(null);
        setActivePage('dashboard');
      }
    }
  }, [currentUser, activePage, activeCourseId, courses, orders]);

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f6fb]">
        <div className="flex items-center gap-3 text-sm font-bold text-[#142746]">
          <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#142746] text-base font-extrabold text-[#d7a84b]">
            A
          </span>
          <span>Loading {authBrand}...</span>
        </div>
      </div>
    );
  }

  const clearAuthInviteParam = () => {
    setInviteToken(null);
    try {
      if (window.location.search.includes('invite=')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch {
      // ignore history errors
    }
  };

  if (!currentUser) {
    return (
      <>
        <AuthScreen
          adminExists={adminExists}
          brandName={authBrand}
          whatsappCloudApiConfigured={whatsappCloudApiConfigured}
          inviteToken={inviteToken}
          pendingWhatsappOtp={pendingWhatsappOtp}
          onCreateAdmin={async (name, email, password, extra) => {
            const res = await store.createAdminAccount(name, email, password, extra);
            if (res.ok) {
              setActivePage('dashboard');
              clearAuthInviteParam();
              if (res.emergencyRecoveryCodes && res.emergencyRecoveryCodes.length > 0) {
                setOwnerRecoveryKit({
                  email: res.user?.email || email.trim().toLowerCase(),
                  codes: res.emergencyRecoveryCodes,
                });
              }
              addToast('success', 'Main Super Admin (Owner) account created.');
            }
            return res;
          }}
          onAdminSignIn={async (email, password) => {
            const res = await store.adminSignIn(email, password);
            if (res.ok && !res.requiresWhatsappOtp) {
              setActivePage('dashboard');
              clearAuthInviteParam();
              setProfileNameDraft(null);
              setProfileEmailDraft(null);
              setProfilePhoneDraft(null);
              setProfileStateDraft(null);
            }
            return res;
          }}
          onVerifyWhatsappLoginOtp={async (code) => {
            const res = await store.verifyWhatsappLoginOtp(code);
            if (res.ok) {
              setActivePage('dashboard');
              clearAuthInviteParam();
              setProfileNameDraft(null);
              setProfileEmailDraft(null);
              setProfilePhoneDraft(null);
              setProfileStateDraft(null);
            }
            return res;
          }}
          onResendWhatsappLoginOtp={store.resendWhatsappLoginOtp}
          onClearPendingWhatsappOtp={store.clearPendingWhatsappOtp}
          onSendWhatsappOtp={store.sendWhatsappOtp}
          onVerifyWhatsappOtp={store.verifyWhatsappOtp}
          onRegisterAdmin={store.registerAdminAccount}
          onFetchInviteDetails={store.fetchInviteDetails}
          onAcceptInvite={async (token, password, name) => {
            const res = await store.acceptInvite(token, password, name);
            if (res.ok) {
              setActivePage('dashboard');
              clearAuthInviteParam();
              addToast('success', 'Admin invitation accepted. Welcome!');
            }
            return res;
          }}
          onStudentSignUp={async (name, email, phone, state, password, extra) => {
            const res = await store.studentSignUp(
              name,
              email,
              phone,
              state,
              password,
              extra
            );
            if (res.ok) {
              setActivePage('dashboard');
              clearAuthInviteParam();
              setProfileNameDraft(null);
              setProfileEmailDraft(null);
              setProfilePhoneDraft(null);
              setProfileStateDraft(null);
              addToast('success', 'Student account created. Welcome!');
            }
            return res;
          }}
          onStudentSignIn={async (email, password) => {
            const res = await store.studentSignIn(email, password);
            if (res.ok && !res.requiresWhatsappOtp) {
              setActivePage('dashboard');
              clearAuthInviteParam();
              setProfileNameDraft(null);
              setProfileEmailDraft(null);
              setProfilePhoneDraft(null);
              setProfileStateDraft(null);
            }
            return res;
          }}
          onRecoverForgotLoginId={store.recoverForgotLoginId}
          onRequestStudentReset={store.requestStudentPasswordReset}
          onRequestSuperAdminReset={store.requestSuperAdminPasswordReset}
          onRequestSubAdminRecovery={store.requestSubAdminPasswordRecovery}
          onCompletePasswordRecovery={store.completePasswordRecovery}
          onSubmitLoginHelp={store.submitPublicLoginHelp}
        />
        <ToastContainer
          toasts={toasts}
          onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))}
        />
      </>
    );
  }

  const isAdmin = currentUser.role === 'admin';
  const owner = isSuperAdmin(currentUser);
  const canCreateCourse = owner || hasPermission(currentUser, 'course_create');
  const canManageAnnouncements =
    owner || hasPermission(currentUser, 'announcement_manage');
  const canManageWelcomeVideo =
    owner ||
    hasPermission(currentUser, 'announcement_manage') ||
    hasPermission(currentUser, 'video_upload');
  const canViewStudents = owner || hasPermission(currentUser, 'student_view');
  const canManageStudents = owner || hasPermission(currentUser, 'student_manage');
  const canViewAdminTeam = owner || hasPermission(currentUser, 'admin_manage');

  const availableCourses = courses.filter(
    (c) => isAdmin || c.visibility === 'published' || c.approvalStatus === 'PUBLISHED'
  );
  const myCourses = isAdmin
    ? courses
    : courses.filter((c) => hasBoughtCourse(currentUser, c, orders));

  const pendingOrdersCount = owner
    ? orders.filter((o) => o.status === 'PENDING').length
    : 0;

  const categories = Array.from(
    new Set(
      availableCourses
        .map((c) => c.category.trim())
        .filter((c) => c.length > 0)
    )
  );

  const filteredCatalogue = availableCourses.filter((c) => {
    const matchesSearch =
      !catalogSearch.trim() ||
      c.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      c.description.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      c.category.toLowerCase().includes(catalogSearch.toLowerCase());
    const matchesCat =
      catalogCategory === 'ALL' || c.category.trim() === catalogCategory;
    return matchesSearch && matchesCat;
  });

  const resetProfileDrafts = () => {
    setProfileNameDraft(null);
    setProfileEmailDraft(null);
    setProfilePhoneDraft(null);
    setProfileStateDraft(null);
    setProfileGuardianDraft(null);
    setProfileAddressDraft(null);
    setProfileCityDraft(null);
    setProfilePincodeDraft(null);
    setCurrentPassword('');
    setNewPassword('');
  };

  const navigate = (page: PageId) => {
    setActivePage(page);
    setMobileMenuOpen(false);
    resetProfileDrafts();
  };

  const handleOpenLearning = (courseId: string) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    if (!isAdmin && !hasBoughtCourse(currentUser, course, orders)) {
      addToast('error', 'এই Course দেখতে হলে আগে purchase অথবা Admin access নিতে হবে।');
      return;
    }
    setActiveCourseId(courseId);
    setActivePage('learning');
  };

  const handleCheckoutCourse = (courseId: string) => {
    if (isAdmin) return;
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    setCheckoutItem({ type: 'course', data: course });
  };

  const handleCheckoutBundle = (bundle: Bundle) => {
    if (isAdmin) return;
    setCheckoutItem({ type: 'bundle', data: bundle });
  };

  const handleSubmitOrder = async (payload: {
    itemType: 'course' | 'bundle';
    itemId: string;
    planId?: string;
    couponCode?: string;
    method: string;
    reference: string;
    studentPhone?: string;
    studentState?: string;
    proofScreenshotUrl?: string;
  }): Promise<{ ok: true; order: Order } | { ok: false; error?: string }> => {
    const res = await store.placeOrder(payload);
    if (!res.ok) {
      addToast('error', res.error || 'Could not submit order.');
      return { ok: false, error: res.error };
    }
    if (res.order.status === 'PAID') {
      addToast(
        'success',
        'Verified ₹0 enrollment activated & confirmation invoice generated!'
      );
    } else {
      addToast(
        'info',
        'Payment proof submitted (Verification in Progress). Course unlocks once Owner / Admin verifies payment.'
      );
    }
    return { ok: true, order: res.order };
  };

  const handleQuickSubmitApproval = async (courseId: string) => {
    const res = await store.submitCourseApproval(courseId);
    if (!res.ok) {
      addToast('error', res.error || 'Could not submit course for review.');
      return;
    }
    addToast('success', 'Course submitted for Owner / Admin approval.');
  };

  const handleQuickPublishCourse = async (courseId: string) => {
    const res = await store.publishCourse(courseId);
    if (!res.ok) {
      addToast('error', res.error || 'Could not publish course.');
      return;
    }
    addToast('success', 'Course published live to Student Portal.');
  };

  const handleDeleteCourse = (course: Course) => {
    setConfirmState({
      open: true,
      title: 'Delete Course',
      description: `Are you sure you want to delete "${course.title}"? Existing order history will remain intact.`,
      confirmLabel: 'Delete Course',
      onConfirm: async () => {
        const res = await store.deleteCourse(course.id);
        setConfirmState((s) => ({ ...s, open: false }));
        if (!res.ok) {
          addToast('error', res.error || 'Could not delete course.');
          return;
        }
        addToast('success', 'Course deleted.');
      },
    });
  };

  const handleDeleteChapter = (courseId: string, chapter: Chapter) => {
    setConfirmState({
      open: true,
      title: 'Delete Chapter',
      description: `Delete "${chapter.title}" and all lessons inside it?`,
      confirmLabel: 'Delete Chapter',
      onConfirm: async () => {
        await store.deleteChapter(courseId, chapter.id);
        setConfirmState((s) => ({ ...s, open: false }));
        addToast('success', 'Chapter removed.');
      },
    });
  };

  const handleDeleteLesson = (
    courseId: string,
    chapterId: string,
    lesson: Lesson
  ) => {
    setConfirmState({
      open: true,
      title: 'Delete Lesson',
      description: `Delete lesson "${lesson.title}"?`,
      confirmLabel: 'Delete Lesson',
      onConfirm: async () => {
        await store.deleteLesson(courseId, chapterId, lesson.id);
        setConfirmState((s) => ({ ...s, open: false }));
        addToast('success', 'Lesson removed.');
      },
    });
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const nextName = (profileNameDraft ?? currentUser.name).trim();
    if (!nextName) return;

    const res = await store.updateProfile({
      name: nextName,
      email: owner
        ? (profileEmailDraft ?? currentUser.email).trim().toLowerCase()
        : undefined,
      phone: (profilePhoneDraft ?? currentUser.phone ?? '').trim(),
      state: profileStateDraft ?? currentUser.state ?? '',
      guardianName: (
        profileGuardianDraft ??
        currentUser.guardianName ??
        ''
      ).trim(),
      address: (profileAddressDraft ?? currentUser.address ?? '').trim(),
      city: (profileCityDraft ?? currentUser.city ?? '').trim(),
      pincode: (profilePincodeDraft ?? currentUser.pincode ?? '').trim(),
      currentPassword: newPassword ? currentPassword : undefined,
      newPassword: newPassword || undefined,
    });

    if (!res.ok) {
      addToast('error', res.error || 'Could not update profile.');
      return;
    }
    resetProfileDrafts();
    addToast(
      'success',
      'Profile & certificate details saved. E-certificates will use these details automatically.'
    );
  };

  // Student dashboard metrics
  const completedMyCourses = myCourses.filter((c) =>
    isCertificateEligible(currentUser.id, c, progress, settings.threshold)
  );
  const avgProgress = myCourses.length
    ? Math.round(
        myCourses.reduce(
          (acc, c) => acc + getUserCourseProgress(currentUser.id, c, progress),
          0
        ) / myCourses.length
      )
    : 0;

  const activeLearningCourse =
    courses.find((c) => c.id === activeCourseId) || null;

  return (
    <div className="min-h-screen flex bg-[#f3f6fb]">
      <Sidebar
        activePage={activePage}
        user={currentUser}
        brandName={settings.brand}
        open={mobileMenuOpen}
        pendingOrdersCount={pendingOrdersCount}
        onNavigate={navigate}
        onClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          user={currentUser}
          notifications={notifications}
          unreadCount={unreadNotificationCount}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onNavigate={navigate}
          onMarkNotificationRead={store.markNotificationRead}
          onMarkAllRead={store.markAllNotificationsRead}
          onLogout={() => {
            store.signOut();
            setActiveCourseId(null);
            setActivePage('dashboard');
          }}
        />

        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6 lg:p-7">
          {/* DASHBOARD */}
          {activePage === 'dashboard' && (
            <div>
              {announcement &&
                announcement.active &&
                dismissedAnnouncementKey !==
                  `${announcement.id}:${announcement.updatedAt}` && (
                  <AnnouncementBar
                    announcement={announcement}
                    isAdmin={canManageAnnouncements}
                    onNavigate={navigate}
                    onEdit={() => setAnnouncementModalOpen(true)}
                    onDismiss={() => {
                      const versionKey = `${announcement.id}:${announcement.updatedAt}`;
                      setDismissedAnnouncementKey(versionKey);
                      try {
                        localStorage.setItem(
                          `arya_dismissed_announcement_${currentUser.id}`,
                          versionKey
                        );
                      } catch {
                        // ignore storage errors
                      }
                    }}
                  />
                )}

              <LiveClassPanel
                session={liveClass}
                isAdmin={canManageAnnouncements}
                onEdit={() => setLiveClassModalOpen(true)}
                onClear={async () => {
                  await store.clearLiveClass();
                  addToast('info', 'Live class schedule removed.');
                }}
              />

              <WelcomeVideoPanel
                showcase={welcomeVideo}
                isAdmin={canManageWelcomeVideo}
                onEdit={() => setWelcomeVideoModalOpen(true)}
              />

              <PlatformLinksPanel
                config={platformLinks}
                isAdmin={canManageAnnouncements}
                onEdit={() => setPlatformLinksModalOpen(true)}
              />

              {isAdmin ? (
                <div className="space-y-6">
                  <RoleDashboards
                    currentUser={currentUser}
                    users={users}
                    courses={courses}
                    orders={orders}
                    certificates={certificates}
                    settings={settings}
                    whatsappCloudApiConfigured={whatsappCloudApiConfigured}
                    onNavigate={navigate}
                    onSelectOrdersMonth={(m) => setOrdersMonthFilter(m)}
                    onOpenAddCourse={() =>
                      setCourseModal({ open: true, course: null })
                    }
                    onOpenLiveClass={() => setLiveClassModalOpen(true)}
                    onOpenBroadcast={() => setAnnouncementModalOpen(true)}
                    onSeedCatalog={async () => {
                      await store.seedSampleCatalog();
                      addToast(
                        'success',
                        'Sample tax courses, bundle, and ARYA10 coupon loaded.'
                      );
                    }}
                    onFetchAuditLogs={store.fetchAuditLogs}
                    onFetchRegistrations={
                      owner ? store.fetchAdminRegistrations : undefined
                    }
                    onFetchRecoveryRequests={
                      owner ? store.fetchRecoveryRequests : undefined
                    }
                    onToast={addToast}
                  />

                  <div className="space-y-3">
                    {courses.slice(0, 5).map((course) => (
                      <CourseCard
                        key={course.id}
                        course={course}
                        user={currentUser}
                        orders={orders}
                        progress={progress}
                        onEditCourse={(c) =>
                          setCourseModal({ open: true, course: c })
                        }
                        onAddChapter={(courseId) =>
                          setChapterModal({
                            open: true,
                            courseId,
                            chapter: null,
                          })
                        }
                        onDeleteCourse={handleDeleteCourse}
                        onManageCourse={handleOpenLearning}
                        onOpenLearning={handleOpenLearning}
                        onCheckout={handleCheckoutCourse}
                        onSubmitApproval={handleQuickSubmitApproval}
                        onPublishCourse={handleQuickPublishCourse}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-extrabold text-[#142746]">
                        Dashboard
                      </h1>
                      <p className="mt-1 text-sm text-[#718096]">
                        আপনার purchased / Admin-granted courses ও learning progress দেখুন।
                      </p>
                    </div>
                  </div>

                  <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <StatCard
                      label="Unlocked Courses"
                      value={String(myCourses.length)}
                    />
                    <StatCard
                      label="Completed"
                      value={String(completedMyCourses.length)}
                    />
                    <StatCard
                      label="In Progress"
                      value={String(
                        myCourses.length - completedMyCourses.length
                      )}
                    />
                    <StatCard label="Average Progress" value={`${avgProgress}%`} />
                  </div>

                  <StudentAchievements
                    userId={currentUser.id}
                    myCourses={myCourses}
                    progress={progress}
                    threshold={settings.threshold}
                  />

                  <div className="space-y-3">
                    {myCourses.slice(0, 5).length === 0 ? (
                      <div className="rounded-[14px] border border-dashed border-[#d0dae8] bg-white p-8 text-center">
                        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#fff7e6] text-[#8c6826] border border-[#f1dca7]">
                          <Lock className="h-5 w-5" />
                        </div>
                        <h3 className="text-base font-extrabold text-[#142746]">
                          Payment Required to Unlock Course Content
                        </h3>
                        <p className="mt-1.5 mx-auto max-w-xl text-sm text-[#718096]">
                          আপনার স্টুডেন্ট লগইন অ্যাক্সেস চালু রয়েছে। তবে যেকোনো কোর্সের ভিডিও ও নোটস খুলতে হলে অবশ্যই পেমেন্ট সম্পূর্ণ করতে হবে। পেমেন্ট করার সাথে সাথেই GST Tax Invoice তৈরি হবে ও কোর্স আনলক হবে।
                        </p>
                        {availableCourses.length > 0 && (
                          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleCheckoutCourse(availableCourses[0].id)
                              }
                              className="rounded-[10px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#18243a] hover:bg-[#cca042] cursor-pointer"
                            >
                              Pay &amp; Enroll Now
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate('courses')}
                              className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                            >
                              Browse Course Catalogue ({availableCourses.length})
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      myCourses.slice(0, 5).map((course) => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          user={currentUser}
                          orders={orders}
                          progress={progress}
                          onEditCourse={(c) =>
                            setCourseModal({ open: true, course: c })
                          }
                          onAddChapter={(courseId) =>
                            setChapterModal({
                              open: true,
                              courseId,
                              chapter: null,
                            })
                          }
                          onDeleteCourse={handleDeleteCourse}
                          onManageCourse={handleOpenLearning}
                          onOpenLearning={handleOpenLearning}
                          onCheckout={handleCheckoutCourse}
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ALL COURSES */}
          {activePage === 'courses' && (
            <div>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-[#142746]">
                    Course Catalogue
                  </h1>
                  <p className="mt-1 text-sm text-[#718096]">
                    প্রতিটি Course আলাদাভাবে কিনুন অথবা Bundle নিন
                  </p>
                </div>

                {canCreateCourse && (
                  <button
                    type="button"
                    onClick={() => setCourseModal({ open: true, course: null })}
                    className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#18243a] hover:bg-[#cca042] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Course</span>
                  </button>
                )}
              </div>

              {availableCourses.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#718096]" />
                    <input
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Search courses..."
                      className="w-full rounded-[10px] border border-[#e3e9f2] bg-white pl-9 pr-3.5 py-2 text-sm outline-none focus:border-[#315b9b]"
                    />
                  </div>

                  {categories.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 rounded-[10px] border border-[#e3e9f2] bg-white p-1">
                      <button
                        type="button"
                        onClick={() => setCatalogCategory('ALL')}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          catalogCategory === 'ALL'
                            ? 'bg-[#142746] text-white'
                            : 'text-[#59677d] hover:text-[#142746]'
                        }`}
                      >
                        All
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCatalogCategory(cat)}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            catalogCategory === cat
                              ? 'bg-[#142746] text-white'
                              : 'text-[#59677d] hover:text-[#142746]'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {filteredCatalogue.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-[#d0dae8] bg-white p-8 text-center text-sm text-[#718096]">
                    No courses published yet.
                  </div>
                ) : (
                  filteredCatalogue.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      user={currentUser}
                      orders={orders}
                      progress={progress}
                      onEditCourse={(c) =>
                        setCourseModal({ open: true, course: c })
                      }
                      onAddChapter={(courseId) =>
                        setChapterModal({
                          open: true,
                          courseId,
                          chapter: null,
                        })
                      }
                      onDeleteCourse={handleDeleteCourse}
                      onManageCourse={handleOpenLearning}
                      onOpenLearning={handleOpenLearning}
                      onCheckout={handleCheckoutCourse}
                      onSubmitApproval={handleQuickSubmitApproval}
                      onPublishCourse={handleQuickPublishCourse}
                    />
                  ))
                )}
              </div>

              {!isAdmin && bundles.length > 0 && (
                <div className="mt-8">
                  <h2 className="mb-3 text-lg font-extrabold text-[#142746]">
                    Course Bundles
                  </h2>
                  <div className="space-y-3">
                    {bundles.map((b) => {
                      const includedTitles = b.courseIds
                        .map(
                          (id) =>
                            courses.find((c) => c.id === id)?.title || 'Course'
                        )
                        .join(' · ');
                      const ownsAll = b.courseIds.every((id) => {
                        const courseObj = courses.find((c) => c.id === id);
                        return courseObj
                          ? hasBoughtCourse(currentUser, courseObj, orders)
                          : false;
                      });
                      const bundlePending =
                        !ownsAll &&
                        orders.some(
                          (o) =>
                            o.userId === currentUser.id &&
                            o.status === 'PENDING' &&
                            b.courseIds.length > 0 &&
                            b.courseIds.every((id) => (o.courseIds || []).includes(id))
                        );
                      return (
                        <article
                          key={b.id}
                          className="flex flex-col justify-between gap-4 rounded-[15px] border border-[#e3e9f2] bg-white p-4 sm:p-5 sm:flex-row sm:items-center"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
                            <div className="aspect-video w-full sm:w-[210px] shrink-0 overflow-hidden rounded-[11px] border border-[#e3e9f2] bg-[#142746]">
                              {b.thumbnailUrl ? (
                                <img
                                  src={b.thumbnailUrl}
                                  alt={`${b.name} bundle thumbnail`}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-[#142746] via-[#1c355e] to-[#0f1d34] p-3.5 text-white">
                                  <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#d7a84b]">
                                    Combo Bundle · {b.courseIds.length} Courses
                                  </div>
                                  <div className="text-xs font-extrabold leading-snug line-clamp-2">
                                    {b.name}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#8c6826]">
                                Bundle Offer · {b.courseIds.length} courses · Includes Bundle Certificate
                              </div>
                              <h3 className="mt-1 text-base font-bold text-[#142746]">
                                {b.name}
                              </h3>
                              <p className="mt-1 text-xs text-[#718096]">
                                {includedTitles}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-lg font-extrabold text-[#142746] tabular-nums">
                              {money(b.price)}
                            </span>
                            {ownsAll ? (
                              <button
                                type="button"
                                onClick={() => navigate('mycourses')}
                                className="rounded-[9px] bg-[#edf2fa] px-4 py-2 text-xs font-bold text-[#142746] whitespace-nowrap cursor-pointer"
                              >
                                Owned · View in My Learning
                              </button>
                            ) : bundlePending ? (
                              <button
                                type="button"
                                disabled
                                className="rounded-[9px] border border-[#f1dca7] bg-[#fffaf0] px-4 py-2 text-xs font-bold text-[#8c6826] whitespace-nowrap cursor-not-allowed"
                              >
                                Verification in Progress
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleCheckoutBundle(b)}
                                className="rounded-[9px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#18243a] hover:bg-[#cca042] whitespace-nowrap cursor-pointer"
                              >
                                Buy Bundle
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MY LEARNING */}
          {activePage === 'mycourses' && (
            <div>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-[#142746]">
                    My Learning
                  </h1>
                  <p className="mt-1 text-sm text-[#718096]">
                    {isAdmin
                      ? 'Select any course to manage chapters, lessons, and preview playback.'
                      : 'আপনি যে Course কিনেছেন বা Admin অ্যাক্সেস দিয়েছেন শুধু সেগুলিই এখানে দেখবেন'}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={myCourses.length === 0}
                  onClick={() => {
                    const summary = downloadProgressCsvReport({
                      user: currentUser,
                      courses: myCourses,
                      progress,
                      settings,
                    });
                    addToast(
                      'success',
                      `Progress CSV downloaded (${summary.courseCount} courses, ${summary.completedLessons} lessons completed).`
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="h-4 w-4 text-[#13845b]" />
                  <span>Download My Progress</span>
                </button>
              </div>

              <div className="space-y-3">
                {myCourses.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-[#d0dae8] bg-white p-8 text-center text-sm text-[#718096]">
                    আপনি এখনও কোনো Course অ্যাক্সেস পাননি।
                  </div>
                ) : (
                  myCourses.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      user={currentUser}
                      orders={orders}
                      progress={progress}
                      showCompletionBar
                      onEditCourse={(c) =>
                        setCourseModal({ open: true, course: c })
                      }
                      onAddChapter={(courseId) =>
                        setChapterModal({
                          open: true,
                          courseId,
                          chapter: null,
                        })
                      }
                      onDeleteCourse={handleDeleteCourse}
                      onManageCourse={handleOpenLearning}
                      onOpenLearning={handleOpenLearning}
                      onCheckout={handleCheckoutCourse}
                    />
                  ))
                )}
              </div>

              {!isAdmin && orders.length > 0 && (
                <div className="mt-8">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-extrabold text-[#142746]">
                        Payment History &amp; GST Tax Invoices
                      </h2>
                      <p className="text-xs text-[#718096]">
                        পেমেন্ট সম্পূর্ণ হলেই GST ইনভয়েস জেনারেট হয় এবং আপনার Gmail ও WhatsApp-এ অটোমেটিক পাঠানো হয়
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-[13px] border border-[#e3e9f2] bg-white">
                    <table className="w-full min-w-[660px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
                          <th className="px-4 py-3 font-bold">Sl. &amp; Invoice #</th>
                          <th className="px-4 py-3 font-bold">Course / Bundle</th>
                          <th className="px-4 py-3 font-bold">Total &amp; GST</th>
                          <th className="px-4 py-3 font-bold">Status</th>
                          <th className="px-4 py-3 font-bold text-right">
                            Invoice &amp; Bill
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => {
                          const serial =
                            o.status === 'PAID' ? getOrderInvoiceSerial(o) : 0;
                          return (
                            <tr
                              key={o.id}
                              className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                            >
                              <td className="px-4 py-3 font-mono font-bold text-[#142746]">
                                {o.status === 'PAID' && o.invoiceNumber ? (
                                  <div>
                                    {serial > 0 ? `#${serial} · ` : ''}
                                    {o.invoiceNumber}
                                  </div>
                                ) : (
                                  <div className="text-[#8c6826]">
                                    No Invoice Yet
                                  </div>
                                )}
                                <div className="text-[11px] font-normal text-[#718096]">
                                  {new Date(o.paidAt || o.created).toLocaleDateString(
                                    'en-IN'
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-semibold text-[#142746]">
                                <div>{o.itemName}</div>
                                {o.discount > 0 && (
                                  <div className="text-[11px] font-normal text-[#13845b]">
                                    Discount: -{money(o.discount)}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono tabular-nums text-[#142746]">
                                <div className="font-bold">{money(o.total)}</div>
                                <div className="text-[11px] text-[#718096]">
                                  {o.gstSplit === 'igst' ? 'IGST' : 'CGST+SGST'}:{' '}
                                  {money(o.gst)} ({o.gstRate ?? 0}%)
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`font-bold ${
                                    o.status === 'PAID'
                                      ? 'text-[#13845b]'
                                      : o.status === 'REJECTED'
                                        ? 'text-[#c64b58]'
                                        : 'text-[#8c6826]'
                                  }`}
                                >
                                  {o.status === 'PAID' ? 'PAID · ACTIVE' : o.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {o.status === 'PAID' ? (
                                  <button
                                    type="button"
                                    onClick={() => setInvoiceOrder(o)}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#edf2fa] px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] cursor-pointer"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    <span>Tax Invoice</span>
                                  </button>
                                ) : (
                                  <span className="text-[11px] font-semibold text-[#8c6826]">
                                    {o.status === 'PENDING'
                                      ? 'Unlocks after payment approval'
                                      : 'No invoice'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LEARNING PLAYER / CURRICULUM EDITOR */}
          {activePage === 'learning' && activeLearningCourse && (
            <LearningView
              course={activeLearningCourse}
              user={currentUser}
              settings={settings}
              progress={progress}
              quizAttempts={quizAttempts}
              assignmentSubmissions={assignmentSubmissions}
              onBack={() => navigate(isAdmin ? 'courses' : 'mycourses')}
              onMarkLessonComplete={async (courseId, lessonId) => {
                await store.markLessonComplete(
                  currentUser.id,
                  courseId,
                  lessonId
                );
                addToast('success', 'Lesson completion saved.');
              }}
              onRecordWatchDelta={(courseId, lessonId, delta, duration) => {
                store.recordWatchDelta(
                  currentUser.id,
                  courseId,
                  lessonId,
                  delta,
                  duration
                );
              }}
              onOpenCertificate={(c) =>
                setCertTarget({ type: 'course', course: c })
              }
              onAddChapter={(courseId) =>
                setChapterModal({ open: true, courseId, chapter: null })
              }
              onEditChapter={(courseId, chapter) =>
                setChapterModal({ open: true, courseId, chapter })
              }
              onDeleteChapter={handleDeleteChapter}
              onAddLesson={(courseId, chapterId) =>
                setLessonModal({
                  open: true,
                  courseId,
                  chapterId,
                  lesson: null,
                })
              }
              onEditLesson={(courseId, chapterId, lesson) =>
                setLessonModal({
                  open: true,
                  courseId,
                  chapterId,
                  lesson,
                })
              }
              onDeleteLesson={handleDeleteLesson}
              onSaveQuiz={store.saveQuiz}
              onDeleteQuiz={store.deleteQuiz}
              onSaveAssignment={store.saveAssignment}
              onDeleteAssignment={store.deleteAssignment}
              onSubmitQuizAttempt={store.submitQuizAttempt}
              onSubmitAssignmentResponse={store.submitAssignmentResponse}
              onReviewSubmission={store.reviewAssignmentSubmission}
              onToast={addToast}
            />
          )}

          {/* ADMIN: APPROVALS & VERSION HISTORY */}
          {activePage === 'approvals' && isAdmin && (
            <ApprovalsAndVersionsPage
              currentUser={currentUser}
              courses={courses}
              onSubmitForApproval={store.submitCourseApproval}
              onApproveCourse={store.approveCourse}
              onPublishCourse={store.publishCourse}
              onRejectCourse={store.rejectCourse}
              onRequestRevision={store.requestCourseRevision}
              onArchiveCourse={store.archiveCourse}
              onFetchVersions={store.fetchCourseVersions}
              onRestoreVersion={store.restoreCourseVersion}
              onToast={addToast}
            />
          )}

          {/* ADMIN: STUDENTS */}
          {activePage === 'students' && isAdmin && canViewStudents && (
            <StudentsPage
              users={users}
              orders={orders}
              canManage={canManageStudents}
              onOpenAddStudent={() => setStudentModalOpen(true)}
              onToggleStudent={async (id) => {
                await store.toggleStudentActive(id);
                addToast('info', 'Student status updated.');
              }}
              onManageAccess={(student) => setAccessModalStudent(student)}
            />
          )}

          {/* SUPER ADMIN ONLY: ORDERS & FINANCIAL LEDGER */}
          {activePage === 'orders' &&
            isAdmin &&
            (owner ? (
              <OrdersPage
                orders={orders}
                users={users}
                methods={methods}
                settings={settings}
                initialMonthFilter={ordersMonthFilter}
                onApprove={async (id) => {
                  await store.approveOrder(id);
                  addToast(
                    'success',
                    'Order approved, GST Tax Invoice generated & dispatched.'
                  );
                }}
                onReject={async (id) => {
                  await store.rejectOrder(id);
                  addToast('info', 'Order rejected.');
                }}
                onRefund={async (id, reason, amount) => {
                  const res = await store.refundOrder(id, reason, amount);
                  if (!res.ok) {
                    addToast('error', res.error || 'Could not process refund.');
                    return;
                  }
                  addToast('info', 'Order marked refunded.');
                }}
                onViewInvoice={(o) => setInvoiceOrder(o)}
                onSendInvoice={store.resendOrderEmail}
                onToast={addToast}
              />
            ) : (
              <RestrictedOwnerNotice onBack={() => navigate('dashboard')} />
            ))}

          {/* SUPER ADMIN ONLY: COUPONS & BUNDLES */}
          {activePage === 'promos' &&
            isAdmin &&
            (owner ? (
              <PromosPage
                courses={courses}
                coupons={coupons}
                bundles={bundles}
                onSaveCoupon={async (p) => {
                  await store.saveCoupon(p);
                }}
                onToggleCoupon={async (id) => {
                  await store.toggleCoupon(id);
                }}
                onDeleteCoupon={async (id) => {
                  await store.deleteCoupon(id);
                }}
                onSaveBundle={async (n, ids, p, extra) => {
                  await store.saveBundle(n, ids, p, extra);
                }}
                onUpdateBundle={async (bundleId, payload) => {
                  await store.updateBundle(bundleId, payload);
                }}
                onDeleteBundle={async (id) => {
                  await store.deleteBundle(id);
                }}
                onToast={addToast}
              />
            ) : (
              <RestrictedOwnerNotice onBack={() => navigate('dashboard')} />
            ))}

          {/* ADMIN TEAM & RBAC */}
          {activePage === 'admin_team' && isAdmin && canViewAdminTeam && (
            <AdminTeamPage
              currentUser={currentUser}
              courses={courses}
              onFetchTeam={store.fetchAdminTeam}
              onCreateSubAdmin={store.createSubAdmin}
              onInviteAdmin={store.inviteAdmin}
              onCancelInvitation={store.cancelInvitation}
              onUpdateSubAdmin={store.updateSubAdmin}
              onAssignCourses={store.assignAdminCourses}
              onUpdateStatus={store.updateAdminStatus}
              onResetPassword={store.resetAdminPassword}
              onDeleteAdmin={store.deleteSubAdmin}
              onTerminateUserSessions={store.terminateUserSessions}
              onFetchRegistrations={store.fetchAdminRegistrations}
              onApproveRegistration={store.approveAdminRegistration}
              onActivateRegistration={store.activateAdminRegistration}
              onRejectRegistration={store.rejectAdminRegistration}
              onFetchRecoveryRequests={store.fetchRecoveryRequests}
              onApproveRecoveryRequest={store.approveRecoveryRequest}
              onRejectRecoveryRequest={store.rejectRecoveryRequest}
              onFetchSessions={store.fetchSessions}
              onRevokeSession={store.revokeSession}
              onToast={addToast}
            />
          )}

          {/* AUDIT LOGS & PERSONAL 2FA SECURITY */}
          {activePage === 'audit_logs' && isAdmin && (
            <AuditAndSecurityPage
              currentUser={currentUser}
              whatsappCloudApiConfigured={whatsappCloudApiConfigured}
              onRegenerateBackupCodes={store.regenerateBackupCodes}
              onUpdateRecoveryPin={store.updateRecoveryPin}
              onSendWhatsappOtp={store.sendWhatsappOtp}
              onVerifyWhatsappOtp={store.verifyWhatsappOtp}
              onFetchSessions={store.fetchSessions}
              onRevokeSession={store.revokeSession}
              onFetchAuditLogs={store.fetchAuditLogs}
              onDownloadBackup={store.downloadSystemBackup}
              onRestoreBackup={store.restoreSystemBackup}
              onToast={addToast}
            />
          )}

          {/* SUPPORT DESK & CERTIFICATE VERIFICATION */}
          {activePage === 'support' && (
            <SupportDeskPage
              currentUser={currentUser}
              courses={courses}
              onFetchTickets={store.fetchSupportTickets}
              onCreateTicket={store.createSupportTicket}
              onReplyTicket={store.replySupportTicket}
              onUpdateTicketStatus={store.updateSupportTicketStatus}
              onVerifyCertificate={store.verifyCertificate}
              onFetchCertificateRegistry={store.fetchCertificateRegistry}
              onRevokeCertificate={store.revokeCertificate}
              onReinstateCertificate={store.reinstateCertificate}
              onToast={addToast}
            />
          )}

          {/* SUPER ADMIN ONLY: SETTINGS */}
          {activePage === 'settings' &&
            isAdmin &&
            (owner ? (
              <SettingsPage
                settings={settings}
                methods={methods}
                onSaveSettings={async (partial) => {
                  await store.updateSettings(partial);
                }}
                onAddMethod={async (payload) => {
                  await store.addPaymentMethod(payload);
                }}
                onToggleMethod={async (id) => {
                  await store.togglePaymentMethod(id);
                }}
                onEditMethod={(m) => setMethodModal(m)}
                onDeleteMethod={async (id) => {
                  await store.deletePaymentMethod(id);
                }}
                onTestEmail={store.testEmailNotification}
                onSaveWhatsappConfig={store.saveWhatsappApiConfig}
                onFetchWhatsappLogs={store.fetchWhatsappDeliveryLogs}
                onTestWhatsapp={store.testWhatsappDelivery}
                onSendWhatsappOtp={store.sendWhatsappOtp}
                onVerifyWhatsappOtp={store.verifyWhatsappOtp}
                onToast={addToast}
              />
            ) : (
              <RestrictedOwnerNotice onBack={() => navigate('dashboard')} />
            ))}

          {/* CERTIFICATES */}
          {activePage === 'certificates' &&
            (() => {
              const studentList = users.filter((u) => u.role === 'student');
              const studentCertMap = new Map(
                certificates
                  .filter((r) => r.studentId === currentUser.id)
                  .map((r) => [`${r.targetType}:${r.targetId}`, r])
              );

              const earnedStudentCourses = !isAdmin
                ? courses.filter(
                    (c) =>
                      completedMyCourses.some((mc) => mc.id === c.id) ||
                      studentCertMap.has(`course:${c.id}`)
                  )
                : [];

              const earnedStudentBundles = !isAdmin
                ? bundles.filter((b) => {
                    if (studentCertMap.has(`bundle:${b.id}`)) return true;
                    if (!b.courseIds.length) return false;
                    return b.courseIds.every((cid) => {
                      const cObj = courses.find((c) => c.id === cid);
                      return (
                        cObj &&
                        hasBoughtCourse(currentUser, cObj, orders) &&
                        isCertificateEligible(
                          currentUser.id,
                          cObj,
                          progress,
                          settings.threshold
                        )
                      );
                    });
                  })
                : [];

              const handleAdminCustomCertUpload = async (
                e: ChangeEvent<HTMLInputElement>
              ) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const parsed = await readCertificateAssetFile(file);
                  setCustomCertFileUrl(parsed.dataUrl);
                  setCustomCertFileName(parsed.fileName);
                  addToast('success', `Loaded ${parsed.fileName}`);
                } catch (err) {
                  addToast(
                    'error',
                    err instanceof Error
                      ? err.message
                      : 'Could not read certificate file.'
                  );
                }
                e.target.value = '';
              };

              const handleSaveCustomCert = async (e: FormEvent) => {
                e.preventDefault();
                if (!customCertStudentId || !customCertTargetKey) {
                  addToast('error', 'Select both Student and Course / Bundle.');
                  return;
                }
                if (!customCertFileUrl) {
                  addToast(
                    'error',
                    'Please upload a certificate image or PDF file.'
                  );
                  return;
                }
                const [targetType, targetId] = customCertTargetKey.split(':');
                const targetTitle =
                  targetType === 'bundle'
                    ? bundles.find((b) => b.id === targetId)?.name || 'Bundle'
                    : courses.find((c) => c.id === targetId)?.title || 'Course';

                setSavingCustomCert(true);
                try {
                  const res = await store.saveCustomCertificate({
                    studentId: customCertStudentId,
                    targetType:
                      targetType === 'bundle' ? 'bundle' : 'course',
                    targetId,
                    targetTitle,
                    certificateNo: customCertNo.trim() || undefined,
                    issuedDate: customCertIssuedDate || undefined,
                    mode: 'uploaded',
                    fileUrl: customCertFileUrl,
                    fileName: customCertFileName,
                    notes: customCertNotes.trim() || undefined,
                  });
                  if (!res.ok) {
                    addToast(
                      'error',
                      res.error || 'Could not assign certificate.'
                    );
                    return;
                  }
                  addToast(
                    'success',
                    'Handmade / external certificate issued to student (read-only).'
                  );
                  setCustomCertFileUrl('');
                  setCustomCertFileName('');
                  setCustomCertNo('');
                  setCustomCertNotes('');
                } finally {
                  setSavingCustomCert(false);
                }
              };

              return (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-extrabold text-[#142746]">
                        {isAdmin
                          ? 'Certificate Studio · Templates, Uploads & Signature'
                          : 'My Verified A4 Certificates'}
                      </h1>
                      <p className="mt-1 text-sm text-[#718096] tabular-nums">
                        {isAdmin
                          ? 'Customize A4 Navy & Gold certificates per Course/Bundle or upload handmade certificates designed in external software.'
                          : `Auto-generated upon reaching ${settings.threshold}% course completion · Read-only official A4 documents`}
                      </p>
                    </div>
                    {owner && (
                      <button
                        type="button"
                        onClick={() => navigate('settings')}
                        className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#dce6f7] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] whitespace-nowrap cursor-pointer"
                      >
                        <Award className="h-4 w-4 text-[#8c6826]" />
                        <span>
                          {settings.certSignatureUrl
                            ? 'Signature Photo Active · Edit'
                            : 'Upload Authorized Signature'}
                        </span>
                      </button>
                    )}
                  </div>

                  {isAdmin ? (
                    <>
                      {!owner && (
                        <div className="rounded-[13px] border border-[#d3dff2] bg-[#f4f8ff] px-4 py-3 text-xs text-[#315b9b]">
                          <strong>Verification Preview Mode:</strong> Only the{' '}
                          <strong>Main Super Admin (Owner)</strong> can upload handmade certificates, alter global signature settings, or edit course/bundle certificate templates. Use{' '}
                          <button
                            type="button"
                            onClick={() => navigate('support')}
                            className="font-bold underline cursor-pointer"
                          >
                            Support &amp; Cert Verify
                          </button>{' '}
                          to look up certificate numbers.
                        </div>
                      )}

                      {/* Admin Panel 1: Issue Handmade / External Software Certificate to Any Student (Owner Only) */}
                      {owner && (
                      <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
                        <h2 className="text-base font-extrabold text-[#142746]">
                          Issue Handmade / External Software Certificate to Student
                        </h2>
                        <p className="mt-0.5 text-xs text-[#718096] mb-4">
                          Created a certificate outside (Photoshop / Canva / CorelDraw)? Upload PNG, JPG, or PDF for any Student &amp; Course/Bundle. Students can view &amp; download it, but cannot edit it.
                        </p>

                        <form
                          onSubmit={handleSaveCustomCert}
                          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 rounded-[12px] border border-[#dce6f5] bg-[#f8fafd] p-4"
                        >
                          <div>
                            <label className="block text-xs font-bold text-[#59677d] mb-1">
                              Select Student *
                            </label>
                            <select
                              required
                              value={customCertStudentId}
                              onChange={(e) =>
                                setCustomCertStudentId(e.target.value)
                              }
                              className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                            >
                              <option value="">Choose student...</option>
                              {studentList.map((st) => (
                                <option key={st.id} value={st.id}>
                                  {st.name} ({st.email})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-[#59677d] mb-1">
                              Course or Bundle *
                            </label>
                            <select
                              required
                              value={customCertTargetKey}
                              onChange={(e) =>
                                setCustomCertTargetKey(e.target.value)
                              }
                              className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                            >
                              <option value="">Choose course / bundle...</option>
                              {courses.map((c) => (
                                <option key={c.id} value={`course:${c.id}`}>
                                  Course: {c.title}
                                </option>
                              ))}
                              {bundles.map((b) => (
                                <option key={b.id} value={`bundle:${b.id}`}>
                                  Bundle: {b.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-[#59677d] mb-1">
                              Certificate No (optional)
                            </label>
                            <input
                              value={customCertNo}
                              onChange={(e) => setCustomCertNo(e.target.value)}
                              placeholder="Auto if blank"
                              className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-[#59677d] mb-1">
                              Issue Date
                            </label>
                            <input
                              type="date"
                              value={customCertIssuedDate}
                              onChange={(e) =>
                                setCustomCertIssuedDate(e.target.value)
                              }
                              className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                            />
                          </div>

                          <div className="md:col-span-2 flex flex-wrap items-center gap-2.5 pt-1">
                            <label className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#dce6f7] bg-white px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer">
                              <Upload className="h-3.5 w-3.5 text-[#315b9b]" />
                              <span>
                                {customCertFileUrl
                                  ? `Loaded: ${customCertFileName}`
                                  : 'Upload Handmade Certificate (PNG/JPG/PDF)'}
                              </span>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={handleAdminCustomCertUpload}
                                className="sr-only"
                              />
                            </label>
                          </div>

                          <div>
                            <input
                              value={customCertNotes}
                              onChange={(e) =>
                                setCustomCertNotes(e.target.value)
                              }
                              placeholder="Optional remark..."
                              className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={savingCustomCert}
                              className="w-full rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
                            >
                              {savingCustomCert
                                ? 'Issuing...'
                                : 'Publish to Student Portal'}
                            </button>
                          </div>
                        </form>

                        {certificates.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <div className="text-xs font-bold text-[#59677d]">
                              Issued Custom Student Certificates ({certificates.length})
                            </div>
                            {certificates.map((rec) => {
                              const st = users.find(
                                (u) => u.id === rec.studentId
                              );
                              return (
                                <div
                                  key={rec.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-xs"
                                >
                                  <div>
                                    <span className="font-bold text-[#142746]">
                                      {st?.name || 'Student'}
                                    </span>
                                    <span className="mx-1.5 text-[#cbd5e1]">
                                      ·
                                    </span>
                                    <span className="font-semibold text-[#315b9b]">
                                      {rec.targetTitle}
                                    </span>
                                    <span className="mx-1.5 text-[#cbd5e1]">
                                      ·
                                    </span>
                                    <span className="font-mono text-[#718096]">
                                      {rec.certificateNo}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      store.deleteCustomCertificate(rec.id)
                                    }
                                    className="inline-flex items-center gap-1 rounded-md border border-[#e3e9f2] px-2.5 py-1 font-semibold text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span>Remove</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      )}

                      {/* Admin Panel 2: Course-Wise Certificate Templates */}
                      <div>
                        <h2 className="mb-3 text-base font-extrabold text-[#142746]">
                          Course-Wise Certificates ({courses.length})
                        </h2>
                        {courses.length === 0 ? (
                          <div className="rounded-[14px] border border-dashed border-[#d0dae8] bg-white p-8 text-center text-sm text-[#718096]">
                            Create a course first to customize or preview its certificate.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {courses.map((c) => {
                              const isUploaded =
                                c.certificateConfig?.mode === 'uploaded' &&
                                Boolean(c.certificateConfig?.customTemplateUrl);
                              return (
                                <div
                                  key={c.id}
                                  className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 flex items-center justify-between gap-4"
                                >
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-[#8c6826]">
                                      {c.category || 'Course'} ·{' '}
                                      {isUploaded
                                        ? 'Uploaded Custom Artwork'
                                        : 'Auto A4 E-Certificate'}
                                    </div>
                                    <h3 className="mt-0.5 text-base font-bold text-[#142746] truncate">
                                      {c.title}
                                    </h3>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {owner && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCertTemplateEditTarget({
                                            type: 'course',
                                            course: c,
                                          })
                                        }
                                        className="inline-flex items-center gap-1 rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] whitespace-nowrap cursor-pointer"
                                      >
                                        <Pencil className="h-3 w-3" />
                                        <span>Edit</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCertTarget({
                                          type: 'course',
                                          course: c,
                                        })
                                      }
                                      className="rounded-[9px] bg-[#edf2fa] px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] whitespace-nowrap cursor-pointer"
                                    >
                                      Preview A4
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Admin Panel 3: Separate Bundle Certificates */}
                      {bundles.length > 0 && (
                        <div>
                          <h2 className="mb-3 text-base font-extrabold text-[#142746]">
                            Bundle Certificates ({bundles.length})
                          </h2>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {bundles.map((b) => {
                              const isUploaded =
                                b.certificateConfig?.mode === 'uploaded' &&
                                Boolean(b.certificateConfig?.customTemplateUrl);
                              return (
                                <div
                                  key={b.id}
                                  className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 flex items-center justify-between gap-4"
                                >
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-[#13845b]">
                                      Bundle Program ({b.courseIds.length}{' '}
                                      courses) ·{' '}
                                      {isUploaded
                                        ? 'Uploaded Custom Artwork'
                                        : 'Auto A4 E-Certificate'}
                                    </div>
                                    <h3 className="mt-0.5 text-base font-bold text-[#142746] truncate">
                                      {b.name}
                                    </h3>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {owner && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCertTemplateEditTarget({
                                            type: 'bundle',
                                            bundle: b,
                                          })
                                        }
                                        className="inline-flex items-center gap-1 rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] whitespace-nowrap cursor-pointer"
                                      >
                                        <Pencil className="h-3 w-3" />
                                        <span>Edit</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCertTarget({
                                          type: 'bundle',
                                          bundle: b,
                                        })
                                      }
                                      className="rounded-[9px] bg-[#edf2fa] px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] whitespace-nowrap cursor-pointer"
                                    >
                                      Preview A4
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Student Profile Completeness Prompt (Read-only certificates auto-use profile info) */}
                      {(!currentUser.address || !currentUser.guardianName) && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[13px] border border-[#f1dca7] bg-[#fffaf0] px-4 py-3 text-xs text-[#59677d]">
                          <span>
                            <strong className="text-[#142746]">
                              Complete Your Profile for Certificate Details:
                            </strong>{' '}
                            Add your Father/Guardian Name and Postal Address in{' '}
                            <strong>My Profile</strong> so your e-certificate prints with complete verified details.
                          </span>
                          <button
                            type="button"
                            onClick={() => navigate('profile')}
                            className="rounded-[8px] bg-[#142746] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#1e3761] whitespace-nowrap cursor-pointer"
                          >
                            Update My Profile
                          </button>
                        </div>
                      )}

                      {earnedStudentCourses.length === 0 &&
                      earnedStudentBundles.length === 0 ? (
                        <div className="rounded-[14px] border border-dashed border-[#d0dae8] bg-white p-8 text-center text-sm text-[#718096]">
                          {settings.threshold}% threshold পূরণ হলে Course ও Bundle-এর Read-Only A4 Certificate এখানে পাওয়া যাবে।
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {earnedStudentCourses.length > 0 && (
                            <div>
                              <h2 className="mb-3 text-base font-extrabold text-[#142746]">
                                Course-Wise Certificates
                              </h2>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {earnedStudentCourses.map((c) => {
                                  const customRec = studentCertMap.get(
                                    `course:${c.id}`
                                  );
                                  return (
                                    <div
                                      key={c.id}
                                      className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 flex items-center justify-between gap-4"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-xs font-semibold text-[#13845b] tabular-nums">
                                          {customRec
                                            ? `Official Issued · ${customRec.certificateNo}`
                                            : `Course progress: ${getUserCourseProgress(currentUser.id, c, progress)}%`}
                                        </div>
                                        <h3 className="mt-0.5 text-base font-bold text-[#142746] truncate">
                                          {c.title}
                                        </h3>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCertTarget({
                                            type: 'course',
                                            course: c,
                                          })
                                        }
                                        className="rounded-[9px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#18243a] hover:bg-[#cca042] whitespace-nowrap shrink-0 cursor-pointer"
                                      >
                                        View / Download A4
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {earnedStudentBundles.length > 0 && (
                            <div>
                              <h2 className="mb-3 text-base font-extrabold text-[#142746]">
                                Bundle Program Certificates
                              </h2>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {earnedStudentBundles.map((b) => (
                                  <div
                                    key={b.id}
                                    className="rounded-[15px] border border-[#d7a84b] bg-[#fffdf7] p-5 flex items-center justify-between gap-4"
                                  >
                                    <div className="min-w-0">
                                      <div className="text-xs font-bold text-[#8c6826]">
                                        Complete Bundle Certification ·{' '}
                                        {b.courseIds.length} Courses
                                      </div>
                                      <h3 className="mt-0.5 text-base font-bold text-[#142746] truncate">
                                        {b.name}
                                      </h3>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCertTarget({
                                          type: 'bundle',
                                          bundle: b,
                                        })
                                      }
                                      className="rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] whitespace-nowrap shrink-0 cursor-pointer"
                                    >
                                      View / Download A4
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

          {/* PROFILE */}
          {activePage === 'profile' && (
            <div className="max-w-xl rounded-[15px] border border-[#e3e9f2] bg-white p-6">
              <h1 className="text-xl font-extrabold text-[#142746]">
                My Profile
              </h1>
              <p className="mt-1 text-xs text-[#718096]">
                Your Name, Guardian Name, Address &amp; State automatically populate your GST Tax Invoices and verified A4 E-Certificates.
              </p>
              <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                      Full Name (Printed on Certificate) *
                    </label>
                    <input
                      required
                      value={profileNameDraft ?? currentUser.name}
                      onChange={(e) => setProfileNameDraft(e.target.value)}
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                      Father / Guardian Name (for Certificate)
                    </label>
                    <input
                      value={
                        profileGuardianDraft ?? currentUser.guardianName ?? ''
                      }
                      onChange={(e) => setProfileGuardianDraft(e.target.value)}
                      placeholder="S/O or D/O Full Name"
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                    {isAdmin
                      ? 'Admin Login ID / Email'
                      : 'Student Gmail / Email ID'}
                  </label>
                  <input
                    disabled={!owner}
                    value={
                      owner
                        ? (profileEmailDraft ?? currentUser.email)
                        : currentUser.email
                    }
                    onChange={(e) => setProfileEmailDraft(e.target.value)}
                    className={`w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm ${
                      owner
                        ? 'bg-white text-[#1d2940] outline-none focus:border-[#315b9b]'
                        : 'bg-[#f8fafd] text-[#718096]'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                      WhatsApp / Phone Number (for Billing &amp; Alerts)
                    </label>
                    <input
                      type="tel"
                      value={profilePhoneDraft ?? currentUser.phone ?? ''}
                      onChange={(e) => setProfilePhoneDraft(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#315b9b]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                      Paying GST From State / UT (Auto Tax &amp; Certificate)
                    </label>
                    <select
                      required={!isAdmin}
                      value={profileStateDraft ?? currentUser.state ?? ''}
                      onChange={(e) => setProfileStateDraft(e.target.value)}
                      className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                    >
                      <option value="">Select State / UT...</option>
                      {INDIAN_GST_STATES.map((st) => (
                        <option key={st.code} value={st.name}>
                          {st.code} - {st.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-[#718096]">
                      GST (CGST+SGST / IGST) auto-calculates from this State. You can only change it here in My Profile.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                    Postal Address (for Certificate &amp; Tax Invoice)
                  </label>
                  <input
                    value={profileAddressDraft ?? currentUser.address ?? ''}
                    onChange={(e) => setProfileAddressDraft(e.target.value)}
                    placeholder="House / Street / Locality"
                    className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                      City / District
                    </label>
                    <input
                      value={profileCityDraft ?? currentUser.city ?? ''}
                      onChange={(e) => setProfileCityDraft(e.target.value)}
                      placeholder="e.g. Kolkata"
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                      PIN Code
                    </label>
                    <input
                      value={profilePincodeDraft ?? currentUser.pincode ?? ''}
                      onChange={(e) => setProfilePincodeDraft(e.target.value)}
                      placeholder="e.g. 700001"
                      maxLength={10}
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#315b9b]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                    Account Role
                  </label>
                  <input
                    disabled
                    value={
                      isAdmin
                        ? ADMIN_ROLE_LABELS[
                            getEffectiveAdminRole(currentUser) || 'ADMIN'
                          ]
                        : 'Student'
                    }
                    className="w-full rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] px-3.5 py-2.5 text-sm text-[#718096]"
                  />
                </div>

                <div className="pt-3 border-t border-[#e3e9f2] space-y-3">
                  <div className="text-xs font-bold text-[#142746]">
                    Change Password (optional)
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1">
                      Current password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Required only if changing password"
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2 text-sm outline-none focus:border-[#315b9b]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1">
                      New password ({isAdmin ? 'min 8 chars' : 'min 6 chars'})
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Leave blank to keep current password"
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2 text-sm outline-none focus:border-[#315b9b]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="rounded-[10px] bg-[#142746] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                >
                  Save Profile
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-[#e3e9f2]">
                <VerifyWhatsappWidget
                  user={currentUser}
                  whatsappCloudApiConfigured={whatsappCloudApiConfigured}
                  onSendOtp={store.sendWhatsappOtp}
                  onVerifyOtp={store.verifyWhatsappOtp}
                  onToast={addToast}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <CourseModal
        open={courseModal.open}
        course={courseModal.course}
        canEditPricing={owner}
        canPublish={
          owner ||
          hasPermission(currentUser, 'course_publish') ||
          hasPermission(currentUser, 'course_publish', courseModal.course?.id)
        }
        onClose={() => setCourseModal({ open: false, course: null })}
        onSave={async (data) => {
          const res = await store.saveCourse(data);
          if (!res.ok) {
            addToast('error', res.error || 'Could not save course.');
            return;
          }
          addToast('success', data.id ? 'Course updated.' : 'Course created.');
        }}
      />

      <ChapterModal
        open={chapterModal.open}
        chapter={chapterModal.chapter}
        onClose={() =>
          setChapterModal({ open: false, courseId: '', chapter: null })
        }
        onSave={async (title) => {
          const res = await store.saveChapter(
            chapterModal.courseId,
            chapterModal.chapter?.id,
            title
          );
          if (!res.ok) {
            addToast('error', res.error || 'Could not save chapter.');
            return;
          }
          if (activePage !== 'learning') {
            setActiveCourseId(chapterModal.courseId);
            setActivePage('learning');
          }
          addToast(
            'success',
            chapterModal.chapter ? 'Chapter updated.' : 'Chapter added.'
          );
        }}
      />

      <LessonModal
        open={lessonModal.open}
        lesson={lessonModal.lesson}
        onClose={() =>
          setLessonModal({
            open: false,
            courseId: '',
            chapterId: '',
            lesson: null,
          })
        }
        onSave={async (payload) => {
          const res = await store.saveLesson(
            lessonModal.courseId,
            lessonModal.chapterId,
            lessonModal.lesson?.id,
            payload
          );
          if (!res.ok) {
            addToast('error', res.error || 'Could not save lesson.');
            return;
          }
          addToast(
            'success',
            lessonModal.lesson ? 'Lesson updated.' : 'Lesson added.'
          );
        }}
      />

      <StudentModal
        open={studentModalOpen}
        onClose={() => setStudentModalOpen(false)}
        onCreate={async (name, email, phone, state, password) => {
          const res = await store.createStudent(
            name,
            email,
            phone,
            state,
            password
          );
          if (res.ok) addToast('success', 'Student account created.');
          return res;
        }}
      />

      <StudentAccessModal
        open={Boolean(accessModalStudent)}
        student={
          accessModalStudent
            ? users.find((u) => u.id === accessModalStudent.id) ||
              accessModalStudent
            : null
        }
        courses={courses}
        manageableCourseIds={
          owner ? null : currentUser.assignedCourseIds || []
        }
        onClose={() => setAccessModalStudent(null)}
        onSaveAccess={async (studentId, courseIds) => {
          const res = await store.updateStudentAccess(studentId, courseIds);
          if (!res.ok) {
            addToast('error', res.error || 'Could not update course access.');
            return;
          }
          addToast(
            'success',
            'Student course access updated across all devices.'
          );
        }}
      />

      <CheckoutModal
        open={Boolean(checkoutItem)}
        item={
          checkoutItem
            ? checkoutItem.type === 'course'
              ? {
                  type: 'course',
                  data:
                    courses.find((c) => c.id === checkoutItem.data.id) ||
                    checkoutItem.data,
                }
              : {
                  type: 'bundle',
                  data:
                    bundles.find((b) => b.id === checkoutItem.data.id) ||
                    checkoutItem.data,
                }
            : null
        }
        user={currentUser}
        settings={settings}
        methods={methods}
        onClose={() => setCheckoutItem(null)}
        onPreviewCheckout={store.previewCheckout}
        onVerifyReference={store.verifyPaymentReference}
        onSubmitOrder={handleSubmitOrder}
        onStartLearning={(courseId) => handleOpenLearning(courseId)}
        onViewInvoice={(order) => setInvoiceOrder(order)}
        onOpenProfile={() => navigate('profile')}
      />

      <PaymentMethodModal
        open={Boolean(methodModal)}
        method={
          methodModal
            ? methods.find((m) => m.id === methodModal.id) || methodModal
            : null
        }
        brandName={settings.brand}
        onClose={() => setMethodModal(null)}
        onSave={async (id, payload) => {
          await store.updatePaymentMethod(id, payload);
          addToast('success', 'Payment method updated.');
        }}
      />

      <TaxInvoiceModal
        open={Boolean(invoiceOrder)}
        order={
          invoiceOrder
            ? orders.find((o) => o.id === invoiceOrder.id) || invoiceOrder
            : null
        }
        settings={settings}
        methods={methods}
        user={currentUser}
        onClose={() => setInvoiceOrder(null)}
        onResendEmail={store.resendOrderEmail}
      />

      <CertificateModal
        open={Boolean(certTarget)}
        target={
          certTarget
            ? certTarget.type === 'course'
              ? {
                  type: 'course',
                  course:
                    courses.find((c) => c.id === certTarget.course.id) ||
                    certTarget.course,
                }
              : {
                  type: 'bundle',
                  bundle:
                    bundles.find((b) => b.id === certTarget.bundle.id) ||
                    certTarget.bundle,
                }
            : null
        }
        allCourses={courses}
        user={currentUser}
        settings={settings}
        customRecords={certificates}
        onEditAsAdmin={
          owner && certTarget
            ? () => setCertTemplateEditTarget(certTarget)
            : undefined
        }
        onClose={() => setCertTarget(null)}
      />

      <CertificateTemplateModal
        open={Boolean(certTemplateEditTarget)}
        target={
          certTemplateEditTarget
            ? certTemplateEditTarget.type === 'course'
              ? {
                  type: 'course',
                  course:
                    courses.find(
                      (c) => c.id === certTemplateEditTarget.course.id
                    ) || certTemplateEditTarget.course,
                }
              : {
                  type: 'bundle',
                  bundle:
                    bundles.find(
                      (b) => b.id === certTemplateEditTarget.bundle.id
                    ) || certTemplateEditTarget.bundle,
                }
            : null
        }
        onClose={() => setCertTemplateEditTarget(null)}
        onSave={async (cfg) => {
          if (!certTemplateEditTarget) return;
          if (certTemplateEditTarget.type === 'course') {
            const c = certTemplateEditTarget.course;
            await store.saveCourse({
              id: c.id,
              title: c.title,
              category: c.category,
              description: c.description,
              thumbnailUrl: c.thumbnailUrl,
              price: c.price,
              paymentPlans: c.paymentPlans,
              certificateConfig: cfg,
              visibility: c.visibility,
            });
            addToast('success', 'Course certificate design updated.');
          } else {
            const b = certTemplateEditTarget.bundle;
            await store.updateBundle(b.id, { certificateConfig: cfg });
            addToast('success', 'Bundle certificate design updated.');
          }
        }}
      />

      <AnnouncementModal
        open={announcementModalOpen}
        announcement={announcement}
        onClose={() => setAnnouncementModalOpen(false)}
        onSave={async (payload) => {
          const res = await store.saveAnnouncement(payload);
          if (!res.ok) {
            addToast('error', res.error || 'Could not publish announcement.');
            return;
          }
          setDismissedAnnouncementKey('');
          try {
            localStorage.removeItem(
              `arya_dismissed_announcement_${currentUser.id}`
            );
          } catch {
            // ignore
          }
          addToast(
            'success',
            payload.active
              ? 'Announcement published to all students.'
              : 'Announcement saved (currently hidden).'
          );
        }}
        onClear={async () => {
          await store.clearAnnouncement();
          addToast('info', 'Announcement removed.');
        }}
      />

      <WelcomeVideoModal
        open={welcomeVideoModalOpen}
        showcase={welcomeVideo}
        onClose={() => setWelcomeVideoModalOpen(false)}
        onSave={async (payload) => {
          const res = await store.saveWelcomeVideo(payload);
          if (!res.ok) {
            addToast('error', res.error || 'Could not save intro video.');
            return;
          }
          addToast(
            'success',
            'Dashboard orientation video & mentor showcase updated.'
          );
        }}
      />

      <PlatformLinksModal
        open={platformLinksModalOpen}
        config={platformLinks}
        onClose={() => setPlatformLinksModalOpen(false)}
        onSave={async (payload) => {
          const res = await store.savePlatformLinks(payload);
          if (!res.ok) {
            addToast('error', res.error || 'Could not save platform links.');
            return;
          }
          addToast(
            'success',
            'Platform & social media links updated for all students.'
          );
        }}
      />

      <LiveClassModal
        open={liveClassModalOpen}
        session={liveClass}
        courses={courses}
        defaultInstructor={currentUser.name}
        onClose={() => setLiveClassModalOpen(false)}
        onSave={async (payload) => {
          const res = await store.saveLiveClass(payload);
          if (!res.ok) {
            addToast('error', res.error || 'Could not save live class link.');
            return;
          }
          addToast(
            'success',
            payload.active
              ? 'Live Zoom/Meet class published to student Dashboard.'
              : 'Live class saved (currently hidden from students).'
          );
        }}
        onClear={async () => {
          await store.clearLiveClass();
          addToast('info', 'Live class schedule removed.');
        }}
      />

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        destructive
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />

      {ownerRecoveryKit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d192b]/65 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-[18px] border border-[#e3e9f2] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eefaf4] text-[#13845b] border border-[#bfe6d5]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-[#142746]">
                  Save Your Owner Recovery Kit
                </h2>
                <p className="mt-1 text-xs text-[#59677d] leading-relaxed">
                  Keep your Admin Login ID and these 6 single-use Emergency Backup Codes safe. You can use them anytime on the sign-in screen to recover a forgotten ID or reset your password even without Email SMTP or WhatsApp API.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[#e3e9f2] bg-[#f8fafd] p-3.5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#718096]">
                Main Super Admin Login ID
              </div>
              <div className="flex items-center justify-between gap-2 font-mono text-sm font-bold text-[#142746]">
                <span className="break-all">{ownerRecoveryKit.email}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(ownerRecoveryKit.email);
                    addToast('info', 'Admin Login ID copied.');
                  }}
                  className="inline-flex items-center gap-1 rounded border border-[#e3e9f2] bg-white px-2.5 py-1 text-[11px] font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#f1dca7] bg-[#fffdf7] p-3.5 space-y-2.5">
              <div className="text-xs font-extrabold text-[#8c6826]">
                6 Emergency Backup Recovery Codes (Single-Use)
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs font-bold text-[#142746]">
                {ownerRecoveryKit.codes.map((code) => (
                  <div
                    key={code}
                    className="rounded-lg border border-[#e3e9f2] bg-white px-3 py-1.5 text-center"
                  >
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = `ARYA TAX PATHSHALA — OWNER RECOVERY KIT\nLogin ID: ${ownerRecoveryKit.email}\n\nEmergency Backup Codes (single-use):\n${ownerRecoveryKit.codes.join('\n')}`;
                    navigator.clipboard?.writeText(text);
                    addToast('success', 'Owner Recovery Kit copied to clipboard.');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy All</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = `ARYA TAX PATHSHALA — OWNER RECOVERY KIT\nGenerated: ${new Date().toISOString()}\nMain Super Admin Login ID: ${ownerRecoveryKit.email}\n\nEmergency Backup Codes (each code is single-use):\n${ownerRecoveryKit.codes.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`;
                    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `arya-owner-recovery-kit-${new Date().toISOString().slice(0, 10)}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                    addToast('success', 'Recovery Kit downloaded (.txt).');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-[#edf2fa] px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .txt</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setOwnerRecoveryKit(null)}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#13845b] px-4 py-2 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>I Have Saved These Codes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-4 sm:p-5 shadow-[0_5px_22px_rgba(23,43,72,0.03)]">
      <div className="text-xs font-medium text-[#718096]">{label}</div>
      <div className="mt-2 font-mono text-2xl font-extrabold text-[#142746] tabular-nums">
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px] font-semibold text-[#8c6826]">
          {sub}
        </div>
      )}
    </div>
  );
}

function RestrictedOwnerNotice({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-[15px] border border-[#f1dca7] bg-[#fffaf0] p-6 text-center space-y-3">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-[#b45309] border border-[#f1dca7]">
        <Lock className="h-5 w-5" />
      </div>
      <h2 className="text-lg font-extrabold text-[#142746]">
        Main Super Admin (Owner) Access Required
      </h2>
      <p className="text-xs text-[#59677d] leading-relaxed">
        Financial ledgers, student payment details, GST invoices, bank/UPI settings, coupons, and system configuration are strictly isolated to the Main Super Admin (Owner).
      </p>
      <button
        type="button"
        onClick={onBack}
        className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
      >
        Return to Dashboard
      </button>
    </div>
  );
}
