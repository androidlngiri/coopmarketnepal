import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db.ts';
import {
  createSession,
  destroySession,
  hashPassword,
  rateLimit,
  requireAuth,
  verifyPassword,
  writeAuditLog,
} from '../auth.ts';
import { isAkashSmsConfigured, issueOtp, normalizeNepalPhone, verifyOtpCode } from '../akash-sms.ts';

export const authRouter = Router();

authRouter.get('/bootstrap-status', (_req, res) => {
  const adminCount = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM platform_administrators WHERE is_active = 1`).get() as { cnt: number }
  ).cnt;
  res.json({
    hasSuperAdmin: adminCount > 0,
    smsConfigured: isAkashSmsConfigured(),
  });
});

authRouter.post('/bootstrap-admin', rateLimit('bootstrap', 5, 15 * 60 * 1000), (req, res) => {
  const { fullName, email, phone, password, bootstrapSecret } = req.body || {};

  const existingAdmins = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM platform_administrators WHERE is_active = 1`).get() as { cnt: number }
  ).cnt;

  const envSecret = process.env.SUPER_ADMIN_BOOTSTRAP_SECRET?.trim();
  if (existingAdmins > 0) {
    if (!envSecret || bootstrapSecret !== envSecret) {
      return res.status(403).json({
        error: 'प्लेटफर्म सुपर एडमिन पहिले नै सेटअप भइसकेको छ।',
      });
    }
  } else if (envSecret && bootstrapSecret !== envSecret) {
    return res.status(403).json({ error: 'अमान्य बुटस्ट्र्याप गोप्य कुञ्जी।' });
  }

  if (!fullName || !email || !password || String(password).length < 8) {
    return res.status(400).json({
      error: 'पूरा नाम, इमेल र कम्तीमा ८ अक्षरको पासवर्ड आवश्यक छ।',
    });
  }

  const normalizedPhone = phone ? normalizeNepalPhone(String(phone)) : null;
  const userId = crypto.randomUUID();

  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id, full_name, full_name_ne, email, phone, password_hash, role, preferred_language, phone_verified_at)
         VALUES (?, ?, ?, ?, ?, ?, 'super_admin', 'ne', datetime('now'))`
      ).run(
        userId,
        String(fullName).trim(),
        String(fullName).trim(),
        String(email).trim().toLowerCase(),
        normalizedPhone,
        hashPassword(String(password))
      );

      db.prepare(
        `INSERT INTO platform_administrators (id, user_id, title, is_active)
         VALUES (?, ?, 'Platform Super Administrator', 1)`
      ).run(crypto.randomUUID(), userId);

      writeAuditLog({
        actorUserId: userId,
        actorRole: 'super_admin',
        action: 'super_admin_provisioned',
        entityType: 'user',
        entityId: userId,
        ipAddress: req.ip,
      });
    })();
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error && err.message.includes('UNIQUE')
        ? 'यो इमेल वा फोन पहिले नै दर्ता छ।'
        : 'सुपर एडमिन सिर्जना गर्न सकिएन।',
    });
  }

  createSession(userId, req, res);
  const user = db
    .prepare(`SELECT id, full_name, full_name_ne, email, phone, role, preferred_language FROM users WHERE id = ?`)
    .get(userId);
  res.status(201).json({ user });
});

authRouter.post('/otp/request', rateLimit('otp_req', 8, 10 * 60 * 1000), async (req, res) => {
  const { phone, purpose } = req.body || {};
  const allowedPurposes = ['coop_registration', 'login', 'guest_checkout', 'phone_change'];
  if (!phone || !allowedPurposes.includes(purpose)) {
    return res.status(400).json({ error: 'मान्य मोबाइल नम्बर र उद्देश्य आवश्यक छ।' });
  }
  const result = await issueOtp({
    phone: String(phone),
    purpose,
    ipAddress: req.ip,
  });
  if (!result.ok) {
    return res.status(429).json(result);
  }
  res.json(result);
});

authRouter.post('/otp/verify', rateLimit('otp_ver', 12, 10 * 60 * 1000), (req, res) => {
  const { phone, purpose, code } = req.body || {};
  if (!phone || !purpose || !code) {
    return res.status(400).json({ error: 'मोबाइल नम्बर र OTP कोड आवश्यक छ।' });
  }
  const check = verifyOtpCode({ phone: String(phone), purpose, code: String(code) });
  if (!check.valid) {
    return res.status(400).json({ verified: false, error: check.error });
  }
  res.json({ verified: true });
});

authRouter.post('/register-buyer', rateLimit('reg_buyer', 10, 15 * 60 * 1000), (req, res) => {
  const { fullName, email, phone, password } = req.body || {};
  if (!fullName || !password || String(password).length < 6 || (!email && !phone)) {
    return res.status(400).json({ error: 'नाम, इमेल वा फोन र कम्तीमा ६ अक्षरको पासवर्ड आवश्यक छ।' });
  }

  const normalizedPhone = phone ? normalizeNepalPhone(String(phone)) : null;
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  const userId = crypto.randomUUID();

  try {
    db.prepare(
      `INSERT INTO users (id, full_name, full_name_ne, email, phone, password_hash, role, preferred_language)
       VALUES (?, ?, ?, ?, ?, ?, 'buyer', 'ne')`
    ).run(userId, String(fullName).trim(), String(fullName).trim(), cleanEmail, normalizedPhone, hashPassword(String(password)));
  } catch {
    return res.status(400).json({ error: 'यो इमेल वा मोबाइल नम्बर पहिले नै प्रयोगमा छ।' });
  }

  createSession(userId, req, res);
  const user = db
    .prepare(`SELECT id, full_name, full_name_ne, email, phone, role, preferred_language FROM users WHERE id = ?`)
    .get(userId);
  res.status(201).json({ user });
});

authRouter.post('/login', rateLimit('login', 15, 10 * 60 * 1000), (req, res) => {
  const { identifier, password, otpCode, mode } = req.body || {};
  if (!identifier) {
    return res.status(400).json({ error: 'इमेल वा मोबाइल नम्बर प्रविष्ट गर्नुहोस्।' });
  }

  const rawId = String(identifier).trim();
  const normalizedPhone = normalizeNepalPhone(rawId);
  const user = db
    .prepare(
      `SELECT * FROM users WHERE lower(email) = lower(?) OR phone = ? LIMIT 1`
    )
    .get(rawId, normalizedPhone) as
    | {
        id: string;
        full_name: string;
        full_name_ne: string | null;
        email: string | null;
        phone: string | null;
        password_hash: string;
        role: string;
        preferred_language: 'ne' | 'en';
        is_active: number;
      }
    | undefined;

  const logAttempt = (success: boolean, reason?: string) => {
    db.prepare(
      `INSERT INTO login_activities (id, user_id, identifier, success, ip_address, user_agent, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      user?.id ?? null,
      rawId,
      success ? 1 : 0,
      req.ip || null,
      req.get('user-agent')?.slice(0, 200) || null,
      reason ?? null
    );
  };

  if (!user || !user.is_active) {
    logAttempt(false, 'user_not_found_or_inactive');
    return res.status(401).json({ error: 'गलत इमेल/फोन वा पासवर्ड।' });
  }

  if (mode === 'otp') {
    if (!user.phone || !otpCode) {
      return res.status(400).json({ error: 'OTP लगइनका लागि दर्ता भएको मोबाइल नम्बर र कोड आवश्यक छ।' });
    }
    const otpCheck = verifyOtpCode({ phone: user.phone, purpose: 'login', code: String(otpCode) });
    if (!otpCheck.valid) {
      logAttempt(false, 'invalid_otp');
      return res.status(401).json({ error: otpCheck.error || 'गलत OTP कोड।' });
    }
  } else {
    if (!password || !verifyPassword(String(password), user.password_hash)) {
      logAttempt(false, 'invalid_password');
      return res.status(401).json({ error: 'गलत इमेल/फोन वा पासवर्ड।' });
    }
  }

  logAttempt(true);
  createSession(user.id, req, res);

  // Resolve cooperative if applicable
  let cooperative = null;
  if (user.role === 'cooperative_admin' || user.role === 'cooperative_staff') {
    cooperative = db
      .prepare(
        `SELECT c.id, c.slug, c.name_ne, c.name_en, c.status, c.logo_url
         FROM cooperatives c
         LEFT JOIN cooperative_staff cs ON cs.cooperative_id = c.id AND cs.user_id = ?
         WHERE c.owner_user_id = ? OR (cs.user_id = ? AND cs.is_active = 1)
         LIMIT 1`
      )
      .get(user.id, user.id, user.id);
  }

  res.json({
    user: {
      id: user.id,
      full_name: user.full_name,
      full_name_ne: user.full_name_ne,
      email: user.email,
      phone: user.phone,
      role: user.role,
      preferred_language: user.preferred_language,
    },
    cooperative,
  });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.authUser) {
    return res.json({ user: null, cooperative: null, unreadNotifications: 0 });
  }

  let cooperative = null;
  if (req.authUser.cooperative_id) {
    cooperative = db
      .prepare(`SELECT id, slug, name_ne, name_en, status, logo_url, province, district FROM cooperatives WHERE id = ?`)
      .get(req.authUser.cooperative_id);
  }

  const unread = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM notifications
       WHERE is_read = 0 AND (recipient_user_id = ? OR (? IS NOT NULL AND cooperative_id = ?))`
    )
    .get(req.authUser.id, req.authUser.cooperative_id ?? null, req.authUser.cooperative_id ?? null) as { cnt: number };

  res.json({
    user: req.authUser,
    cooperative,
    unreadNotifications: unread.cnt,
  });
});

authRouter.patch('/language', requireAuth, (req, res) => {
  const lang = req.body?.language === 'en' ? 'en' : 'ne';
  db.prepare(`UPDATE users SET preferred_language = ? WHERE id = ?`).run(lang, req.authUser!.id);
  res.json({ language: lang });
});
