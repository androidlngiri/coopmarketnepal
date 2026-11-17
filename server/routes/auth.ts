import { Router } from 'express';
import {
  createSession,
  destroySession,
  rateLimit,
  requireAuth,
  writeAuditLog,
} from '../auth.ts';
import { isAkashSmsConfigured, issueOtp, normalizeNepalPhone, verifyOtpCode } from '../akash-sms.ts';
import {
  createSupabaseAuthUser,
  requireSupabaseAdmin,
  verifySupabaseUserPassword,
} from '../supabase-admin.ts';
import { notifySuperAdmins } from '../services/notifications.ts';

export const authRouter = Router();

authRouter.get('/bootstrap-status', async (_req, res) => {
  try {
    const sb = requireSupabaseAdmin();
    const { count } = await sb
      .from('platform_administrators')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    res.json({
      hasSuperAdmin: (count || 0) > 0,
      smsConfigured: isAkashSmsConfigured(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Supabase connection error' });
  }
});

authRouter.post('/bootstrap-admin', rateLimit('bootstrap', 5, 15 * 60 * 1000), async (req, res) => {
  const { fullName, email, phone, password, bootstrapSecret } = req.body || {};
  const sb = requireSupabaseAdmin();

  const { count: existingAdmins } = await sb
    .from('platform_administrators')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const envSecret = process.env.SUPER_ADMIN_BOOTSTRAP_SECRET?.trim();
  if ((existingAdmins || 0) > 0) {
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

  let userId: string;
  try {
    const created = await createSupabaseAuthUser({
      email: String(email).trim().toLowerCase(),
      phone: normalizedPhone,
      password: String(password),
      fullName: String(fullName).trim(),
      fullNameNe: String(fullName).trim(),
      role: 'super_admin',
      phoneVerifiedAt: new Date().toISOString(),
    });
    userId = created.id;

    const { error: adminErr } = await sb.from('platform_administrators').insert({
      user_id: userId,
      title: 'Platform Super Administrator',
      is_active: true,
    });
    if (adminErr) {
      await sb.auth.admin.deleteUser(userId);
      throw new Error(adminErr.message);
    }

    await writeAuditLog({
      actorUserId: userId,
      actorRole: 'super_admin',
      action: 'super_admin_provisioned',
      entityType: 'user',
      entityId: userId,
      ipAddress: req.ip,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    return res.status(400).json({
      error: msg === 'DUPLICATE_USER' ? 'यो इमेल वा फोन पहिले नै दर्ता छ।' : 'सुपर एडमिन सिर्जना गर्न सकिएन।',
    });
  }

  await createSession(userId, req, res);
  const { data: user } = await sb
    .from('profiles')
    .select('id, full_name, full_name_ne, email, phone, role, preferred_language')
    .eq('id', userId)
    .single();

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

authRouter.post('/otp/verify', rateLimit('otp_ver', 12, 10 * 60 * 1000), async (req, res) => {
  const { phone, purpose, code } = req.body || {};
  if (!phone || !purpose || !code) {
    return res.status(400).json({ error: 'मोबाइल नम्बर र OTP कोड आवश्यक छ।' });
  }
  const check = await verifyOtpCode({ phone: String(phone), purpose, code: String(code) });
  if (!check.valid) {
    return res.status(400).json({ verified: false, error: check.error });
  }
  res.json({ verified: true });
});

authRouter.post('/register-buyer', rateLimit('reg_buyer', 10, 15 * 60 * 1000), async (req, res) => {
  const { fullName, email, phone, password } = req.body || {};
  if (!fullName || !password || String(password).length < 6 || (!email && !phone)) {
    return res.status(400).json({ error: 'नाम, इमेल वा फोन र कम्तीमा ६ अक्षरको पासवर्ड आवश्यक छ।' });
  }

  const normalizedPhone = phone ? normalizeNepalPhone(String(phone)) : null;
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  const sb = requireSupabaseAdmin();

  let userId: string;
  try {
    const created = await createSupabaseAuthUser({
      email: cleanEmail,
      phone: normalizedPhone,
      password: String(password),
      fullName: String(fullName).trim(),
      fullNameNe: String(fullName).trim(),
      role: 'buyer',
    });
    userId = created.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    return res.status(400).json({
      error: msg === 'DUPLICATE_USER' ? 'यो इमेल वा मोबाइल नम्बर पहिले नै प्रयोगमा छ।' : 'खाता दर्ता असफल भयो।',
    });
  }

  await createSession(userId, req, res);
  const { data: user } = await sb
    .from('profiles')
    .select('id, full_name, full_name_ne, email, phone, role, preferred_language')
    .eq('id', userId)
    .single();

  const cleanName = String(fullName).trim();
  const contact = normalizedPhone || cleanEmail || 'New Buyer';
  await notifySuperAdmins({
    type: 'new_buyer_registered',
    titleNe: 'नयाँ क्रेता खाता दर्ता',
    titleEn: 'New Buyer Registered',
    bodyNe: `${cleanName} (${contact}) ले क्रेता खाता खोल्नुभएको छ।`,
    bodyEn: `${cleanName} (${contact}) created a new buyer account.`,
    actionUrl: '/super-admin?tab=users',
    smsText: `Sahakari Bazar Alert: New Buyer ${cleanName} (${contact}) registered.`,
    smsPurpose: 'admin_alert_buyer_registered',
  });

  res.status(201).json({ user });
});

authRouter.post('/login', rateLimit('login', 15, 10 * 60 * 1000), async (req, res) => {
  const { identifier, password, otpCode, mode } = req.body || {};
  if (!identifier) {
    return res.status(400).json({ error: 'इमेल वा मोबाइल नम्बर प्रविष्ट गर्नुहोस्।' });
  }

  const sb = requireSupabaseAdmin();
  const rawId = String(identifier).trim();
  const normalizedPhone = normalizeNepalPhone(rawId);

  let user: Record<string, unknown> | null = null;
  if (rawId.includes('@')) {
    const { data } = await sb.from('profiles').select('*').ilike('email', rawId).limit(1).maybeSingle();
    user = data;
  } else {
    const { data } = await sb
      .from('profiles')
      .select('*')
      .or(`phone.eq.${normalizedPhone},email.ilike.${rawId}`)
      .limit(1)
      .maybeSingle();
    user = data;
  }

  const logAttempt = async (success: boolean, reason?: string) => {
    await sb.from('login_activities').insert({
      user_id: user ? String(user.id) : null,
      identifier: rawId,
      success,
      ip_address: req.ip || null,
      user_agent: req.get('user-agent')?.slice(0, 200) || null,
      failure_reason: reason ?? null,
    });
  };

  if (!user || !user.is_active) {
    await logAttempt(false, 'user_not_found_or_inactive');
    return res.status(401).json({ error: 'गलत इमेल/फोन वा पासवर्ड।' });
  }

  if (mode === 'otp') {
    if (!user.phone || !otpCode) {
      return res.status(400).json({ error: 'OTP लगइनका लागि दर्ता भएको मोबाइल नम्बर र कोड आवश्यक छ।' });
    }
    const otpCheck = await verifyOtpCode({
      phone: String(user.phone),
      purpose: 'login',
      code: String(otpCode),
    });
    if (!otpCheck.valid) {
      await logAttempt(false, 'invalid_otp');
      return res.status(401).json({ error: otpCheck.error || 'गलत OTP कोड।' });
    }
  } else {
    if (!password || !(await verifySupabaseUserPassword(String(user.id), String(password)))) {
      await logAttempt(false, 'invalid_password');
      return res.status(401).json({ error: 'गलत इमेल/फोन वा पासवर्ड।' });
    }
  }

  await logAttempt(true);
  await createSession(String(user.id), req, res);

  let cooperative: Record<string, unknown> | null = null;
  if (user.role === 'cooperative_admin' || user.role === 'cooperative_staff') {
    const { data: owned } = await sb
      .from('cooperatives')
      .select('id, slug, name_ne, name_en, status, logo_url')
      .eq('owner_user_id', String(user.id))
      .limit(1)
      .maybeSingle();

    if (owned) {
      cooperative = owned;
    } else {
      const { data: staff } = await sb
        .from('cooperative_staff')
        .select('cooperatives:cooperative_id (id, slug, name_ne, name_en, status, logo_url)')
        .eq('user_id', String(user.id))
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (staff?.cooperatives) {
        cooperative = (Array.isArray(staff.cooperatives) ? staff.cooperatives[0] : staff.cooperatives) as Record<
          string,
          unknown
        >;
      }
    }
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

function maskPhone(phone: string): string {
  const clean = phone.trim();
  if (clean.length < 6) return clean;
  return `${clean.slice(0, 4)}****${clean.slice(-2)}`;
}

authRouter.post('/password-reset/request', rateLimit('pwd_reset_req', 8, 10 * 60 * 1000), async (req, res) => {
  const { identifier } = req.body || {};
  if (!identifier || !String(identifier).trim()) {
    return res.status(400).json({ error: 'कृपया दर्ता भएको इमेल वा मोबाइल नम्बर प्रविष्ट गर्नुहोस्।' });
  }

  const sb = requireSupabaseAdmin();
  const rawId = String(identifier).trim();
  const normalizedPhone = normalizeNepalPhone(rawId);

  let user: { id: string; email: string | null; phone: string | null; is_active: boolean } | null = null;
  if (rawId.includes('@')) {
    const { data } = await sb
      .from('profiles')
      .select('id, email, phone, is_active')
      .ilike('email', rawId)
      .limit(1)
      .maybeSingle();
    user = data;
  } else {
    const { data } = await sb
      .from('profiles')
      .select('id, email, phone, is_active')
      .or(`phone.eq.${normalizedPhone},email.ilike.${rawId}`)
      .limit(1)
      .maybeSingle();
    user = data;
  }

  if (!user || !user.is_active) {
    return res.status(404).json({
      error: 'यो इमेल वा मोबाइल नम्बरसँग मिल्ने सक्रिय खाता फेला परेन।',
    });
  }

  if (!user.phone) {
    return res.status(400).json({
      error: 'यो खातामा मोबाइल नम्बर दर्ता नभएकोले SMS OTP पठाउन सकिएन। कृपया सहायता केन्द्रमा सम्पर्क गर्नुहोस्।',
    });
  }

  const otpRes = await issueOtp({
    phone: String(user.phone),
    purpose: 'login',
    ipAddress: req.ip,
  });

  if (!otpRes.ok) {
    return res.status(429).json({
      error: otpRes.error || 'OTP पठाउन सकिएन। कृपया केही बेरपछि पुनः प्रयास गर्नुहोस्।',
      cooldownSeconds: otpRes.cooldownSeconds,
    });
  }

  res.json({
    ok: true,
    maskedPhone: maskPhone(String(user.phone)),
    smsConfigured: otpRes.smsConfigured,
    smsSent: otpRes.smsSent,
    expiresInSeconds: otpRes.expiresInSeconds,
    ...(otpRes.localOtpNotice ? { localOtpNotice: otpRes.localOtpNotice } : {}),
  });
});

authRouter.post('/password-reset/confirm', rateLimit('pwd_reset_conf', 10, 10 * 60 * 1000), async (req, res) => {
  const { identifier, otpCode, newPassword } = req.body || {};
  if (!identifier || !otpCode || !newPassword) {
    return res.status(400).json({ error: 'इमेल/फोन, OTP कोड र नयाँ पासवर्ड सबै आवश्यक छन्।' });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'नयाँ पासवर्ड कम्तीमा ६ अक्षरको हुनुपर्छ।' });
  }

  const sb = requireSupabaseAdmin();
  const rawId = String(identifier).trim();
  const normalizedPhone = normalizeNepalPhone(rawId);

  let user: Record<string, unknown> | null = null;
  if (rawId.includes('@')) {
    const { data } = await sb.from('profiles').select('*').ilike('email', rawId).limit(1).maybeSingle();
    user = data;
  } else {
    const { data } = await sb
      .from('profiles')
      .select('*')
      .or(`phone.eq.${normalizedPhone},email.ilike.${rawId}`)
      .limit(1)
      .maybeSingle();
    user = data;
  }

  if (!user || !user.is_active || !user.phone) {
    return res.status(404).json({ error: 'मान्य सक्रिय खाता वा दर्ता मोबाइल नम्बर फेला परेन।' });
  }

  if (user.role === 'super_admin' && String(newPassword).length < 8) {
    return res.status(400).json({ error: 'सुपर एडमिन पासवर्ड कम्तीमा ८ अक्षरको हुनुपर्छ।' });
  }

  const otpCheck = await verifyOtpCode({
    phone: String(user.phone),
    purpose: 'login',
    code: String(otpCode),
  });

  if (!otpCheck.valid) {
    return res.status(400).json({ error: otpCheck.error || 'गलत वा म्याद समाप्त OTP कोड।' });
  }

  const { error: authUpdateErr } = await sb.auth.admin.updateUserById(String(user.id), {
    password: String(newPassword),
    phone_confirm: true,
  });

  if (authUpdateErr) {
    return res.status(500).json({ error: 'पासवर्ड अद्यावधिक गर्न असफल भयो।' });
  }

  await Promise.all([
    sb
      .from('profiles')
      .update({
        phone_verified_at: user.phone_verified_at || new Date().toISOString(),
      })
      .eq('id', String(user.id)),
    sb.from('sessions').delete().eq('user_id', String(user.id)),
  ]);

  await writeAuditLog({
    actorUserId: String(user.id),
    actorRole: String(user.role),
    action: 'password_reset_via_otp',
    entityType: 'user',
    entityId: String(user.id),
    ipAddress: req.ip,
  });

  await createSession(String(user.id), req, res);

  let cooperative: Record<string, unknown> | null = null;
  if (user.role === 'cooperative_admin' || user.role === 'cooperative_staff') {
    const { data: owned } = await sb
      .from('cooperatives')
      .select('id, slug, name_ne, name_en, status, logo_url')
      .eq('owner_user_id', String(user.id))
      .limit(1)
      .maybeSingle();
    if (owned) cooperative = owned;
  }

  res.json({
    ok: true,
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

authRouter.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  if (!req.authUser) {
    return res.json({ user: null, cooperative: null, unreadNotifications: 0 });
  }

  const sb = requireSupabaseAdmin();
  let cooperative = null;
  if (req.authUser.cooperative_id) {
    const { data } = await sb
      .from('cooperatives')
      .select('id, slug, name_ne, name_en, status, logo_url, province, district')
      .eq('id', req.authUser.cooperative_id)
      .maybeSingle();
    cooperative = data;
  }

  let notifQuery = sb
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);

  if (req.authUser.cooperative_id) {
    notifQuery = notifQuery.or(`recipient_user_id.eq.${req.authUser.id},cooperative_id.eq.${req.authUser.cooperative_id}`);
  } else {
    notifQuery = notifQuery.eq('recipient_user_id', req.authUser.id);
  }
  const { count } = await notifQuery;

  res.json({
    user: req.authUser,
    cooperative,
    unreadNotifications: count || 0,
  });
});

authRouter.patch('/language', requireAuth, async (req, res) => {
  const sb = requireSupabaseAdmin();
  const lang = req.body?.language === 'en' ? 'en' : 'ne';
  await sb.from('profiles').update({ preferred_language: lang }).eq('id', req.authUser!.id);
  res.json({ language: lang });
});
