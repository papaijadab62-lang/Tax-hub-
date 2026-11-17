import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  HelpCircle,
  KeyRound,
  MessageCircle,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import type { PendingWhatsappOtpChallenge } from '../hooks/useLmsStore';
import { LAST_PORTAL_KEY } from '../hooks/useLmsStore';
import type { AdminRole } from '../types/lms';
import { INDIAN_GST_STATES } from '../utils/lms';
import { ADMIN_ROLE_LABELS } from '../utils/rbac';

interface AuthScreenProps {
  adminExists: boolean;
  brandName: string;
  whatsappCloudApiConfigured: boolean;
  inviteToken?: string | null;
  pendingWhatsappOtp: PendingWhatsappOtpChallenge | null;
  onCreateAdmin: (
    name: string,
    email: string,
    password: string,
    extra?: {
      phone?: string;
      countryCode?: string;
      whatsappNumber?: string;
      recoveryPin?: string;
    }
  ) => Promise<{
    ok: boolean;
    error?: string;
    emergencyRecoveryCodes?: string[];
  }>;
  onAdminSignIn: (
    email: string,
    password: string
  ) => Promise<{
    ok: boolean;
    error?: string;
    requiresWhatsappOtp?: boolean;
    wrongPortal?: 'admin' | 'student';
  }>;
  onVerifyWhatsappLoginOtp: (
    code: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onResendWhatsappLoginOtp: () => Promise<
    { ok: true; data: unknown } | { ok: false; error: string }
  >;
  onClearPendingWhatsappOtp: () => void;
  onSendWhatsappOtp: (payload: {
    countryCode: string;
    whatsappNumber: string;
    purpose: 'REGISTRATION' | 'PASSWORD_RECOVERY' | 'WHATSAPP_VERIFY';
    recipientName?: string;
  }) => Promise<
    | {
        ok: true;
        data: {
          ok: boolean;
          challengeId: string;
          maskedPhone: string;
          expiresAt: string;
          resendAvailableAt: string;
        };
      }
    | { ok: false; error: string; apiNotConfigured?: boolean }
  >;
  onVerifyWhatsappOtp: (payload: {
    challengeId: string;
    code: string;
    consumeImmediately?: boolean;
  }) => Promise<
    | {
        ok: true;
        data: { ok: boolean; verified: boolean; challengeId: string; maskedPhone: string };
      }
    | { ok: false; error: string }
  >;
  onRegisterAdmin: (payload: {
    name: string;
    email: string;
    phone: string;
    countryCode: string;
    whatsappNumber: string;
    password: string;
    confirmPassword: string;
    requestedDesignation: Exclude<AdminRole, 'SUPER_ADMIN'>;
    otpChallengeId?: string;
  }) => Promise<{ ok: boolean; error?: string; data?: { message: string } }>;
  onFetchInviteDetails: (token: string) => Promise<
    | {
        ok: true;
        data: {
          invitation: {
            name: string;
            email: string;
            adminRole: Exclude<AdminRole, 'SUPER_ADMIN'>;
            invitedByName: string;
            expiresAt: string;
            brand: string;
          };
        };
      }
    | { ok: false; error: string }
  >;
  onAcceptInvite: (
    token: string,
    password: string,
    name?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onStudentSignUp: (
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
  ) => Promise<{ ok: boolean; error?: string }>;
  onStudentSignIn: (
    email: string,
    password: string
  ) => Promise<{
    ok: boolean;
    error?: string;
    requiresWhatsappOtp?: boolean;
    wrongPortal?: 'admin' | 'student';
  }>;
  onRecoverForgotLoginId: (payload: {
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
  }) => Promise<
    | {
        ok: true;
        data: {
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
        };
      }
    | { ok: false; error: string; apiNotConfigured?: boolean }
  >;
  onRequestStudentReset: (
    email: string
  ) => Promise<
    | {
        ok: true;
        data: {
          ok: boolean;
          channel: 'WHATSAPP';
          challengeId: string;
          maskedPhone?: string;
        };
      }
    | { ok: false; error: string; useSupportHelp?: boolean }
  >;
  onRequestSuperAdminReset: (
    email: string,
    method: 'auto' | 'whatsapp' | 'backup_code' | 'recovery_pin',
    backupCodeOrPin?: string
  ) => Promise<
    | {
        ok: true;
        data: {
          ok: boolean;
          channel: 'WHATSAPP' | 'BACKUP_CODE' | 'RECOVERY_PIN';
          challengeId?: string;
          resetChallengeToken?: string;
          maskedPhone?: string;
        };
      }
    | {
        ok: false;
        error: string;
        suggestOfflineMethods?: boolean;
        hasBackupCodes?: boolean;
        hasRecoveryPin?: boolean;
      }
  >;
  onRequestSubAdminRecovery: (email: string) => Promise<
    | { ok: true; data: { ok: boolean; message: string } }
    | { ok: false; error: string }
  >;
  onCompletePasswordRecovery: (payload: {
    newPassword: string;
    resetToken?: string;
    resetChallengeToken?: string;
    challengeId?: string;
    code?: string;
  }) => Promise<
    { ok: true; data: { ok: boolean; message: string } } | { ok: false; error: string }
  >;
  onSubmitLoginHelp: (
    name: string,
    email: string,
    message: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

const ADMIN_DESIGNATIONS: Array<Exclude<AdminRole, 'SUPER_ADMIN'>> = [
  'ADMIN',
  'CO_ADMIN',
  'COURSE_MANAGER',
  'CONTENT_EDITOR',
  'STUDENT_SUPPORT',
];

export function AuthScreen({
  adminExists,
  brandName,
  whatsappCloudApiConfigured,
  inviteToken,
  pendingWhatsappOtp,
  onCreateAdmin,
  onAdminSignIn,
  onVerifyWhatsappLoginOtp,
  onResendWhatsappLoginOtp,
  onClearPendingWhatsappOtp,
  onSendWhatsappOtp,
  onVerifyWhatsappOtp,
  onRegisterAdmin,
  onFetchInviteDetails,
  onAcceptInvite,
  onStudentSignUp,
  onStudentSignIn,
  onRecoverForgotLoginId,
  onRequestStudentReset,
  onRequestSuperAdminReset,
  onRequestSubAdminRecovery,
  onCompletePasswordRecovery,
  onSubmitLoginHelp,
}: AuthScreenProps) {
  const [portalMode, setPortalMode] = useState<'student' | 'admin'>(() => {
    if (!adminExists) return 'admin';
    try {
      const saved = localStorage.getItem(LAST_PORTAL_KEY);
      if (saved === 'admin' || saved === 'student') return saved;
    } catch {
      // ignore storage errors
    }
    return 'student';
  });
  const [studentAction, setStudentAction] = useState<
    'signin' | 'signup' | 'forgot' | 'help'
  >('signin');
  const [adminAction, setAdminAction] = useState<'signin' | 'register' | 'forgot'>(
    'signin'
  );

  // Common Login / Signup state
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [setupRecoveryPin, setSetupRecoveryPin] = useState('');
  const [studentState, setStudentState] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requestedDesignation, setRequestedDesignation] = useState<
    Exclude<AdminRole, 'SUPER_ADMIN'>
  >('COURSE_MANAGER');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Registration Phone / WhatsApp OTP state
  const [regOtpChallengeId, setRegOtpChallengeId] = useState('');
  const [regOtpCode, setRegOtpCode] = useState('');
  const [regOtpVerified, setRegOtpVerified] = useState(false);
  const [regMaskedPhone, setRegMaskedPhone] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [adminPendingSuccess, setAdminPendingSuccess] = useState('');

  // Pending Phone OTP 2FA Verification inputs
  const [waLoginCode, setWaLoginCode] = useState('');
  const [resendCooldownSec, setResendCooldownSec] = useState(0);

  // Invite Token state
  const [inviteInfo, setInviteInfo] = useState<{
    name: string;
    email: string;
    adminRole: Exclude<AdminRole, 'SUPER_ADMIN'>;
    invitedByName: string;
  } | null>(null);
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteName, setInviteName] = useState('');

  // Forgot ID / Forgot Password / Recovery state
  const [adminRecoveryTab, setAdminRecoveryTab] = useState<'password' | 'forgot_id'>(
    'password'
  );
  const [recoveryType, setRecoveryType] = useState<'sub_admin' | 'super_admin'>(
    'super_admin'
  );
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMethod, setRecoveryMethod] = useState<
    'auto' | 'whatsapp' | 'backup_code' | 'recovery_pin'
  >('auto');
  const [backupCode, setBackupCode] = useState('');
  const [recoveryPinInput, setRecoveryPinInput] = useState('');
  const [resetChallengeId, setResetChallengeId] = useState('');
  const [resetChallengeToken, setResetChallengeToken] = useState('');
  const [subAdminTokenMode, setSubAdminTokenMode] = useState(false);
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [resetOtpCode, setResetOtpCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  // Forgot Admin ID lookup state
  const [forgotIdMethod, setForgotIdMethod] = useState<
    'password' | 'recovery_pin' | 'backup_code' | 'whatsapp_otp'
  >('password');
  const [forgotIdName, setForgotIdName] = useState('');
  const [forgotIdPhone, setForgotIdPhone] = useState('');
  const [forgotIdSecret, setForgotIdSecret] = useState('');
  const [forgotIdChallengeId, setForgotIdChallengeId] = useState('');
  const [forgotIdOtp, setForgotIdOtp] = useState('');
  const [recoveredAccounts, setRecoveredAccounts] = useState<
    Array<{
      name: string;
      email: string;
      role: 'admin' | 'student';
      adminRole: AdminRole | null;
    }>
  >([]);

  // Login Help form
  const [helpName, setHelpName] = useState('');
  const [helpEmail, setHelpEmail] = useState('');
  const [helpMessage, setHelpMessage] = useState('');

  useEffect(() => {
    if (!inviteToken) {
      setInviteInfo(null);
      return;
    }
    onFetchInviteDetails(inviteToken).then((res) => {
      if (res.ok) {
        setInviteInfo(res.data.invitation);
        setInviteName(res.data.invitation.name);
      } else {
        setError(res.error);
      }
    });
  }, [inviteToken, onFetchInviteDetails]);

  useEffect(() => {
    if (!pendingWhatsappOtp?.resendAvailableAt) {
      setResendCooldownSec(0);
      return;
    }
    const update = () => {
      const diff = Math.ceil(
        (Date.parse(pendingWhatsappOtp.resendAvailableAt) - Date.now()) / 1000
      );
      setResendCooldownSec(Math.max(0, diff));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [pendingWhatsappOtp?.resendAvailableAt]);

  const resetMessages = () => {
    setError('');
    setInfoMsg('');
    setAdminPendingSuccess('');
  };

  const resetRegOtp = () => {
    setRegOtpChallengeId('');
    setRegOtpCode('');
    setRegOtpVerified(false);
    setRegMaskedPhone('');
  };

  const switchPortal = (mode: 'student' | 'admin') => {
    setPortalMode(mode);
    try {
      localStorage.setItem(LAST_PORTAL_KEY, mode);
    } catch {
      // ignore storage errors
    }
    setPassword('');
    setConfirmPassword('');
    resetMessages();
    resetRegOtp();
  };

  const handleSendRegOtp = async () => {
    resetMessages();
    if (whatsappNumber.replace(/\D/g, '').length < 8) {
      setError('Enter a valid 10-digit Phone / WhatsApp number before requesting OTP.');
      return;
    }
    setOtpBusy(true);
    try {
      const res = await onSendWhatsappOtp({
        countryCode: countryCode || '+91',
        whatsappNumber: whatsappNumber.trim(),
        purpose: 'REGISTRATION',
        recipientName: name.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRegOtpChallengeId(res.data.challengeId);
      setRegMaskedPhone(res.data.maskedPhone);
      setRegOtpVerified(false);
      setInfoMsg(`6-digit OTP sent to ${res.data.maskedPhone}.`);
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyRegOtp = async () => {
    resetMessages();
    if (!regOtpChallengeId || !regOtpCode.trim()) {
      setError('Enter the 6-digit OTP sent to your WhatsApp.');
      return;
    }
    setOtpBusy(true);
    try {
      const res = await onVerifyWhatsappOtp({
        challengeId: regOtpChallengeId,
        code: regOtpCode.trim(),
        consumeImmediately: false,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRegOtpVerified(true);
      setInfoMsg(`WhatsApp number ${res.data.maskedPhone} verified.`);
    } finally {
      setOtpBusy(false);
    }
  };

  // SCREEN A: Single Phone / WhatsApp 6-Digit OTP Verification Challenge
  if (pendingWhatsappOtp) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5 bg-[linear-gradient(135deg,#eaf0fa_0%,#f8f5ed_100%)]">
        <div className="w-full max-w-[460px] rounded-[22px] border border-[#e3e9f2] bg-white p-7 sm:p-8 shadow-[0_20px_70px_rgba(20,39,70,0.10)] space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[#13845b]">
            <MessageCircle className="h-4 w-4" />
            <span>Phone / WhatsApp OTP Verification (2FA)</span>
          </div>
          <h1 className="text-xl font-extrabold text-[#142746]">
            Enter 6-Digit Phone OTP
          </h1>
          <p className="text-xs text-[#59677d]">
            Sent only to your registered phone <strong>{pendingWhatsappOtp.maskedPhone}</strong> for{' '}
            <strong>{pendingWhatsappOtp.userPreview.name}</strong> (
            {pendingWhatsappOtp.userPreview.email}). Expires in 5 minutes.
          </p>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              resetMessages();
              setSubmitting(true);
              try {
                const res = await onVerifyWhatsappLoginOtp(waLoginCode.trim());
                if (!res.ok && res.error) setError(res.error);
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                6-Digit WhatsApp OTP *
              </label>
              <input
                required
                autoFocus
                maxLength={6}
                value={waLoginCode}
                onChange={(e) => setWaLoginCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full rounded-[10px] border border-[#e3e9f2] px-4 py-3 text-center text-lg font-mono font-bold tracking-[0.35em] text-[#142746] outline-none focus:border-[#315b9b]"
              />
            </div>

            {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
            {infoMsg && <p className="text-xs font-semibold text-[#13845b]">{infoMsg}</p>}

            <button
              type="submit"
              disabled={submitting || waLoginCode.length < 6}
              className="w-full rounded-[10px] bg-[#142746] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1e3761] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Verifying...' : 'Verify OTP & Enter Portal'}
            </button>
          </form>

          <div className="flex items-center justify-between pt-2 border-t border-[#e3e9f2] text-xs">
            <button
              type="button"
              onClick={() => {
                setWaLoginCode('');
                resetMessages();
                onClearPendingWhatsappOtp();
              }}
              className="inline-flex items-center gap-1 font-bold text-[#59677d] hover:text-[#142746] cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Sign In</span>
            </button>
            <button
              type="button"
              disabled={resendCooldownSec > 0 || otpBusy}
              onClick={async () => {
                resetMessages();
                setOtpBusy(true);
                try {
                  const res = await onResendWhatsappLoginOtp();
                  if (!res.ok) setError(res.error);
                  else setInfoMsg('A fresh 6-digit OTP has been sent to WhatsApp.');
                } finally {
                  setOtpBusy(false);
                }
              }}
              className="font-bold text-[#315b9b] hover:underline disabled:opacity-50 cursor-pointer"
            >
              {resendCooldownSec > 0
                ? `Resend in ${resendCooldownSec}s`
                : 'Resend Phone OTP'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // SCREEN C: Admin Invitation Activation
  if (inviteToken && inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5 bg-[linear-gradient(135deg,#eaf0fa_0%,#f8f5ed_100%)]">
        <div className="w-full max-w-[460px] rounded-[22px] border border-[#e3e9f2] bg-white p-7 sm:p-8 shadow-[0_20px_70px_rgba(20,39,70,0.10)] space-y-4">
          <div className="text-xs font-bold text-[#8c6826]">
            Admin Invitation · {ADMIN_ROLE_LABELS[inviteInfo.adminRole]}
          </div>
          <h1 className="text-xl font-extrabold text-[#142746]">
            Activate Your Staff Account
          </h1>
          <p className="text-xs text-[#59677d]">
            Invited by <strong>{inviteInfo.invitedByName}</strong> for{' '}
            <strong>{inviteInfo.email}</strong>.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              resetMessages();
              setSubmitting(true);
              try {
                const res = await onAcceptInvite(inviteToken, invitePassword, inviteName);
                if (!res.ok && res.error) setError(res.error);
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-3.5"
          >
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Full Name *
              </label>
              <input
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Set Password (min 8 chars) *
              </label>
              <input
                required
                type="password"
                minLength={8}
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
              />
            </div>
            {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-[10px] bg-[#142746] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1e3761] cursor-pointer"
            >
              {submitting ? 'Activating...' : 'Activate Admin Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);

    try {
      if (portalMode === 'admin') {
        if (!adminExists) {
          if (password.length < 8) {
            setError('Admin password must be at least 8 characters.');
            return;
          }
          if (confirmPassword && password !== confirmPassword) {
            setError('Password and Confirm Password must match.');
            return;
          }
          if (setupRecoveryPin.trim() && setupRecoveryPin.trim().length < 4) {
            setError('Security Recovery PIN must be at least 4 characters (or leave blank).');
            return;
          }
          const cleanPhone = phone.trim();
          const res = await onCreateAdmin(name, loginId, password, {
            phone: cleanPhone || undefined,
            countryCode: countryCode || '+91',
            whatsappNumber: cleanPhone || undefined,
            recoveryPin: setupRecoveryPin.trim() || undefined,
          });
          if (!res.ok && res.error) setError(res.error);
          return;
        }

        if (adminAction === 'register') {
          if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
          }
          if (password !== confirmPassword) {
            setError('Password and Confirm Password must match.');
            return;
          }
          const cleanWa = whatsappNumber.trim();
          if (cleanWa.replace(/\D/g, '').length < 10) {
            setError('Enter a valid 10-digit Phone / WhatsApp number.');
            return;
          }
          if (whatsappCloudApiConfigured && !regOtpVerified) {
            setError('Verify your phone number via 6-digit OTP first.');
            return;
          }
          const res = await onRegisterAdmin({
            name: name.trim(),
            email: loginId.trim(),
            phone: cleanWa,
            countryCode,
            whatsappNumber: cleanWa,
            password,
            confirmPassword,
            requestedDesignation,
            otpChallengeId: regOtpChallengeId || undefined,
          });
          if (!res.ok && res.error) {
            setError(res.error);
            return;
          }
          setAdminPendingSuccess(
            res.data?.message ||
              'Registration submitted with PENDING APPROVAL status. Main Super Admin will review, assign role/permissions, and activate your account.'
          );
          return;
        }

        // adminAction === 'signin'
        const res = await onAdminSignIn(loginId, password);
        if (!res.ok) {
          if (res.wrongPortal) {
            setPortalMode(res.wrongPortal);
            setStudentAction('signin');
            try {
              localStorage.setItem(LAST_PORTAL_KEY, res.wrongPortal);
            } catch {
              // ignore
            }
            setInfoMsg(res.error || 'Switched to Student Portal. Click Sign In to continue.');
            return;
          }
          if (res.error) setError(res.error);
        }
      } else {
        if (studentAction === 'signup') {
          if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
          }
          if (whatsappNumber.replace(/\D/g, '').length < 10) {
            setError('Enter a valid 10-digit Phone / WhatsApp number.');
            return;
          }
          if (whatsappCloudApiConfigured && !regOtpVerified) {
            setError('Verify your phone number via 6-digit OTP first.');
            return;
          }
          if (!studentState) {
            setError(
              'Please select your State / UT for automatic CGST/SGST or IGST calculation.'
            );
            return;
          }
          const res = await onStudentSignUp(
            name,
            loginId,
            `${countryCode}${whatsappNumber.replace(/\D/g, '')}`,
            studentState,
            password,
            {
              countryCode,
              whatsappNumber: whatsappNumber.trim(),
              otpChallengeId: regOtpChallengeId || undefined,
            }
          );
          if (!res.ok && res.error) setError(res.error);
        } else if (studentAction === 'signin') {
          const res = await onStudentSignIn(loginId, password);
          if (!res.ok) {
            if (res.wrongPortal) {
              setPortalMode(res.wrongPortal);
              setAdminAction('signin');
              try {
                localStorage.setItem(LAST_PORTAL_KEY, res.wrongPortal);
              } catch {
                // ignore
              }
              setInfoMsg(res.error || 'Switched to Admin Portal. Click Sign In to continue.');
              return;
            }
            if (res.error) setError(res.error);
          }
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const heading =
    portalMode === 'admin'
      ? !adminExists
        ? 'Setup Main Super Admin (Owner)'
        : adminAction === 'register'
          ? 'Admin Staff Registration'
          : adminAction === 'forgot'
            ? adminRecoveryTab === 'forgot_id'
              ? 'Recover Forgotten Admin ID'
              : 'Admin Password Recovery'
            : 'Admin Panel Login'
      : studentAction === 'signup'
        ? 'Student Sign Up'
        : studentAction === 'forgot'
          ? 'Student Password Reset'
          : studentAction === 'help'
            ? 'Student Login Help'
            : 'Student Sign In';

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-[linear-gradient(135deg,#eaf0fa_0%,#f8f5ed_100%)]">
      <div className="w-full max-w-[510px] rounded-[22px] border border-[#e3e9f2] bg-white p-7 sm:p-8 shadow-[0_20px_70px_rgba(20,39,70,0.10)]">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[#142746] text-xl font-extrabold text-[#d7a84b]">
            A
          </div>
          <span className="font-display text-lg font-extrabold tracking-tight text-[#142746]">
            {brandName || 'ARYA TAX PATHSHALA'}
          </span>
        </div>

        {/* Separate Student vs Admin Portal Switcher */}
        <div
          className="mt-5 grid grid-cols-2 gap-1.5 rounded-xl bg-[#f3f6fb] p-1.5 border border-[#e3e9f2]"
          role="tablist"
          aria-label="Select login portal"
        >
          <button
            type="button"
            role="tab"
            aria-selected={portalMode === 'student'}
            onClick={() => switchPortal('student')}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              portalMode === 'student'
                ? 'bg-white text-[#142746] shadow-sm'
                : 'text-[#59677d] hover:text-[#142746]'
            }`}
          >
            <GraduationCap className="h-4 w-4 shrink-0" />
            <span>Student Portal</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={portalMode === 'admin'}
            onClick={() => switchPortal('admin')}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              portalMode === 'admin'
                ? 'bg-[#142746] text-white shadow-sm'
                : 'text-[#59677d] hover:text-[#142746]'
            }`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Admin Portal</span>
          </button>
        </div>

        <h1 className="mt-5 text-2xl font-extrabold text-[#142746] text-balance">
          {heading}
        </h1>

        {/* Sub-Navigation */}
        {portalMode === 'student' && (
          <div className="mt-3 flex flex-wrap items-center gap-4 border-b border-[#e3e9f2] text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setStudentAction('signin');
                resetMessages();
              }}
              className={`pb-2 border-b-2 cursor-pointer ${
                studentAction === 'signin'
                  ? 'border-[#142746] text-[#142746]'
                  : 'border-transparent text-[#718096] hover:text-[#142746]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setStudentAction('signup');
                resetMessages();
              }}
              className={`pb-2 border-b-2 cursor-pointer ${
                studentAction === 'signup'
                  ? 'border-[#142746] text-[#142746]'
                  : 'border-transparent text-[#718096] hover:text-[#142746]'
              }`}
            >
              New Student Sign Up
            </button>
            <button
              type="button"
              onClick={() => {
                setStudentAction('forgot');
                setResetChallengeId('');
                resetMessages();
              }}
              className={`pb-2 border-b-2 cursor-pointer ${
                studentAction === 'forgot'
                  ? 'border-[#142746] text-[#142746]'
                  : 'border-transparent text-[#718096] hover:text-[#142746]'
              }`}
            >
              Forgot Password
            </button>
            <button
              type="button"
              onClick={() => {
                setStudentAction('help');
                resetMessages();
              }}
              className={`pb-2 border-b-2 cursor-pointer ${
                studentAction === 'help'
                  ? 'border-[#142746] text-[#142746]'
                  : 'border-transparent text-[#718096] hover:text-[#142746]'
              }`}
            >
              Login Help
            </button>
          </div>
        )}

        {portalMode === 'admin' && adminExists && (
          <div className="mt-3 flex flex-wrap items-center gap-4 border-b border-[#e3e9f2] text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setAdminAction('signin');
                resetMessages();
              }}
              className={`pb-2 border-b-2 cursor-pointer ${
                adminAction === 'signin'
                  ? 'border-[#142746] text-[#142746]'
                  : 'border-transparent text-[#718096] hover:text-[#142746]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAdminAction('register');
                resetMessages();
              }}
              className={`pb-2 border-b-2 cursor-pointer ${
                adminAction === 'register'
                  ? 'border-[#142746] text-[#142746]'
                  : 'border-transparent text-[#718096] hover:text-[#142746]'
              }`}
            >
              <UserPlus className="inline h-3.5 w-3.5 mr-1" />
              Register Staff Admin
            </button>
            <button
              type="button"
              onClick={() => {
                setAdminAction('forgot');
                setResetChallengeId('');
                setResetChallengeToken('');
                setRecoveredAccounts([]);
                setForgotIdChallengeId('');
                resetMessages();
              }}
              className={`pb-2 border-b-2 cursor-pointer ${
                adminAction === 'forgot'
                  ? 'border-[#142746] text-[#142746]'
                  : 'border-transparent text-[#718096] hover:text-[#142746]'
              }`}
            >
              Forgot ID / Password
            </button>
          </div>
        )}

        {/* STUDENT FORGOT PASSWORD */}
        {portalMode === 'student' && studentAction === 'forgot' && (
          <div className="mt-4 space-y-3.5">
            {!resetChallengeId ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  resetMessages();
                  setSubmitting(true);
                  try {
                    const res = await onRequestStudentReset(recoveryEmail.trim());
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    setResetChallengeId(res.data.challengeId);
                    setInfoMsg(
                      `6-digit reset OTP sent only to your registered phone ${res.data.maskedPhone || ''} via WhatsApp.`
                    );
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="space-y-3"
              >
                <p className="text-xs text-[#718096]">
                  One single 6-digit OTP will be sent strictly to your registered Phone / WhatsApp number (no email verification code).
                </p>
                <input
                  required
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="Registered Phone Number, Student ID, or Email"
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                />
                {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-[10px] bg-[#142746] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                >
                  {submitting ? 'Sending Phone OTP...' : 'Send Phone / WhatsApp OTP'}
                </button>
              </form>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  resetMessages();
                  setSubmitting(true);
                  try {
                    const res = await onCompletePasswordRecovery({
                      challengeId: resetChallengeId,
                      code: resetOtpCode.trim(),
                      newPassword: resetNewPassword,
                    });
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    setResetChallengeId('');
                    setResetOtpCode('');
                    setResetNewPassword('');
                    setStudentAction('signin');
                    setInfoMsg('Password reset complete. Sign in with your new password.');
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="space-y-3"
              >
                {infoMsg && <p className="text-xs font-semibold text-[#13845b]">{infoMsg}</p>}
                <input
                  required
                  value={resetOtpCode}
                  onChange={(e) => setResetOtpCode(e.target.value)}
                  placeholder="6-digit OTP code"
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#315b9b]"
                />
                <input
                  required
                  type="password"
                  minLength={6}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="New password (min 6 chars)"
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                />
                {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-[10px] bg-[#13845b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
                >
                  Confirm Password Reset
                </button>
              </form>
            )}
          </div>
        )}

        {/* STUDENT LOGIN HELP */}
        {portalMode === 'student' && studentAction === 'help' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              resetMessages();
              setSubmitting(true);
              try {
                const res = await onSubmitLoginHelp(
                  helpName.trim(),
                  helpEmail.trim(),
                  helpMessage.trim()
                );
                if (!res.ok && res.error) {
                  setError(res.error);
                  return;
                }
                setHelpName('');
                setHelpEmail('');
                setHelpMessage('');
                setInfoMsg(
                  'Login assistance ticket created. Student Support Staff & Main Super Admin have been notified.'
                );
              } finally {
                setSubmitting(false);
              }
            }}
            className="mt-4 space-y-3"
          >
            <p className="text-xs text-[#718096]">
              <HelpCircle className="inline h-3.5 w-3.5 mr-1 text-[#315b9b]" />
              Cannot access your email or WhatsApp? Send a help request directly to Support Staff.
            </p>
            <input
              required
              value={helpName}
              onChange={(e) => setHelpName(e.target.value)}
              placeholder="Full Name *"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
            <input
              required
              value={helpEmail}
              onChange={(e) => setHelpEmail(e.target.value)}
              placeholder="Registered Email / Phone *"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
            <textarea
              required
              rows={3}
              value={helpMessage}
              onChange={(e) => setHelpMessage(e.target.value)}
              placeholder="Describe the login issue..."
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
            {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
            {infoMsg && <p className="text-xs font-semibold text-[#13845b]">{infoMsg}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-[10px] bg-[#142746] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
            >
              Send Login Support Request
            </button>
          </form>
        )}

        {/* ADMIN FORGOT ID & PASSWORD RECOVERY */}
        {portalMode === 'admin' && adminAction === 'forgot' && (
          <div className="mt-4 space-y-3.5">
            <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-[#f3f6fb] p-1 border border-[#e3e9f2] text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setAdminRecoveryTab('password');
                  setRecoveredAccounts([]);
                  setForgotIdChallengeId('');
                  resetMessages();
                }}
                className={`rounded-md px-3 py-1.5 cursor-pointer ${
                  adminRecoveryTab === 'password'
                    ? 'bg-white text-[#142746] shadow-sm'
                    : 'text-[#59677d] hover:text-[#142746]'
                }`}
              >
                Forgot Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminRecoveryTab('forgot_id');
                  setResetChallengeId('');
                  setResetChallengeToken('');
                  resetMessages();
                }}
                className={`rounded-md px-3 py-1.5 cursor-pointer ${
                  adminRecoveryTab === 'forgot_id'
                    ? 'bg-white text-[#142746] shadow-sm'
                    : 'text-[#59677d] hover:text-[#142746]'
                }`}
              >
                Forgot Admin ID
              </button>
            </div>

            {adminRecoveryTab === 'forgot_id' ? (
              recoveredAccounts.length > 0 ? (
                <div className="rounded-[13px] border border-[#bfe6d5] bg-[#eefaf4] p-4 space-y-3">
                  <div className="text-xs font-extrabold text-[#13845b] flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Admin Login ID Found</span>
                  </div>
                  <div className="space-y-2">
                    {recoveredAccounts.map((acc) => (
                      <div
                        key={acc.email}
                        className="rounded-[10px] border border-[#cde8dc] bg-white p-3 space-y-2"
                      >
                        <div className="text-xs text-[#59677d]">
                          <strong className="text-[#142746]">{acc.name}</strong> ·{' '}
                          {acc.adminRole ? ADMIN_ROLE_LABELS[acc.adminRole] : 'Admin'}
                        </div>
                        <div className="text-sm font-mono font-extrabold text-[#142746] break-all">
                          {acc.email}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setLoginId(acc.email);
                            setRecoveryEmail(acc.email);
                            setAdminAction('signin');
                            setRecoveredAccounts([]);
                            resetMessages();
                            setInfoMsg(`Admin ID "${acc.email}" filled in. Enter your password to sign in.`);
                          }}
                          className="rounded-[8px] bg-[#142746] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                        >
                          Use This ID to Sign In →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    resetMessages();
                    setSubmitting(true);
                    try {
                      const res = await onRecoverForgotLoginId({
                        portal: 'admin',
                        method: forgotIdMethod,
                        name: forgotIdName.trim() || undefined,
                        phone: forgotIdPhone.trim() || undefined,
                        countryCode,
                        password:
                          forgotIdMethod === 'password' ? forgotIdSecret : undefined,
                        recoveryPin:
                          forgotIdMethod === 'recovery_pin'
                            ? forgotIdSecret.trim()
                            : undefined,
                        backupCode:
                          forgotIdMethod === 'backup_code'
                            ? forgotIdSecret.trim()
                            : undefined,
                        challengeId: forgotIdChallengeId || undefined,
                        code: forgotIdChallengeId ? forgotIdOtp.trim() : undefined,
                      });
                      if (!res.ok) {
                        setError(res.error);
                        return;
                      }
                      if (res.data.step === 'VERIFY_OTP' && res.data.challengeId) {
                        setForgotIdChallengeId(res.data.challengeId);
                        setInfoMsg(
                          `6-digit OTP sent to ${res.data.maskedPhone || 'your WhatsApp'}. Enter it below to view your Admin ID.`
                        );
                        return;
                      }
                      if (res.data.recoveredAccounts?.length) {
                        setRecoveredAccounts(res.data.recoveredAccounts);
                      }
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="space-y-3"
                >
                  <p className="text-xs text-[#718096]">
                    Verify your identity to recover your forgotten Admin Login ID / Email:
                  </p>
                  <select
                    value={forgotIdMethod}
                    onChange={(e) => {
                      setForgotIdMethod(
                        e.target.value as
                          | 'password'
                          | 'recovery_pin'
                          | 'backup_code'
                          | 'whatsapp_otp'
                      );
                      setForgotIdSecret('');
                      setForgotIdChallengeId('');
                      resetMessages();
                    }}
                    className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-semibold outline-none"
                  >
                    <option value="password">Full Name / Phone + Account Password</option>
                    <option value="recovery_pin">Full Name / Phone + Security Recovery PIN</option>
                    <option value="backup_code">Emergency Backup Recovery Code</option>
                    <option value="whatsapp_otp">Registered WhatsApp OTP</option>
                  </select>

                  {forgotIdMethod !== 'backup_code' &&
                    forgotIdMethod !== 'whatsapp_otp' && (
                      <input
                        value={forgotIdName}
                        onChange={(e) => setForgotIdName(e.target.value)}
                        placeholder="Full Name (e.g. Arya Sengupta)"
                        className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                      />
                    )}

                  <input
                    type="tel"
                    required={forgotIdMethod === 'whatsapp_otp'}
                    value={forgotIdPhone}
                    onChange={(e) => setForgotIdPhone(e.target.value)}
                    placeholder={
                      forgotIdMethod === 'whatsapp_otp'
                        ? 'Registered 10-digit WhatsApp Number *'
                        : 'Registered Mobile / WhatsApp Number (or leave blank if Name entered)'
                    }
                    className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#315b9b]"
                  />

                  {forgotIdMethod !== 'whatsapp_otp' && (
                    <input
                      required
                      type={forgotIdMethod === 'password' ? 'password' : 'text'}
                      value={forgotIdSecret}
                      onChange={(e) => setForgotIdSecret(e.target.value)}
                      placeholder={
                        forgotIdMethod === 'password'
                          ? 'Your Account Password *'
                          : forgotIdMethod === 'recovery_pin'
                            ? 'Your Security Recovery PIN *'
                            : 'Emergency Backup Code (e.g. A1B2-C3D4) *'
                      }
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                    />
                  )}

                  {forgotIdMethod === 'whatsapp_otp' && forgotIdChallengeId && (
                    <input
                      required
                      value={forgotIdOtp}
                      onChange={(e) => setForgotIdOtp(e.target.value)}
                      placeholder="Enter 6-digit WhatsApp OTP *"
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#315b9b]"
                    />
                  )}

                  {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
                  {infoMsg && <p className="text-xs font-semibold text-[#13845b]">{infoMsg}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-[10px] bg-[#142746] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                  >
                    {submitting
                      ? 'Checking...'
                      : forgotIdMethod === 'whatsapp_otp' && !forgotIdChallengeId
                        ? 'Send WhatsApp OTP'
                        : 'Find My Admin Login ID'}
                  </button>
                </form>
              )
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryType('super_admin');
                      setResetChallengeId('');
                      setResetChallengeToken('');
                      resetMessages();
                    }}
                    className={`rounded-[9px] border px-3 py-2 cursor-pointer ${
                      recoveryType === 'super_admin'
                        ? 'border-[#142746] bg-[#142746] text-white'
                        : 'border-[#e3e9f2] bg-[#f8fafd] text-[#142746]'
                    }`}
                  >
                    Main Super Admin (Owner)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryType('sub_admin');
                      setResetChallengeId('');
                      setResetChallengeToken('');
                      resetMessages();
                    }}
                    className={`rounded-[9px] border px-3 py-2 cursor-pointer ${
                      recoveryType === 'sub_admin'
                        ? 'border-[#142746] bg-[#142746] text-white'
                        : 'border-[#e3e9f2] bg-[#f8fafd] text-[#142746]'
                    }`}
                  >
                    Staff Sub-Admin
                  </button>
                </div>

                {recoveryType === 'sub_admin' ? (
                  !subAdminTokenMode ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        resetMessages();
                        setSubmitting(true);
                        try {
                          const res = await onRequestSubAdminRecovery(recoveryEmail.trim());
                          if (!res.ok) {
                            setError(res.error);
                            return;
                          }
                          setInfoMsg(res.data.message);
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      className="space-y-3"
                    >
                      <p className="text-xs text-[#718096]">
                        Sub-Admin password resets require explicit Main Super Admin review &amp; approval.
                      </p>
                      <input
                        required
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        placeholder="Staff Admin Email, ID, or Phone"
                        className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                      />
                      {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
                      {infoMsg && <p className="text-xs font-semibold text-[#13845b]">{infoMsg}</p>}
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-[10px] bg-[#142746] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                      >
                        Request Main Super Admin Approval
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSubAdminTokenMode(true);
                          resetMessages();
                        }}
                        className="block w-full text-center text-xs font-bold text-[#315b9b] hover:underline cursor-pointer"
                      >
                        Already approved? Enter One-Time Reset Token →
                      </button>
                    </form>
                  ) : (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        resetMessages();
                        setSubmitting(true);
                        try {
                          const res = await onCompletePasswordRecovery({
                            resetToken: resetTokenInput.trim(),
                            newPassword: resetNewPassword,
                          });
                          if (!res.ok) {
                            setError(res.error);
                            return;
                          }
                          setSubAdminTokenMode(false);
                          setResetTokenInput('');
                          setResetNewPassword('');
                          setAdminAction('signin');
                          setInfoMsg('Staff password updated. Please sign in.');
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      className="space-y-3"
                    >
                      <input
                        required
                        value={resetTokenInput}
                        onChange={(e) => setResetTokenInput(e.target.value)}
                        placeholder="One-Time Reset Token (ATP-RST-...)"
                        className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-xs font-mono outline-none focus:border-[#315b9b]"
                      />
                      <input
                        required
                        type="password"
                        minLength={8}
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="New Password (min 8 chars)"
                        className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                      />
                      {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-[10px] bg-[#13845b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
                      >
                        Complete Staff Password Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubAdminTokenMode(false)}
                        className="block w-full text-center text-xs font-bold text-[#59677d] hover:underline cursor-pointer"
                      >
                        ← Request New Approval
                      </button>
                    </form>
                  )
                ) : !resetChallengeId && !resetChallengeToken ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      resetMessages();
                      setSubmitting(true);
                      try {
                        const res = await onRequestSuperAdminReset(
                          recoveryEmail.trim(),
                          recoveryMethod,
                          recoveryMethod === 'backup_code'
                            ? backupCode.trim()
                            : recoveryMethod === 'recovery_pin'
                              ? recoveryPinInput.trim()
                              : undefined
                        );
                        if (!res.ok) {
                          if (res.suggestOfflineMethods) {
                            const fallbackMethod = res.hasRecoveryPin
                              ? 'recovery_pin'
                              : 'backup_code';
                            setRecoveryMethod(fallbackMethod);
                            setInfoMsg(
                              res.hasRecoveryPin
                                ? 'Phone / WhatsApp OTP API is not active — enter your Security Recovery PIN or Backup Recovery Code below to reset immediately.'
                                : 'Phone / WhatsApp OTP API is not active — enter one of your Emergency Backup Recovery Codes below to reset immediately.'
                            );
                            return;
                          }
                          setError(res.error);
                          return;
                        }
                        if (res.data.resetChallengeToken) {
                          setResetChallengeToken(res.data.resetChallengeToken);
                          setInfoMsg(
                            res.data.channel === 'RECOVERY_PIN'
                              ? 'Security Recovery PIN verified. Set your new Owner password.'
                              : 'Backup recovery code verified. Set your new Owner password.'
                          );
                        } else if (res.data.challengeId) {
                          setResetChallengeId(res.data.challengeId);
                          setInfoMsg(
                            `6-digit OTP sent to Owner phone ${res.data.maskedPhone || ''} via WhatsApp.`
                          );
                        }
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="space-y-3"
                  >
                    <p className="text-xs text-[#718096]">
                      Main Super Admin recovers via Phone / WhatsApp OTP (no email OTP), Security Recovery PIN, or Emergency Backup Code.
                    </p>
                    <input
                      required
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      placeholder="Super Admin ID, Email, or Phone Number"
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                    />
                    <select
                      value={recoveryMethod}
                      onChange={(e) => {
                        setRecoveryMethod(
                          e.target.value as
                            | 'auto'
                            | 'whatsapp'
                            | 'backup_code'
                            | 'recovery_pin'
                        );
                        resetMessages();
                      }}
                      className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-semibold outline-none"
                    >
                      <option value="auto">Auto (Phone / WhatsApp OTP)</option>
                      <option value="recovery_pin">Security Recovery PIN (Works Offline)</option>
                      <option value="backup_code">Emergency Backup Recovery Code (Works Offline)</option>
                      <option value="whatsapp">Phone / WhatsApp OTP</option>
                    </select>
                    {recoveryMethod === 'recovery_pin' && (
                      <input
                        required
                        value={recoveryPinInput}
                        onChange={(e) => setRecoveryPinInput(e.target.value)}
                        placeholder="Enter your Security Recovery PIN *"
                        className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#315b9b]"
                      />
                    )}
                    {recoveryMethod === 'backup_code' && (
                      <input
                        required
                        value={backupCode}
                        onChange={(e) => setBackupCode(e.target.value)}
                        placeholder="Emergency Backup Code (e.g. A1B2-C3D4) *"
                        className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#315b9b]"
                      />
                    )}
                    {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
                    {infoMsg && <p className="text-xs font-semibold text-[#13845b]">{infoMsg}</p>}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-[10px] bg-[#142746] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                    >
                      Verify &amp; Proceed
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      resetMessages();
                      setSubmitting(true);
                      try {
                        const res = await onCompletePasswordRecovery({
                          challengeId: resetChallengeId || undefined,
                          code: resetChallengeId ? resetOtpCode.trim() : undefined,
                          resetChallengeToken: resetChallengeToken || undefined,
                          newPassword: resetNewPassword,
                        });
                        if (!res.ok) {
                          setError(res.error);
                          return;
                        }
                        setResetChallengeId('');
                        setResetChallengeToken('');
                        setResetOtpCode('');
                        setResetNewPassword('');
                        setBackupCode('');
                        setRecoveryPinInput('');
                        setAdminAction('signin');
                        setInfoMsg('Main Super Admin password updated successfully. Sign in below.');
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="space-y-3"
                  >
                    {infoMsg && <p className="text-xs font-semibold text-[#13845b]">{infoMsg}</p>}
                    {resetChallengeId && (
                      <input
                        required
                        value={resetOtpCode}
                        onChange={(e) => setResetOtpCode(e.target.value)}
                        placeholder="6-digit OTP code"
                        className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#315b9b]"
                      />
                    )}
                    <input
                      required
                      type="password"
                      minLength={8}
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="New Owner Password (min 8 chars)"
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                    />
                    {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-[10px] bg-[#13845b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
                    >
                      Save New Owner Password
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        )}

        {/* ADMIN PENDING APPROVAL CONFIRMATION */}
        {portalMode === 'admin' && adminAction === 'register' && adminPendingSuccess ? (
          <div className="mt-5 rounded-[14px] border border-[#bfe6d5] bg-[#eefaf4] p-4 space-y-2 text-xs text-[#13845b]">
            <div className="font-extrabold flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span>Account Status: PENDING APPROVAL</span>
            </div>
            <p className="leading-relaxed text-[#142746]">{adminPendingSuccess}</p>
            <button
              type="button"
              onClick={() => {
                setAdminPendingSuccess('');
                setAdminAction('signin');
              }}
              className="rounded-[9px] bg-[#142746] px-4 py-2 font-bold text-white cursor-pointer"
            >
              Return to Admin Sign In
            </button>
          </div>
        ) : (
          /* STANDARD LOGIN / SIGNUP / ADMIN REGISTRATION FORM */
          ((portalMode === 'student' &&
            (studentAction === 'signin' || studentAction === 'signup')) ||
            (portalMode === 'admin' &&
              (!adminExists ||
                adminAction === 'signin' ||
                adminAction === 'register'))) && (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
              {((portalMode === 'admin' && (!adminExists || adminAction === 'register')) ||
                (portalMode === 'student' && studentAction === 'signup')) && (
                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1">
                    Full Name *
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      portalMode === 'admin' ? 'e.g. Arya Sengupta' : 'e.g. Rahul Das'
                    }
                    className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  {portalMode === 'admin'
                    ? adminAction === 'register'
                      ? 'Official Email Address *'
                      : !adminExists
                        ? 'Admin Login ID or Email *'
                        : 'Admin ID, Email, or Mobile Number *'
                    : studentAction === 'signup'
                      ? 'Gmail / Email (for Invoices & Login) *'
                      : 'Gmail, Student ID, or Mobile Number *'}
                </label>
                <input
                  type={
                    (portalMode === 'student' && studentAction === 'signup') ||
                    (portalMode === 'admin' && adminAction === 'register')
                      ? 'email'
                      : 'text'
                  }
                  required
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder={
                    portalMode === 'admin'
                      ? !adminExists
                        ? 'admin@aryatax.in'
                        : 'admin@aryatax.in or 10-digit mobile'
                      : studentAction === 'signup'
                        ? 'student@gmail.com'
                        : 'student@gmail.com or 10-digit mobile'
                  }
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                />
              </div>

              {/* First-time Main Super Admin Setup: Mobile + Security Recovery PIN */}
              {portalMode === 'admin' && !adminExists && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-[12px] border border-[#dce6f5] bg-[#f8fafd] p-3">
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1">
                      Mobile / WhatsApp (for ID &amp; OTP Login)
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="10-digit mobile (optional)"
                      className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1">
                      Security Recovery PIN (min 4 chars)
                    </label>
                    <input
                      type="text"
                      value={setupRecoveryPin}
                      onChange={(e) => setSetupRecoveryPin(e.target.value)}
                      placeholder="e.g. 2468 (for ID/Pass reset)"
                      className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                    />
                  </div>
                </div>
              )}

              {/* Admin Staff Registration Designation */}
              {portalMode === 'admin' && adminExists && adminAction === 'register' && (
                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1">
                    Requested Designation *
                  </label>
                  <select
                    value={requestedDesignation}
                    onChange={(e) =>
                      setRequestedDesignation(
                        e.target.value as Exclude<AdminRole, 'SUPER_ADMIN'>
                      )
                    }
                    className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-bold text-[#142746] outline-none"
                  >
                    {ADMIN_DESIGNATIONS.map((d) => (
                      <option key={d} value={d}>
                        {ADMIN_ROLE_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Single Phone / WhatsApp Number + Live OTP for Signup / Admin Register */}
              {((portalMode === 'student' && studentAction === 'signup') ||
                (portalMode === 'admin' && adminExists && adminAction === 'register')) && (
                <div className="rounded-[12px] border border-[#dce6f5] bg-[#f8fafd] p-3.5 space-y-2.5">
                  <div className="text-xs font-bold text-[#142746] flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 text-[#13845b]" />
                    <span>Phone / WhatsApp Number *</span>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <input
                      value={countryCode}
                      onChange={(e) => {
                        setCountryCode(e.target.value);
                        resetRegOtp();
                      }}
                      placeholder="+91"
                      className="col-span-3 rounded-[9px] border border-[#e3e9f2] bg-white px-2.5 py-2 text-xs font-mono font-bold text-center outline-none"
                    />
                    <input
                      required
                      type="tel"
                      value={whatsappNumber}
                      onChange={(e) => {
                        setWhatsappNumber(e.target.value);
                        resetRegOtp();
                      }}
                      placeholder="10-digit Phone / WhatsApp Number *"
                      className="col-span-9 rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                    />
                  </div>

                  {whatsappCloudApiConfigured ? (
                    regOtpVerified ? (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#13845b]">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Verified: {regMaskedPhone}</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={otpBusy}
                            onClick={handleSendRegOtp}
                            className="rounded-[8px] bg-[#142746] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                          >
                            {otpBusy
                              ? 'Sending...'
                              : regOtpChallengeId
                                ? 'Resend Phone OTP'
                                : 'Send Phone OTP'}
                          </button>
                          {regOtpChallengeId && (
                            <>
                              <input
                                value={regOtpCode}
                                onChange={(e) =>
                                  setRegOtpCode(e.target.value.replace(/\D/g, ''))
                                }
                                placeholder="6-digit OTP"
                                maxLength={6}
                                className="w-28 rounded-[8px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-mono font-bold outline-none"
                              />
                              <button
                                type="button"
                                disabled={otpBusy}
                                onClick={handleVerifyRegOtp}
                                className="rounded-[8px] bg-[#13845b] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
                              >
                                Verify
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    <p className="text-[11px] text-[#718096]">
                      1-step signup — OTP on phone activates only when WhatsApp OTP 2FA is enabled.
                    </p>
                  )}
                </div>
              )}

              {portalMode === 'student' && studentAction === 'signup' && (
                <div>
                  <label className="block text-xs font-bold text-[#59677d] mb-1">
                    Paying GST From State / UT *
                  </label>
                  <select
                    required
                    value={studentState}
                    onChange={(e) => setStudentState(e.target.value)}
                    className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                  >
                    <option value="">Select your State / UT...</option>
                    {INDIAN_GST_STATES.map((st) => (
                      <option key={st.code} value={st.name}>
                        {st.code} - {st.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-bold text-[#59677d]">
                    Password *
                  </label>
                  {((portalMode === 'admin' && adminExists && adminAction === 'signin') ||
                    (portalMode === 'student' && studentAction === 'signin')) && (
                    <button
                      type="button"
                      onClick={() => {
                        resetMessages();
                        if (portalMode === 'admin') {
                          setAdminAction('forgot');
                          setAdminRecoveryTab('password');
                        } else {
                          setStudentAction('forgot');
                        }
                      }}
                      className="text-[11px] font-bold text-[#315b9b] hover:underline cursor-pointer"
                    >
                      Forgot {portalMode === 'admin' ? 'ID / Password' : 'Password'}?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength={
                      portalMode === 'admin' &&
                      (!adminExists || adminAction === 'register')
                        ? 8
                        : portalMode === 'student' && studentAction === 'signup'
                          ? 6
                          : 1
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-[#315b9b]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#718096]"
                    aria-label="Toggle password"
                  >
                    {showPass ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {portalMode === 'admin' &&
                (!adminExists || adminAction === 'register') && (
                  <div>
                    <label className="block text-xs font-bold text-[#59677d] mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                    />
                  </div>
                )}

              {error && (
                <p className="text-xs font-semibold text-[#c64b58]" role="alert">
                  {error}
                </p>
              )}
              {infoMsg && (
                <p className="text-xs font-semibold text-[#13845b]">{infoMsg}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-[10px] bg-[#142746] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? 'Please wait...'
                  : portalMode === 'admin'
                    ? !adminExists
                      ? 'Create Main Super Admin Account'
                      : adminAction === 'register'
                        ? 'Submit Staff Registration (Pending Approval)'
                        : 'Sign In to Admin Portal'
                    : studentAction === 'signup'
                      ? 'Create Student Account'
                      : 'Sign In as Student'}
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );
}
