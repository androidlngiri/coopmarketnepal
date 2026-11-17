import crypto from 'crypto';
import { requireSupabaseAdmin } from './supabase-admin.ts';

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
  return Boolean(key && key !== 'your-akash-sms-auth-token' && key !== 'your-aakash-sms-auth-token' && key !== 'MY_AKASH_SMS_KEY');
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

export function formatSingleSegmentSms(rawText: string, maxLen = 158): string {
  // GSM-7 single SMS allows 160 ASCII/basic chars (Unicode drops limit to 70).
  // Normalize smart quotes/dashes and strip non-ASCII so every SMS stays within 1 SMS count.
  const ascii = String(rawText || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (ascii.length <= maxLen) return ascii;
  return `${ascii.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

export async function sendAkashSms(params: {
  to: string;
  text: string;
  purpose: string;
  cooperativeId?: string | null;
}): Promise<SmsSendResult> {
  const sb = requireSupabaseAdmin();
  const normalizedPhone = normalizeNepalPhone(params.to);
  const authToken = getAkashAuthToken();
  const smsText = formatSingleSegmentSms(params.text);

  if (!isValidNepalMobile(normalizedPhone)) {
    return {
      configured: isAkashSmsConfigured(),
      sent: false,
      status: 'failed',
      message: 'Invalid Nepal mobile number.',
    };
  }

  if (!isAkashSmsConfigured() || !authToken) {
    await sb.from('sms_logs').insert({
      cooperative_id: params.cooperativeId ?? null,
      recipient_phone: normalizedPhone,
      purpose: params.purpose,
      provider: 'akash_sms',
      status: 'unconfigured',
      provider_response: `UNCONFIGURED | 1-SMS(${smsText.length}): ${smsText}`,
    });

    return {
      configured: false,
      sent: false,
      status: 'unconfigured',
      message: 'Akash SMS Auth Token is not configured on the server.',
    };
  }

  try {
    const formBody = new URLSearchParams({
      auth_token: authToken,
      to: normalizedPhone,
      text: smsText,
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

    await sb.from('sms_logs').insert({
      cooperative_id: params.cooperativeId ?? null,
      recipient_phone: normalizedPhone,
      purpose: params.purpose,
      provider: 'akash_sms',
      status: ok ? 'sent' : 'failed',
      provider_response: responseText.slice(0, 1000),
    });

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
    await sb.from('sms_logs').insert({
      cooperative_id: params.cooperativeId ?? null,
      recipient_phone: normalizedPhone,
      purpose: params.purpose,
      provider: 'akash_sms',
      status: 'failed',
      provider_response: errMsg,
    });

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
  const sb = requireSupabaseAdmin();
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
  const { data: recent } = await sb
    .from('otp_verifications')
    .select('created_at')
    .eq('phone', phone)
    .eq('purpose', params.purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    const elapsedSec = (Date.now() - new Date(String(recent.created_at)).getTime()) / 1000;
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
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: hourlyCount } = await sb
    .from('otp_verifications')
    .select('*', { count: 'exact', head: true })
    .eq('phone', phone)
    .gt('created_at', oneHourAgo);

  if ((hourlyCount || 0) >= 5) {
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

  await sb.from('otp_verifications').insert({
    phone,
    purpose: params.purpose,
    code_hash: codeHash,
    attempts: 0,
    max_attempts: 5,
    expires_at: expiresAt,
    ip_address: params.ipAddress ?? null,
  });

  const smsText = `Sahakari Bazar OTP: ${code}. Valid for 5 mins. Do not share.`;
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

export async function verifyOtpCode(params: {
  phone: string;
  purpose: 'coop_registration' | 'login' | 'guest_checkout' | 'phone_change';
  code: string;
}): Promise<{ valid: boolean; error?: string }> {
  const sb = requireSupabaseAdmin();
  const phone = normalizeNepalPhone(params.phone);

  const { data: record } = await sb
    .from('otp_verifications')
    .select('id, code_hash, attempts, max_attempts, expires_at')
    .eq('phone', phone)
    .eq('purpose', params.purpose)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!record) {
    return { valid: false, error: 'मान्य OTP फेला परेन। कृपया नयाँ कोड पठाउनुहोस्।' };
  }

  if (new Date(String(record.expires_at)).getTime() < Date.now()) {
    return { valid: false, error: 'OTP कोडको म्याद समाप्त भएको छ।' };
  }

  if (Number(record.attempts) >= Number(record.max_attempts)) {
    return { valid: false, error: 'अधिकतम प्रयास सीमा नाघ्यो। कृपया नयाँ OTP अनुरोध गर्नुहोस्।' };
  }

  const expectedHash = hashOtp(phone, params.code.trim());
  const matches =
    expectedHash.length === String(record.code_hash).length &&
    crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(String(record.code_hash)));

  if (!matches) {
    await sb
      .from('otp_verifications')
      .update({ attempts: Number(record.attempts) + 1 })
      .eq('id', record.id);
    return { valid: false, error: 'गलत OTP कोड।' };
  }

  await sb
    .from('otp_verifications')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', record.id);

  return { valid: true };
}
