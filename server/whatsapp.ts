import crypto from 'node:crypto';
import type { WhatsappDeliveryLog } from '../src/types/lms.ts';
import {
  resolveEffectiveWhatsappCredentials,
  uid,
  type DatabaseSchema,
  type OtpChallengeRecord,
} from './db.ts';

/**
 * Normalize country code + phone digits into Meta Graph API E.164 digits-only format (no + prefix).
 * E.g. ('+91', '9876543210') => '919876543210'
 */
export function formatWhatsappDigits(
  rawNumber: string,
  countryCode = '+91'
): string {
  const ccDigits = String(countryCode || '+91').replace(/\D/g, '') || '91';
  let digits = String(rawNumber || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10) {
    return `${ccDigits}${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${ccDigits}${digits.slice(1)}`;
  }
  return digits;
}

export function maskWhatsappNumber(digits: string): string {
  const clean = String(digits || '').replace(/\D/g, '');
  if (clean.length < 4) return '****';
  return `+${clean.slice(0, 2)}••••${clean.slice(-4)}`;
}

export function generateCryptographicOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtp(secret: string, salt: string, otp: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${salt}:${otp.trim()}`)
    .digest('hex');
}

export function verifyOtpHash(
  secret: string,
  salt: string,
  storedHash: string,
  candidateOtp: string
): boolean {
  const clean = String(candidateOtp || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean) || !storedHash || !salt) return false;
  const candidateHash = hashOtp(secret, salt, clean);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function recordWhatsappDelivery(
  db: DatabaseSchema,
  entry: Omit<WhatsappDeliveryLog, 'id' | 'timestamp'>
): WhatsappDeliveryLog {
  const rec: WhatsappDeliveryLog = {
    id: uid(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  db.whatsappDeliveryLogs.unshift(rec);
  if (db.whatsappDeliveryLogs.length > 500) {
    db.whatsappDeliveryLogs = db.whatsappDeliveryLogs.slice(0, 500);
  }
  return rec;
}

/**
 * Send OTP strictly through the configured Official WhatsApp Business Cloud API (Meta Graph API)
 * or configured authorized WhatsApp Business provider webhook.
 * NEVER fakes or simulates OTP delivery when credentials are missing or rejected.
 */
export async function sendWhatsappOtpViaProvider(params: {
  db: DatabaseSchema;
  e164Digits: string;
  otp: string;
  purpose: WhatsappDeliveryLog['purpose'];
  recipientName?: string;
}): Promise<{
  sent: boolean;
  providerMessageId?: string;
  error?: string;
  apiNotConfigured?: boolean;
}> {
  const { db, e164Digits, otp, purpose, recipientName } = params;
  const creds = resolveEffectiveWhatsappCredentials(db);
  const masked = maskWhatsappNumber(e164Digits);

  if (!e164Digits || e164Digits.length < 10) {
    return {
      sent: false,
      error: 'Valid WhatsApp number with country code (e.g. +91) is required.',
    };
  }

  if (!creds.cloudApiReady && !creds.webhookUrl) {
    recordWhatsappDelivery(db, {
      recipientMasked: masked,
      purpose,
      provider: 'META_CLOUD_API',
      status: 'FAILED',
      errorDetail: 'WhatsApp Business API credentials not configured.',
    });
    return {
      sent: false,
      apiNotConfigured: true,
      error:
        'Official WhatsApp Business API credentials are not configured yet. Ask the Main Super Admin to configure WABA Phone Number ID, Access Token, and Auth Template.',
    };
  }

  if (creds.cloudApiReady) {
    const endpoint = `https://graph.facebook.com/v20.0/${encodeURIComponent(
      creds.phoneNumberId
    )}/messages`;

    const payload = creds.otpTemplateName
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: e164Digits,
          type: 'template',
          template: {
            name: creds.otpTemplateName,
            language: { code: creds.otpTemplateLang || 'en_US' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: otp }],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: otp }],
              },
            ],
          },
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: e164Digits,
          type: 'text',
          text: {
            preview_url: false,
            body: `${db.settings.brand || 'ARYA TAX PATHSHALA'}: Your verification code is ${otp}. Valid for 5 minutes. Do not share this code${recipientName ? `, ${recipientName}` : ''}.`,
          },
        };

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = (await resp.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string; code?: number };
      };

      if (!resp.ok || !body.messages?.[0]?.id) {
        const errMsg =
          body.error?.message || `WhatsApp Cloud API rejected request (HTTP ${resp.status}).`;
        recordWhatsappDelivery(db, {
          recipientMasked: masked,
          purpose,
          provider: 'META_CLOUD_API',
          templateName: creds.otpTemplateName || undefined,
          status: 'FAILED',
          errorDetail: errMsg,
        });
        return {
          sent: false,
          error: `WhatsApp Cloud API delivery failed: ${errMsg}`,
        };
      }

      const msgId = body.messages[0].id;
      recordWhatsappDelivery(db, {
        recipientMasked: masked,
        purpose,
        provider: 'META_CLOUD_API',
        providerMessageId: msgId,
        templateName: creds.otpTemplateName || undefined,
        status: 'ACCEPTED',
      });
      return { sent: true, providerMessageId: msgId };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error calling Meta Graph API';
      recordWhatsappDelivery(db, {
        recipientMasked: masked,
        purpose,
        provider: 'META_CLOUD_API',
        templateName: creds.otpTemplateName || undefined,
        status: 'FAILED',
        errorDetail: errMsg,
      });
      return {
        sent: false,
        error: `Unable to reach WhatsApp Business API: ${errMsg}`,
      };
    }
  }

  // Authorized Business Webhook Provider fallback (explicitly configured by Super Admin)
  try {
    const resp = await fetch(creds.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'OTP',
        purpose,
        to: e164Digits,
        otp,
        brand: db.settings.brand || 'ARYA TAX PATHSHALA',
        templateName: creds.otpTemplateName || undefined,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      recordWhatsappDelivery(db, {
        recipientMasked: masked,
        purpose,
        provider: 'WEBHOOK',
        status: 'FAILED',
        errorDetail: `HTTP ${resp.status} ${text.slice(0, 120)}`.trim(),
      });
      return {
        sent: false,
        error: `WhatsApp gateway returned HTTP ${resp.status}. OTP was not sent.`,
      };
    }
    const providerId = `wh_${uid()}`;
    recordWhatsappDelivery(db, {
      recipientMasked: masked,
      purpose,
      provider: 'WEBHOOK',
      providerMessageId: providerId,
      status: 'ACCEPTED',
    });
    return { sent: true, providerMessageId: providerId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Webhook connection error';
    recordWhatsappDelivery(db, {
      recipientMasked: masked,
      purpose,
      provider: 'WEBHOOK',
      status: 'FAILED',
      errorDetail: errMsg,
    });
    return { sent: false, error: `WhatsApp gateway unreachable: ${errMsg}` };
  }
}

export function checkOtpRateLimit(
  db: DatabaseSchema,
  e164Phone: string,
  ip: string
): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const recent = db.otpChallenges.filter(
    (c) =>
      now - Date.parse(c.createdAt) < windowMs &&
      (c.e164Phone === e164Phone || (ip !== 'unknown' && c.ip === ip))
  );
  if (recent.length >= 6) {
    return {
      allowed: false,
      waitSeconds: 300,
    };
  }
  const latest = recent[0];
  if (latest) {
    const elapsedSec = Math.floor((now - Date.parse(latest.lastSentAt)) / 1000);
    if (elapsedSec < 60 && !latest.consumed) {
      return {
        allowed: false,
        waitSeconds: 60 - elapsedSec,
      };
    }
  }
  return { allowed: true };
}

export async function issueWhatsappOtpChallenge(params: {
  db: DatabaseSchema;
  purpose: OtpChallengeRecord['purpose'];
  deliveryPurpose: WhatsappDeliveryLog['purpose'];
  e164Phone: string;
  userId?: string;
  email?: string;
  recipientName?: string;
  ip?: string;
}): Promise<
  | {
      ok: true;
      challengeId: string;
      maskedPhone: string;
      expiresAt: string;
      resendAvailableAt: string;
    }
  | {
      ok: false;
      error: string;
      statusCode: number;
      apiNotConfigured?: boolean;
    }
> {
  const { db, purpose, deliveryPurpose, e164Phone, userId, email, recipientName, ip } =
    params;

  const rl = checkOtpRateLimit(db, e164Phone, ip || 'unknown');
  if (!rl.allowed) {
    return {
      ok: false,
      statusCode: 429,
      error: `Please wait ${rl.waitSeconds || 60} seconds before requesting another OTP.`,
    };
  }

  const otp = generateCryptographicOtp();
  const delivery = await sendWhatsappOtpViaProvider({
    db,
    e164Digits: e164DigitsSafe(e164Phone),
    otp,
    purpose: deliveryPurpose,
    recipientName,
  });

  if (!delivery.sent) {
    return {
      ok: false,
      statusCode: delivery.apiNotConfigured ? 503 : 502,
      error: delivery.error || 'Could not deliver WhatsApp OTP.',
      apiNotConfigured: delivery.apiNotConfigured,
    };
  }

  // Invalidate prior unconsumed challenges for same user/phone/purpose
  for (const prev of db.otpChallenges) {
    if (
      prev.e164Phone === e164Phone &&
      prev.purpose === purpose &&
      !prev.consumed
    ) {
      prev.consumed = true;
    }
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();
  const resendAvailableAt = new Date(now + 60 * 1000).toISOString();
  const rec: OtpChallengeRecord = {
    id: uid(),
    purpose,
    userId,
    email,
    e164Phone,
    otpSalt: salt,
    otpHash: hashOtp(db.authSecret, salt, otp),
    attempts: 0,
    maxAttempts: 5,
    resendCount: 0,
    lastSentAt: new Date(now).toISOString(),
    expiresAt,
    verified: false,
    consumed: false,
    ip,
    createdAt: new Date(now).toISOString(),
  };

  db.otpChallenges.unshift(rec);
  if (db.otpChallenges.length > 500) {
    db.otpChallenges = db.otpChallenges.slice(0, 500);
  }

  return {
    ok: true,
    challengeId: rec.id,
    maskedPhone: maskWhatsappNumber(e164Phone),
    expiresAt,
    resendAvailableAt,
  };
}

function e164DigitsSafe(val: string): string {
  return String(val || '').replace(/\D/g, '');
}

export function verifyOtpChallengeCode(params: {
  db: DatabaseSchema;
  challengeId: string;
  code: string;
  consumeImmediately?: boolean;
}): {
  valid: boolean;
  challenge?: OtpChallengeRecord;
  error?: string;
} {
  const ch = params.db.otpChallenges.find((c) => c.id === params.challengeId);
  if (!ch) {
    return { valid: false, error: 'OTP challenge not found or expired.' };
  }
  if (ch.consumed) {
    return {
      valid: false,
      error: 'This OTP has already been used or superseded. Please request a new code.',
    };
  }
  if (Date.parse(ch.expiresAt) < Date.now()) {
    ch.consumed = true;
    return { valid: false, error: 'OTP expired after 5 minutes. Request a new code.' };
  }
  if (ch.attempts >= ch.maxAttempts) {
    ch.consumed = true;
    return {
      valid: false,
      error: 'Maximum 5 incorrect OTP attempts exceeded. Please request a new OTP.',
    };
  }

  const matched = verifyOtpHash(
    params.db.authSecret,
    ch.otpSalt,
    ch.otpHash,
    params.code
  );
  if (!matched) {
    ch.attempts += 1;
    const remaining = Math.max(0, ch.maxAttempts - ch.attempts);
    if (remaining === 0) ch.consumed = true;
    return {
      valid: false,
      error:
        remaining > 0
          ? `Invalid 6-digit OTP (${remaining} attempt${remaining === 1 ? '' : 's'} remaining).`
          : 'Maximum OTP attempts reached. Challenge locked.',
    };
  }

  ch.verified = true;
  ch.verifiedAt = new Date().toISOString();
  if (params.consumeImmediately !== false) {
    ch.consumed = true;
  }
  return { valid: true, challenge: ch };
}
