import crypto from 'crypto';
import { Router } from 'express';
import { createSession, rateLimit, requireAuth, writeAuditLog } from '../auth.ts';
import { issueOtp, normalizeNepalPhone, verifyOtpCode } from '../akash-sms.ts';
import { createSupabaseAuthUser, requireSupabaseAdmin, verifySupabaseUserPassword } from '../supabase-admin.ts';
import { resolveDocumentAccessUrl, uploadBase64ToSupabaseStorage } from '../storage.ts';
import {
  GeminiAssistantError,
  isGeminiConfigured,
  prefillCooperativeRegistrationWithGemini,
} from '../gemini.ts';
import { notifySuperAdmins } from '../services/notifications.ts';

export const cooperativesRouter = Router();

cooperativesRouter.post('/ai-prefill', rateLimit('coop_ai_prefill', 15, 10 * 60 * 1000), async (req, res) => {
  const hint = String(req.body?.hint || '').trim();
  const language: 'ne' | 'en' = req.body?.language === 'en' ? 'en' : 'ne';
  if (hint.length < 3 || hint.length > 500) {
    return res.status(400).json({
      error:
        language === 'ne'
          ? 'कृपया कम्तीमा ३ अक्षरमा सहकारीको नाम र स्थान (जस्तै: सगरमाथा कृषि सहकारी, इलाम) लेख्नुहोस्।'
          : 'Please describe your cooperative in at least 3 characters (e.g. Sagarmatha Agro Coop, Ilam).',
    });
  }
  if (!isGeminiConfigured()) {
    return res.status(503).json({
      error:
        language === 'ne'
          ? 'AI प्रिफिल सेवा हाल कन्फिगर गरिएको छैन। कृपया फारम म्यानुअल रूपमा भर्नुहोस्।'
          : 'AI prefill is currently unconfigured. Please fill fields manually.',
    });
  }
  try {
    const prefill = await prefillCooperativeRegistrationWithGemini({ hint, language });
    res.json({ prefill });
  } catch (err) {
    if (err instanceof GeminiAssistantError) {
      return res.status(err.httpStatus).json({ error: err.message, code: err.code });
    }
    return res.status(502).json({ error: 'AI प्रिफिल असफल भयो।' });
  }
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

cooperativesRouter.post('/register', rateLimit('coop_reg', 10, 15 * 60 * 1000), async (req, res) => {
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
  const cleanEmail = contactEmail ? String(contactEmail).trim().toLowerCase() : null;
  const cleanRegNo = String(registrationNumber).trim();
  const baseSlug = slugify(String(requestedSlug || requestedStoreName || nameEn)) || `coop-${Date.now()}`;
  const uniqueSlug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;

  const authUser = req.authUser || null;
  const isUpgradingBuyer = Boolean(authUser);

  if (authUser && authUser.role !== 'buyer') {
    return res.status(403).json({
      error:
        'तपाईंको लगइन खाता पहिले नै सहकारी वा एडमिन भूमिकामा आबद्ध छ। अर्को सहकारी दर्ता गर्न पहिले बाहिर निस्कनुहोस् (Sign Out)।',
      code: 'ALREADY_HAS_ROLE',
    });
  }

  let previousBuyerProfile: {
    full_name: string;
    full_name_ne: string | null;
    email: string | null;
    phone: string | null;
    phone_verified_at: string | null;
  } | null = null;

  if (authUser) {
    const [{ data: existingOwned }, { data: existingStaff }, { data: currentProfile }] = await Promise.all([
      sb.from('cooperatives').select('id').eq('owner_user_id', authUser.id).limit(1).maybeSingle(),
      sb.from('cooperative_staff').select('id').eq('user_id', authUser.id).eq('is_active', true).limit(1).maybeSingle(),
      sb
        .from('profiles')
        .select('full_name, full_name_ne, email, phone, role, phone_verified_at')
        .eq('id', authUser.id)
        .maybeSingle(),
    ]);

    if (existingOwned || existingStaff || !currentProfile || currentProfile.role !== 'buyer') {
      return res.status(403).json({
        error: 'तपाईंको खाता पहिले नै अर्को सहकारी संस्थासँग आबद्ध छ।',
        code: 'ALREADY_HAS_COOPERATIVE',
      });
    }

    let verifiedByRegisteredPhoneOtp = false;
    const passwordValid = await verifySupabaseUserPassword(authUser.id, String(password));
    if (!passwordValid) {
      if (otpCode && currentProfile.phone && currentProfile.phone === normalizedPhone) {
        const otpOwnershipCheck = await verifyOtpCode({
          phone: normalizedPhone,
          purpose: 'coop_registration',
          code: String(otpCode),
        });
        if (otpOwnershipCheck.valid) {
          verifiedByRegisteredPhoneOtp = true;
        }
      }

      if (!verifiedByRegisteredPhoneOtp) {
        return res.status(403).json({
          error:
            'तपाईंको हालको खाता पासवर्ड मिलेन। कृपया सही पासवर्ड राख्नुहोस्, पासवर्ड रिसेट गर्नुहोस्, वा दर्ता मोबाइलमा OTP प्रमाणित गरी पेश गर्नुहोस्।',
          code: 'INVALID_ACCOUNT_PASSWORD',
        });
      }
    }

    previousBuyerProfile = {
      full_name: currentProfile.full_name,
      full_name_ne: currentProfile.full_name_ne,
      email: currentProfile.email,
      phone: currentProfile.phone,
      phone_verified_at: currentProfile.phone_verified_at,
    };
    if (verifiedByRegisteredPhoneOtp) {
      body.__verifiedByRegisteredPhoneOtp = true;
    }
  }

  // Pre-check duplicate cooperative registration number
  const { data: dupReg } = await sb
    .from('cooperatives')
    .select('id')
    .eq('registration_number', cleanRegNo)
    .limit(1)
    .maybeSingle();

  if (dupReg) {
    return res.status(400).json({
      error: 'यो सहकारी दर्ता नम्बर पहिले नै अर्को सहकारीमा दर्ता भइसकेको छ।',
      code: 'DUPLICATE_REG_NUMBER',
    });
  }

  // Pre-check duplicate phone or email across profiles
  let phoneConflictQuery = sb.from('profiles').select('id').eq('phone', normalizedPhone).limit(1);
  if (authUser) {
    phoneConflictQuery = phoneConflictQuery.neq('id', authUser.id);
  }
  const { data: phoneConflict } = await phoneConflictQuery.maybeSingle();

  let emailConflict: { id: string } | null = null;
  if (cleanEmail) {
    let emailConflictQuery = sb.from('profiles').select('id').ilike('email', cleanEmail).limit(1);
    if (authUser) {
      emailConflictQuery = emailConflictQuery.neq('id', authUser.id);
    }
    const { data } = await emailConflictQuery.maybeSingle();
    emailConflict = data;
  }

  if (phoneConflict || emailConflict) {
    if (authUser) {
      return res.status(400).json({
        error: 'तपाईंले प्रविष्ट गर्नुभएको मोबाइल नम्बर वा इमेल अर्को खातामा दर्ता भइसकेको छ।',
        code: 'DUPLICATE_CONTACT',
      });
    }
    return res.status(409).json({
      error:
        'यो मोबाइल नम्बर वा इमेल पहिले नै खातामा दर्ता भइसकेको छ। यदि तपाईंले पहिले क्रेता (Buyer) खाता खोल्नुभएको हो भने, पहिले सोही खातामा लगइन गरी यही पेजबाट सहकारी खातामा स्तरोन्नति (Upgrade) गर्न सक्नुहुन्छ।',
      code: 'EXISTING_ACCOUNT_LOGIN_TO_UPGRADE',
    });
  }

  let initialStatus: 'pending_otp' | 'pending_review' = 'pending_otp';
  let otpVerifiedAt: string | null = null;
  if (body.__verifiedByRegisteredPhoneOtp) {
    initialStatus = 'pending_review';
    otpVerifiedAt = new Date().toISOString();
  } else if (otpCode) {
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
    if (isUpgradingBuyer && authUser && previousBuyerProfile) {
      userId = authUser.id;
      const nextPhone = previousBuyerProfile.phone || normalizedPhone;
      const nextEmail = previousBuyerProfile.email || cleanEmail;

      const { error: upgradeProfErr } = await sb
        .from('profiles')
        .update({
          role: 'cooperative_admin',
          full_name: String(authorizedRepName).trim(),
          full_name_ne: String(authorizedRepName).trim(),
          phone: nextPhone,
          email: nextEmail,
          ...(otpVerifiedAt && nextPhone === normalizedPhone ? { phone_verified_at: otpVerifiedAt } : {}),
        })
        .eq('id', userId)
        .eq('role', 'buyer');

      if (upgradeProfErr) {
        throw new Error(upgradeProfErr.code === '23505' ? 'DUPLICATE_USER' : upgradeProfErr.message);
      }

      await sb.auth.admin.updateUserById(userId, {
        user_metadata: {
          full_name: String(authorizedRepName).trim(),
          role: 'cooperative_admin',
        },
        ...(otpVerifiedAt ? { phone_confirm: true } : {}),
        ...(body.__verifiedByRegisteredPhoneOtp ? { password: String(password) } : {}),
      });
    } else {
      const createdUser = await createSupabaseAuthUser({
        email: cleanEmail,
        phone: normalizedPhone,
        password: String(password),
        fullName: String(authorizedRepName).trim(),
        fullNameNe: String(authorizedRepName).trim(),
        role: 'cooperative_admin',
        phoneVerifiedAt: otpVerifiedAt,
      });
      userId = createdUser.id;
    }

    const { data: coopRow, error: coopErr } = await sb
      .from('cooperatives')
      .insert({
        owner_user_id: userId,
        slug: uniqueSlug,
        name_ne: String(nameNe).trim(),
        name_en: String(nameEn).trim(),
        registration_number: cleanRegNo,
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
        contact_email: cleanEmail,
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
      throw new Error(coopErr?.code === '23505' ? 'DUPLICATE_REG_NUMBER' : coopErr?.message || 'Coop insert failed');
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
      reason: isUpgradingBuyer
        ? initialStatus === 'pending_review'
          ? 'Upgraded from buyer account & OTP verified'
          : 'Upgraded from buyer account awaiting OTP verification'
        : initialStatus === 'pending_review'
        ? 'OTP verified during registration'
        : 'Registered awaiting OTP verification',
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
      contact_email: cleanEmail,
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

    const cleanCoopNameNe = String(nameNe).trim();
    const cleanCoopNameEn = String(nameEn).trim();
    const cleanDistrict = String(district).trim();
    await notifySuperAdmins({
      type: initialStatus === 'pending_review' ? 'coop_pending_review' : 'coop_registered',
      titleNe:
        initialStatus === 'pending_review'
          ? 'नयाँ सहकारी स्वीकृति अनुरोध'
          : 'नयाँ सहकारी दर्ता (OTP बाँकी)',
      titleEn:
        initialStatus === 'pending_review'
          ? 'New Cooperative Approval Request'
          : 'New Cooperative Registered (OTP Pending)',
      bodyNe: `${cleanCoopNameNe} (${cleanDistrict}) दर्ता भएको छ${initialStatus === 'pending_review' ? ' र समीक्षाको लागि प्रतीक्षारत छ।' : ' (मोबाइल OTP प्रतीक्षारत)।'}`,
      bodyEn: `${cleanCoopNameEn} (${cleanDistrict}) registered (${initialStatus}).`,
      actionUrl: '/super-admin?tab=cooperatives',
      smsText: `Sahakari Bazar Alert: New Coop ${cleanCoopNameEn} (${normalizedPhone}) registered.`,
      smsPurpose: 'admin_alert_coop_registered',
      cooperativeId: coopId,
    });

    await writeAuditLog({
      actorUserId: userId,
      actorRole: 'cooperative_admin',
      cooperativeId: coopId,
      action: isUpgradingBuyer ? 'buyer_upgraded_to_cooperative' : 'cooperative_registered',
      entityType: 'cooperative',
      entityId: coopId,
      metadata: { status: initialStatus, registrationNumber: cleanRegNo, upgradedFromBuyer: isUpgradingBuyer },
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
    res.status(201).json({ cooperative: coopRow, otpResult, upgradedFromBuyer: isUpgradingBuyer });
  } catch (err) {
    if (userId && !coopId) {
      if (isUpgradingBuyer && previousBuyerProfile) {
        await sb
          .from('profiles')
          .update({
            role: 'buyer',
            full_name: previousBuyerProfile.full_name,
            full_name_ne: previousBuyerProfile.full_name_ne,
            phone: previousBuyerProfile.phone,
            email: previousBuyerProfile.email,
            phone_verified_at: previousBuyerProfile.phone_verified_at,
          })
          .eq('id', userId);
        await sb.auth.admin.updateUserById(userId, {
          user_metadata: {
            full_name: previousBuyerProfile.full_name,
            role: 'buyer',
          },
        });
      } else {
        await sb.auth.admin.deleteUser(userId);
      }
    }
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'DUPLICATE_REG_NUMBER') {
      return res.status(400).json({
        error: 'यो सहकारी दर्ता नम्बर पहिले नै अर्को सहकारीमा दर्ता भइसकेको छ।',
        code: 'DUPLICATE_REG_NUMBER',
      });
    }
    if (msg === 'DUPLICATE_USER' || msg === 'DUPLICATE' || msg.includes('duplicate')) {
      return res.status(isUpgradingBuyer ? 400 : 409).json({
        error: isUpgradingBuyer
          ? 'यो मोबाइल नम्बर वा इमेल अर्को खातामा दर्ता भइसकेको छ।'
          : 'यो मोबाइल नम्बर वा इमेल पहिले नै खातामा दर्ता भइसकेको छ। यदि तपाईंले पहिले क्रेता (Buyer) खाता खोल्नुभएको हो भने, पहिले सोही खातामा लगइन गरी यही पेजबाट सहकारी खातामा स्तरोन्नति (Upgrade) गर्न सक्नुहुन्छ।',
        code: isUpgradingBuyer ? 'DUPLICATE_CONTACT' : 'EXISTING_ACCOUNT_LOGIN_TO_UPGRADE',
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

  await notifySuperAdmins({
    type: 'coop_pending_review',
    titleNe: 'सहकारी OTP प्रमाणित — समीक्षा तयार',
    titleEn: 'Cooperative OTP Verified — Ready for Review',
    bodyNe: `${coop.name_ne} (${coop.district}) ले मोबाइल OTP प्रमाणित गर्यो र स्वीकृतिको प्रतीक्षामा छ।`,
    bodyEn: `${coop.name_en} (${coop.district}) verified OTP and awaits approval.`,
    actionUrl: '/super-admin?tab=cooperatives',
    cooperativeId: coop.id,
  });

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
