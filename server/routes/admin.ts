import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db.ts';
import { requireSuperAdmin, writeAuditLog } from '../auth.ts';
import { isAkashSmsConfigured, sendAkashSms } from '../akash-sms.ts';

export const adminRouter = Router();

adminRouter.use(requireSuperAdmin);

adminRouter.get('/overview', (_req, res) => {
  const coopCounts = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status IN ('pending_review','pending_otp') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
       FROM cooperatives`
    )
    .get();

  const subCounts = db
    .prepare(
      `SELECT
        SUM(CASE WHEN status IN ('trial','active') AND ends_at > datetime('now') THEN 1 ELSE 0 END) AS active_subs,
        SUM(CASE WHEN status = 'expired' OR ends_at <= datetime('now') THEN 1 ELSE 0 END) AS expired_subs
       FROM subscriptions`
    )
    .get();

  const marketplaceStats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE status != 'archived') AS total_products,
        (SELECT COUNT(*) FROM orders) AS total_orders,
        (SELECT COUNT(*) FROM orders WHERE is_guest = 1) AS guest_orders,
        (SELECT COUNT(*) FROM users WHERE role = 'buyer') AS registered_buyers,
        (SELECT COALESCE(SUM(total_npr), 0) FROM orders WHERE status NOT IN ('cancelled','refunded')) AS gmv_npr,
        (SELECT COALESCE(SUM(amount_npr), 0) FROM subscription_payments WHERE status = 'verified') AS sub_revenue_npr`
    )
    .get();

  const mrrRow = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN s.billing_cycle = 'annual' THEN sp.annual_price_npr / 12.0 ELSE sp.monthly_price_npr END), 0) AS mrr_npr
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.status = 'active' AND s.ends_at > datetime('now')`
    )
    .get() as { mrr_npr: number };

  const recentAudits = db
    .prepare(
      `SELECT al.*, u.full_name AS actor_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       ORDER BY al.created_at DESC LIMIT 20`
    )
    .all();

  res.json({
    coopCounts,
    subCounts,
    marketplaceStats,
    mrrNpr: Math.round(mrrRow.mrr_npr),
    recentAudits,
    smsConfigured: isAkashSmsConfigured(),
  });
});

// Cooperatives Administration
adminRouter.get('/cooperatives', (_req, res) => {
  const cooperatives = db
    .prepare(
      `SELECT c.*, u.full_name AS owner_name, u.email AS owner_email, u.phone AS owner_phone,
              s.store_name_ne, s.store_name_en, s.is_published,
              sub.id AS subscription_id, sub.status AS subscription_status, sub.ends_at AS subscription_ends_at,
              sp.id AS plan_id, sp.name_ne AS plan_name_ne, sp.name_en AS plan_name_en
       FROM cooperatives c
       JOIN users u ON u.id = c.owner_user_id
       LEFT JOIN stores s ON s.cooperative_id = c.id
       LEFT JOIN subscriptions sub ON sub.id = (
         SELECT id FROM subscriptions WHERE cooperative_id = c.id ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN subscription_plans sp ON sp.id = sub.plan_id
       ORDER BY CASE WHEN c.status = 'pending_review' THEN 0 ELSE 1 END, c.created_at DESC`
    )
    .all() as Record<string, unknown>[];

  const enriched = cooperatives.map((c) => ({
    ...c,
    documents: db.prepare(`SELECT * FROM cooperative_documents WHERE cooperative_id = ?`).all(c.id),
    history: db.prepare(`SELECT * FROM cooperative_status_history WHERE cooperative_id = ? ORDER BY created_at DESC`).all(c.id),
  }));

  res.json({ cooperatives: enriched });
});

adminRouter.post('/cooperatives/:id/decision', async (req, res) => {
  const { status, reason, planId, trialDays } = req.body || {};
  const allowed = ['approved', 'rejected', 'suspended', 'inactive'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'अमान्य स्थिति।' });
  }

  const coop = db.prepare(`SELECT * FROM cooperatives WHERE id = ?`).get(req.params.id) as
    | { id: string; status: string; owner_user_id: string; contact_phone: string; name_ne: string; name_en: string }
    | undefined;
  if (!coop) return res.status(404).json({ error: 'सहकारी फेला परेन।' });

  db.transaction(() => {
    db.prepare(
      `UPDATE cooperatives SET
        status = ?,
        rejection_reason = ?,
        approved_at = CASE WHEN ? = 'approved' THEN datetime('now') ELSE approved_at END,
        approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(status, reason || null, status, status, req.authUser!.id, coop.id);

    db.prepare(
      `INSERT INTO cooperative_status_history (id, cooperative_id, from_status, to_status, reason, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), coop.id, coop.status, status, reason || `Admin decision: ${status}`, req.authUser!.id);

    if (status === 'approved') {
      // Activate initial subscription (Free Trial or selected plan)
      const existingSub = db
        .prepare(`SELECT id FROM subscriptions WHERE cooperative_id = ? AND status IN ('trial','active') AND ends_at > datetime('now')`)
        .get(coop.id);
      if (!existingSub) {
        const chosenPlan = (planId
          ? db.prepare(`SELECT * FROM subscription_plans WHERE id = ?`).get(planId)
          : db.prepare(`SELECT * FROM subscription_plans WHERE code = 'free_trial' LIMIT 1`).get()) as
          | { id: string; trial_days: number }
          | undefined;

        if (chosenPlan) {
          const days = Number(trialDays || chosenPlan.trial_days || 30);
          db.prepare(
            `INSERT INTO subscriptions (id, cooperative_id, plan_id, billing_cycle, status, starts_at, ends_at, assigned_by)
             VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', ?), ?)`
          ).run(
            crypto.randomUUID(),
            coop.id,
            chosenPlan.id,
            days > 0 && chosenPlan.trial_days > 0 ? 'trial' : 'monthly',
            days > 0 && chosenPlan.trial_days > 0 ? 'trial' : 'active',
            `+${days} days`,
            req.authUser!.id
          );
        }
      }
      db.prepare(`UPDATE stores SET is_published = 1, published_at = COALESCE(published_at, datetime('now')) WHERE cooperative_id = ?`).run(
        coop.id
      );
      db.prepare(`UPDATE cooperative_documents SET verified_status = 'verified', verified_by = ?, verified_at = datetime('now') WHERE cooperative_id = ?`).run(
        req.authUser!.id,
        coop.id
      );
    }

    db.prepare(
      `INSERT INTO notifications (id, cooperative_id, recipient_user_id, type, title_ne, title_en, body_ne, body_en, action_url)
       VALUES (?, ?, ?, 'coop_decision', ?, ?, ?, ?, '/cooperative')`
    ).run(
      crypto.randomUUID(),
      coop.id,
      coop.owner_user_id,
      status === 'approved' ? 'सहकारी स्वीकृत भयो!' : 'सहकारी स्थिति अद्यावधिक',
      status === 'approved' ? 'Cooperative Approved!' : 'Cooperative Status Updated',
      `${coop.name_ne} को स्थिति "${status}" मा अद्यावधिक भयो।`,
      `${coop.name_en} status updated to "${status}".`
    );

    writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: 'super_admin',
      cooperativeId: coop.id,
      action: `cooperative_${status}`,
      entityType: 'cooperative',
      entityId: coop.id,
      metadata: { reason },
      ipAddress: req.ip,
    });
  })();

  if (coop.contact_phone) {
    await sendAkashSms({
      to: coop.contact_phone,
      text:
        status === 'approved'
          ? `बधाई छ! तपाईंको सहकारी "${coop.name_ne}" सहकारी बजारमा स्वीकृत र प्रकाशित भएको छ।`
          : `सहकारी बजार सूचना: तपाईंको सहकारी स्थिति "${status}" मा अद्यावधिक गरिएको छ।`,
      purpose: 'cooperative_decision',
      cooperativeId: coop.id,
    });
  }

  res.json({ ok: true });
});

adminRouter.patch('/cooperatives/:id/featured', (req, res) => {
  db.prepare(`UPDATE cooperatives SET is_featured = ? WHERE id = ?`).run(req.body?.isFeatured ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

adminRouter.post('/cooperatives/:id/assign-subscription', (req, res) => {
  const { planId, billingCycle, extendDays } = req.body || {};
  const plan = db.prepare(`SELECT * FROM subscription_plans WHERE id = ?`).get(planId);
  if (!plan) return res.status(404).json({ error: 'योजना फेला परेन।' });

  const days = Number(extendDays || (billingCycle === 'annual' ? 365 : 30));
  db.transaction(() => {
    db.prepare(`UPDATE subscriptions SET status = 'cancelled' WHERE cooperative_id = ? AND status IN ('trial','active')`).run(
      req.params.id
    );
    db.prepare(
      `INSERT INTO subscriptions (id, cooperative_id, plan_id, billing_cycle, status, starts_at, ends_at, assigned_by)
       VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now', ?), ?)`
    ).run(crypto.randomUUID(), req.params.id, planId, billingCycle || 'monthly', `+${days} days`, req.authUser!.id);
    writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: 'super_admin',
      cooperativeId: req.params.id,
      action: 'subscription_assigned',
      entityType: 'subscription',
      entityId: planId,
      metadata: { days, billingCycle },
      ipAddress: req.ip,
    });
  })();
  res.json({ ok: true });
});

// Subscription Plans & Payments
adminRouter.get('/plans', (_req, res) => {
  const plans = db.prepare(`SELECT * FROM subscription_plans ORDER BY sort_order ASC`).all();
  const payments = db
    .prepare(
      `SELECT sp.*, c.name_ne AS cooperative_name_ne, c.name_en AS cooperative_name_en,
              pl.name_ne AS plan_name_ne, pl.name_en AS plan_name_en
       FROM subscription_payments sp
       JOIN cooperatives c ON c.id = sp.cooperative_id
       JOIN subscription_plans pl ON pl.id = sp.plan_id
       ORDER BY sp.created_at DESC`
    )
    .all();
  res.json({ plans, payments });
});

adminRouter.post('/plans', (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.nameNe || !b.nameEn) {
    return res.status(400).json({ error: 'योजना कोड र नाम आवश्यक छ।' });
  }
  const id = crypto.randomUUID();
  try {
    db.prepare(
      `INSERT INTO subscription_plans (id, code, name_ne, name_en, description_ne, description_en, monthly_price_npr, annual_price_npr, trial_days, max_products, max_staff, max_storage_mb, features_json, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      String(b.code).trim().toLowerCase(),
      b.nameNe,
      b.nameEn,
      b.descriptionNe || '',
      b.descriptionEn || '',
      Number(b.monthlyPriceNpr || 0),
      Number(b.annualPriceNpr || 0),
      Number(b.trialDays || 0),
      Number(b.maxProducts || 25),
      Number(b.maxStaff || 3),
      Number(b.maxStorageMb || 500),
      JSON.stringify(b.features || {}),
      Number(b.sortOrder || 10)
    );
    res.status(201).json({ id });
  } catch {
    res.status(400).json({ error: 'योजना कोड पहिले नै छ।' });
  }
});

adminRouter.post('/subscription-payments/:id/verify', (req, res) => {
  const { decision } = req.body || {};
  const payment = db.prepare(`SELECT * FROM subscription_payments WHERE id = ?`).get(req.params.id) as
    | { id: string; cooperative_id: string; plan_id: string; billing_cycle: string }
    | undefined;
  if (!payment) return res.status(404).json({ error: 'भुक्तानी फेला परेन।' });

  const status = decision === 'verified' ? 'verified' : 'rejected';
  db.transaction(() => {
    db.prepare(
      `UPDATE subscription_payments SET status = ?, verified_by = ?, verified_at = datetime('now') WHERE id = ?`
    ).run(status, req.authUser!.id, payment.id);

    if (status === 'verified') {
      const days = payment.billing_cycle === 'annual' ? 365 : 30;
      db.prepare(`UPDATE subscriptions SET status = 'cancelled' WHERE cooperative_id = ? AND status IN ('trial','active')`).run(
        payment.cooperative_id
      );
      db.prepare(
        `INSERT INTO subscriptions (id, cooperative_id, plan_id, billing_cycle, status, starts_at, ends_at, assigned_by)
         VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now', ?), ?)`
      ).run(
        crypto.randomUUID(),
        payment.cooperative_id,
        payment.plan_id,
        payment.billing_cycle,
        `+${days} days`,
        req.authUser!.id
      );
    }
  })();

  res.json({ ok: true });
});

// Global Marketplace & Product Moderation
adminRouter.get('/marketplace-controls', (_req, res) => {
  const categories = db.prepare(`SELECT * FROM global_categories ORDER BY sort_order ASC`).all();
  const products = db
    .prepare(
      `SELECT p.*, c.name_ne AS cooperative_name_ne, c.name_en AS cooperative_name_en,
              (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC LIMIT 1) AS image_url
       FROM products p
       JOIN cooperatives c ON c.id = p.cooperative_id
       ORDER BY p.created_at DESC LIMIT 100`
    )
    .all();
  const branding = db.prepare(`SELECT value_json FROM platform_settings WHERE key = 'branding'`).get() as
    | { value_json: string }
    | undefined;
  res.json({
    categories,
    products,
    branding: branding ? JSON.parse(branding.value_json) : {},
  });
});

adminRouter.post('/categories', (req, res) => {
  const { nameNe, nameEn, slug, descriptionNe, descriptionEn } = req.body || {};
  if (!nameNe || !nameEn) return res.status(400).json({ error: 'नेपाली र अंग्रेजी नाम आवश्यक छ।' });
  const id = crypto.randomUUID();
  const safeSlug =
    slug ||
    String(nameEn)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  db.prepare(
    `INSERT INTO global_categories (id, slug, name_ne, name_en, description_ne, description_en) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, `${safeSlug}-${crypto.randomBytes(2).toString('hex')}`, nameNe, nameEn, descriptionNe || '', descriptionEn || '');
  res.status(201).json({ id });
});

adminRouter.patch('/products/:id/moderate', (req, res) => {
  const { isProhibited, prohibitionReason, isPlatformFeatured } = req.body || {};
  db.prepare(
    `UPDATE products SET
      is_prohibited = COALESCE(?, is_prohibited),
      prohibition_reason = COALESCE(?, prohibition_reason),
      is_platform_featured = COALESCE(?, is_platform_featured),
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    isProhibited !== undefined ? (isProhibited ? 1 : 0) : null,
    prohibitionReason ?? null,
    isPlatformFeatured !== undefined ? (isPlatformFeatured ? 1 : 0) : null,
    req.params.id
  );
  writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: 'super_admin',
    action: 'product_moderated',
    entityType: 'product',
    entityId: req.params.id,
    metadata: { isProhibited, isPlatformFeatured },
    ipAddress: req.ip,
  });
  res.json({ ok: true });
});

adminRouter.put('/settings/branding', (req, res) => {
  db.prepare(
    `INSERT INTO platform_settings (key, value_json, updated_by, updated_at)
     VALUES ('branding', ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = datetime('now')`
  ).run(JSON.stringify(req.body || {}), req.authUser!.id);
  res.json({ ok: true });
});

// Users, Support, Audit, Login & SMS Logs
adminRouter.get('/users', (_req, res) => {
  const users = db
    .prepare(`SELECT id, full_name, full_name_ne, email, phone, role, is_active, last_login_at, created_at FROM users ORDER BY created_at DESC LIMIT 100`)
    .all();
  res.json({ users });
});

adminRouter.patch('/users/:id/toggle-active', (req, res) => {
  if (req.params.id === req.authUser!.id) {
    return res.status(400).json({ error: 'आफ्नै खाता निष्क्रिय गर्न मिल्दैन।' });
  }
  db.prepare(`UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

adminRouter.get('/logs', (_req, res) => {
  const auditLogs = db
    .prepare(
      `SELECT al.*, u.full_name AS actor_name
       FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id
       ORDER BY al.created_at DESC LIMIT 80`
    )
    .all();
  const loginActivities = db.prepare(`SELECT * FROM login_activities ORDER BY created_at DESC LIMIT 60`).all();
  const smsLogs = db.prepare(`SELECT * FROM sms_logs ORDER BY created_at DESC LIMIT 60`).all();
  const tickets = (
    db
      .prepare(
        `SELECT st.*, c.name_ne AS cooperative_name_ne, c.name_en AS cooperative_name_en
         FROM support_tickets st
         LEFT JOIN cooperatives c ON c.id = st.cooperative_id
         ORDER BY st.updated_at DESC`
      )
      .all() as Record<string, unknown>[]
  ).map((t) => ({
      ...t,
      messages: db.prepare(`SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC`).all(t.id),
    }));

  res.json({ auditLogs, loginActivities, smsLogs, tickets, smsConfigured: isAkashSmsConfigured() });
});

adminRouter.post('/tickets/:id/reply', (req, res) => {
  const { message, status } = req.body || {};
  if (!message) return res.status(400).json({ error: 'सन्देश आवश्यक छ।' });
  db.transaction(() => {
    db.prepare(
      `INSERT INTO support_messages (id, ticket_id, sender_user_id, sender_role, message)
       VALUES (?, ?, ?, 'super_admin', ?)`
    ).run(crypto.randomUUID(), req.params.id, req.authUser!.id, message);
    db.prepare(`UPDATE support_tickets SET status = COALESCE(?, 'in_progress'), updated_at = datetime('now') WHERE id = ?`).run(
      status || null,
      req.params.id
    );
  })();
  res.json({ ok: true });
});

adminRouter.get('/integrations-status', async (_req, res) => {
  const { verifySupabaseConnection } = await import('../supabase-admin.ts');
  const supabase = await verifySupabaseConnection();
  res.json({
    supabase,
    akashSms: {
      configured: isAkashSmsConfigured(),
      endpoint:
        process.env.AAKASH_SMS_ENDPOINT ||
        process.env.AKASH_SMS_API_URL ||
        'https://sms.aakashsms.com/sms/v3/send',
    },
  });
});

adminRouter.post('/test-sms', async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'परीक्षण मोबाइल नम्बर आवश्यक छ।' });
  const result = await sendAkashSms({
    to: String(phone),
    text: String(message || 'सहकारी बजार: Akash SMS जडान परीक्षण सफल।'),
    purpose: 'admin_test_sms',
  });
  res.status(result.sent ? 200 : 400).json(result);
});

