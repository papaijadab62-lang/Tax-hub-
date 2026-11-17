import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActivityLogEntry,
  AdminInvitation,
  AdminPermission,
  AdminRole,
  AdminSessionRecord,
  Announcement,
  AnnouncementCategory,
  AssignmentSubmission,
  Bundle,
  CertificateTemplateConfig,
  Coupon,
  Course,
  CourseAssignment,
  CourseAssignmentHistoryEntry,
  CoursePaymentPlan,
  CourseQuiz,
  CourseVersionRecord,
  CustomCertificateRecord,
  InternalNotification,
  IssuedCertificateMeta,
  Lesson,
  LiveClassSession,
  Order,
  PasswordRecoveryRequest,
  PaymentMethod,
  PlatformLinksConfig,
  PortalSettings,
  ProgressMap,
  QuizAttempt,
  SupportTicket,
  User,
  WelcomeShowcase,
  WhatsappDeliveryLog,
} from '../types/lms';
import type { PriceBreakdown } from '../utils/lms';

const TOKEN_KEY = 'arya_auth_token';
export const LAST_PORTAL_KEY = 'arya_last_portal_mode';

function setLastPortalMode(mode: 'admin' | 'student'): void {
  try {
    localStorage.setItem(LAST_PORTAL_KEY, mode);
  } catch {
    // ignore storage errors
  }
}

const DEFAULT_SETTINGS: PortalSettings = {
  brand: 'ARYA TAX PATHSHALA',
  gst: 18,
  gstMode: 'exclusive',
  gstSection: 'Section 9(1) CGST/SGST Act · Educational & Tax Training',
  sacCode: '999293',
  gstNumber: '',
  gstState: 'West Bengal',
  autoGstByState: true,
  stateGstRates: {},
  gstSplit: 'cgst_sgst',
  instantActivation: true,
  threshold: 75,
  certHeading: 'Certificate of Completion',
  certSub: 'has successfully completed the course',
  certSigner: 'Authorized Signatory',
  certFooter: 'This certificate is issued by ARYA TAX PATHSHALA',
  certSignatureUrl: '',
  certSealText: 'CERTIFIED',
};

interface PortalStatePayload {
  user: User;
  users: User[];
  courses: Course[];
  orders: Order[];
  coupons: Coupon[];
  bundles: Bundle[];
  methods: PaymentMethod[];
  settings: PortalSettings;
  announcement: Announcement | null;
  liveClass: LiveClassSession | null;
  welcomeVideo: WelcomeShowcase;
  platformLinks: PlatformLinksConfig;
  certificates?: CustomCertificateRecord[];
  progress: ProgressMap;
  quizAttempts?: QuizAttempt[];
  assignmentSubmissions?: AssignmentSubmission[];
}

export interface PendingWhatsappOtpChallenge {
  challengeToken: string;
  maskedPhone: string;
  expiresAt: string;
  resendAvailableAt: string;
  userPreview: {
    name: string;
    email: string;
    role?: 'admin' | 'student';
    adminRole: AdminRole | null;
  };
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  tokenOverride?: string | null
): Promise<
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      status: number;
      requiresStepUp2FA?: boolean;
      apiNotConfigured?: boolean;
      useSupportHelp?: boolean;
      wrongPortal?: 'admin' | 'student';
      suggestOfflineMethods?: boolean;
      hasBackupCodes?: boolean;
      hasRecoveryPin?: boolean;
    }
> {
  const token = tokenOverride !== undefined ? tokenOverride : getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { cache: 'no-store', ...options, headers });
    const body = (await res.json().catch(() => ({}))) as T & {
      error?: string;
      requiresStepUp2FA?: boolean;
      apiNotConfigured?: boolean;
      useSupportHelp?: boolean;
      wrongPortal?: 'admin' | 'student';
      suggestOfflineMethods?: boolean;
      hasBackupCodes?: boolean;
      hasRecoveryPin?: boolean;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: body.error || `Request failed (${res.status})`,
        status: res.status,
        requiresStepUp2FA: Boolean(body.requiresStepUp2FA),
        apiNotConfigured: Boolean(body.apiNotConfigured),
        useSupportHelp: Boolean(body.useSupportHelp),
        wrongPortal: body.wrongPortal,
        suggestOfflineMethods: Boolean(body.suggestOfflineMethods),
        hasBackupCodes: body.hasBackupCodes,
        hasRecoveryPin: body.hasRecoveryPin,
      };
    }
    return { ok: true, data: body };
  } catch {
    return {
      ok: false,
      error: 'Unable to reach server. Please check your connection.',
      status: 0,
    };
  }
}

const DEFAULT_WELCOME_VIDEO: WelcomeShowcase = {
  active: true,
  title: 'Course Orientation & Complete Syllabus Overview',
  subtitle:
    'Watch this inbuilt guide to understand GST, Income Tax & TDS modules, live filing workflow, and certification steps.',
  videoUrl: '',
  mentorName: 'Arya Tax Mentor',
  mentorRole: 'Founder & Lead Tax Practitioner · ARYA TAX PATHSHALA',
  photoUrl: '/assets/aistudio/IMG_20251110_092655_764_2c1ee29a.webp',
  autoplay: true,
  loop: true,
  updatedAt: '',
};

const DEFAULT_PLATFORM_LINKS: PlatformLinksConfig = {
  heading: 'Important Links & Student Community',
  subtitle:
    'Connect directly on WhatsApp, YouTube, Telegram, Instagram, and official portal channels.',
  links: [],
  updatedAt: '',
};

export function useLmsStore() {
  const [initializing, setInitializing] = useState(true);
  const [adminExists, setAdminExists] = useState(false);
  const [authBrand, setAuthBrand] = useState('ARYA TAX PATHSHALA');
  const [whatsappCloudApiConfigured, setWhatsappCloudApiConfigured] =
    useState(false);
  const [enforceWhatsapp2FA, setEnforceWhatsapp2FA] = useState(false);
  const [pendingWhatsappOtp, setPendingWhatsappOtp] =
    useState<PendingWhatsappOtpChallenge | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_SETTINGS);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [liveClass, setLiveClass] = useState<LiveClassSession | null>(null);
  const [welcomeVideo, setWelcomeVideo] = useState<WelcomeShowcase>(
    DEFAULT_WELCOME_VIDEO
  );
  const [platformLinks, setPlatformLinks] = useState<PlatformLinksConfig>(
    DEFAULT_PLATFORM_LINKS
  );
  const [certificates, setCertificates] = useState<CustomCertificateRecord[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<
    AssignmentSubmission[]
  >([]);
  const [notifications, setNotifications] = useState<InternalNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const watchBufferRef = useRef<
    Record<string, { courseId: string; lessonId: string; delta: number; duration: number }>
  >({});

  const fetchAuthStatus = useCallback(async () => {
    const res = await apiRequest<{
      adminExists: boolean;
      brand: string;
      whatsappCloudApiConfigured?: boolean;
      enforceWhatsapp2FA?: boolean;
    }>('/api/auth/status', { method: 'GET' }, null);
    if (res.ok) {
      setAdminExists(res.data.adminExists);
      if (res.data.brand) setAuthBrand(res.data.brand);
      setWhatsappCloudApiConfigured(Boolean(res.data.whatsappCloudApiConfigured));
      setEnforceWhatsapp2FA(Boolean(res.data.enforceWhatsapp2FA));
    }
  }, []);

  const fetchNotifications = useCallback(async (tokenOverride?: string | null) => {
    const token = tokenOverride !== undefined ? tokenOverride : getStoredToken();
    if (!token) return;
    const res = await apiRequest<{
      notifications: InternalNotification[];
      unreadCount: number;
    }>('/api/notifications', { method: 'GET' }, token);
    if (res.ok) {
      setNotifications(res.data.notifications || []);
      setUnreadNotificationCount(res.data.unreadCount || 0);
    }
  }, []);

  const syncPortalState = useCallback(
    async (tokenOverride?: string | null) => {
      const token = tokenOverride !== undefined ? tokenOverride : getStoredToken();
      if (!token) {
        setCurrentUser(null);
        return false;
      }
      const res = await apiRequest<PortalStatePayload>(
        '/api/portal/state',
        { method: 'GET' },
        token
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setStoredToken(null);
          setCurrentUser(null);
        }
        return false;
      }
      setCurrentUser(res.data.user);
      setUsers(res.data.users);
      setCourses(res.data.courses);
      setOrders(res.data.orders);
      setCoupons(res.data.coupons);
      setBundles(res.data.bundles);
      setMethods(res.data.methods);
      setSettings(res.data.settings);
      setAnnouncement(res.data.announcement || null);
      setLiveClass(res.data.liveClass || null);
      setWelcomeVideo(res.data.welcomeVideo || DEFAULT_WELCOME_VIDEO);
      setPlatformLinks(res.data.platformLinks || DEFAULT_PLATFORM_LINKS);
      setCertificates(res.data.certificates || []);
      setProgress(res.data.progress || {});
      setQuizAttempts(res.data.quizAttempts || []);
      setAssignmentSubmissions(res.data.assignmentSubmissions || []);
      setAuthBrand(res.data.settings.brand || 'ARYA TAX PATHSHALA');
      await fetchNotifications(token);
      return true;
    },
    [fetchNotifications]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      await fetchAuthStatus();
      await syncPortalState();
      if (active) setInitializing(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchAuthStatus, syncPortalState]);

  // Background cross-device sync (every 5s + on window focus / tab visible)
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      syncPortalState();
    }, 5000);
    const onFocus = () => {
      syncPortalState();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncPortalState();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentUser?.id, syncPortalState]);

  // Flush buffered watch deltas to server every 4s
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') return;
    const flush = async () => {
      const entries = Object.entries(watchBufferRef.current);
      if (entries.length === 0) return;
      watchBufferRef.current = {};
      for (const [, item] of entries) {
        await apiRequest('/api/student/progress/watch', {
          method: 'POST',
          body: JSON.stringify(item),
        });
      }
    };
    const timer = setInterval(flush, 4000);
    return () => {
      clearInterval(timer);
      flush();
    };
  }, [currentUser?.id, currentUser?.role]);

  // ---- AUTH ACTIONS ----
  const createAdminAccount = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      extra?: {
        phone?: string;
        countryCode?: string;
        whatsappNumber?: string;
        recoveryPin?: string;
      }
    ) => {
      const res = await apiRequest<{
        token: string;
        user: User;
        emergencyRecoveryCodes?: string[];
      }>(
        '/api/auth/admin/setup',
        {
          method: 'POST',
          body: JSON.stringify({ name, email, password, ...(extra || {}) }),
        },
        null
      );
      if (!res.ok) return { ok: false, error: res.error };
      setLastPortalMode('admin');
      setStoredToken(res.data.token);
      setAdminExists(true);
      await syncPortalState(res.data.token);
      return {
        ok: true,
        user: res.data.user,
        emergencyRecoveryCodes: res.data.emergencyRecoveryCodes || [],
      };
    },
    [syncPortalState]
  );

  const adminSignIn = useCallback(
    async (email: string, password: string) => {
      const res = await apiRequest<{
        token?: string;
        user?: User;
        requiresWhatsappOtp?: boolean;
        challengeToken?: string;
        maskedPhone?: string;
        expiresAt?: string;
        resendAvailableAt?: string;
        userPreview?: PendingWhatsappOtpChallenge['userPreview'];
      }>(
        '/api/auth/admin/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        },
        null
      );
      if (!res.ok) {
        return {
          ok: false,
          error: res.error,
          wrongPortal: res.wrongPortal,
        };
      }
      if (
        res.data.requiresWhatsappOtp &&
        res.data.challengeToken &&
        res.data.userPreview
      ) {
        setPendingWhatsappOtp({
          challengeToken: res.data.challengeToken,
          maskedPhone: res.data.maskedPhone || 'Verified Phone',
          expiresAt: res.data.expiresAt || '',
          resendAvailableAt: res.data.resendAvailableAt || '',
          userPreview: res.data.userPreview,
        });
        return { ok: true, requiresWhatsappOtp: true };
      }
      if (res.data.token) {
        setLastPortalMode('admin');
        setStoredToken(res.data.token);
        setPendingWhatsappOtp(null);
        await syncPortalState(res.data.token);
      }
      return { ok: true, user: res.data.user };
    },
    [syncPortalState]
  );

  const verifyWhatsappLoginOtp = useCallback(
    async (code: string) => {
      if (!pendingWhatsappOtp?.challengeToken) {
        return {
          ok: false,
          error: 'WhatsApp 2FA session expired. Please sign in again.',
        };
      }
      const res = await apiRequest<{ token: string; user: User }>(
        '/api/auth/whatsapp/verify-login',
        {
          method: 'POST',
          body: JSON.stringify({
            challengeToken: pendingWhatsappOtp.challengeToken,
            code,
          }),
        },
        null
      );
      if (!res.ok) return { ok: false, error: res.error };
      setLastPortalMode(res.data.user.role === 'admin' ? 'admin' : 'student');
      setPendingWhatsappOtp(null);
      setStoredToken(res.data.token);
      await syncPortalState(res.data.token);
      return { ok: true, user: res.data.user };
    },
    [pendingWhatsappOtp, syncPortalState]
  );

  const resendWhatsappLoginOtp = useCallback(async (): Promise<
    { ok: true; data: unknown } | { ok: false; error: string }
  > => {
    if (!pendingWhatsappOtp?.challengeToken) {
      return {
        ok: false,
        error: 'WhatsApp 2FA session expired. Please sign in again.',
      };
    }
    const res = await apiRequest<{
      ok: boolean;
      resent: boolean;
      challengeToken: string;
      maskedPhone: string;
      expiresAt: string;
      resendAvailableAt: string;
    }>(
      '/api/auth/whatsapp/verify-login',
      {
        method: 'POST',
        body: JSON.stringify({
          challengeToken: pendingWhatsappOtp.challengeToken,
          resend: true,
        }),
      },
      null
    );
    if (!res.ok) return { ok: false, error: res.error };
    setPendingWhatsappOtp((prev) =>
      prev
        ? {
            ...prev,
            challengeToken: res.data.challengeToken,
            maskedPhone: res.data.maskedPhone,
            expiresAt: res.data.expiresAt,
            resendAvailableAt: res.data.resendAvailableAt,
          }
        : null
    );
    return { ok: true, data: res.data };
  }, [pendingWhatsappOtp]);

  const clearPendingWhatsappOtp = useCallback(() => {
    setPendingWhatsappOtp(null);
  }, []);

  const sendWhatsappOtp = useCallback(
    async (payload: {
      countryCode: string;
      whatsappNumber: string;
      purpose: 'REGISTRATION' | 'PASSWORD_RECOVERY' | 'WHATSAPP_VERIFY';
      recipientName?: string;
    }) => {
      return apiRequest<{
        ok: boolean;
        challengeId: string;
        maskedPhone: string;
        expiresAt: string;
        resendAvailableAt: string;
      }>('/api/auth/whatsapp/send-otp', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    []
  );

  const verifyWhatsappOtp = useCallback(
    async (payload: {
      challengeId: string;
      code: string;
      consumeImmediately?: boolean;
      countryCode?: string;
      whatsappNumber?: string;
    }) => {
      const res = await apiRequest<{
        ok: boolean;
        verified: boolean;
        challengeId: string;
        maskedPhone: string;
        user?: User;
      }>('/api/auth/whatsapp/verify-otp', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok && res.data.user) {
        await syncPortalState();
      }
      return res;
    },
    [syncPortalState]
  );

  const registerAdminAccount = useCallback(
    async (payload: {
      name: string;
      email: string;
      phone: string;
      countryCode: string;
      whatsappNumber: string;
      confirmWhatsappNumber?: string;
      password: string;
      confirmPassword: string;
      requestedDesignation: Exclude<AdminRole, 'SUPER_ADMIN'>;
      otpChallengeId?: string;
    }) => {
      return apiRequest<{
        ok: boolean;
        accountStatus: 'PENDING_APPROVAL';
        message: string;
        admin: User;
      }>(
        '/api/auth/admin/register',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        null
      );
    },
    []
  );

  const fetchInviteDetails = useCallback(async (token: string) => {
    return apiRequest<{
      invitation: {
        name: string;
        email: string;
        adminRole: Exclude<AdminRole, 'SUPER_ADMIN'>;
        invitedByName: string;
        expiresAt: string;
        brand: string;
      };
    }>(`/api/auth/admin/invite/${encodeURIComponent(token)}`, { method: 'GET' }, null);
  }, []);

  const acceptInvite = useCallback(
    async (token: string, password: string, name?: string) => {
      const res = await apiRequest<{ token: string; user: User }>(
        `/api/auth/admin/invite/${encodeURIComponent(token)}/accept`,
        {
          method: 'POST',
          body: JSON.stringify({ password, name }),
        },
        null
      );
      if (!res.ok) return { ok: false, error: res.error };
      setLastPortalMode('admin');
      setStoredToken(res.data.token);
      await syncPortalState(res.data.token);
      return { ok: true, user: res.data.user };
    },
    [syncPortalState]
  );

  const studentSignUp = useCallback(
    async (
      name: string,
      email: string,
      phone: string,
      state: string,
      password: string,
      extra?: {
        countryCode?: string;
        whatsappNumber?: string;
        confirmWhatsappNumber?: string;
        otpChallengeId?: string;
      }
    ) => {
      const res = await apiRequest<{ token: string; user: User }>(
        '/api/auth/student/signup',
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            phone,
            state,
            password,
            ...(extra || {}),
          }),
        },
        null
      );
      if (!res.ok) return { ok: false, error: res.error };
      setLastPortalMode('student');
      setStoredToken(res.data.token);
      await syncPortalState(res.data.token);
      return { ok: true, user: res.data.user };
    },
    [syncPortalState]
  );

  const studentSignIn = useCallback(
    async (email: string, password: string) => {
      const res = await apiRequest<{
        token?: string;
        user?: User;
        requiresWhatsappOtp?: boolean;
        challengeToken?: string;
        maskedPhone?: string;
        expiresAt?: string;
        resendAvailableAt?: string;
        userPreview?: PendingWhatsappOtpChallenge['userPreview'];
      }>(
        '/api/auth/student/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        },
        null
      );
      if (!res.ok) {
        return {
          ok: false,
          error: res.error,
          wrongPortal: res.wrongPortal,
        };
      }
      if (
        res.data.requiresWhatsappOtp &&
        res.data.challengeToken &&
        res.data.userPreview
      ) {
        setPendingWhatsappOtp({
          challengeToken: res.data.challengeToken,
          maskedPhone: res.data.maskedPhone || 'Verified WhatsApp',
          expiresAt: res.data.expiresAt || '',
          resendAvailableAt: res.data.resendAvailableAt || '',
          userPreview: res.data.userPreview,
        });
        return { ok: true, requiresWhatsappOtp: true };
      }
      if (res.data.token) {
        setLastPortalMode('student');
        setStoredToken(res.data.token);
        setPendingWhatsappOtp(null);
        await syncPortalState(res.data.token);
      }
      return { ok: true, user: res.data.user };
    },
    [syncPortalState]
  );

  const signOut = useCallback(async () => {
    if (currentUser?.role) {
      setLastPortalMode(currentUser.role === 'admin' ? 'admin' : 'student');
    }
    const token = getStoredToken();
    if (token) {
      await apiRequest('/api/auth/logout', { method: 'POST' }, token);
    }
    setStoredToken(null);
    setPendingWhatsappOtp(null);
    setCurrentUser(null);
    setUsers([]);
    setCourses([]);
    setOrders([]);
    setCoupons([]);
    setBundles([]);
    setAnnouncement(null);
    setLiveClass(null);
    setWelcomeVideo(DEFAULT_WELCOME_VIDEO);
    setPlatformLinks(DEFAULT_PLATFORM_LINKS);
    setCertificates([]);
    setProgress({});
    setQuizAttempts([]);
    setAssignmentSubmissions([]);
    setNotifications([]);
    setUnreadNotificationCount(0);
    fetchAuthStatus();
  }, [currentUser?.role, fetchAuthStatus]);

  // ---- SECURITY, BACKUP CODES & SESSION GOVERNANCE ----

  const regenerateBackupCodes = useCallback(
    async (password?: string) => {
      const res = await apiRequest<{
        ok: boolean;
        backupCodes: string[];
        user: User;
      }>('/api/admin/security/backup-codes/regenerate', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const updateRecoveryPin = useCallback(
    async (recoveryPin: string, currentPassword?: string) => {
      const res = await apiRequest<{ ok: boolean; user: User }>(
        '/api/admin/security/recovery-pin',
        {
          method: 'POST',
          body: JSON.stringify({ recoveryPin, currentPassword }),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const fetchSessions = useCallback(async () => {
    return apiRequest<{ sessions: AdminSessionRecord[] }>(
      '/api/admin/security/sessions',
      { method: 'GET' }
    );
  }, []);

  const revokeSession = useCallback(async (sid: string) => {
    return apiRequest<{ ok: boolean }>(
      `/api/admin/security/sessions/${encodeURIComponent(sid)}/revoke`,
      { method: 'POST' }
    );
  }, []);

  const terminateUserSessions = useCallback(async (userId: string) => {
    return apiRequest<{ ok: boolean; revokedCount: number }>(
      `/api/admin/security/users/${encodeURIComponent(userId)}/terminate-sessions`,
      { method: 'POST' }
    );
  }, []);

  // ---- SUPER ADMIN: MULTI-LEVEL ADMIN TEAM & RBAC ----
  const fetchAdminTeam = useCallback(async () => {
    return apiRequest<{
      admins: User[];
      invitations: AdminInvitation[];
      assignmentHistory: CourseAssignmentHistoryEntry[];
    }>('/api/admin/team', { method: 'GET' });
  }, []);

  const inviteAdmin = useCallback(
    async (payload: {
      name: string;
      email: string;
      adminRole: Exclude<AdminRole, 'SUPER_ADMIN'>;
      permissions: AdminPermission[];
      assignedCourseIds: string[];
      expiresInHours?: number;
    }) => {
      const res = await apiRequest<{
        invitation: AdminInvitation;
        inviteUrl: string;
        emailNote: string;
      }>('/api/admin/team/invite', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const createSubAdmin = useCallback(
    async (payload: {
      name: string;
      email: string;
      phone?: string;
      password: string;
      adminRole: Exclude<AdminRole, 'SUPER_ADMIN'>;
      permissions: AdminPermission[];
      assignedCourseIds: string[];
      mustChangePassword?: boolean;
    }) => {
      const res = await apiRequest<{ admin: User }>('/api/admin/team/create', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const cancelInvitation = useCallback(async (inviteId: string) => {
    return apiRequest<{ ok: boolean }>(
      `/api/admin/team/invitations/${encodeURIComponent(inviteId)}`,
      { method: 'DELETE' }
    );
  }, []);

  const updateSubAdmin = useCallback(
    async (
      adminId: string,
      payload: {
        name?: string;
        phone?: string;
        adminRole?: Exclude<AdminRole, 'SUPER_ADMIN'>;
        permissions?: AdminPermission[];
      }
    ) => {
      const res = await apiRequest<{ admin: User }>(
        `/api/admin/team/${encodeURIComponent(adminId)}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const assignAdminCourses = useCallback(
    async (
      adminId: string,
      assignedCourseIds: string[],
      coursePermissions?: Record<string, AdminPermission[]>
    ) => {
      const res = await apiRequest<{ admin: User }>(
        `/api/admin/team/${encodeURIComponent(adminId)}/courses`,
        {
          method: 'PUT',
          body: JSON.stringify({ assignedCourseIds, coursePermissions }),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const updateAdminStatus = useCallback(
    async (
      adminId: string,
      status: 'ACTIVATE' | 'DEACTIVATE' | 'SUSPEND',
      reason?: string
    ) => {
      const res = await apiRequest<{ admin: User }>(
        `/api/admin/team/${encodeURIComponent(adminId)}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status, reason }),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const resetAdminPassword = useCallback(
    async (adminId: string, newPassword: string, twoFactorCode?: string) => {
      return apiRequest<{ ok: boolean; temporaryPassword: string }>(
        `/api/admin/team/${encodeURIComponent(adminId)}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify({ newPassword, twoFactorCode }),
        }
      );
    },
    []
  );

  const deleteSubAdmin = useCallback(
    async (adminId: string, twoFactorCode?: string) => {
      const res = await apiRequest<{ ok: boolean }>(
        `/api/admin/team/${encodeURIComponent(adminId)}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ twoFactorCode }),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  // ---- ADMIN REGISTRATION APPROVAL WORKFLOW (MAIN SUPER ADMIN) ----
  const fetchAdminRegistrations = useCallback(async () => {
    return apiRequest<{ registrations: User[] }>('/api/admin/registrations', {
      method: 'GET',
    });
  }, []);

  const approveAdminRegistration = useCallback(
    async (
      adminId: string,
      payload: {
        adminRole: Exclude<AdminRole, 'SUPER_ADMIN'>;
        permissions: AdminPermission[];
        assignedCourseIds: string[];
        activateNow?: boolean;
      }
    ) => {
      const res = await apiRequest<{ admin: User }>(
        `/api/admin/registrations/${encodeURIComponent(adminId)}/approve`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const activateAdminRegistration = useCallback(
    async (adminId: string) => {
      const res = await apiRequest<{ admin: User }>(
        `/api/admin/registrations/${encodeURIComponent(adminId)}/activate`,
        { method: 'POST' }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const rejectAdminRegistration = useCallback(
    async (adminId: string, reason: string) => {
      const res = await apiRequest<{ admin: User }>(
        `/api/admin/registrations/${encodeURIComponent(adminId)}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  // ---- WHATSAPP BUSINESS CLOUD API CONFIG & LOGS (MAIN SUPER ADMIN) ----
  const saveWhatsappApiConfig = useCallback(
    async (payload: {
      whatsappBusinessAccountId?: string;
      whatsappPhoneNumberId?: string;
      whatsappApiToken?: string;
      clearWhatsappToken?: boolean;
      whatsappOtpTemplateName?: string;
      whatsappOtpTemplateLang?: string;
      whatsappWebhookUrl?: string;
      adminWhatsapp?: string;
      enforceWhatsapp2FA?: boolean;
    }) => {
      const res = await apiRequest<{ settings: PortalSettings }>(
        '/api/admin/security/whatsapp-config',
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) {
        await syncPortalState();
        await fetchAuthStatus();
      }
      return res;
    },
    [syncPortalState, fetchAuthStatus]
  );

  const fetchWhatsappDeliveryLogs = useCallback(async () => {
    return apiRequest<{
      logs: WhatsappDeliveryLog[];
      status: {
        cloudApiReady: boolean;
        webhookConfigured: boolean;
        templateConfigured: boolean;
        hasWabaId: boolean;
        hasPhoneNumberId: boolean;
        hasAccessToken: boolean;
        envOverrideActive: boolean;
      };
    }>('/api/admin/security/whatsapp-logs', { method: 'GET' });
  }, []);

  const testWhatsappDelivery = useCallback(
    async (phone: string, countryCode = '+91') => {
      return apiRequest<{
        ok: boolean;
        providerMessageId?: string;
        maskedPhone?: string;
      }>('/api/admin/security/whatsapp/test', {
        method: 'POST',
        body: JSON.stringify({ phone, countryCode }),
      });
    },
    []
  );

  // ---- ROLE-SPECIFIC PASSWORD RECOVERY (PHONE OTP ONLY — NO EMAIL OTP) ----
  const requestStudentPasswordReset = useCallback(async (email: string) => {
    return apiRequest<{
      ok: boolean;
      channel: 'WHATSAPP';
      challengeId: string;
      maskedPhone?: string;
      expiresAt: string;
      resendAvailableAt?: string;
    }>(
      '/api/auth/forgot-password/student',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      null
    );
  }, []);

  const recoverForgotLoginId = useCallback(
    async (payload: {
      portal?: 'admin' | 'student';
      method: 'password' | 'recovery_pin' | 'backup_code' | 'whatsapp_otp';
      name?: string;
      phone?: string;
      countryCode?: string;
      password?: string;
      recoveryPin?: string;
      backupCode?: string;
      challengeId?: string;
      code?: string;
    }) => {
      return apiRequest<{
        ok: boolean;
        step?: 'VERIFY_OTP';
        challengeId?: string;
        maskedPhone?: string;
        recoveredAccounts?: Array<{
          name: string;
          email: string;
          role: 'admin' | 'student';
          adminRole: AdminRole | null;
        }>;
      }>(
        '/api/auth/forgot-id',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        null
      );
    },
    []
  );

  const requestSuperAdminPasswordReset = useCallback(
    async (
      email: string,
      method: 'auto' | 'whatsapp' | 'backup_code' | 'recovery_pin' = 'auto',
      backupCodeOrPin?: string
    ) => {
      return apiRequest<{
        ok: boolean;
        channel: 'WHATSAPP' | 'BACKUP_CODE' | 'RECOVERY_PIN';
        challengeId?: string;
        resetChallengeToken?: string;
        maskedPhone?: string;
        expiresAt?: string;
      }>(
        '/api/auth/forgot-password/super-admin',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            method,
            ...(method === 'recovery_pin'
              ? { recoveryPin: backupCodeOrPin }
              : { backupCode: backupCodeOrPin }),
          }),
        },
        null
      );
    },
    []
  );

  const requestSubAdminPasswordRecovery = useCallback(async (email: string) => {
    return apiRequest<{
      ok: boolean;
      alreadyPending?: boolean;
      request: PasswordRecoveryRequest;
      message: string;
    }>(
      '/api/auth/forgot-password/admin-request',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      null
    );
  }, []);

  const completePasswordRecovery = useCallback(
    async (payload: {
      newPassword: string;
      resetToken?: string;
      resetChallengeToken?: string;
      challengeId?: string;
      code?: string;
    }) => {
      return apiRequest<{ ok: boolean; message: string }>(
        '/api/auth/forgot-password/complete',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        null
      );
    },
    []
  );

  const fetchRecoveryRequests = useCallback(async () => {
    return apiRequest<{ requests: PasswordRecoveryRequest[] }>(
      '/api/admin/security/recovery-requests',
      { method: 'GET' }
    );
  }, []);

  const approveRecoveryRequest = useCallback(async (requestId: string) => {
    return apiRequest<{
      ok: boolean;
      request: PasswordRecoveryRequest;
      oneTimeResetToken: string;
    }>(
      `/api/admin/security/recovery-requests/${encodeURIComponent(requestId)}/approve`,
      { method: 'POST' }
    );
  }, []);

  const rejectRecoveryRequest = useCallback(
    async (requestId: string, reason: string) => {
      return apiRequest<{ ok: boolean; request: PasswordRecoveryRequest }>(
        `/api/admin/security/recovery-requests/${encodeURIComponent(requestId)}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      );
    },
    []
  );

  // ---- COURSE & CURRICULUM ACTIONS ----
  const saveCourse = useCallback(
    async (data: {
      id?: string;
      title: string;
      category: string;
      description: string;
      thumbnailUrl?: string;
      price: number;
      paymentPlans?: CoursePaymentPlan[];
      certificateConfig?: CertificateTemplateConfig;
      visibility: 'draft' | 'published';
    }) => {
      const res = data.id
        ? await apiRequest(`/api/admin/courses/${data.id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
          })
        : await apiRequest('/api/admin/courses', {
            method: 'POST',
            body: JSON.stringify(data),
          });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const deleteCourse = useCallback(
    async (courseId: string) => {
      const res = await apiRequest(`/api/admin/courses/${courseId}`, {
        method: 'DELETE',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const saveChapter = useCallback(
    async (courseId: string, chapterId: string | undefined, title: string) => {
      const res = chapterId
        ? await apiRequest(
            `/api/admin/courses/${courseId}/chapters/${chapterId}`,
            {
              method: 'PUT',
              body: JSON.stringify({ title }),
            }
          )
        : await apiRequest(`/api/admin/courses/${courseId}/chapters`, {
            method: 'POST',
            body: JSON.stringify({ title }),
          });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const deleteChapter = useCallback(
    async (courseId: string, chapterId: string) => {
      const res = await apiRequest(
        `/api/admin/courses/${courseId}/chapters/${chapterId}`,
        { method: 'DELETE' }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const saveLesson = useCallback(
    async (
      courseId: string,
      chapterId: string,
      lessonId: string | undefined,
      payload: Omit<Lesson, 'id'>
    ) => {
      const res = lessonId
        ? await apiRequest(
            `/api/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}`,
            {
              method: 'PUT',
              body: JSON.stringify(payload),
            }
          )
        : await apiRequest(
            `/api/admin/courses/${courseId}/chapters/${chapterId}/lessons`,
            {
              method: 'POST',
              body: JSON.stringify(payload),
            }
          );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const deleteLesson = useCallback(
    async (courseId: string, chapterId: string, lessonId: string) => {
      const res = await apiRequest(
        `/api/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}`,
        { method: 'DELETE' }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  // ---- COURSE APPROVAL WORKFLOW & VERSIONS ----
  const submitCourseApproval = useCallback(
    async (courseId: string, note?: string) => {
      const res = await apiRequest<{ course: Course }>(
        `/api/admin/courses/${courseId}/submit-approval`,
        { method: 'POST', body: JSON.stringify({ note }) }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const approveCourse = useCallback(
    async (courseId: string, note?: string) => {
      const res = await apiRequest<{ course: Course }>(
        `/api/admin/courses/${courseId}/approve`,
        { method: 'POST', body: JSON.stringify({ note }) }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const publishCourse = useCallback(
    async (courseId: string) => {
      const res = await apiRequest<{ course: Course }>(
        `/api/admin/courses/${courseId}/publish`,
        { method: 'POST' }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const rejectCourse = useCallback(
    async (courseId: string, reason: string) => {
      const res = await apiRequest<{ course: Course }>(
        `/api/admin/courses/${courseId}/reject`,
        { method: 'POST', body: JSON.stringify({ reason }) }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const requestCourseRevision = useCallback(
    async (courseId: string, reason: string) => {
      const res = await apiRequest<{ course: Course }>(
        `/api/admin/courses/${courseId}/request-revision`,
        { method: 'POST', body: JSON.stringify({ reason }) }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const archiveCourse = useCallback(
    async (courseId: string, reason?: string) => {
      const res = await apiRequest<{ course: Course }>(
        `/api/admin/courses/${courseId}/archive`,
        { method: 'POST', body: JSON.stringify({ reason }) }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const fetchCourseVersions = useCallback(async (courseId: string) => {
    return apiRequest<{ versions: CourseVersionRecord[] }>(
      `/api/admin/courses/${encodeURIComponent(courseId)}/versions`,
      { method: 'GET' }
    );
  }, []);

  const restoreCourseVersion = useCallback(
    async (courseId: string, versionId: string) => {
      const res = await apiRequest<{ course: Course }>(
        `/api/admin/courses/${encodeURIComponent(courseId)}/versions/${encodeURIComponent(versionId)}/restore`,
        { method: 'POST' }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  // ---- QUIZZES & ASSIGNMENTS ----
  const saveQuiz = useCallback(
    async (courseId: string, quiz: Partial<CourseQuiz> & { title: string }) => {
      const res = await apiRequest<{ quiz: CourseQuiz; course: Course }>(
        `/api/admin/courses/${courseId}/quizzes`,
        { method: 'POST', body: JSON.stringify(quiz) }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const deleteQuiz = useCallback(
    async (courseId: string, quizId: string) => {
      const res = await apiRequest<{ ok: boolean }>(
        `/api/admin/courses/${courseId}/quizzes/${quizId}`,
        { method: 'DELETE' }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const saveAssignment = useCallback(
    async (
      courseId: string,
      assignment: Partial<CourseAssignment> & { title: string; description: string }
    ) => {
      const res = await apiRequest<{ assignment: CourseAssignment; course: Course }>(
        `/api/admin/courses/${courseId}/assignments`,
        { method: 'POST', body: JSON.stringify(assignment) }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const deleteAssignment = useCallback(
    async (courseId: string, assignmentId: string) => {
      const res = await apiRequest<{ ok: boolean }>(
        `/api/admin/courses/${courseId}/assignments/${assignmentId}`,
        { method: 'DELETE' }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const submitQuizAttempt = useCallback(
    async (courseId: string, quizId: string, answers: number[]) => {
      const res = await apiRequest<{ attempt: QuizAttempt }>(
        `/api/student/courses/${courseId}/quizzes/${quizId}/attempt`,
        { method: 'POST', body: JSON.stringify({ answers }) }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const submitAssignmentResponse = useCallback(
    async (
      courseId: string,
      assignmentId: string,
      submissionText: string,
      attachmentUrl?: string
    ) => {
      const res = await apiRequest<{ submission: AssignmentSubmission }>(
        `/api/student/courses/${courseId}/assignments/${assignmentId}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ submissionText, attachmentUrl }),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const reviewAssignmentSubmission = useCallback(
    async (
      courseId: string,
      assignmentId: string,
      submissionId: string,
      marks: number,
      feedback: string
    ) => {
      const res = await apiRequest<{ submission: AssignmentSubmission }>(
        `/api/admin/courses/${courseId}/assignments/${assignmentId}/review/${submissionId}`,
        {
          method: 'POST',
          body: JSON.stringify({ marks, feedback }),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  // ---- STUDENTS & ACCESS ----
  const createStudent = useCallback(
    async (
      name: string,
      email: string,
      phone: string,
      state: string,
      password: string
    ) => {
      const res = await apiRequest('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify({ name, email, phone, state, password }),
      });
      if (!res.ok) return { ok: false, error: res.error };
      await syncPortalState();
      return { ok: true };
    },
    [syncPortalState]
  );

  const toggleStudentActive = useCallback(
    async (studentId: string) => {
      const res = await apiRequest(`/api/admin/students/${studentId}/toggle`, {
        method: 'PATCH',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const updateStudentAccess = useCallback(
    async (studentId: string, courseIds: string[]) => {
      const res = await apiRequest(`/api/admin/students/${studentId}/access`, {
        method: 'PUT',
        body: JSON.stringify({ courseIds }),
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const updateProfile = useCallback(
    async (payload: {
      name: string;
      email?: string;
      phone?: string;
      state?: string;
      guardianName?: string;
      address?: string;
      city?: string;
      pincode?: string;
      recoveryPin?: string;
      currentPassword?: string;
      newPassword?: string;
    }) => {
      const res = await apiRequest<{ user: User }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, error: res.error };
      await syncPortalState();
      return { ok: true };
    },
    [syncPortalState]
  );

  // ---- AUDIT LOGS & NOTIFICATIONS ----
  const fetchAuditLogs = useCallback(
    async (params?: {
      search?: string;
      role?: string;
      category?: string;
      page?: number;
      pageSize?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.role) qs.set('role', params.role);
      if (params?.category) qs.set('category', params.category);
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      return apiRequest<{
        logs: ActivityLogEntry[];
        total: number;
        page: number;
        pageSize: number;
      }>(`/api/admin/audit-logs?${qs.toString()}`, { method: 'GET' });
    },
    []
  );

  const markNotificationRead = useCallback(
    async (id: string) => {
      await apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
      });
      await fetchNotifications();
    },
    [fetchNotifications]
  );

  const markAllNotificationsRead = useCallback(async () => {
    await apiRequest('/api/notifications/read-all', { method: 'POST' });
    await fetchNotifications();
  }, [fetchNotifications]);

  // ---- CERTIFICATE VERIFICATION, REGISTRY & REVOCATION ----
  const verifyCertificate = useCallback(async (certNo: string) => {
    return apiRequest<{
      found: boolean;
      certificate?: {
        certificateNo: string;
        studentName: string;
        studentEmail: string;
        targetTitle: string;
        targetType: 'course' | 'bundle';
        issuedDate: string;
        status: 'ACTIVE' | 'REVOKED';
        revokedReason?: string;
        source?: string;
      };
    }>(`/api/certificates/verify/${encodeURIComponent(certNo)}`, { method: 'GET' });
  }, []);

  const fetchCertificateRegistry = useCallback(async () => {
    return apiRequest<{ registry: IssuedCertificateMeta[] }>(
      '/api/admin/certificates/registry',
      { method: 'GET' }
    );
  }, []);

  const revokeCertificate = useCallback(
    async (certNo: string, reason: string) => {
      const res = await apiRequest<{ ok: boolean }>(
        `/api/admin/certificates/${encodeURIComponent(certNo)}/revoke`,
        { method: 'POST', body: JSON.stringify({ reason }) }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const reinstateCertificate = useCallback(
    async (certNo: string) => {
      const res = await apiRequest<{ ok: boolean }>(
        `/api/admin/certificates/${encodeURIComponent(certNo)}/reinstate`,
        { method: 'POST' }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  // ---- SUPPORT DESK & LOGIN HELP ----
  const submitPublicLoginHelp = useCallback(
    async (name: string, email: string, message: string) => {
      return apiRequest<{ ok: boolean; ticketId: string }>(
        '/api/support/public-login-help',
        {
          method: 'POST',
          body: JSON.stringify({ name, email, message }),
        },
        null
      );
    },
    []
  );

  const fetchSupportTickets = useCallback(async () => {
    return apiRequest<{ tickets: SupportTicket[] }>('/api/support/tickets', {
      method: 'GET',
    });
  }, []);

  const createSupportTicket = useCallback(
    async (payload: {
      subject: string;
      message: string;
      category: SupportTicket['category'];
      courseId?: string;
      priority?: SupportTicket['priority'];
    }) => {
      return apiRequest<{ ticket: SupportTicket }>('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    []
  );

  const replySupportTicket = useCallback(
    async (ticketId: string, message: string) => {
      return apiRequest<{ ticket: SupportTicket }>(
        `/api/support/tickets/${encodeURIComponent(ticketId)}/reply`,
        { method: 'POST', body: JSON.stringify({ message }) }
      );
    },
    []
  );

  const updateSupportTicketStatus = useCallback(
    async (ticketId: string, status: SupportTicket['status']) => {
      return apiRequest<{ ticket: SupportTicket }>(
        `/api/support/tickets/${encodeURIComponent(ticketId)}/status`,
        { method: 'PATCH', body: JSON.stringify({ status }) }
      );
    },
    []
  );

  // ---- CHECKOUT & ORDERS ----
  const previewCheckout = useCallback(
    async (
      itemType: 'course' | 'bundle',
      itemId: string,
      couponCode: string,
      planId?: string,
      studentState?: string
    ) => {
      return apiRequest<{ breakdown: PriceBreakdown }>(
        '/api/student/checkout/preview',
        {
          method: 'POST',
          body: JSON.stringify({
            itemType,
            itemId,
            couponCode,
            planId,
            studentState,
          }),
        }
      );
    },
    []
  );

  const verifyPaymentReference = useCallback(
    async (payload: {
      reference: string;
      studentPhone?: string;
    }): Promise<
      | {
          ok: true;
          valid: boolean;
          normalized: string;
          proofType: string;
          duplicate: boolean;
          message: string;
        }
      | { ok: false; error: string }
    > => {
      const res = await apiRequest<{
        valid: boolean;
        normalized: string;
        proofType: string;
        duplicate: boolean;
        message: string;
      }>('/api/student/checkout/verify-reference', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, ...res.data };
    },
    []
  );

  const placeOrder = useCallback(
    async (payload: {
      itemType: 'course' | 'bundle';
      itemId: string;
      planId?: string;
      couponCode?: string;
      method: string;
      reference: string;
      studentPhone?: string;
      studentState?: string;
      proofScreenshotUrl?: string;
    }): Promise<{ ok: true; order: Order } | { ok: false; error: string }> => {
      const res = await apiRequest<{ order: Order }>('/api/student/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, error: res.error };
      await syncPortalState();
      return { ok: true, order: res.data.order };
    },
    [syncPortalState]
  );

  const resendOrderEmail = useCallback(
    async (orderId: string) => {
      const res = await apiRequest<{
        order: Order;
        status: string;
        note: string;
      }>(`/api/orders/${orderId}/resend-email`, {
        method: 'POST',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const approveOrder = useCallback(
    async (orderId: string) => {
      const res = await apiRequest(`/api/admin/orders/${orderId}/approve`, {
        method: 'POST',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const rejectOrder = useCallback(
    async (orderId: string) => {
      const res = await apiRequest(`/api/admin/orders/${orderId}/reject`, {
        method: 'POST',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const refundOrder = useCallback(
    async (orderId: string, reason: string, amount?: number) => {
      const res = await apiRequest<{ order: Order }>(
        `/api/admin/orders/${encodeURIComponent(orderId)}/refund`,
        { method: 'POST', body: JSON.stringify({ reason, amount }) }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  // ---- PROMOS, SETTINGS & BACKUP ----
  const saveCoupon = useCallback(
    async (payload: {
      code: string;
      type: 'percent' | 'flat';
      value: number;
      min: number;
    }) => {
      const res = await apiRequest('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const toggleCoupon = useCallback(
    async (couponId: string) => {
      const res = await apiRequest(`/api/admin/coupons/${couponId}/toggle`, {
        method: 'PATCH',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const deleteCoupon = useCallback(
    async (couponId: string) => {
      const res = await apiRequest(`/api/admin/coupons/${couponId}`, {
        method: 'DELETE',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const saveBundle = useCallback(
    async (
      name: string,
      courseIds: string[],
      price: number,
      extra?: {
        thumbnailUrl?: string;
        certificateConfig?: CertificateTemplateConfig;
      }
    ) => {
      const res = await apiRequest('/api/admin/bundles', {
        method: 'POST',
        body: JSON.stringify({ name, courseIds, price, ...(extra || {}) }),
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const updateBundle = useCallback(
    async (bundleId: string, payload: Partial<Omit<Bundle, 'id'>>) => {
      const res = await apiRequest(`/api/admin/bundles/${bundleId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const deleteBundle = useCallback(
    async (bundleId: string) => {
      const res = await apiRequest(`/api/admin/bundles/${bundleId}`, {
        method: 'DELETE',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const saveCustomCertificate = useCallback(
    async (payload: {
      studentId: string;
      targetType: 'course' | 'bundle';
      targetId: string;
      targetTitle?: string;
      certificateNo?: string;
      issuedDate?: string;
      mode: 'template' | 'uploaded';
      fileUrl?: string;
      fileName?: string;
      customHeading?: string;
      customSubtitle?: string;
      notes?: string;
    }) => {
      const res = await apiRequest<{ certificate: CustomCertificateRecord }>(
        '/api/admin/certificates',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const deleteCustomCertificate = useCallback(
    async (certId: string) => {
      const res = await apiRequest(`/api/admin/certificates/${certId}`, {
        method: 'DELETE',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const addPaymentMethod = useCallback(
    async (payload: Omit<PaymentMethod, 'id' | 'active'> & { active?: boolean }) => {
      const res = await apiRequest<{ method: PaymentMethod }>('/api/admin/methods', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const updatePaymentMethod = useCallback(
    async (id: string, payload: Partial<Omit<PaymentMethod, 'id'>>) => {
      const res = await apiRequest<{ method: PaymentMethod }>(
        `/api/admin/methods/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const togglePaymentMethod = useCallback(
    async (id: string) => {
      const res = await apiRequest(`/api/admin/methods/${id}/toggle`, {
        method: 'PATCH',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const deletePaymentMethod = useCallback(
    async (id: string) => {
      const res = await apiRequest(`/api/admin/methods/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const updateSettings = useCallback(
    async (
      partial: Partial<PortalSettings> & {
        smtpPass?: string;
        clearSmtpPass?: boolean;
        whatsappApiToken?: string;
        clearWhatsappToken?: boolean;
      }
    ) => {
      const res = await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(partial),
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const testEmailNotification = useCallback(async (to: string) => {
    return apiRequest<{ ok: boolean; note: string }>(
      '/api/admin/notifications/test-email',
      {
        method: 'POST',
        body: JSON.stringify({ to }),
      }
    );
  }, []);

  const saveAnnouncement = useCallback(
    async (payload: {
      active: boolean;
      category: AnnouncementCategory;
      title: string;
      message: string;
      actionPage?: 'courses' | 'mycourses' | 'certificates' | '';
      actionLabel?: string;
    }) => {
      const res = await apiRequest<{ announcement: Announcement }>(
        '/api/admin/announcement',
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const clearAnnouncement = useCallback(async () => {
    const res = await apiRequest('/api/admin/announcement', {
      method: 'DELETE',
    });
    if (res.ok) await syncPortalState();
    return res;
  }, [syncPortalState]);

  const saveLiveClass = useCallback(
    async (payload: Partial<LiveClassSession>) => {
      const res = await apiRequest<{ liveClass: LiveClassSession }>(
        '/api/admin/live-class',
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const clearLiveClass = useCallback(async () => {
    const res = await apiRequest('/api/admin/live-class', {
      method: 'DELETE',
    });
    if (res.ok) await syncPortalState();
    return res;
  }, [syncPortalState]);

  const saveWelcomeVideo = useCallback(
    async (payload: Partial<WelcomeShowcase>) => {
      const res = await apiRequest<{ welcomeVideo: WelcomeShowcase }>(
        '/api/admin/welcome-video',
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const savePlatformLinks = useCallback(
    async (payload: Partial<PlatformLinksConfig>) => {
      const res = await apiRequest<{ platformLinks: PlatformLinksConfig }>(
        '/api/admin/platform-links',
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  const downloadSystemBackup = useCallback(async () => {
    const token = getStoredToken();
    const res = await fetch('/api/admin/system/backup', {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      return { ok: false as const, error: 'Could not download system backup.' };
    }
    const text = await res.text();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arya-lms-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true as const };
  }, []);

  const restoreSystemBackup = useCallback(
    async (backup: unknown, twoFactorCode?: string) => {
      const res = await apiRequest<{ ok: boolean }>('/api/admin/system/restore', {
        method: 'POST',
        body: JSON.stringify({ backup, twoFactorCode }),
      });
      if (res.ok) await syncPortalState();
      return res;
    },
    [syncPortalState]
  );

  // ---- PROGRESS ----
  const markLessonComplete = useCallback(
    async (userId: string, courseId: string, lessonId: string) => {
      const key = `${userId}_${courseId}_${lessonId}`;
      setProgress((prev) => ({ ...prev, [key]: 100 }));
      await apiRequest('/api/student/progress/complete', {
        method: 'POST',
        body: JSON.stringify({ courseId, lessonId }),
      });
    },
    []
  );

  const recordWatchDelta = useCallback(
    (
      userId: string,
      courseId: string,
      lessonId: string,
      delta: number,
      duration: number
    ) => {
      if (duration <= 0 || delta <= 0) return;
      const key = `${userId}_${courseId}_${lessonId}`;
      const existingBuf = watchBufferRef.current[key];
      watchBufferRef.current[key] = {
        courseId,
        lessonId,
        delta: (existingBuf?.delta || 0) + delta,
        duration,
      };
      setProgress((prev) => {
        const currentPct = prev[key] || 0;
        const addedPct = (delta / duration) * 100;
        return { ...prev, [key]: Math.min(100, currentPct + addedPct) };
      });
    },
    []
  );

  const seedSampleCatalog = useCallback(async () => {
    const res = await apiRequest('/api/admin/seed-sample', { method: 'POST' });
    if (res.ok) await syncPortalState();
    return res;
  }, [syncPortalState]);

  return {
    initializing,
    adminExists,
    authBrand,
    whatsappCloudApiConfigured,
    enforceWhatsapp2FA,
    pendingWhatsappOtp,
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
    currentUser,
    syncPortalState,
    createAdminAccount,
    adminSignIn,
    verifyWhatsappLoginOtp,
    resendWhatsappLoginOtp,
    clearPendingWhatsappOtp,
    sendWhatsappOtp,
    verifyWhatsappOtp,
    registerAdminAccount,
    fetchInviteDetails,
    acceptInvite,
    studentSignUp,
    studentSignIn,
    signOut,
    regenerateBackupCodes,
    updateRecoveryPin,
    fetchSessions,
    revokeSession,
    terminateUserSessions,
    fetchAdminTeam,
    inviteAdmin,
    createSubAdmin,
    cancelInvitation,
    updateSubAdmin,
    assignAdminCourses,
    updateAdminStatus,
    resetAdminPassword,
    deleteSubAdmin,
    fetchAdminRegistrations,
    approveAdminRegistration,
    activateAdminRegistration,
    rejectAdminRegistration,
    saveWhatsappApiConfig,
    fetchWhatsappDeliveryLogs,
    testWhatsappDelivery,
    recoverForgotLoginId,
    requestStudentPasswordReset,
    requestSuperAdminPasswordReset,
    requestSubAdminPasswordRecovery,
    completePasswordRecovery,
    fetchRecoveryRequests,
    approveRecoveryRequest,
    rejectRecoveryRequest,
    saveCourse,
    deleteCourse,
    saveChapter,
    deleteChapter,
    saveLesson,
    deleteLesson,
    submitCourseApproval,
    approveCourse,
    publishCourse,
    rejectCourse,
    requestCourseRevision,
    archiveCourse,
    fetchCourseVersions,
    restoreCourseVersion,
    saveQuiz,
    deleteQuiz,
    saveAssignment,
    deleteAssignment,
    submitQuizAttempt,
    submitAssignmentResponse,
    reviewAssignmentSubmission,
    createStudent,
    toggleStudentActive,
    updateStudentAccess,
    updateProfile,
    fetchAuditLogs,
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    verifyCertificate,
    fetchCertificateRegistry,
    revokeCertificate,
    reinstateCertificate,
    submitPublicLoginHelp,
    fetchSupportTickets,
    createSupportTicket,
    replySupportTicket,
    updateSupportTicketStatus,
    previewCheckout,
    verifyPaymentReference,
    placeOrder,
    resendOrderEmail,
    approveOrder,
    rejectOrder,
    refundOrder,
    saveCoupon,
    toggleCoupon,
    deleteCoupon,
    saveBundle,
    updateBundle,
    deleteBundle,
    saveCustomCertificate,
    deleteCustomCertificate,
    addPaymentMethod,
    updatePaymentMethod,
    togglePaymentMethod,
    deletePaymentMethod,
    updateSettings,
    testEmailNotification,
    saveAnnouncement,
    clearAnnouncement,
    saveLiveClass,
    clearLiveClass,
    saveWelcomeVideo,
    savePlatformLinks,
    downloadSystemBackup,
    restoreSystemBackup,
    markLessonComplete,
    recordWatchDelta,
    seedSampleCatalog,
  };
}
