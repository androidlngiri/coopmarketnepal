import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { db } from '../db.ts';
import { createSession, hashPassword, rateLimit, requireAuth, writeAuditLog } from '../auth.ts';
import { issueOtp, normalizeNepalPhone, verifyOtpCode } from '../akash-sms.ts';

export const cooperativesRouter = Router();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function saveBase64Upload(dataUrl: string, prefix: string): { url: string; size: number } | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('फाइल साइज ५ MB भन्दा कम हुनुपर्छ।');
  }
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1];
  const fileName = `${prefix}-${crypto.randomUUID()}.${ext}`;
  const uploadDir = path.join(process.cwd(), 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, fileName), buffer);
  return { url: `/uploads/${fileName}`, size: buffer.length };
}

cooperativesRouter.post('/register', rateLimit('coop_reg', 6, 15 * 60 * 1000), async (req, res) => {
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

  // Optional immediate OTP verification if code was sent during step 3 of wizard
  let initialStatus: 'pending_otp' | 'pending_review' = 'pending_otp';
  let otpVerifiedAt: string | null = null;
  if (otpCode) {
    const otpCheck = verifyOtpCode({
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
      savedLogoUrl = saveBase64Upload(String(logoBase64), 'coop-logo')?.url ?? null;
    }
    if (documentBase64 && String(documentBase64).startsWith('data:')) {
      savedDoc = saveBase64Upload(String(documentBase64), 'coop-doc');
    }
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'फाइल अपलोड असफल।' });
  }

  const userId = crypto.randomUUID();
  const coopId = crypto.randomUUID();
  const storeId = crypto.randomUUID();

  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id, full_name, full_name_ne, email, phone, password_hash, role, preferred_language, phone_verified_at)
         VALUES (?, ?, ?, ?, ?, ?, 'cooperative_admin', 'ne', ?)`
      ).run(
        userId,
        String(authorizedRepName).trim(),
        String(authorizedRepName).trim(),
        contactEmail ? String(contactEmail).trim().toLowerCase() : null,
        normalizedPhone,
        hashPassword(String(password)),
        otpVerifiedAt
      );

      db.prepare(
        `INSERT INTO cooperatives (
          id, owner_user_id, slug, name_ne, name_en, registration_number, registration_authority,
          registration_date_ad, registration_date_bs, cooperative_type, pan_vat_number,
          province, district, municipality, ward_number, tole_address,
          contact_email, contact_phone, authorized_rep_name, authorized_rep_designation,
          logo_url, requested_store_name, status, otp_verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        coopId,
        userId,
        uniqueSlug,
        String(nameNe).trim(),
        String(nameEn).trim(),
        String(registrationNumber).trim(),
        String(registrationAuthority).trim(),
        String(registrationDateAd),
        registrationDateBs ? String(registrationDateBs) : null,
        String(cooperativeType || 'multipurpose'),
        panVatNumber ? String(panVatNumber).trim() : null,
        String(province),
        String(district),
        String(municipality).trim(),
        String(wardNumber).trim(),
        String(toleAddress).trim(),
        contactEmail ? String(contactEmail).trim().toLowerCase() : null,
        normalizedPhone,
        String(authorizedRepName).trim(),
        String(authorizedRepDesignation).trim(),
        savedLogoUrl,
        String(requestedStoreName).trim(),
        initialStatus,
        otpVerifiedAt
      );

      if (savedDoc) {
        db.prepare(
          `INSERT INTO cooperative_documents (id, cooperative_id, document_type, file_name, file_url, file_size_bytes, verified_status)
           VALUES (?, ?, 'registration_certificate', ?, ?, ?, 'pending')`
        ).run(
          crypto.randomUUID(),
          coopId,
          String(documentFileName || 'registration-certificate'),
          savedDoc.url,
          savedDoc.size
        );
      }

      db.prepare(
        `INSERT INTO cooperative_status_history (id, cooperative_id, from_status, to_status, reason, changed_by)
         VALUES (?, ?, NULL, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        coopId,
        initialStatus,
        initialStatus === 'pending_review' ? 'OTP verified during registration' : 'Registered awaiting OTP verification',
        userId
      );

      const defaultSections = JSON.stringify([
        { id: 'hero', type: 'hero', visible: true, title_ne: 'हाम्रा उत्पादनहरू', title_en: 'Our Products' },
        { id: 'featured_products', type: 'featured_products', visible: true, title_ne: 'विशेष उत्पादनहरू', title_en: 'Featured Products' },
        { id: 'about', type: 'about', visible: true, title_ne: 'सहकारी परिचय', title_en: 'About Us' },
        { id: 'notice', type: 'notice', visible: true, title_ne: 'सूचना', title_en: 'Notices' },
      ]);

      db.prepare(
        `INSERT INTO stores (
          id, cooperative_id, store_name_ne, store_name_en, logo_url, banner_url,
          contact_phone, contact_email, address_text, sections_json, is_published
        ) VALUES (?, ?, ?, ?, ?, '/images/hero-nepal-cooperative.jpg', ?, ?, ?, ?, 0)`
      ).run(
        storeId,
        coopId,
        String(requestedStoreName).trim(),
        String(requestedStoreName).trim(),
        savedLogoUrl || '/images/hero-nepal-cooperative.jpg',
        normalizedPhone,
        contactEmail ? String(contactEmail).trim().toLowerCase() : null,
        `${municipality}-${wardNumber}, ${district}`,
        defaultSections
      );

      db.prepare(
        `INSERT INTO delivery_configs (id, cooperative_id, delivery_areas_json, default_fee_npr, free_delivery_threshold_npr, minimum_order_npr, pickup_enabled, pickup_address_ne)
         VALUES (?, ?, ?, 120, 2500, 300, 1, ?)`
      ).run(
        crypto.randomUUID(),
        coopId,
        JSON.stringify([district, 'काठमाडौँ उपत्यका']),
        `${toleAddress}, ${municipality}-${wardNumber}, ${district}`
      );

      // Notify super admins if ready for review
      if (initialStatus === 'pending_review') {
        const admins = db.prepare(`SELECT user_id FROM platform_administrators WHERE is_active = 1`).all() as {
          user_id: string;
        }[];
        for (const a of admins) {
          db.prepare(
            `INSERT INTO notifications (id, recipient_user_id, type, title_ne, title_en, body_ne, body_en, action_url)
             VALUES (?, ?, 'coop_pending_review', ?, ?, ?, ?, '/super-admin')`
          ).run(
            crypto.randomUUID(),
            a.user_id,
            'नयाँ सहकारी स्वीकृति अनुरोध',
            'New Cooperative Approval Request',
            `${nameNe} (${district}) समीक्षाको लागि प्रतीक्षारत छ।`,
            `${nameEn} (${district}) is awaiting verification.`
          );
        }
      }

      writeAuditLog({
        actorUserId: userId,
        actorRole: 'cooperative_admin',
        cooperativeId: coopId,
        action: 'cooperative_registered',
        entityType: 'cooperative',
        entityId: coopId,
        metadata: { status: initialStatus, registrationNumber },
        ipAddress: req.ip,
      });
    })();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      return res.status(400).json({
        error: 'यो दर्ता नम्बर, मोबाइल नम्बर वा इमेल पहिले नै दर्ता भइसकेको छ।',
      });
    }
    return res.status(500).json({ error: 'सहकारी दर्ता प्रक्रियामा त्रुटि भयो।' });
  }

  let otpResult = null;
  if (initialStatus === 'pending_otp') {
    otpResult = await issueOtp({
      phone: normalizedPhone,
      purpose: 'coop_registration',
      ipAddress: req.ip,
    });
  }

  createSession(userId, req, res);
  const cooperative = db.prepare(`SELECT * FROM cooperatives WHERE id = ?`).get(coopId);

  res.status(201).json({
    cooperative,
    otpResult,
  });
});

cooperativesRouter.post('/verify-otp', requireAuth, (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'OTP कोड आवश्यक छ।' });
  }

  const coop = db
    .prepare(`SELECT * FROM cooperatives WHERE owner_user_id = ? LIMIT 1`)
    .get(req.authUser!.id) as { id: string; contact_phone: string; status: string; name_ne: string; name_en: string; district: string } | undefined;

  if (!coop) {
    return res.status(404).json({ error: 'सहकारी फेला परेन।' });
  }

  const check = verifyOtpCode({
    phone: coop.contact_phone,
    purpose: 'coop_registration',
    code: String(code),
  });
  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE cooperatives SET status = 'pending_review', otp_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(coop.id);
    db.prepare(`UPDATE users SET phone_verified_at = datetime('now') WHERE id = ?`).run(req.authUser!.id);
    db.prepare(
      `INSERT INTO cooperative_status_history (id, cooperative_id, from_status, to_status, reason, changed_by)
       VALUES (?, ?, ?, 'pending_review', 'Mobile OTP verified', ?)`
    ).run(crypto.randomUUID(), coop.id, coop.status, req.authUser!.id);
  })();

  res.json({ ok: true, status: 'pending_review' });
});

cooperativesRouter.get('/my-status', requireAuth, (req, res) => {
  if (!req.authUser?.cooperative_id) {
    return res.json({ cooperative: null });
  }
  const cooperative = db.prepare(`SELECT * FROM cooperatives WHERE id = ?`).get(req.authUser.cooperative_id);
  const history = db
    .prepare(`SELECT * FROM cooperative_status_history WHERE cooperative_id = ? ORDER BY created_at DESC`)
    .all(req.authUser.cooperative_id);
  const documents = db
    .prepare(`SELECT * FROM cooperative_documents WHERE cooperative_id = ?`)
    .all(req.authUser.cooperative_id);
  res.json({ cooperative, history, documents });
});
