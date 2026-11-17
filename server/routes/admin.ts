import { Router } from 'express';
import { requireSuperAdmin, writeAuditLog } from '../auth.ts';
import { isAkashSmsConfigured, sendAkashSms } from '../akash-sms.ts';
import { getGeminiModel, isGeminiConfigured } from '../gemini.ts';
import {
  parseJsonField,
  requireSupabaseAdmin,
  verifySupabaseConnection,
  verifySupabaseUserPassword,
} from '../supabase-admin.ts';
import { resolveDocumentAccessUrl } from '../storage.ts';
import {
  createVerifiedBackupSnapshot,
  executeSafeCleanup,
  previewCleanupTargets,
  restoreFromBackup,
  runMaintenanceScan,
  type CleanupMode,
  type TargetRef,
} from '../services/maintenance.ts';

export const adminRouter = Router();

adminRouter.use(requireSuperAdmin);

adminRouter.get('/overview', async (_req, res) => {
  const sb = requireSupabaseAdmin();

  const [metricsRes, auditsRes] = await Promise.all([
    sb.rpc('get_admin_overview_metrics'),
    sb
      .from('audit_logs')
      .select('*, profiles:actor_user_id (full_name)')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const metrics = (metricsRes.data || {}) as Record<string, unknown>;
  const recentAudits = (auditsRes.data || []).map((al: Record<string, unknown>) => {
    const prof = (Array.isArray(al.profiles) ? al.profiles[0] : al.profiles) as { full_name?: string } | null;
    const { profiles: _p, ...rest } = al;
    return {
      ...rest,
      actor_name: prof?.full_name ?? null,
    };
  });

  res.json({
    coopCounts: metrics.coopCounts || {},
    subCounts: metrics.subCounts || {},
    marketplaceStats: metrics.marketplaceStats || {},
    mrrNpr: Number(metrics.mrrNpr || 0),
    recentAudits,
    smsConfigured: isAkashSmsConfigured(),
  });
});

// Cooperatives Administration
adminRouter.get('/cooperatives', async (_req, res) => {
  const sb = requireSupabaseAdmin();

  const { data: coops } = await sb
    .from('cooperatives')
    .select(
      `*,
       profiles:owner_user_id (full_name, email, phone),
       stores (store_name_ne, store_name_en, is_published),
       subscriptions (id, status, ends_at, created_at, subscription_plans (id, name_ne, name_en)),
       cooperative_documents (*),
       cooperative_status_history (*)`
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const enriched = await Promise.all(
    (coops || []).map(async (c: Record<string, unknown>) => {
      const owner = (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) as Record<string, unknown> | null;
      const store = (Array.isArray(c.stores) ? c.stores[0] : c.stores) as Record<string, unknown> | null;
      const subs = ((c.subscriptions as Array<Record<string, unknown>>) || []).sort(
        (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime()
      );
      const latestSub = subs[0];
      const latestPlan = latestSub
        ? ((Array.isArray(latestSub.subscription_plans)
            ? latestSub.subscription_plans[0]
            : latestSub.subscription_plans) as Record<string, unknown> | null)
        : null;

      const rawDocs = (c.cooperative_documents as Array<Record<string, unknown>>) || [];
      const documents = await Promise.all(
        rawDocs.map(async (d) => ({
          ...d,
          file_url: await resolveDocumentAccessUrl(String(d.file_url || '')),
        }))
      );
      const history = ((c.cooperative_status_history as Array<Record<string, unknown>>) || []).sort(
        (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime()
      );

      const {
        profiles: _p,
        stores: _st,
        subscriptions: _su,
        cooperative_documents: _cd,
        cooperative_status_history: _ch,
        ...rest
      } = c;

      return {
        ...rest,
        owner_name: owner?.full_name ?? null,
        owner_email: owner?.email ?? null,
        owner_phone: owner?.phone ?? null,
        store_name_ne: store?.store_name_ne ?? null,
        store_name_en: store?.store_name_en ?? null,
        is_published: store?.is_published ?? false,
        subscription_id: latestSub?.id ?? null,
        subscription_status: latestSub?.status ?? null,
        subscription_ends_at: latestSub?.ends_at ?? null,
        plan_id: latestPlan?.id ?? null,
        plan_name_ne: latestPlan?.name_ne ?? null,
        plan_name_en: latestPlan?.name_en ?? null,
        documents,
        history,
      };
    })
  );

  enriched.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const aPend = a.status === 'pending_review' ? 0 : 1;
    const bPend = b.status === 'pending_review' ? 0 : 1;
    return aPend - bPend;
  });

  res.json({ cooperatives: enriched });
});

adminRouter.post('/cooperatives/:id/decision', async (req, res) => {
  const { status, reason, planId, trialDays } = req.body || {};
  const allowed = ['approved', 'rejected', 'suspended', 'inactive'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'अमान्य स्थिति।' });
  }

  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('approve_or_reject_cooperative', {
    p_cooperative_id: req.params.id,
    p_decision: status,
    p_reason: reason || null,
    p_plan_id: planId || null,
    p_duration_days: Number(trialDays || 0),
    p_actor_user_id: req.authUser!.id,
  });

  if (error) {
    return res.status(error.message.includes('फेला परेन') ? 404 : 400).json({ error: error.message });
  }

  const coopInfo = (data || {}) as { contact_phone?: string; name_ne?: string; name_en?: string };
  const cleanCoopEn = String(coopInfo.name_en || coopInfo.name_ne || 'Cooperative').trim();
  const cleanCoopNe = String(coopInfo.name_ne || coopInfo.name_en || 'सहकारी').trim();

  await sb.from('notifications').insert({
    cooperative_id: req.params.id,
    type: `cooperative_${status}`,
    title_ne: status === 'approved' ? 'बधाई छ! सहकारी स्वीकृत भयो' : 'सहकारी खाता स्थिति अद्यावधिक',
    title_en: status === 'approved' ? 'Congratulations! Cooperative Approved' : 'Cooperative Status Updated',
    body_ne:
      status === 'approved'
        ? `तपाईंको सहकारी "${cleanCoopNe}" स्वीकृत भएको छ। अब उत्पादन र पसल प्रकाशित गर्न सक्नुहुन्छ।`
        : `तपाईंको सहकारी स्थिति "${status}" मा अद्यावधिक गरिएको छ।${reason ? ` कारण: ${reason}` : ''}`,
    body_en:
      status === 'approved'
        ? `"${cleanCoopEn}" is approved! You can now publish your store and products.`
        : `Your cooperative status was updated to "${status}".${reason ? ` Reason: ${reason}` : ''}`,
    action_url: '/cooperative?tab=overview',
  });

  if (coopInfo.contact_phone) {
    await sendAkashSms({
      to: coopInfo.contact_phone,
      text:
        status === 'approved'
          ? `Congrats! Coop ${cleanCoopEn} is approved & live on Sahakari Bazar.`
          : `Sahakari Bazar: Coop ${cleanCoopEn} status updated to ${status}.`,
      purpose: 'cooperative_decision',
      cooperativeId: req.params.id,
    });
  }

  res.json({ ok: true });
});

adminRouter.patch('/cooperatives/:id/featured', async (req, res) => {
  const sb = requireSupabaseAdmin();
  await sb.from('cooperatives').update({ is_featured: Boolean(req.body?.isFeatured) }).eq('id', req.params.id);
  res.json({ ok: true });
});

adminRouter.post('/cooperatives/:id/assign-subscription', async (req, res) => {
  const { planId, billingCycle, extendDays } = req.body || {};
  const sb = requireSupabaseAdmin();
  const { error } = await sb.rpc('assign_coop_subscription', {
    p_cooperative_id: req.params.id,
    p_plan_id: planId,
    p_billing_cycle: billingCycle || 'monthly',
    p_duration_days: Number(extendDays || 0),
    p_actor_user_id: req.authUser!.id,
  });
  if (error) {
    return res.status(404).json({ error: error.message });
  }
  res.json({ ok: true });
});

// Subscription Plans & Payments
adminRouter.get('/plans', async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const [plansRes, paysRes] = await Promise.all([
    sb.from('subscription_plans').select('*').order('sort_order', { ascending: true }),
    sb
      .from('subscription_payments')
      .select('*, cooperatives (name_ne, name_en), subscription_plans (name_ne, name_en)')
      .order('created_at', { ascending: false }),
  ]);

  const payments = (paysRes.data || []).map((sp: Record<string, unknown>) => {
    const coop = (Array.isArray(sp.cooperatives) ? sp.cooperatives[0] : sp.cooperatives) as Record<string, unknown> | null;
    const plan = (Array.isArray(sp.subscription_plans)
      ? sp.subscription_plans[0]
      : sp.subscription_plans) as Record<string, unknown> | null;
    const { cooperatives: _c, subscription_plans: _pl, ...rest } = sp;
    return {
      ...rest,
      cooperative_name_ne: coop?.name_ne ?? null,
      cooperative_name_en: coop?.name_en ?? null,
      plan_name_ne: plan?.name_ne ?? null,
      plan_name_en: plan?.name_en ?? null,
    };
  });

  res.json({ plans: plansRes.data || [], payments });
});

adminRouter.post('/plans', async (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.nameNe || !b.nameEn) {
    return res.status(400).json({ error: 'योजना कोड र नाम आवश्यक छ।' });
  }
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb
    .from('subscription_plans')
    .insert({
      code: String(b.code).trim().toLowerCase(),
      name_ne: b.nameNe,
      name_en: b.nameEn,
      description_ne: b.descriptionNe || '',
      description_en: b.descriptionEn || '',
      monthly_price_npr: Number(b.monthlyPriceNpr || 0),
      annual_price_npr: Number(b.annualPriceNpr || 0),
      trial_days: Number(b.trialDays || 0),
      max_products: Number(b.maxProducts || 25),
      max_staff: Number(b.maxStaff || 3),
      max_storage_mb: Number(b.maxStorageMb || 500),
      features_json: b.features || {},
      sort_order: Number(b.sortOrder || 10),
    })
    .select('id')
    .single();

  if (error) {
    return res.status(400).json({ error: 'योजना कोड पहिले नै छ।' });
  }
  res.status(201).json({ id: data.id });
});

adminRouter.post('/subscription-payments/:id/verify', async (req, res) => {
  const { decision } = req.body || {};
  const sb = requireSupabaseAdmin();
  const { error } = await sb.rpc('verify_subscription_payment', {
    p_payment_id: req.params.id,
    p_decision: decision || 'rejected',
    p_actor_user_id: req.authUser!.id,
  });
  if (error) {
    return res.status(404).json({ error: error.message });
  }
  res.json({ ok: true });
});

// Platform Settings, Global Categories & Read-Only Product Monitoring
adminRouter.get('/marketplace-controls', async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const [catsRes, prodsRes, brandRes] = await Promise.all([
    sb.from('global_categories').select('*').order('sort_order', { ascending: true }),
    sb
      .from('products')
      .select('*, cooperatives (name_ne, name_en, slug), global_categories (name_ne, name_en), product_images (image_url, is_primary)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
    sb.from('platform_settings').select('value_json').eq('key', 'branding').maybeSingle(),
  ]);

  const products = (prodsRes.data || []).map((p: Record<string, unknown>) => {
    const coop = (Array.isArray(p.cooperatives) ? p.cooperatives[0] : p.cooperatives) as Record<string, unknown> | null;
    const cat = (Array.isArray(p.global_categories) ? p.global_categories[0] : p.global_categories) as Record<string, unknown> | null;
    const imgs = (p.product_images as Array<{ image_url: string; is_primary?: boolean }>) || [];
    const { cooperatives: _c, global_categories: _gc, product_images: _pi, ...rest } = p;
    return {
      ...rest,
      ai_details_json: parseJsonField(p.ai_details_json, {}),
      seo_keywords_json: parseJsonField(p.seo_keywords_json, []),
      cooperative_name_ne: coop?.name_ne ?? null,
      cooperative_name_en: coop?.name_en ?? null,
      cooperative_slug: coop?.slug ?? null,
      category_name_ne: cat?.name_ne ?? null,
      category_name_en: cat?.name_en ?? null,
      image_url: imgs.find((i) => i.is_primary)?.image_url || imgs[0]?.image_url || null,
    };
  });

  res.json({
    categories: catsRes.data || [],
    products,
    branding: brandRes.data ? parseJsonField(brandRes.data.value_json, {}) : {},
  });
});

adminRouter.post('/categories', async (req, res) => {
  const { nameNe, nameEn, slug, descriptionNe, descriptionEn } = req.body || {};
  if (!nameNe || !nameEn) return res.status(400).json({ error: 'नेपाली र अंग्रेजी नाम आवश्यक छ।' });
  const sb = requireSupabaseAdmin();
  const safeSlug =
    slug ||
    String(nameEn)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const { data, error } = await sb
    .from('global_categories')
    .insert({
      slug: `${safeSlug}-${Math.random().toString(16).slice(2, 6)}`,
      name_ne: nameNe,
      name_en: nameEn,
      description_ne: descriptionNe || '',
      description_en: descriptionEn || '',
    })
    .select('id')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ id: data.id });
});

adminRouter.patch('/categories/:id/toggle', async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: existing } = await sb
    .from('global_categories')
    .select('id, is_active')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'वर्ग फेला परेन।' });
  const { error } = await sb
    .from('global_categories')
    .update({ is_active: !existing.is_active })
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, is_active: !existing.is_active });
});

adminRouter.get('/ai-usage', async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const [statsRes, recentRes] = await Promise.all([
    sb.rpc('get_platform_ai_usage_stats'),
    sb
      .from('ai_product_generations')
      .select(
        'id, cooperative_id, mode, product_name_input, language, generation_date_ktm, model, status, counts_toward_quota, error_message, prompt_tokens, output_tokens, created_at, cooperatives (name_ne, name_en)'
      )
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  if (statsRes.error) {
    return res.status(500).json({ error: statsRes.error.message });
  }

  const recentGenerations = (recentRes.data || []).map((row: Record<string, unknown>) => {
    const coop = (Array.isArray(row.cooperatives) ? row.cooperatives[0] : row.cooperatives) as Record<
      string,
      unknown
    > | null;
    const { cooperatives: _c, ...rest } = row;
    return {
      ...rest,
      cooperative_name_ne: coop?.name_ne ?? null,
      cooperative_name_en: coop?.name_en ?? null,
    };
  });

  res.json({
    stats: statsRes.data || {},
    recentGenerations,
    geminiConfigured: isGeminiConfigured(),
    model: getGeminiModel(),
  });
});

adminRouter.all('/products*', (_req, res) => {
  return res.status(403).json({
    error: 'व्यक्तिगत उत्पादन व्यवस्थापन सम्बन्धित सहकारी पसलबाट मात्र गर्न मिल्छ (Super Admin has read-only product monitoring).',
  });
});

adminRouter.put('/settings/branding', async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { error } = await sb.from('platform_settings').upsert(
    {
      key: 'branding',
      value_json: req.body || {},
      updated_by: req.authUser!.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Users, Support, Audit, Login & SMS Logs
adminRouter.get('/users', async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: users } = await sb
    .from('profiles')
    .select('id, full_name, full_name_ne, email, phone, role, is_active, last_login_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  res.json({ users: users || [] });
});

adminRouter.patch('/users/:id/toggle-active', async (req, res) => {
  if (req.params.id === req.authUser!.id) {
    return res.status(400).json({ error: 'आफ्नै खाता निष्क्रिय गर्न मिल्दैन।' });
  }
  const sb = requireSupabaseAdmin();
  const { data: u } = await sb.from('profiles').select('is_active').eq('id', req.params.id).maybeSingle();
  if (!u) return res.status(404).json({ error: 'प्रयोगकर्ता फेला परेन।' });
  await sb.from('profiles').update({ is_active: !u.is_active }).eq('id', req.params.id);
  res.json({ ok: true });
});

adminRouter.get('/logs', async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const [auditRes, loginRes, smsRes, ticketsRes] = await Promise.all([
    sb
      .from('audit_logs')
      .select('*, profiles:actor_user_id (full_name)')
      .order('created_at', { ascending: false })
      .limit(80),
    sb.from('login_activities').select('*').order('created_at', { ascending: false }).limit(60),
    sb.from('sms_logs').select('*').order('created_at', { ascending: false }).limit(60),
    sb
      .from('support_tickets')
      .select('*, cooperatives (name_ne, name_en), support_messages (*)')
      .order('updated_at', { ascending: false }),
  ]);

  const auditLogs = (auditRes.data || []).map((al: Record<string, unknown>) => {
    const prof = (Array.isArray(al.profiles) ? al.profiles[0] : al.profiles) as { full_name?: string } | null;
    const { profiles: _p, ...rest } = al;
    return { ...rest, actor_name: prof?.full_name ?? null };
  });

  const tickets = (ticketsRes.data || []).map((t: Record<string, unknown>) => {
    const coop = (Array.isArray(t.cooperatives) ? t.cooperatives[0] : t.cooperatives) as Record<string, unknown> | null;
    const msgs = ((t.support_messages as Array<Record<string, unknown>>) || []).sort(
      (a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime()
    );
    const { cooperatives: _c, support_messages: _sm, ...rest } = t;
    return {
      ...rest,
      cooperative_name_ne: coop?.name_ne ?? null,
      cooperative_name_en: coop?.name_en ?? null,
      messages: msgs,
    };
  });

  res.json({
    auditLogs,
    loginActivities: loginRes.data || [],
    smsLogs: smsRes.data || [],
    tickets,
    smsConfigured: isAkashSmsConfigured(),
  });
});

adminRouter.post('/tickets/:id/reply', async (req, res) => {
  const { message, status } = req.body || {};
  if (!message) return res.status(400).json({ error: 'सन्देश आवश्यक छ।' });
  const sb = requireSupabaseAdmin();

  await sb.from('support_messages').insert({
    ticket_id: req.params.id,
    sender_user_id: req.authUser!.id,
    sender_role: 'super_admin',
    message,
  });
  const { data: ticketRow } = await sb
    .from('support_tickets')
    .update({ status: status || 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('cooperative_id, subject')
    .maybeSingle();

  if (ticketRow?.cooperative_id) {
    await sb.from('notifications').insert({
      cooperative_id: ticketRow.cooperative_id,
      type: 'support_reply',
      title_ne: 'सहायता टिकटमा सुपर एडमिनको जवाफ',
      title_en: 'New Reply on Support Ticket',
      body_ne: `विषय "${String(ticketRow.subject || '')}" मा जवाफ आएको छ।`,
      body_en: `Super Admin replied to "${String(ticketRow.subject || '')}".`,
      action_url: '/cooperative?tab=support',
    });
  }

  res.json({ ok: true });
});

adminRouter.get('/integrations-status', async (_req, res) => {
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
    gemini: {
      configured: isGeminiConfigured(),
      model: getGeminiModel(),
    },
  });
});

adminRouter.post('/test-sms', async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'परीक्षण मोबाइल नम्बर आवश्यक छ।' });
  const result = await sendAkashSms({
    to: String(phone),
    text: String(message || 'Sahakari Bazar: Akash SMS connection test successful.'),
    purpose: 'admin_test_sms',
  });
  res.status(result.sent ? 200 : 400).json(result);
});

// System Data Cleanup & Maintenance Module (Super Admin only + Password Re-Auth for mutations)
adminRouter.get('/maintenance/scan', async (_req, res) => {
  try {
    const report = await runMaintenanceScan();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Maintenance scan failed' });
  }
});

adminRouter.post('/maintenance/preview', async (req, res) => {
  try {
    const targets = Array.isArray(req.body?.targets) ? (req.body.targets as TargetRef[]) : [];
    const mode: CleanupMode = req.body?.mode === 'permanent_delete' ? 'permanent_delete' : 'soft_archive';
    if (targets.length === 0) {
      return res.status(400).json({ error: 'कम्तीमा १ रेकर्ड छान्नुहोस्।' });
    }
    if (targets.length > 500) {
      return res.status(400).json({ error: 'एक पटकमा अधिकतम ५०० रेकर्ड मात्र पूर्वावलोकन गर्न मिल्छ।' });
    }
    const preview = await previewCleanupTargets(targets, mode);
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Cleanup preview failed' });
  }
});

adminRouter.get('/maintenance/backups', async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb
    .from('cleanup_backups')
    .select(
      'id, backup_label, category, mode, table_counts_json, record_count, checksum_sha256, created_by, restored_at, restored_by, restore_notes, created_at, profiles:created_by (full_name)'
    )
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  const backups = (data || []).map((row: Record<string, unknown>) => {
    const prof = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { full_name?: string } | null;
    const { profiles: _p, ...rest } = row;
    return {
      ...rest,
      created_by_name: prof?.full_name ?? null,
    };
  });

  res.json({ backups });
});

adminRouter.post('/maintenance/backup', async (req, res) => {
  try {
    const targets = Array.isArray(req.body?.targets) ? (req.body.targets as TargetRef[]) : [];
    const category = String(req.body?.category || 'manual_backup').slice(0, 64);
    const backupLabel =
      String(req.body?.backupLabel || '').trim() || `Manual Snapshot (${category}) — ${new Date().toISOString().slice(0, 16)}`;

    if (targets.length === 0) {
      return res.status(400).json({ error: 'ब्याकअप गर्न कम्तीमा १ रेकर्ड छान्नुहोस्।' });
    }
    if (targets.length > 500) {
      return res.status(400).json({ error: 'एक पटकमा अधिकतम ५०० रेकर्ड ब्याकअप गर्न मिल्छ।' });
    }

    const backup = await createVerifiedBackupSnapshot({
      targets,
      category,
      mode: 'manual_backup',
      backupLabel,
      adminUserId: req.authUser!.id,
    });

    await writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: 'super_admin',
      action: 'maintenance_backup_created',
      entityType: 'cleanup_backup',
      entityId: String(backup.id),
      metadata: { category, recordCount: backup.record_count },
      ipAddress: req.ip,
    });

    res.status(201).json({ backup });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Backup failed' });
  }
});

adminRouter.get('/maintenance/backups/:id/download', async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb
    .from('cleanup_backups')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).json({ error: 'ब्याकअप फाइल फेला परेन।' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sahakari-backup-${req.params.id.slice(0, 8)}.json"`);
  res.send(
    JSON.stringify(
      {
        backupId: data.id,
        label: data.backup_label,
        category: data.category,
        mode: data.mode,
        checksumSha256: data.checksum_sha256,
        recordCount: data.record_count,
        tableCounts: data.table_counts_json,
        createdAt: data.created_at,
        snapshot: data.snapshot_json,
      },
      null,
      2
    )
  );
});

adminRouter.post('/maintenance/backups/:id/restore', async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    const reason = String(req.body?.reason || '').trim();
    if (!password) {
      return res.status(400).json({ error: 'पुनःस्थापनाको लागि सुपर एडमिन पासवर्ड पुन: प्रविष्ट गर्नुहोस्।' });
    }
    const validPass = await verifySupabaseUserPassword(req.authUser!.id, password);
    if (!validPass) {
      return res.status(403).json({ error: 'सुपर एडमिन पासवर्ड मिलेन। पुनःस्थापना अस्वीकृत गरियो।' });
    }

    const result = await restoreFromBackup({
      backupId: req.params.id,
      adminUserId: req.authUser!.id,
      reason: reason || 'Super Admin backup recovery',
      ipAddress: req.ip,
    });

    await writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: 'super_admin',
      action: 'maintenance_backup_restored',
      entityType: 'cleanup_backup',
      entityId: req.params.id,
      metadata: result,
      ipAddress: req.ip,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Restore failed' });
  }
});

adminRouter.post('/maintenance/execute', async (req, res) => {
  try {
    const targets = Array.isArray(req.body?.targets) ? (req.body.targets as TargetRef[]) : [];
    const mode: CleanupMode = req.body?.mode === 'permanent_delete' ? 'permanent_delete' : 'soft_archive';
    const category = String(req.body?.category || 'data_cleanup').slice(0, 64);
    const reason = String(req.body?.reason || '').trim();
    const password = String(req.body?.password || '');
    const confirmPhrase = String(req.body?.confirmPhrase || '').trim().toUpperCase();

    if (targets.length === 0) {
      return res.status(400).json({ error: 'सफाई गर्न कम्तीमा १ रेकर्ड छान्नुहोस्।' });
    }
    if (targets.length > 500) {
      return res.status(400).json({ error: 'असीमित मेटाउने कार्य रोकिएको छ — एक पटकमा अधिकतम ५०० रेकर्ड मात्र।' });
    }
    if (reason.length < 5) {
      return res.status(400).json({ error: 'कम्तीमा ५ अक्षरको स्पष्ट सफाई कारण प्रविष्ट गर्नुहोस्।' });
    }
    if (confirmPhrase !== 'CONFIRM CLEANUP') {
      return res.status(400).json({ error: 'सफाई पुष्टि गर्न "CONFIRM CLEANUP" टाइप गर्नुहोस्।' });
    }
    if (!password) {
      return res.status(400).json({ error: 'उच्च-प्रभाव कार्यको लागि सुपर एडमिन पासवर्ड प्रमाणीकरण अनिवार्य छ।' });
    }

    const validPass = await verifySupabaseUserPassword(req.authUser!.id, password);
    if (!validPass) {
      return res.status(403).json({ error: 'सुपर एडमिन पासवर्ड मिलेन। डाटा सफाई रोकियो।' });
    }

    const result = await executeSafeCleanup({
      targets,
      mode,
      category,
      reason,
      adminUserId: req.authUser!.id,
      ipAddress: req.ip,
    });

    await writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: 'super_admin',
      action: `maintenance_${mode}`,
      entityType: 'cleanup_audit_logs',
      entityId: String(result.backupId),
      metadata: {
        category,
        deletedCount: result.deletedCount,
        retainedCount: result.retainedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
      },
      ipAddress: req.ip,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Cleanup execution failed' });
  }
});

adminRouter.get('/maintenance/history', async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb
    .from('cleanup_audit_logs')
    .select(
      '*, profiles:admin_user_id (full_name, email), cleanup_backups:backup_id (backup_label, checksum_sha256, record_count)'
    )
    .order('created_at', { ascending: false })
    .limit(120);

  if (error) return res.status(500).json({ error: error.message });

  const history = (data || []).map((row: Record<string, unknown>) => {
    const adminProf = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { full_name?: string; email?: string } | null;
    const backup = (Array.isArray(row.cleanup_backups) ? row.cleanup_backups[0] : row.cleanup_backups) as {
      backup_label?: string;
      checksum_sha256?: string;
      record_count?: number;
    } | null;
    const { profiles: _p, cleanup_backups: _b, ...rest } = row;
    return {
      ...rest,
      admin_name: adminProf?.full_name ?? null,
      admin_email: adminProf?.email ?? null,
      backup_label: backup?.backup_label ?? null,
      backup_checksum: backup?.checksum_sha256 ?? null,
      backup_record_count: backup?.record_count ?? 0,
    };
  });

  res.json({ history });
});
