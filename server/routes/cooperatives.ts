import crypto from 'crypto';
import { Router } from 'express';
import { createSession, rateLimit, requireAuth, writeAuditLog } from '../auth.ts';
import { issueOtp, normalizeNepalPhone, verifyOtpCode } from '../akash-sms.ts';
import { createSupabaseAuthUser, requireSupabaseAdmin } from '../supabase-admin.ts';
import { resolveDocumentAccessUrl, uploadBase64ToSupabaseStorage } from '../storage.ts';

export const cooperativesRouter = Router();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

cooperativesRouter.post('/register', rateLimit('coop_reg', 6, 15 * 60 * 1000), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const body = req.body || {};
  const {
    nameNe,
    nameEn,
    registrationNumber,
    registrationAuthority,
    registrationDateAd,
    registrationDateBs,
    cooperativeType,
    panVatNumber,
    province,
    district,
    municipality,
    wardNumber,
    toleAddress,
    contactEmail,
    contactPhone,
    authorizedRepName,
    authorizedRepDesignation,
    requestedStoreName,
    requestedSlug,
    password,
    logoBase64,
    documentBase64,
    documentFileName,
    otpCode,
  } = body;

  if (
    !nameNe ||
    !nameEn ||
    !registrationNumber ||
    !registrationAuthority ||
    !registrationDateAd ||
    !province ||
    !district ||
    !municipality ||
    !wardNumber ||
    !toleAddress ||
    !contactPhone ||
    !authorizedRepName ||
    !authorizedRepDesignation ||
    !requestedStoreName ||
    !password ||
    String(password).length < 6
  ) {
    return res.status(400).json({ error: 'कृपया सबै अनिवार्य सहकारी विवरणहरू भर्नुहोस्।' });
  }

  const normalizedPhone = normalizeNepalPhone(String(contactPhone));
  const baseSlug = slugify(String(requestedSlug || requestedStoreName || nameEn)) || `coop-${Date.now()}`;
  const uniqueSlug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;

  let initialStatus: 'pending_otp' | 'pending_review' = 'pending_otp';
  let otpVerifiedAt: string | null = null;
  if (otpCode) {
    const otpCheck = await verifyOtpCode({
      phone: normalizedPhone,
      purpose: 'coop_registration',
      code: String(otpCode),
    });
    if (!otpCheck.valid) {
      return res.status(400).json({ error: otpCheck.error || 'गलत OTP कोड।' });
    }
    initialStatus = 'pending_review';
    otpVerifiedAt = new Date().toISOString();
  }

  let savedLogoUrl: string | null = null;
  let savedDoc: { url: string; size: number } | null = null;
  try {
    if (logoBase64 && String(logoBase64).startsWith('data:')) {
      savedLogoUrl = (
        await uploadBase64ToSupabaseStorage({
          dataUrl: String(logoBase64),
          bucket: 'cooperative-logos',
          folder: uniqueSlug,
          allowPdf: false,
        })
      ).url;
    }
    if (documentBase64 && String(documentBase64).startsWith('data:')) {
      savedDoc = await uploadBase64ToSupabaseStorage({
        dataUrl: String(documentBase64),
        bucket: 'cooperative-documents',
        folder: uniqueSlug,
        allowPdf: true,
      });
    }
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'फाइल अपलोड असफल।' });
  }

  let userId: string | null = null;
  let coopId: string | null = null;

  const allowedCoopTypes = ['agriculture', 'dairy', 'multipurpose', 'handicraft', 'consumer', 'savings_credit_producer', 'other'];
  const validCoopType = allowedCoopTypes.includes(String(cooperativeType || '')) ? String(cooperativeType) : 'multipurpose';

  try {
    const createdUser = await createSupabaseAuthUser({
      email: contactEmail ? String(contactEmail).trim().toLowerCase() : null,
      phone: normalizedPhone,
      password: String(password),
      fullName: String(authorizedRepName).trim(),
      fullNameNe: String(authorizedRepName).trim(),
      role: 'cooperative_admin',
      phoneVerifiedAt: otpVerifiedAt,
    });
    userId = createdUser.id;

    const { data: coopRow, error: coopErr } = await sb
      .from('cooperatives')
      .insert({
        owner_user_id: userId,
        slug: uniqueSlug,
        name_ne: String(nameNe).trim(),
        name_en: String(nameEn).trim(),
        registration_number: String(registrationNumber).trim(),
        registration_authority: String(registrationAuthority).trim(),
        registration_date_ad: String(registrationDateAd),
        registration_date_bs: registrationDateBs ? String(registrationDateBs) : null,
        cooperative_type: validCoopType,
        pan_vat_number: panVatNumber ? String(panVatNumber).trim() : null,
        province: String(province),
        district: String(district),
        municipality: String(municipality).trim(),
        ward_number: String(wardNumber).trim(),
        tole_address: String(toleAddress).trim(),
        contact_email: contactEmail ? String(contactEmail).trim().toLowerCase() : null,
        contact_phone: normalizedPhone,
        authorized_rep_name: String(authorizedRepName).trim(),
        authorized_rep_designation: String(authorizedRepDesignation).trim(),
        logo_url: savedLogoUrl,
        requested_store_name: String(requestedStoreName).trim(),
        status: initialStatus,
        otp_verified_at: otpVerifiedAt,
      })
      .select('*')
      .single();

    if (coopErr || !coopRow) {
      throw new Error(coopErr?.code === '23505' ? 'DUPLICATE' : coopErr?.message || 'Coop insert failed');
    }
    coopId = coopRow.id;

    if (savedDoc) {
      await sb.from('cooperative_documents').insert({
        cooperative_id: coopId,
        document_type: 'registration_certificate',
        file_name: String(documentFileName || 'registration-certificate'),
        file_url: savedDoc.url,
        file_size_bytes: savedDoc.size,
        verified_status: 'pending',
      });
    }

    await sb.from('cooperative_status_history').insert({
      cooperative_id: coopId,
      from_status: null,
      to_status: initialStatus,
      reason: initialStatus === 'pending_review' ? 'OTP verified during registration' : 'Registered awaiting OTP verification',
      changed_by: userId,
    });

    const defaultSections = [
      { id: 'hero', type: 'hero', visible: true, title_ne: 'हाम्रा उत्पादनहरू', title_en: 'Our Products' },
      { id: 'featured_products', type: 'featured_products', visible: true, title_ne: 'विशेष उत्पादनहरू', title_en: 'Featured Products' },
      { id: 'about', type: 'about', visible: true, title_ne: 'सहकारी परिचय', title_en: 'About Us' },
      { id: 'notice', type: 'notice', visible: true, title_ne: 'सूचना', title_en: 'Notices' },
    ];

    await sb.from('stores').insert({
      cooperative_id: coopId,
      store_name_ne: String(requestedStoreName).trim(),
      store_name_en: String(requestedStoreName).trim(),
      logo_url: savedLogoUrl || '/images/hero-nepal-cooperative.jpg',
      banner_url: '/images/hero-nepal-cooperative.jpg',
      contact_phone: normalizedPhone,
      contact_email: contactEmail ? String(contactEmail).trim().toLowerCase() : null,
      address_text: `${municipality}-${wardNumber}, ${district}`,
      sections_json: defaultSections,
      is_published: false,
    });

    await sb.from('delivery_configs').insert({
      cooperative_id: coopId,
      delivery_areas_json: [district, 'काठमाडौँ उपत्यका'],
      default_fee_npr: 120,
      free_delivery_threshold_npr: 2500,
      minimum_order_npr: 300,
      pickup_enabled: true,
      pickup_address_ne: `${toleAddress}, ${municipality}-${wardNumber}, ${district}`,
    });

    if (initialStatus === 'pending_review') {
      const { data: admins } = await sb
        .from('platform_administrators')
        .select('user_id')
        .eq('is_active', true);

      if (admins && admins.length > 0) {
        await sb.from('notifications').insert(
          admins.map((a: { user_id: string }) => ({
            recipient_user_id: a.user_id,
            type: 'coop_pending_review',
            title_ne: 'नयाँ सहकारी स्वीकृति अनुरोध',
            title_en: 'New Cooperative Approval Request',
            body_ne: `${nameNe} (${district}) समीक्षाको लागि प्रतीक्षारत छ।`,
            body_en: `${nameEn} (${district}) is awaiting verification.`,
            action_url: '/super-admin',
          }))
        );
      }
    }

    await writeAuditLog({
      actorUserId: userId,
      actorRole: 'cooperative_admin',
      cooperativeId: coopId,
      action: 'cooperative_registered',
      entityType: 'cooperative',
      entityId: coopId,
      metadata: { status: initialStatus, registrationNumber },
      ipAddress: req.ip,
    });

    let otpResult = null;
    if (initialStatus === 'pending_otp') {
      otpResult = await issueOtp({
        phone: normalizedPhone,
        purpose: 'coop_registration',
        ipAddress: req.ip,
      });
    }

    await createSession(userId, req, res);
    res.status(201).json({ cooperative: coopRow, otpResult });
  } catch (err) {
    if (userId && !coopId) {
      await sb.auth.admin.deleteUser(userId);
    }
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'DUPLICATE_USER' || msg === 'DUPLICATE' || msg.includes('duplicate')) {
      return res.status(400).json({
        error: 'यो दर्ता नम्बर, मोबाइल नम्बर वा इमेल पहिले नै दर्ता भइसकेको छ।',
      });
    }
    return res.status(500).json({ error: 'सहकारी दर्ता प्रक्रियामा त्रुटि भयो।' });
  }
});

cooperativesRouter.post('/verify-otp', requireAuth, async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'OTP कोड आवश्यक छ।' });
  }

  const sb = requireSupabaseAdmin();
  const { data: coop } = await sb
    .from('cooperatives')
    .select('id, contact_phone, status, name_ne, name_en, district')
    .eq('owner_user_id', req.authUser!.id)
    .limit(1)
    .maybeSingle();

  if (!coop) {
    return res.status(404).json({ error: 'सहकारी फेला परेन।' });
  }

  const check = await verifyOtpCode({
    phone: coop.contact_phone,
    purpose: 'coop_registration',
    code: String(code),
  });
  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  const nowIso = new Date().toISOString();
  await Promise.all([
    sb.from('cooperatives').update({ status: 'pending_review', otp_verified_at: nowIso }).eq('id', coop.id),
    sb.from('profiles').update({ phone_verified_at: nowIso }).eq('id', req.authUser!.id),
    sb.from('cooperative_status_history').insert({
      cooperative_id: coop.id,
      from_status: coop.status,
      to_status: 'pending_review',
      reason: 'Mobile OTP verified',
      changed_by: req.authUser!.id,
    }),
  ]);

  res.json({ ok: true, status: 'pending_review' });
});

cooperativesRouter.get('/my-status', requireAuth, async (req, res) => {
  if (!req.authUser?.cooperative_id) {
    return res.json({ cooperative: null });
  }
  const sb = requireSupabaseAdmin();
  const [coopRes, histRes, docsRes] = await Promise.all([
    sb.from('cooperatives').select('*').eq('id', req.authUser.cooperative_id).maybeSingle(),
    sb
      .from('cooperative_status_history')
      .select('*')
      .eq('cooperative_id', req.authUser.cooperative_id)
      .order('created_at', { ascending: false }),
    sb.from('cooperative_documents').select('*').eq('cooperative_id', req.authUser.cooperative_id),
  ]);

  const documents = await Promise.all(
    (docsRes.data || []).map(async (d: Record<string, unknown>) => ({
      ...d,
      file_url: await resolveDocumentAccessUrl(String(d.file_url || '')),
    }))
  );

  res.json({
    cooperative: coopRes.data,
    history: histRes.data || [],
    documents,
  });
});
