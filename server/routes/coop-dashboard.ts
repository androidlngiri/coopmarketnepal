import crypto from 'crypto';
import { Router } from 'express';
import { rateLimit, requireCooperativeAccess, writeAuditLog } from '../auth.ts';
import { normalizeNepalPhone, sendAkashSms } from '../akash-sms.ts';
import {
  generateProductWithGemini,
  GeminiAssistantError,
  getGeminiModel,
  isGeminiConfigured,
} from '../gemini.ts';
import {
  createSupabaseAuthUser,
  parseJsonField,
  requireSupabaseAdmin,
} from '../supabase-admin.ts';
import { resolveDocumentAccessUrl, uploadBase64ToSupabaseStorage } from '../storage.ts';

export const coopDashboardRouter = Router();

function sanitizeAiDetails(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const cleanArr = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 15) : [];
  const cleanSpecs = Array.isArray(obj.known_specifications)
    ? obj.known_specifications
        .map((s) => {
          const item = s as Record<string, unknown>;
          return { label: String(item?.label ?? '').trim(), value: String(item?.value ?? '').trim() };
        })
        .filter((s) => s.label && s.value)
        .slice(0, 15)
    : [];
  const cleanRecipes = Array.isArray(obj.recipe_suggestions)
    ? obj.recipe_suggestions
        .map((r) => {
          const item = r as Record<string, unknown>;
          return {
            title: String(item?.title ?? '').trim(),
            ingredients: cleanArr(item?.ingredients),
            steps: cleanArr(item?.steps),
          };
        })
        .filter((r) => r.title && (r.ingredients.length > 0 || r.steps.length > 0))
        .slice(0, 4)
    : [];

  return {
    product_type_detected: String(obj.product_type_detected ?? '').trim(),
    highlights: cleanArr(obj.highlights),
    known_specifications: cleanSpecs,
    ingredients_or_materials: cleanArr(obj.ingredients_or_materials),
    uses_and_benefits: cleanArr(obj.uses_and_benefits),
    preparation_or_usage: String(obj.preparation_or_usage ?? '').trim(),
    recipe_suggestions: cleanRecipes,
    storage_instructions: String(obj.storage_instructions ?? '').trim(),
    handling_instructions: String(obj.handling_instructions ?? '').trim(),
    safety_precautions: String(obj.safety_precautions ?? '').trim(),
    packaging_suggestions: String(obj.packaging_suggestions ?? '').trim(),
    needs_confirmation: cleanArr(obj.needs_confirmation),
  };
}

async function getCoopAndSub(coopId: string) {
  const sb = requireSupabaseAdmin();
  const [coopRes, subRes] = await Promise.all([
    sb.from('cooperatives').select('*').eq('id', coopId).single(),
    sb
      .from('subscriptions')
      .select('*, subscription_plans (code, name_ne, name_en, max_products, max_staff, max_storage_mb, features_json)')
      .eq('cooperative_id', coopId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let sub: Record<string, unknown> | null = null;
  if (subRes.data) {
    const plan = (Array.isArray(subRes.data.subscription_plans)
      ? subRes.data.subscription_plans[0]
      : subRes.data.subscription_plans) as Record<string, unknown> | null;
    const { subscription_plans: _sp, ...rest } = subRes.data as Record<string, unknown>;
    sub = {
      ...rest,
      plan_code: plan?.code ?? null,
      plan_name_ne: plan?.name_ne ?? null,
      plan_name_en: plan?.name_en ?? null,
      max_products: plan?.max_products ?? 15,
      max_staff: plan?.max_staff ?? 2,
      max_storage_mb: plan?.max_storage_mb ?? 200,
      features_json: plan?.features_json ?? {},
    };
  }

  return { coop: coopRes.data as Record<string, unknown>, sub };
}

// 1. Overview & Analytics
coopDashboardRouter.get('/overview', requireCooperativeAccess(), async (req, res) => {
  const coopId = req.cooperativeId!;
  const sb = requireSupabaseAdmin();

  const [{ coop, sub }, metricsRes, lowStockRes, recentOrdersRes] = await Promise.all([
    getCoopAndSub(coopId),
    sb.rpc('get_coop_overview_metrics', { p_cooperative_id: coopId }),
    sb
      .from('products')
      .select('id, sku, name_ne, name_en, stock_quantity, low_stock_threshold')
      .eq('cooperative_id', coopId)
      .order('stock_quantity', { ascending: true })
      .limit(50),
    sb
      .from('orders')
      .select('*')
      .eq('cooperative_id', coopId)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const m = (metricsRes.data || {}) as Record<string, unknown>;
  const lowStockItems = (lowStockRes.data || [])
    .filter((p: Record<string, unknown>) => Number(p.stock_quantity) <= Number(p.low_stock_threshold))
    .slice(0, 10);

  res.json({
    cooperative: coop,
    subscription: sub,
    metrics: m.metrics || {
      total_sales: 0,
      today_sales: 0,
      monthly_sales: 0,
      total_orders: 0,
      pending_orders: 0,
    },
    productStats: m.productStats || {
      total_products: 0,
      published_products: 0,
      low_stock_count: 0,
    },
    lowStockItems,
    dailySales: m.dailySales || [],
    recentOrders: recentOrdersRes.data || [],
  });
});

// 2. Store Builder & Settings
coopDashboardRouter.get('/store', requireCooperativeAccess(), async (req, res) => {
  const coopId = req.cooperativeId!;
  const sb = requireSupabaseAdmin();
  const [storeRes, coopRes] = await Promise.all([
    sb.from('stores').select('*').eq('cooperative_id', coopId).single(),
    sb.from('cooperatives').select('slug, status').eq('id', coopId).single(),
  ]);

  const store = storeRes.data as Record<string, unknown>;
  res.json({
    cooperative: coopRes.data,
    store: {
      ...store,
      sections: parseJsonField(store?.sections_json, []),
      socialLinks: parseJsonField(store?.social_links_json, {}),
      draftConfig: store?.draft_config_json ? parseJsonField(store.draft_config_json, null) : null,
    },
  });
});

coopDashboardRouter.put('/store', requireCooperativeAccess('manage_store'), async (req, res) => {
  const coopId = req.cooperativeId!;
  const sb = requireSupabaseAdmin();
  const { coop } = await getCoopAndSub(coopId);
  const body = req.body || {};

  let logoUrl = body.logo_url;
  let bannerUrl = body.banner_url;
  try {
    if (body.logoBase64 && String(body.logoBase64).startsWith('data:')) {
      logoUrl = (
        await uploadBase64ToSupabaseStorage({
          dataUrl: String(body.logoBase64),
          bucket: 'cooperative-logos',
          folder: coopId,
        })
      ).url;
    }
    if (body.bannerBase64 && String(body.bannerBase64).startsWith('data:')) {
      bannerUrl = (
        await uploadBase64ToSupabaseStorage({
          dataUrl: String(body.bannerBase64),
          bucket: 'store-banners',
          folder: coopId,
        })
      ).url;
    }
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'छवि अपलोड त्रुटि।' });
  }

  const publishRequested = Boolean(body.publish);
  if (publishRequested && coop.status !== 'approved') {
    return res.status(403).json({
      error: 'सुपर एडमिनबाट सहकारी स्वीकृत नभएसम्म पसल प्रकाशित गर्न मिल्दैन।',
    });
  }

  const allowedThemes = ['himalayan_stone', 'ilam_emerald', 'palpa_crimson', 'mustang_slate'];
  const allowedFonts = ['noto_jakarta', 'serif_editorial', 'modern_outfit'];
  const themeKey = allowedThemes.includes(body.theme_key) ? body.theme_key : 'himalayan_stone';
  const fontKey = allowedFonts.includes(body.font_key) ? body.font_key : 'noto_jakarta';

  const sanitizedSections = Array.isArray(body.sections)
    ? body.sections.map((s: Record<string, unknown>) => ({
        id: String(s.id || crypto.randomUUID()),
        type: String(s.type || 'featured_products'),
        visible: Boolean(s.visible),
        title_ne: String(s.title_ne || ''),
        title_en: String(s.title_en || ''),
      }))
    : [];

  const updatePayload = {
    store_name_ne: String(body.store_name_ne || ''),
    store_name_en: String(body.store_name_en || ''),
    tagline_ne: String(body.tagline_ne || ''),
    tagline_en: String(body.tagline_en || ''),
    theme_key: themeKey,
    primary_color: /^#[0-9A-Fa-f]{6}$/.test(String(body.primary_color || '')) ? body.primary_color : '#B91C1C',
    accent_color: /^#[0-9A-Fa-f]{6}$/.test(String(body.accent_color || '')) ? body.accent_color : '#15803D',
    font_key: fontKey,
    logo_url: logoUrl || '/images/hero-nepal-cooperative.jpg',
    banner_url: bannerUrl || '/images/hero-nepal-cooperative.jpg',
    intro_ne: String(body.intro_ne || ''),
    intro_en: String(body.intro_en || ''),
    mission_ne: String(body.mission_ne || ''),
    mission_en: String(body.mission_en || ''),
    vision_ne: String(body.vision_ne || ''),
    vision_en: String(body.vision_en || ''),
    notice_ne: String(body.notice_ne || ''),
    notice_en: String(body.notice_en || ''),
    footer_text_ne: String(body.footer_text_ne || ''),
    footer_text_en: String(body.footer_text_en || ''),
    contact_phone: String(body.contact_phone || ''),
    contact_email: String(body.contact_email || ''),
    address_text: String(body.address_text || ''),
    custom_domain: body.custom_domain ? String(body.custom_domain).trim().toLowerCase() : null,
    social_links_json: body.socialLinks || {},
    sections_json: sanitizedSections,
  };

  if (publishRequested) {
    const { error } = await sb
      .from('stores')
      .update({
        ...updatePayload,
        draft_config_json: null,
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .eq('cooperative_id', coopId);
    if (error) return res.status(400).json({ error: error.message });
  } else {
    const { error } = await sb
      .from('stores')
      .update({
        draft_config_json: {
          ...updatePayload,
          sections: sanitizedSections,
          socialLinks: body.socialLinks || {},
        },
      })
      .eq('cooperative_id', coopId);
    if (error) return res.status(400).json({ error: error.message });
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    cooperativeId: coopId,
    action: publishRequested ? 'store_published' : 'store_draft_saved',
    entityType: 'store',
    entityId: coopId,
    ipAddress: req.ip,
  });

  res.json({ ok: true, published: publishRequested });
});

// 3. Cooperative Categories
coopDashboardRouter.get('/categories', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const [globalRes, coopRes] = await Promise.all([
    sb.from('global_categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    sb
      .from('cooperative_categories')
      .select('*')
      .eq('cooperative_id', req.cooperativeId!)
      .order('sort_order', { ascending: true }),
  ]);
  res.json({ globalCategories: globalRes.data || [], coopCategories: coopRes.data || [] });
});

coopDashboardRouter.post('/categories', requireCooperativeAccess('manage_products'), async (req, res) => {
  const { nameNe, nameEn } = req.body || {};
  if (!nameNe || !nameEn) return res.status(400).json({ error: 'नेपाली र अंग्रेजी वर्ग नाम आवश्यक छ।' });
  const sb = requireSupabaseAdmin();
  const slug =
    String(nameEn)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `cat-${Date.now()}`;

  const { data, error } = await sb
    .from('cooperative_categories')
    .insert({
      cooperative_id: req.cooperativeId!,
      slug: `${slug}-${crypto.randomBytes(2).toString('hex')}`,
      name_ne: nameNe,
      name_en: nameEn,
    })
    .select('id')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ id: data.id });
});

coopDashboardRouter.delete('/categories/:id', requireCooperativeAccess('manage_products'), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { error } = await sb
    .from('cooperative_categories')
    .delete()
    .eq('id', req.params.id)
    .eq('cooperative_id', req.cooperativeId!);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// 4. Products, Rich Content, Inventory & AI Product Assistant
coopDashboardRouter.get('/products/ai-quota', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: quota, error } = await sb.rpc('get_coop_ai_quota', {
    p_cooperative_id: req.cooperativeId!,
    p_daily_limit: 2,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    quota,
    geminiConfigured: isGeminiConfigured(),
    model: getGeminiModel(),
    timezone: 'Asia/Kathmandu',
  });
});

coopDashboardRouter.get('/products/ai-history', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb
    .from('ai_product_generations')
    .select(
      'id, product_id, mode, product_name_input, language, generation_date_ktm, model, status, counts_toward_quota, generated_payload_json, error_message, prompt_tokens, output_tokens, created_at, completed_at'
    )
    .eq('cooperative_id', req.cooperativeId!)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ history: data || [] });
});

coopDashboardRouter.post(
  '/products/ai-generate',
  rateLimit('coop_ai_generate', 12, 60 * 1000),
  requireCooperativeAccess('manage_products'),
  async (req, res) => {
    const coopId = req.cooperativeId!;
    const sb = requireSupabaseAdmin();
    const b = req.body || {};

    const productName = String(b.productName || '').trim();
    if (productName.length < 2 || productName.length > 200) {
      return res.status(400).json({ error: 'उत्पादनको नाम कम्तीमा २ अक्षरको प्रविष्ट गर्नुहोस्।' });
    }

    const language: 'ne' | 'en' = b.language === 'en' ? 'en' : 'ne';
    const mode: 'create' | 'edit' = b.mode === 'edit' ? 'edit' : 'create';
    const productId = b.productId ? String(b.productId).trim() : null;

    if (productId) {
      const { data: ownedProd } = await sb
        .from('products')
        .select('id')
        .eq('id', productId)
        .eq('cooperative_id', coopId)
        .maybeSingle();
      if (!ownedProd) {
        return res.status(404).json({ error: 'सम्बन्धित उत्पादन फेला परेन।' });
      }
    }

    if (!isGeminiConfigured()) {
      const { data: quota } = await sb.rpc('get_coop_ai_quota', {
        p_cooperative_id: coopId,
        p_daily_limit: 2,
      });
      return res.status(503).json({
        error: 'AI सेवा हाल कन्फिगर गरिएको छैन। कृपया म्यानुअल रूपमा उत्पादन विवरण भरेर सुरक्षित गर्नुहोस्।',
        code: 'AI_UNCONFIGURED',
        quota,
        manualFallback: true,
      });
    }

    const [coopRes, catsRes] = await Promise.all([
      sb.from('cooperatives').select('name_ne, name_en, cooperative_type, district').eq('id', coopId).single(),
      sb.from('global_categories').select('id, slug, name_ne, name_en').eq('is_active', true).order('sort_order', { ascending: true }),
    ]);

    const model = getGeminiModel();
    const { data: reservation, error: resErr } = await sb.rpc('reserve_coop_ai_generation', {
      p_cooperative_id: coopId,
      p_user_id: req.authUser!.id,
      p_product_id: productId,
      p_mode: mode,
      p_product_name: productName,
      p_language: language,
      p_model: model,
      p_daily_limit: 2,
    });

    if (resErr) {
      return res.status(500).json({ error: resErr.message || 'कोटा जाँच असफल।', manualFallback: true });
    }

    const reserveObj = (reservation || {}) as {
      allowed?: boolean;
      generationId?: string;
      used?: number;
      limit?: number;
      remaining?: number;
      dateKtm?: string;
    };

    if (!reserveObj.allowed || !reserveObj.generationId) {
      return res.status(429).json({
        error: `तपाईंको सहकारीको आजको निःशुल्क AI सीमा (${reserveObj.limit ?? 2} पटक / दिन, नेपाल समय) पूरा भइसकेको छ। भोलि पुनः प्रयास गर्नुहोस् वा म्यानुअल रूपमा विवरण प्रविष्ट गर्नुहोस्।`,
        code: 'DAILY_QUOTA_REACHED',
        quota: reserveObj,
        manualFallback: true,
      });
    }

    const generationId = reserveObj.generationId;
    const globalCategories = (catsRes.data || []) as Array<{
      id: string;
      slug: string;
      name_ne: string;
      name_en: string;
    }>;

    try {
      const coopData = (coopRes.data || {}) as Record<string, unknown>;
      const result = await generateProductWithGemini({
        productName,
        language,
        cooperativeName: String(coopData.name_ne || coopData.name_en || ''),
        cooperativeType: String(coopData.cooperative_type || ''),
        cooperativeDistrict: String(coopData.district || ''),
        existingNotes: b.existingNotes ? String(b.existingNotes).slice(0, 800) : undefined,
        knownSpecs: b.knownSpecs ? String(b.knownSpecs).slice(0, 600) : undefined,
        unitHint: b.unitHint ? String(b.unitHint).slice(0, 60) : undefined,
        globalCategories,
      });

      const matchedCat = globalCategories.find((c) => c.slug === result.data.suggested_category_slug);
      const { data: completedQuota } = await sb.rpc('complete_coop_ai_generation', {
        p_generation_id: generationId,
        p_status: 'completed',
        p_payload: result.data,
        p_error_message: null,
        p_prompt_tokens: result.promptTokens,
        p_output_tokens: result.outputTokens,
      });

      await writeAuditLog({
        actorUserId: req.authUser!.id,
        actorRole: req.authUser!.role,
        cooperativeId: coopId,
        action: 'ai_product_generated',
        entityType: 'ai_product_generation',
        entityId: generationId,
        metadata: { productName, language, model: result.model, mode },
        ipAddress: req.ip,
      });

      return res.json({
        generationId,
        generated: result.data,
        suggestedCategoryId: matchedCat?.id ?? '',
        model: result.model,
        quota: completedQuota || reserveObj,
      });
    } catch (err) {
      const isGeminiErr = err instanceof GeminiAssistantError;
      const errMsg = isGeminiErr ? err.message : 'AI उत्पादन विवरण सिर्जना असफल भयो।';
      const errCode = isGeminiErr ? err.code : 'AI_FAILED';
      const httpStatus = isGeminiErr ? err.httpStatus : 502;

      const { data: releasedQuota } = await sb.rpc('complete_coop_ai_generation', {
        p_generation_id: generationId,
        p_status: 'failed',
        p_payload: null,
        p_error_message: errMsg,
      });

      return res.status(httpStatus).json({
        error: errMsg,
        code: errCode,
        quota: releasedQuota,
        manualFallback: true,
      });
    }
  }
);

coopDashboardRouter.get('/products', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: rawProducts } = await sb
    .from('products')
    .select('*, product_images (image_url, is_primary), global_categories (name_ne, name_en)')
    .eq('cooperative_id', req.cooperativeId!)
    .order('created_at', { ascending: false });

  const products = (rawProducts || []).map((p: Record<string, unknown>) => {
    const imgs = (p.product_images as Array<{ image_url: string; is_primary?: boolean }>) || [];
    const cat = (Array.isArray(p.global_categories) ? p.global_categories[0] : p.global_categories) as Record<
      string,
      unknown
    > | null;
    const { product_images: _pi, global_categories: _gc, ...rest } = p;
    return {
      ...rest,
      ai_details_json: parseJsonField(p.ai_details_json, {}),
      seo_keywords_json: parseJsonField(p.seo_keywords_json, []),
      image_url: imgs.find((i) => i.is_primary)?.image_url || imgs[0]?.image_url || null,
      category_name_ne: cat?.name_ne ?? null,
      category_name_en: cat?.name_en ?? null,
    };
  });

  res.json({ products });
});

coopDashboardRouter.post('/products', requireCooperativeAccess('manage_products'), async (req, res) => {
  const coopId = req.cooperativeId!;
  const sb = requireSupabaseAdmin();
  const { coop, sub } = await getCoopAndSub(coopId);
  const b = req.body || {};

  if (!b.nameNe || !b.nameEn || !b.sku || b.priceNpr === undefined) {
    return res.status(400).json({ error: 'उत्पादन नाम, SKU र मूल्य आवश्यक छन्।' });
  }

  const desiredStatus = b.status === 'published' ? 'published' : 'draft';
  if (desiredStatus === 'published') {
    if (coop.status !== 'approved') {
      return res.status(403).json({
        error: 'स्वीकृत नभएका सहकारीले उत्पादन प्रकाशित गर्न सक्दैनन्। पहिले मस्यौदा (Draft) को रूपमा सुरक्षित गर्नुहोस्।',
      });
    }
    if (!sub || !['trial', 'active'].includes(String(sub.status)) || new Date(String(sub.ends_at)).getTime() < Date.now()) {
      return res.status(403).json({ error: 'उत्पादन प्रकाशित गर्न सक्रिय सदस्यता योजना आवश्यक छ।' });
    }
  }

  const { count: currentCount } = await sb
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('cooperative_id', coopId)
    .neq('status', 'archived');

  const maxProducts = Number(sub?.max_products || 15);
  if ((currentCount || 0) >= maxProducts) {
    return res.status(403).json({ error: `तपाईंको योजनाको अधिकतम उत्पादन सीमा (${maxProducts}) पूरा भएको छ।` });
  }

  let imageUrl = b.imageUrl || '/images/product-ilam-tea.jpg';
  if (b.imageBase64 && String(b.imageBase64).startsWith('data:')) {
    try {
      imageUrl = (
        await uploadBase64ToSupabaseStorage({
          dataUrl: String(b.imageBase64),
          bucket: 'product-images',
          folder: coopId,
        })
      ).url;
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'छवि अपलोड असफल।' });
    }
  }

  const slugBase =
    String(b.nameEn)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'product';
  const slug = `${slugBase}-${crypto.randomBytes(2).toString('hex')}`;
  const stockQty = Math.max(0, Math.floor(Number(b.stockQuantity || 0)));
  const seoKeywords = Array.isArray(b.seoKeywords)
    ? b.seoKeywords.map((k: unknown) => String(k ?? '').trim()).filter(Boolean).slice(0, 15)
    : [];

  const { data: prod, error: prodErr } = await sb
    .from('products')
    .insert({
      cooperative_id: coopId,
      global_category_id: b.globalCategoryId || null,
      coop_category_id: b.coopCategoryId || null,
      slug,
      sku: String(b.sku).trim().toUpperCase(),
      name_ne: String(b.nameNe).trim(),
      name_en: String(b.nameEn).trim(),
      short_description_ne: b.shortDescriptionNe || null,
      short_description_en: b.shortDescriptionEn || null,
      description_ne: b.descriptionNe || '',
      description_en: b.descriptionEn || '',
      ai_details_json: sanitizeAiDetails(b.aiDetails),
      seo_title_ne: b.seoTitleNe || null,
      seo_title_en: b.seoTitleEn || null,
      seo_meta_description_ne: b.seoMetaDescriptionNe || null,
      seo_meta_description_en: b.seoMetaDescriptionEn || null,
      seo_keywords_json: seoKeywords,
      ai_assisted: Boolean(b.aiAssisted),
      price_npr: Number(b.priceNpr),
      discount_price_npr: b.discountPriceNpr ? Number(b.discountPriceNpr) : null,
      unit_label_ne: b.unitLabelNe || 'के.जी.',
      unit_label_en: b.unitLabelEn || 'kg',
      stock_quantity: stockQty,
      low_stock_threshold: Math.max(0, Number(b.lowStockThreshold ?? 5)),
      availability_status: stockQty > 0 ? 'in_stock' : 'out_of_stock',
      origin_district: b.originDistrict || null,
      producer_name: b.producerName || null,
      is_featured: Boolean(b.isFeatured),
      status: desiredStatus,
    })
    .select('id, slug')
    .single();

  if (prodErr || !prod) {
    return res.status(400).json({
      error: prodErr?.code === '23505' ? 'यो SKU पहिले नै प्रयोग भइसकेको छ।' : 'उत्पादन थप्न सकिएन।',
    });
  }

  await Promise.all([
    sb.from('product_images').insert({
      product_id: prod.id,
      cooperative_id: coopId,
      image_url: imageUrl,
      alt_text: String(b.nameEn),
      is_primary: true,
    }),
    sb.from('inventory_movements').insert({
      cooperative_id: coopId,
      product_id: prod.id,
      movement_type: 'initial',
      quantity_delta: stockQty,
      previous_quantity: 0,
      new_quantity: stockQty,
      note: 'प्रारम्भिक स्टक',
      created_by: req.authUser!.id,
    }),
    b.aiGenerationId
      ? sb
          .from('ai_product_generations')
          .update({ product_id: prod.id })
          .eq('id', String(b.aiGenerationId))
          .eq('cooperative_id', coopId)
      : Promise.resolve(),
  ]);

  res.status(201).json({ id: prod.id, slug: prod.slug });
});

coopDashboardRouter.patch('/products/:id', requireCooperativeAccess('manage_products'), async (req, res) => {
  const coopId = req.cooperativeId!;
  const sb = requireSupabaseAdmin();

  const { data: existing } = await sb
    .from('products')
    .select('*')
    .eq('id', req.params.id)
    .eq('cooperative_id', coopId)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'उत्पादन फेला परेन।' });

  const b = req.body || {};
  const { coop } = await getCoopAndSub(coopId);

  if (b.status === 'published' && coop.status !== 'approved') {
    return res.status(403).json({ error: 'सहकारी स्वीकृत नभई उत्पादन प्रकाशित गर्न मिल्दैन।' });
  }

  const allowedAvailability = ['in_stock', 'out_of_stock', 'preorder', 'discontinued'];
  const allowedStatus = ['draft', 'published', 'archived'];

  const updatePayload: Record<string, unknown> = {};
  if (b.nameNe !== undefined) updatePayload.name_ne = String(b.nameNe).trim();
  if (b.nameEn !== undefined) updatePayload.name_en = String(b.nameEn).trim();
  if (b.sku !== undefined && String(b.sku).trim()) updatePayload.sku = String(b.sku).trim().toUpperCase();
  if (b.shortDescriptionNe !== undefined) updatePayload.short_description_ne = b.shortDescriptionNe;
  if (b.shortDescriptionEn !== undefined) updatePayload.short_description_en = b.shortDescriptionEn;
  if (b.descriptionNe !== undefined) updatePayload.description_ne = b.descriptionNe;
  if (b.descriptionEn !== undefined) updatePayload.description_en = b.descriptionEn;
  if (b.aiDetails !== undefined) updatePayload.ai_details_json = sanitizeAiDetails(b.aiDetails);
  if (b.seoTitleNe !== undefined) updatePayload.seo_title_ne = b.seoTitleNe;
  if (b.seoTitleEn !== undefined) updatePayload.seo_title_en = b.seoTitleEn;
  if (b.seoMetaDescriptionNe !== undefined) updatePayload.seo_meta_description_ne = b.seoMetaDescriptionNe;
  if (b.seoMetaDescriptionEn !== undefined) updatePayload.seo_meta_description_en = b.seoMetaDescriptionEn;
  if (b.seoKeywords !== undefined) {
    updatePayload.seo_keywords_json = Array.isArray(b.seoKeywords)
      ? b.seoKeywords.map((k: unknown) => String(k ?? '').trim()).filter(Boolean).slice(0, 15)
      : [];
  }
  if (b.aiAssisted !== undefined) updatePayload.ai_assisted = Boolean(b.aiAssisted);
  if (b.priceNpr !== undefined) updatePayload.price_npr = Number(b.priceNpr);
  if (b.discountPriceNpr !== undefined) {
    updatePayload.discount_price_npr =
      b.discountPriceNpr === null || b.discountPriceNpr === '' ? null : Number(b.discountPriceNpr);
  }
  if (b.unitLabelNe !== undefined) updatePayload.unit_label_ne = b.unitLabelNe;
  if (b.unitLabelEn !== undefined) updatePayload.unit_label_en = b.unitLabelEn;
  if (b.globalCategoryId !== undefined) updatePayload.global_category_id = b.globalCategoryId || null;
  if (b.coopCategoryId !== undefined) updatePayload.coop_category_id = b.coopCategoryId || null;
  if (b.originDistrict !== undefined) updatePayload.origin_district = b.originDistrict || null;
  if (b.producerName !== undefined) updatePayload.producer_name = b.producerName || null;
  if (b.lowStockThreshold !== undefined) updatePayload.low_stock_threshold = Math.max(0, Number(b.lowStockThreshold));
  if (b.availabilityStatus !== undefined && allowedAvailability.includes(String(b.availabilityStatus))) {
    updatePayload.availability_status = b.availabilityStatus;
  }
  if (b.isFeatured !== undefined) updatePayload.is_featured = Boolean(b.isFeatured);
  if (b.status !== undefined && allowedStatus.includes(String(b.status))) updatePayload.status = b.status;

  if (b.imageBase64 && String(b.imageBase64).startsWith('data:')) {
    try {
      const uploaded = await uploadBase64ToSupabaseStorage({
        dataUrl: String(b.imageBase64),
        bucket: 'product-images',
        folder: coopId,
      });
      await sb.from('product_images').update({ is_primary: false }).eq('product_id', req.params.id);
      await sb.from('product_images').insert({
        product_id: req.params.id,
        cooperative_id: coopId,
        image_url: uploaded.url,
        alt_text: String(b.nameEn || existing.name_en || ''),
        is_primary: true,
      });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'छवि अपलोड असफल।' });
    }
  }

  const { error: updateErr } = await sb
    .from('products')
    .update(updatePayload)
    .eq('id', req.params.id)
    .eq('cooperative_id', coopId);

  if (updateErr) {
    return res.status(400).json({
      error: updateErr.code === '23505' ? 'यो SKU पहिले नै प्रयोग भइसकेको छ।' : updateErr.message,
    });
  }

  if (b.aiGenerationId) {
    await sb
      .from('ai_product_generations')
      .update({ product_id: req.params.id })
      .eq('id', String(b.aiGenerationId))
      .eq('cooperative_id', coopId);
  }

  res.json({ ok: true });
});

coopDashboardRouter.delete('/products/:id', requireCooperativeAccess('manage_products'), async (req, res) => {
  const coopId = req.cooperativeId!;
  const sb = requireSupabaseAdmin();

  const { data: existing } = await sb
    .from('products')
    .select('id, name_ne, sku')
    .eq('id', req.params.id)
    .eq('cooperative_id', coopId)
    .maybeSingle();

  if (!existing) {
    return res.status(404).json({ error: 'उत्पादन फेला परेन।' });
  }

  const { count: orderItemCount } = await sb
    .from('order_items')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', req.params.id);

  if ((orderItemCount || 0) > 0) {
    const { error } = await sb
      .from('products')
      .update({ status: 'archived', availability_status: 'discontinued' })
      .eq('id', req.params.id)
      .eq('cooperative_id', coopId);
    if (error) return res.status(400).json({ error: error.message });

    await writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: req.authUser!.role,
      cooperativeId: coopId,
      action: 'product_archived',
      entityType: 'product',
      entityId: req.params.id,
      metadata: { sku: existing.sku, reason: 'existing_orders_present' },
      ipAddress: req.ip,
    });

    return res.json({
      ok: true,
      mode: 'archived',
      message: 'यो उत्पादनमा अर्डर इतिहास रहेकोले स्थायी रूपमा मेटाइएन, आर्काइभ गरिएको छ।',
    });
  }

  await Promise.all([
    sb.from('product_images').delete().eq('product_id', req.params.id).eq('cooperative_id', coopId),
    sb.from('inventory_movements').delete().eq('product_id', req.params.id).eq('cooperative_id', coopId),
    sb.from('wishlists').delete().eq('product_id', req.params.id),
  ]);

  const { error: delErr } = await sb
    .from('products')
    .delete()
    .eq('id', req.params.id)
    .eq('cooperative_id', coopId);
  if (delErr) return res.status(400).json({ error: delErr.message });

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    cooperativeId: coopId,
    action: 'product_deleted',
    entityType: 'product',
    entityId: req.params.id,
    metadata: { sku: existing.sku, name_ne: existing.name_ne },
    ipAddress: req.ip,
  });

  res.json({ ok: true, mode: 'deleted', message: 'उत्पादन सफलतापूर्वक हटाइयो।' });
});

coopDashboardRouter.post('/products/:id/adjust-stock', requireCooperativeAccess('manage_inventory'), async (req, res) => {
  const coopId = req.cooperativeId!;
  const { delta, movementType, note } = req.body || {};
  const qtyDelta = Math.floor(Number(delta));
  if (!qtyDelta) return res.status(400).json({ error: 'मान्य परिमाण परिवर्तन प्रविष्ट गर्नुहोस्।' });

  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('adjust_product_stock', {
    p_cooperative_id: coopId,
    p_product_id: req.params.id,
    p_delta: qtyDelta,
    p_movement_type: movementType || 'adjustment',
    p_note: note || 'Manual adjustment',
    p_actor_user_id: req.authUser!.id,
  });

  if (error) {
    return res.status(error.message.includes('फेला परेन') ? 404 : 400).json({ error: error.message });
  }
  res.json(data);
});

coopDashboardRouter.get('/inventory-movements', requireCooperativeAccess('manage_inventory'), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data } = await sb
    .from('inventory_movements')
    .select('*, products (name_ne, name_en, sku)')
    .eq('cooperative_id', req.cooperativeId!)
    .order('created_at', { ascending: false })
    .limit(100);

  const movements = (data || []).map((m: Record<string, unknown>) => {
    const prod = (Array.isArray(m.products) ? m.products[0] : m.products) as Record<string, unknown> | null;
    const { products: _p, ...rest } = m;
    return {
      ...rest,
      name_ne: prod?.name_ne ?? null,
      name_en: prod?.name_en ?? null,
      sku: prod?.sku ?? null,
    };
  });

  res.json({ movements });
});

// 5. Orders & Payments (Tenant-Scoped)
coopDashboardRouter.get('/orders', requireCooperativeAccess('manage_orders'), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const status = req.query.status ? String(req.query.status) : '';

  let query = sb
    .from('orders')
    .select('*, order_items (*), payments (*)')
    .eq('cooperative_id', req.cooperativeId!)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: orders } = await query;
  const enriched = (orders || []).map((o: Record<string, unknown>) => {
    const { order_items: items, payments, ...rest } = o;
    const payArr = (payments as Array<Record<string, unknown>>) || [];
    return {
      ...rest,
      items: items || [],
      payment: payArr[0] || null,
    };
  });

  res.json({ orders: enriched });
});

coopDashboardRouter.patch('/orders/:id/status', requireCooperativeAccess('manage_orders'), async (req, res) => {
  const coopId = req.cooperativeId!;
  const { status, note, paymentStatus } = req.body || {};

  const allowedStatuses = [
    'pending',
    'confirmed',
    'processing',
    'ready_for_dispatch',
    'shipped',
    'delivered',
    'cancelled',
    'returned',
    'refunded',
  ];
  const validStatus = status && allowedStatuses.includes(status) ? status : null;
  const validPayStatus =
    paymentStatus && ['pending', 'submitted', 'verified', 'failed', 'refunded'].includes(paymentStatus)
      ? paymentStatus
      : null;

  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('update_coop_order_status', {
    p_cooperative_id: coopId,
    p_order_id: req.params.id,
    p_status: validStatus,
    p_payment_status: validPayStatus,
    p_note: note || null,
    p_actor_user_id: req.authUser!.id,
  });

  if (error) {
    return res.status(error.message.includes('फेला परेन') ? 404 : 400).json({ error: error.message });
  }

  const info = (data || {}) as { order_number?: string; customer_phone?: string };
  if (validStatus && info.customer_phone) {
    await sendAkashSms({
      to: String(info.customer_phone),
      text: `तपाईंको अर्डर ${info.order_number} को स्थिति "${validStatus}" मा अद्यावधिक गरिएको छ। - सहकारी बजार`,
      purpose: 'order_status_update',
      cooperativeId: coopId,
    });
  }

  res.json({ ok: true });
});

// 6. Customers (derived strictly from cooperative's own orders)
coopDashboardRouter.get('/customers', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: orders } = await sb
    .from('orders')
    .select('customer_name, customer_phone, customer_email, delivery_district, total_npr, status, created_at')
    .eq('cooperative_id', req.cooperativeId!)
    .order('created_at', { ascending: false });

  const byPhone = new Map<
    string,
    {
      customer_name: string;
      customer_phone: string;
      customer_email: string | null;
      delivery_district: string | null;
      order_count: number;
      total_spent: number;
      last_order_at: string;
    }
  >();

  for (const o of orders || []) {
    const key = String(o.customer_phone);
    const prev = byPhone.get(key);
    const spent = !['cancelled', 'refunded'].includes(String(o.status)) ? Number(o.total_npr || 0) : 0;
    if (!prev) {
      byPhone.set(key, {
        customer_name: o.customer_name,
        customer_phone: key,
        customer_email: o.customer_email,
        delivery_district: o.delivery_district,
        order_count: 1,
        total_spent: spent,
        last_order_at: o.created_at,
      });
    } else {
      prev.order_count += 1;
      prev.total_spent = Number((prev.total_spent + spent).toFixed(2));
    }
  }

  res.json({ customers: Array.from(byPhone.values()) });
});

// 7. Reports & CSV Export
coopDashboardRouter.get('/reports', requireCooperativeAccess('view_reports'), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data } = await sb.rpc('get_coop_reports', { p_cooperative_id: req.cooperativeId! });
  const r = (data || {}) as { monthly?: unknown[]; productWise?: unknown[] };
  res.json({ monthly: r.monthly || [], productWise: r.productWise || [] });
});

coopDashboardRouter.get('/reports/export.csv', requireCooperativeAccess('view_reports'), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: orders } = await sb
    .from('orders')
    .select(
      'order_number, invoice_number, customer_name, customer_phone, delivery_district, subtotal_npr, discount_npr, delivery_fee_npr, total_npr, status, payment_method, payment_status, created_at'
    )
    .eq('cooperative_id', req.cooperativeId!)
    .order('created_at', { ascending: false });

  const headers = [
    'Order Number',
    'Invoice',
    'Customer',
    'Phone',
    'District',
    'Subtotal NPR',
    'Discount NPR',
    'Delivery Fee NPR',
    'Total NPR',
    'Order Status',
    'Payment Method',
    'Payment Status',
    'Created At',
  ];

  const escapeCsv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = (orders || []).map((o: Record<string, unknown>) =>
    [
      o.order_number,
      o.invoice_number,
      o.customer_name,
      o.customer_phone,
      o.delivery_district,
      o.subtotal_npr,
      o.discount_npr,
      o.delivery_fee_npr,
      o.total_npr,
      o.status,
      o.payment_method,
      o.payment_status,
      o.created_at,
    ]
      .map(escapeCsv)
      .join(',')
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="cooperative-sales-report.csv"');
  res.send('\uFEFF' + [headers.join(','), ...rows].join('\n'));
});

// 8. Promotions & Delivery Configs
coopDashboardRouter.get('/promotions', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: promotions } = await sb
    .from('promotions')
    .select('*')
    .eq('cooperative_id', req.cooperativeId!)
    .order('created_at', { ascending: false });
  res.json({ promotions: promotions || [] });
});

coopDashboardRouter.post('/promotions', requireCooperativeAccess('manage_settings'), async (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.titleNe || !b.discountValue) {
    return res.status(400).json({ error: 'कूपन कोड, शीर्षक र छुट मान आवश्यक छ।' });
  }
  const sb = requireSupabaseAdmin();
  const startsAt = b.startsAt ? new Date(b.startsAt).toISOString() : new Date().toISOString();
  const endsAt = b.endsAt
    ? new Date(b.endsAt).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from('promotions')
    .insert({
      cooperative_id: req.cooperativeId!,
      code: String(b.code).trim().toUpperCase(),
      title_ne: b.titleNe,
      title_en: b.titleEn || b.titleNe,
      discount_type: b.discountType === 'flat' ? 'flat' : 'percentage',
      discount_value: Number(b.discountValue),
      min_order_npr: Number(b.minOrderNpr || 0),
      max_uses: b.maxUses ? Number(b.maxUses) : null,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select('id')
    .single();

  if (error) return res.status(400).json({ error: 'यो कूपन कोड पहिले नै छ।' });
  res.status(201).json({ id: data.id });
});

coopDashboardRouter.delete('/promotions/:id', requireCooperativeAccess('manage_settings'), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { error } = await sb
    .from('promotions')
    .delete()
    .eq('id', req.params.id)
    .eq('cooperative_id', req.cooperativeId!);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

coopDashboardRouter.get('/delivery', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: config } = await sb
    .from('delivery_configs')
    .select('*')
    .eq('cooperative_id', req.cooperativeId!)
    .maybeSingle();

  res.json({
    config: config
      ? { ...config, delivery_areas: parseJsonField(config.delivery_areas_json, []) }
      : null,
  });
});

coopDashboardRouter.put('/delivery', requireCooperativeAccess('manage_settings'), async (req, res) => {
  const b = req.body || {};
  const areas = Array.isArray(b.delivery_areas)
    ? b.delivery_areas
    : String(b.delivery_areas_text || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const sb = requireSupabaseAdmin();
  const { error } = await sb
    .from('delivery_configs')
    .update({
      delivery_areas_json: areas,
      default_fee_npr: Number(b.default_fee_npr ?? 100),
      free_delivery_threshold_npr: Number(b.free_delivery_threshold_npr ?? 2500),
      minimum_order_npr: Number(b.minimum_order_npr ?? 0),
      pickup_enabled: Boolean(b.pickup_enabled),
      pickup_address_ne: b.pickup_address_ne || '',
      pickup_address_en: b.pickup_address_en || '',
      delivery_instructions_ne: b.delivery_instructions_ne || '',
      bank_payment_instructions_ne: b.bank_payment_instructions_ne || '',
    })
    .eq('cooperative_id', req.cooperativeId!);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// 9. Staff & Permissions
coopDashboardRouter.get('/staff', requireCooperativeAccess('manage_staff'), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data } = await sb
    .from('cooperative_staff')
    .select('*, profiles:user_id (full_name, email, phone)')
    .eq('cooperative_id', req.cooperativeId!)
    .order('created_at', { ascending: false });

  const staff = (data || []).map((s: Record<string, unknown>) => {
    const prof = (Array.isArray(s.profiles) ? s.profiles[0] : s.profiles) as Record<string, unknown> | null;
    const { profiles: _p, ...rest } = s;
    return {
      ...rest,
      full_name: prof?.full_name ?? null,
      email: prof?.email ?? null,
      phone: prof?.phone ?? null,
      permissions: parseJsonField(s.permissions_json, {}),
    };
  });

  res.json({ staff });
});

coopDashboardRouter.post('/staff', requireCooperativeAccess('manage_staff'), async (req, res) => {
  const coopId = req.cooperativeId!;
  const sb = requireSupabaseAdmin();
  const { sub } = await getCoopAndSub(coopId);

  const { count: currentStaff } = await sb
    .from('cooperative_staff')
    .select('*', { count: 'exact', head: true })
    .eq('cooperative_id', coopId)
    .eq('is_active', true);

  const maxStaff = Number(sub?.max_staff || 2);
  if ((currentStaff || 0) >= maxStaff) {
    return res.status(403).json({ error: `सदस्यता योजनाको अधिकतम कर्मचारी सीमा (${maxStaff}) पूरा भयो।` });
  }

  const { fullName, email, phone, password, staffRole, permissions } = req.body || {};
  if (!fullName || !password || (!email && !phone)) {
    return res.status(400).json({ error: 'कर्मचारीको नाम, इमेल/फोन र पासवर्ड आवश्यक छ।' });
  }

  let userId: string | null = null;
  try {
    const created = await createSupabaseAuthUser({
      email: email ? String(email).trim().toLowerCase() : null,
      phone: phone ? normalizeNepalPhone(String(phone)) : null,
      password: String(password),
      fullName: String(fullName).trim(),
      fullNameNe: String(fullName).trim(),
      role: 'cooperative_staff',
    });
    userId = created.id;

    const { data: staffRow, error: staffErr } = await sb
      .from('cooperative_staff')
      .insert({
        cooperative_id: coopId,
        user_id: userId,
        staff_role: staffRole || 'manager',
        permissions_json: permissions || {},
        invited_by: req.authUser!.id,
      })
      .select('id')
      .single();

    if (staffErr || !staffRow) {
      await sb.auth.admin.deleteUser(userId);
      return res.status(400).json({ error: staffErr?.message || 'कर्मचारी थप्न सकिएन।' });
    }
    res.status(201).json({ id: staffRow.id });
  } catch (err) {
    if (userId) await sb.auth.admin.deleteUser(userId);
    const msg = err instanceof Error ? err.message : '';
    return res.status(400).json({
      error: msg === 'DUPLICATE_USER' ? 'यो इमेल वा फोन पहिले नै दर्ता छ।' : 'कर्मचारी थप्न सकिएन।',
    });
  }
});

coopDashboardRouter.delete('/staff/:id', requireCooperativeAccess('manage_staff'), async (req, res) => {
  const sb = requireSupabaseAdmin();
  await sb.from('cooperative_staff').delete().eq('id', req.params.id).eq('cooperative_id', req.cooperativeId!);
  res.json({ ok: true });
});

// 10. Subscription, Billing, Notifications, Documents & Support
coopDashboardRouter.get('/billing', requireCooperativeAccess(), async (req, res) => {
  const coopId = req.cooperativeId!;
  const sb = requireSupabaseAdmin();
  const [{ sub }, plansRes, paysRes] = await Promise.all([
    getCoopAndSub(coopId),
    sb.from('subscription_plans').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    sb
      .from('subscription_payments')
      .select('*, subscription_plans (name_ne, name_en)')
      .eq('cooperative_id', coopId)
      .order('created_at', { ascending: false }),
  ]);

  const payments = (paysRes.data || []).map((sp: Record<string, unknown>) => {
    const plan = (Array.isArray(sp.subscription_plans)
      ? sp.subscription_plans[0]
      : sp.subscription_plans) as Record<string, unknown> | null;
    const { subscription_plans: _pl, ...rest } = sp;
    return {
      ...rest,
      plan_name_ne: plan?.name_ne ?? null,
      plan_name_en: plan?.name_en ?? null,
    };
  });

  res.json({ subscription: sub, plans: plansRes.data || [], payments });
});

coopDashboardRouter.post('/billing/submit-payment', requireCooperativeAccess(), async (req, res) => {
  const { planId, billingCycle, paymentMethod, referenceNumber, notes } = req.body || {};
  const sb = requireSupabaseAdmin();
  const { data: plan } = await sb
    .from('subscription_plans')
    .select('id, monthly_price_npr, annual_price_npr')
    .eq('id', planId)
    .maybeSingle();

  if (!plan) return res.status(404).json({ error: 'योजना फेला परेन।' });

  const amount = billingCycle === 'annual' ? Number(plan.annual_price_npr) : Number(plan.monthly_price_npr);
  const { data, error } = await sb
    .from('subscription_payments')
    .insert({
      cooperative_id: req.cooperativeId!,
      plan_id: plan.id,
      amount_npr: amount,
      billing_cycle: billingCycle === 'annual' ? 'annual' : 'monthly',
      payment_method: paymentMethod || 'bank_transfer',
      reference_number: referenceNumber || null,
      status: 'pending',
      notes: notes || null,
    })
    .select('id')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ id: data.id });
});

coopDashboardRouter.get('/notifications', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: notifications } = await sb
    .from('notifications')
    .select('*')
    .or(`cooperative_id.eq.${req.cooperativeId!},recipient_user_id.eq.${req.authUser!.id}`)
    .order('created_at', { ascending: false })
    .limit(40);
  res.json({ notifications: notifications || [] });
});

coopDashboardRouter.post('/notifications/read-all', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  await sb
    .from('notifications')
    .update({ is_read: true })
    .or(`cooperative_id.eq.${req.cooperativeId!},recipient_user_id.eq.${req.authUser!.id}`);
  res.json({ ok: true });
});

coopDashboardRouter.get('/documents', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data } = await sb
    .from('cooperative_documents')
    .select('*')
    .eq('cooperative_id', req.cooperativeId!)
    .order('created_at', { ascending: false });

  const documents = await Promise.all(
    (data || []).map(async (d: Record<string, unknown>) => ({
      ...d,
      file_url: await resolveDocumentAccessUrl(String(d.file_url || '')),
    }))
  );
  res.json({ documents });
});

coopDashboardRouter.get('/support', requireCooperativeAccess(), async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data } = await sb
    .from('support_tickets')
    .select('*, support_messages (*)')
    .eq('cooperative_id', req.cooperativeId!)
    .order('updated_at', { ascending: false });

  const tickets = (data || []).map((t: Record<string, unknown>) => {
    const msgs = ((t.support_messages as Array<Record<string, unknown>>) || []).sort(
      (a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime()
    );
    const { support_messages: _sm, ...rest } = t;
    return { ...rest, messages: msgs };
  });

  res.json({ tickets });
});

coopDashboardRouter.post('/support', requireCooperativeAccess(), async (req, res) => {
  const { subject, category, priority, message } = req.body || {};
  if (!subject || !message) return res.status(400).json({ error: 'विषय र सन्देश आवश्यक छ।' });
  const sb = requireSupabaseAdmin();

  const { data: ticket, error: ticketErr } = await sb
    .from('support_tickets')
    .insert({
      cooperative_id: req.cooperativeId!,
      user_id: req.authUser!.id,
      subject,
      category: category || 'general',
      priority: priority || 'normal',
      status: 'open',
    })
    .select('id')
    .single();

  if (ticketErr || !ticket) return res.status(400).json({ error: ticketErr?.message || 'टिकट सिर्जना असफल।' });

  await sb.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_user_id: req.authUser!.id,
    sender_role: req.authUser!.role,
    message,
  });

  res.status(201).json({ id: ticket.id });
});

coopDashboardRouter.post('/support/:id/reply', requireCooperativeAccess(), async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'सन्देश आवश्यक छ।' });
  const sb = requireSupabaseAdmin();

  const { data: ticket } = await sb
    .from('support_tickets')
    .select('id, status')
    .eq('id', req.params.id)
    .eq('cooperative_id', req.cooperativeId!)
    .maybeSingle();

  if (!ticket) return res.status(404).json({ error: 'सहायता टिकट फेला परेन।' });

  const { error: msgErr } = await sb.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_user_id: req.authUser!.id,
    sender_role: req.authUser!.role,
    message,
  });
  if (msgErr) return res.status(400).json({ error: msgErr.message });

  await sb
    .from('support_tickets')
    .update({
      status: ticket.status === 'resolved' || ticket.status === 'closed' ? 'open' : ticket.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id);

  res.status(201).json({ ok: true });
});
