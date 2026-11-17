import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type {
  PortalSettings,
  User,
  WhatsappDeliveryLog,
} from '../types/lms';

export function VerifyWhatsappWidget({
  user,
  whatsappCloudApiConfigured,
  onSendOtp,
  onVerifyOtp,
  onToast,
}: {
  user: User;
  whatsappCloudApiConfigured: boolean;
  onSendOtp: (payload: {
    countryCode: string;
    whatsappNumber: string;
    purpose: 'WHATSAPP_VERIFY';
    recipientName?: string;
  }) => Promise<
    | {
        ok: true;
        data: {
          challengeId: string;
          maskedPhone: string;
          expiresAt: string;
        };
      }
    | { ok: false; error: string; apiNotConfigured?: boolean }
  >;
  onVerifyOtp: (payload: {
    challengeId: string;
    code: string;
    consumeImmediately?: boolean;
    countryCode?: string;
    whatsappNumber?: string;
  }) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [countryCode, setCountryCode] = useState(user.countryCode || '+91');
  const [waPhone, setWaPhone] = useState(
    user.whatsappNumber || user.phone || ''
  );
  const [challengeId, setChallengeId] = useState('');
  const [maskedTarget, setMaskedTarget] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await onSendOtp({
        countryCode,
        whatsappNumber: waPhone,
        purpose: 'WHATSAPP_VERIFY',
        recipientName: user.name,
      });
      if (!res.ok) {
        onToast('error', res.error);
        return;
      }
      setChallengeId(res.data.challengeId);
      setMaskedTarget(res.data.maskedPhone);
      onToast(
        'success',
        `6-digit OTP sent to WhatsApp ${res.data.maskedPhone}.`
      );
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (!challengeId || otpCode.trim().length < 6) {
      onToast('error', 'Enter the 6-digit OTP sent to your WhatsApp.');
      return;
    }
    setVerifying(true);
    try {
      const res = await onVerifyOtp({
        challengeId,
        code: otpCode.trim(),
        consumeImmediately: true,
        countryCode,
        whatsappNumber: waPhone,
      });
      if (!res.ok) {
        onToast('error', res.error);
        return;
      }
      setChallengeId('');
      setOtpCode('');
      onToast(
        'success',
        'WhatsApp number verified for Two-Factor Authentication.'
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-[13px] border border-[#e3e9f2] bg-[#f8fafd] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-[#142746] flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-[#13845b]" />
            <span>WhatsApp Two-Factor Authentication (2FA)</span>
          </div>
          <div className="mt-0.5 text-[11px] text-[#718096]">
            {user.whatsappVerified ? (
              <span className="font-semibold text-[#13845b]">
                Verified · {user.countryCode || '+91'}{' '}
                {user.whatsappNumber || user.phone}
                {user.whatsappVerifiedAt
                  ? ` on ${new Date(user.whatsappVerifiedAt).toLocaleDateString('en-IN')}`
                  : ''}
              </span>
            ) : (
              <span>
                Verify ownership of your WhatsApp number for mandatory login 2FA OTPs.
              </span>
            )}
          </div>
        </div>
        {!whatsappCloudApiConfigured && (
          <span className="text-[11px] font-semibold text-[#b45309]">
            Official Meta Cloud API not configured
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[110px_minmax(0,1fr)_auto] gap-2 items-center">
        <input
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          placeholder="+91"
          aria-label="Country code"
          className="rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
        />
        <input
          type="tel"
          value={waPhone}
          onChange={(e) => setWaPhone(e.target.value)}
          placeholder="10-digit WhatsApp number"
          className="rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
        />
        <button
          type="button"
          disabled={sending || !whatsappCloudApiConfigured}
          onClick={handleSend}
          className="inline-flex items-center justify-center gap-1.5 rounded-[9px] bg-[#142746] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{sending ? 'Sending...' : 'Send OTP'}</span>
        </button>
      </div>

      {challengeId && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            maxLength={6}
            placeholder={`6-digit OTP sent to ${maskedTarget}`}
            className="w-56 rounded-[9px] border border-[#315b9b] bg-white px-3 py-2 text-xs font-mono tracking-widest outline-none"
          />
          <button
            type="button"
            disabled={verifying}
            onClick={handleVerify}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#13845b] px-4 py-2 text-xs font-bold text-white hover:bg-[#0f6c4a] disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{verifying ? 'Verifying...' : 'Verify OTP'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function WhatsappSecurityPanel({
  settings,
  onSaveConfig,
  onFetchLogs,
  onTestDelivery,
  onToast,
}: {
  settings: PortalSettings;
  onSaveConfig: (payload: {
    whatsappBusinessAccountId?: string;
    whatsappPhoneNumberId?: string;
    whatsappApiToken?: string;
    clearWhatsappToken?: boolean;
    whatsappOtpTemplateName?: string;
    whatsappOtpTemplateLang?: string;
    whatsappWebhookUrl?: string;
    adminWhatsapp?: string;
    enforceWhatsapp2FA?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onFetchLogs: () => Promise<
    | {
        ok: true;
        data: {
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
        };
      }
    | { ok: false; error: string }
  >;
  onTestDelivery: (
    phone: string,
    countryCode: string
  ) => Promise<
    | { ok: true; data: { providerMessageId?: string; maskedPhone?: string } }
    | { ok: false; error: string; apiNotConfigured?: boolean }
  >;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [wabaId, setWabaId] = useState(
    settings.whatsappBusinessAccountId || ''
  );
  const [phoneNumberId, setPhoneNumberId] = useState(
    settings.whatsappPhoneNumberId || ''
  );
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [templateName, setTemplateName] = useState(
    settings.whatsappOtpTemplateName || ''
  );
  const [templateLang, setTemplateLang] = useState(
    settings.whatsappOtpTemplateLang || 'en_US'
  );
  const [webhookUrl, setWebhookUrl] = useState(
    settings.whatsappWebhookUrl || ''
  );
  const [adminWa, setAdminWa] = useState(settings.adminWhatsapp || '');
  const [enforce2FA, setEnforce2FA] = useState(
    Boolean(settings.enforceWhatsapp2FA)
  );
  const [saving, setSaving] = useState(false);

  const [testCountryCode, setTestCountryCode] = useState('+91');
  const [testPhone, setTestPhone] = useState(settings.adminWhatsapp || '');
  const [testing, setTesting] = useState(false);

  const [logs, setLogs] = useState<WhatsappDeliveryLog[]>([]);
  const [statusMeta, setStatusMeta] = useState<{
    cloudApiReady: boolean;
    webhookConfigured: boolean;
    templateConfigured: boolean;
    hasWabaId: boolean;
    hasPhoneNumberId: boolean;
    hasAccessToken: boolean;
    envOverrideActive: boolean;
  } | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await onFetchLogs();
      if (res.ok) {
        setLogs(res.data.logs);
        setStatusMeta(res.data.status);
      }
    } finally {
      setLoadingLogs(false);
    }
  }, [onFetchLogs]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    setWabaId(settings.whatsappBusinessAccountId || '');
    setPhoneNumberId(settings.whatsappPhoneNumberId || '');
    setTemplateName(settings.whatsappOtpTemplateName || '');
    setTemplateLang(settings.whatsappOtpTemplateLang || 'en_US');
    setWebhookUrl(settings.whatsappWebhookUrl || '');
    setAdminWa(settings.adminWhatsapp || '');
    setEnforce2FA(Boolean(settings.enforceWhatsapp2FA));
  }, [settings]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await onSaveConfig({
        whatsappBusinessAccountId: wabaId.trim(),
        whatsappPhoneNumberId: phoneNumberId.trim(),
        whatsappApiToken: apiToken.trim() || undefined,
        whatsappOtpTemplateName: templateName.trim(),
        whatsappOtpTemplateLang: templateLang.trim() || 'en_US',
        whatsappWebhookUrl: webhookUrl.trim(),
        adminWhatsapp: adminWa.trim(),
        enforceWhatsapp2FA: enforce2FA,
      });
      if (!res.ok) {
        onToast('error', res.error || 'Could not save WhatsApp API config.');
        return;
      }
      setApiToken('');
      onToast('success', 'Official WhatsApp Business API settings saved.');
      loadLogs();
    } finally {
      setSaving(false);
    }
  };

  const handleClearToken = async () => {
    const res = await onSaveConfig({ clearWhatsappToken: true });
    if (res.ok) {
      onToast('info', 'Saved WhatsApp API token cleared.');
      loadLogs();
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await onTestDelivery(testPhone, testCountryCode);
      if (!res.ok) {
        onToast('error', res.error);
        loadLogs();
        return;
      }
      onToast(
        'success',
        `Live WhatsApp OTP test dispatched to ${res.data.maskedPhone} (Message ID: ${res.data.providerMessageId || 'accepted'}).`
      );
      loadLogs();
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#142746] flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#13845b]" />
              <span>Official Meta WhatsApp Business Cloud API</span>
            </h2>
            <p className="mt-1 text-xs text-[#718096] max-w-2xl">
              Configure real Meta Graph API credentials for cryptographic 6-digit login 2FA, registration ownership OTPs, password recovery, and invoice alerts. Never simulates or falls back to fake OTPs.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-right">
            {statusMeta?.cloudApiReady ? (
              <span className="font-bold text-[#13845b]">
                Cloud API Connected
              </span>
            ) : statusMeta?.webhookConfigured ? (
              <span className="font-bold text-[#315b9b]">
                Webhook Gateway Connected
              </span>
            ) : (
              <span className="font-bold text-[#b45309]">
                Not Configured · OTPs Blocked
              </span>
            )}
            {statusMeta?.envOverrideActive && (
              <div className="text-[11px] font-sans text-[#718096]">
                Environment variables active
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                WhatsApp Business Account ID (WABA ID)
              </label>
              <input
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="e.g. 109482716253411"
                className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Phone Number ID *
              </label>
              <input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="e.g. 112233445566778"
                className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-[#59677d]">
                  Permanent Access Token (System User Token)
                </label>
                {settings.whatsappTokenSet && (
                  <button
                    type="button"
                    onClick={handleClearToken}
                    className="text-[11px] font-semibold text-[#c64b58] hover:underline cursor-pointer"
                  >
                    Clear stored token
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={
                    settings.whatsappTokenSet
                      ? 'Token saved securely on server (leave blank to keep existing)'
                      : 'EAA...'
                  }
                  className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 pr-9 text-xs font-mono outline-none focus:border-[#315b9b]"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#718096] hover:text-[#142746]"
                  aria-label="Toggle token visibility"
                >
                  {showToken ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Approved Authentication Template Name
              </label>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. auth_otp_verification (optional)"
                className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
              />
              <p className="mt-1 text-[11px] text-[#718096]">
                Recommended by Meta for 1-tap copy-code OTP delivery.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Template Language Code
              </label>
              <input
                value={templateLang}
                onChange={(e) => setTemplateLang(e.target.value)}
                placeholder="en_US"
                className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Owner Alert WhatsApp Number
              </label>
              <input
                value={adminWa}
                onChange={(e) => setAdminWa(e.target.value)}
                placeholder="e.g. 919876543210"
                className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Custom Webhook Relay URL (Optional Fallback Provider)
              </label>
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-[11px] border border-[#e3e9f2] bg-[#f8fafd] p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enforce2FA}
              onChange={(e) => setEnforce2FA(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#142746]"
            />
            <span className="text-xs text-[#142746]">
              <strong className="block">
                Enforce Mandatory WhatsApp 2FA OTP on Every Login
              </strong>
              <span className="text-[#718096]">
                Requires all Students, Main Super Admin, and Staff Admins with WhatsApp numbers to pass a 6-digit Meta WhatsApp OTP challenge after password verification.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-[10px] bg-[#142746] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              {saving ? 'Saving Configuration...' : 'Save WhatsApp API Config'}
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={testCountryCode}
                onChange={(e) => setTestCountryCode(e.target.value)}
                className="w-16 rounded-[9px] border border-[#e3e9f2] px-2.5 py-2 text-xs font-mono outline-none"
                aria-label="Test country code"
              />
              <input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="Test WhatsApp number"
                className="w-44 rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs font-mono outline-none"
              />
              <button
                type="button"
                disabled={testing}
                onClick={handleTest}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#dce6f7] bg-[#edf2fa] px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Send className="h-3.5 w-3.5 text-[#13845b]" />
                <span>{testing ? 'Sending...' : 'Send Live Test OTP'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Delivery Status Logs */}
      <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-[#142746]">
              WhatsApp OTP &amp; Notification Delivery Logs
            </h3>
            <p className="text-xs text-[#718096]">
              Only delivery status, masked numbers, and Meta Message IDs are stored — OTP codes are never logged.
            </p>
          </div>
          <button
            type="button"
            onClick={loadLogs}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-1.5 text-xs font-semibold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-[11px] border border-[#e3e9f2]">
          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#e3e9f2] bg-[#f8fafd] text-[#718096]">
                <th className="px-3.5 py-2.5 font-bold">Time</th>
                <th className="px-3.5 py-2.5 font-bold">Recipient</th>
                <th className="px-3.5 py-2.5 font-bold">Purpose</th>
                <th className="px-3.5 py-2.5 font-bold">Provider / Template</th>
                <th className="px-3.5 py-2.5 font-bold">Status &amp; Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-xs text-[#718096]"
                  >
                    No WhatsApp API dispatch attempts logged yet.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-[#e3e9f2] last:border-b-0 hover:bg-[#f8fafd]"
                  >
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-[#59677d] tabular-nums whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[#142746] tabular-nums">
                      {l.recipientMasked}
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold text-[#142746]">
                      {l.purpose.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3.5 py-2.5 text-[#59677d] font-mono text-[11px]">
                      {l.provider === 'META_CLOUD_API' ? 'Meta Graph v20.0' : 'Webhook'}
                      {l.templateName ? ` · ${l.templateName}` : ''}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`font-bold ${
                          l.status === 'ACCEPTED'
                            ? 'text-[#13845b]'
                            : 'text-[#c64b58]'
                        }`}
                      >
                        {l.status}
                      </span>
                      {l.providerMessageId && (
                        <div className="font-mono text-[10px] text-[#718096]">
                          ID: {l.providerMessageId}
                        </div>
                      )}
                      {l.errorDetail && (
                        <div className="text-[11px] text-[#c64b58]">
                          {l.errorDetail}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
