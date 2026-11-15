import crypto from 'crypto';
import { db } from './db.ts';

export interface SmsSendResult {
  configured: boolean;
  sent: boolean;
  status: 'sent' | 'failed' | 'unconfigured';
  message: string;
  providerResponse?: string;
}

const AKASH_API_URL = (
  process.env.AAKASH_SMS_ENDPOINT ||
  process.env.AKASH_SMS_API_URL ||
  'https://sms.aakashsms.com/sms/v3/send'
).trim();

function getAkashAuthToken(): string {
  return (
    process.env.AAKASH_SMS_AUTH_TOKEN ||
    process.env.AKASH_SMS_API_KEY ||
    process.env.AKASH_SMS_AUTH_TOKEN ||
    ''
  ).trim();
}

export function isAkashSmsConfigured(): boolean {
  const key = getAkashAuthToken();
  return Boolean(key && key !== 'your-akash-sms-auth-token' && key !== 'MY_AKASH_SMS_KEY');
}

export function normalizeNepalPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('977') && digits.length === 13) {
    return digits.slice(3);
  }
  return digits;
}

export function isValidNepalMobile(phone: string): boolean {
  const normalized = normalizeNepalPhone(phone);
  return /^9[678]\d{8}$/.test(normalized);
}

export async function sendAkashSms(params: {
  to: string;
  text: string;
  purpose: string;
  cooperativeId?: string | null;
}): Promise<SmsSendResult> {
  const normalizedPhone = normalizeNepalPhone(params.to);
  const authToken = getAkashAuthToken();

  if (!isAkashSmsConfigured() || !authToken) {
    db.prepare(
      `INSERT INTO sms_logs (id, cooperative_id, recipient_phone, purpose, provider, status, provider_response)
       VALUES (?, ?, ?, ?, 'akash_sms', 'unconfigured', ?)`
    ).run(
      crypto.randomUUID(),
      params.cooperativeId ?? null,
      normalizedPhone,
      params.purpose,
      'AKASH_SMS_API_KEY / AKASH_SMS_AUTH_TOKEN not configured in environment'
    );

    return {
      configured: false,
      sent: false,
      status: 'unconfigured',
      message: 'Akash SMS Auth Token is not configured on the server.',
    };
  }

  try {
    // Verified Akash SMS v3 contract: POST application/x-www-form-urlencoded with auth_token, to, text
    const formBody = new URLSearchParams({
      auth_token: authToken,
      to: normalizedPhone,
      text: params.text,
    });

    const response = await fetch(AKASH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: formBody.toString(),
    });

    const responseText = await response.text();
    let parsed: { error?: boolean; message?: string } | null = null;
    try {
      parsed = JSON.parse(responseText) as { error?: boolean; message?: string };
    } catch {
      parsed = null;
    }

    const ok = response.ok && (!parsed || parsed.error === false);

    db.prepare(
      `INSERT INTO sms_logs (id, cooperative_id, recipient_phone, purpose, provider, status, provider_response)
       VALUES (?, ?, ?, ?, 'akash_sms', ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.cooperativeId ?? null,
      normalizedPhone,
      params.purpose,
      ok ? 'sent' : 'failed',
      responseText.slice(0, 1000)
    );

    return {
      configured: true,
      sent: ok,
      status: ok ? 'sent' : 'failed',
      message: ok
        ? parsed?.message || 'SMS dispatched via Akash SMS v3.'
        : parsed?.message || 'Akash SMS gateway rejected the request.',
      providerResponse: responseText,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Network error';
    db.prepare(
      `INSERT INTO sms_logs (id, cooperative_id, recipient_phone, purpose, provider, status, provider_response)
       VALUES (?, ?, ?, ?, 'akash_sms', 'failed', ?)`
    ).run(crypto.randomUUID(), params.cooperativeId ?? null, normalizedPhone, params.purpose, errMsg);

    return {
      configured: true,
      sent: false,
      status: 'failed',
      message: `Akash SMS error: ${errMsg}`,
    };
  }
}

export function hashOtp(phone: string, code: string): string {
  const secret = process.env.SESSION_SECRET || 'sahakari-local-otp-salt';
  return crypto.createHmac('sha256', secret).update(`${normalizeNepalPhone(phone)}:${code}`).digest('hex');
}

export async function issueOtp(params: {
  phone: string;
  purpose: 'coop_registration' | 'login' | 'guest_checkout' | 'phone_change';
  ipAddress?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  cooldownSeconds?: number;
  smsConfigured: boolean;
  smsSent: boolean;
  localOtpNotice?: string;
  expiresInSeconds: number;
}> {
  const phone = normalizeNepalPhone(params.phone);
  if (!isValidNepalMobile(phone)) {
    return {
      ok: false,
      error: 'अमान्य नेपाली मोबाइल नम्बर (९८/९७ बाट सुरु हुने १० अंक आवश्यक)।',
      smsConfigured: isAkashSmsConfigured(),
      smsSent: false,
      expiresInSeconds: 0,
    };
  }

  // Resend cooldown: 60 seconds
  const recent = db
    .prepare(
      `SELECT created_at FROM otp_verifications
       WHERE phone = ? AND purpose = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(phone, params.purpose) as { created_at: string } | undefined;

  if (recent) {
    const elapsedSec = (Date.now() - new Date(recent.created_at + 'Z').getTime()) / 1000;
    if (elapsedSec < 60) {
      return {
        ok: false,
        error: `कृपया ${Math.ceil(60 - elapsedSec)} सेकेन्ड पर्खनुहोस्।`,
        cooldownSeconds: Math.ceil(60 - elapsedSec),
        smsConfigured: isAkashSmsConfigured(),
        smsSent: false,
        expiresInSeconds: 0,
      };
    }
  }

  // Hourly rate limit: max 5 OTPs per phone per hour
  const hourlyCount = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM otp_verifications
       WHERE phone = ? AND created_at > datetime('now', '-1 hour')`
    )
    .get(phone) as { cnt: number };

  if (hourlyCount.cnt >= 5) {
    return {
      ok: false,
      error: 'अत्यधिक OTP अनुरोध। कृपया १ घण्टापछि पुनः प्रयास गर्नुहोस्।',
      smsConfigured: isAkashSmsConfigured(),
      smsSent: false,
      expiresInSeconds: 0,
    };
  }

  const code = String(crypto.randomInt(100000, 999999));
  const codeHash = hashOtp(phone, code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO otp_verifications (id, phone, purpose, code_hash, attempts, max_attempts, expires_at, ip_address)
     VALUES (?, ?, ?, ?, 0, 5, ?, ?)`
  ).run(crypto.randomUUID(), phone, params.purpose, codeHash, expiresAt, params.ipAddress ?? null);

  const smsText = `तपाईंको सहकारी बजार प्रमाणीकरण कोड (OTP): ${code}। यो कोड ५ मिनेटमा समाप्त हुन्छ।`;
  const smsResult = await sendAkashSms({
    to: phone,
    text: smsText,
    purpose: params.purpose,
  });

  return {
    ok: true,
    smsConfigured: smsResult.configured,
    smsSent: smsResult.sent,
    expiresInSeconds: 300,
    ...(smsResult.configured
      ? {}
      : {
          localOtpNotice: `Akash SMS Auth Token सेट गरिएको छैन। स्थानीय परीक्षण OTP: ${code}`,
        }),
  };
}

export function verifyOtpCode(params: {
  phone: string;
  purpose: 'coop_registration' | 'login' | 'guest_checkout' | 'phone_change';
  code: string;
}): { valid: boolean; error?: string } {
  const phone = normalizeNepalPhone(params.phone);
  const record = db
    .prepare(
      `SELECT * FROM otp_verifications
       WHERE phone = ? AND purpose = ? AND verified_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(phone, params.purpose) as
    | {
        id: string;
        code_hash: string;
        attempts: number;
        max_attempts: number;
        expires_at: string;
      }
    | undefined;

  if (!record) {
    return { valid: false, error: 'मान्य OTP फेला परेन। कृपया नयाँ कोड पठाउनुहोस्।' };
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { valid: false, error: 'OTP कोडको म्याद समाप्त भएको छ।' };
  }

  if (record.attempts >= record.max_attempts) {
    return { valid: false, error: 'अधिकतम प्रयास सीमा नाघ्यो। कृपया नयाँ OTP अनुरोध गर्नुहोस्।' };
  }

  const expectedHash = hashOtp(phone, params.code.trim());
  if (!crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(record.code_hash))) {
    db.prepare(`UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?`).run(record.id);
    return { valid: false, error: 'गलत OTP कोड।' };
  }

  db.prepare(`UPDATE otp_verifications SET verified_at = datetime('now') WHERE id = ?`).run(record.id);
  return { valid: true };
}
