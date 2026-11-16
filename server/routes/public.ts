import { Router } from 'express';
import { parseJsonField, requireSupabaseAdmin } from '../supabase-admin.ts';

export const publicRouter = Router();

const DEFAULT_HERO_PLACEHOLDER = '/images/hero-nepal-cooperative.jpg';

function resolveStoreLogo(storeLogo: unknown, coopLogo: unknown): string | null {
  const s = typeof storeLogo === 'string' ? storeLogo.trim() : '';
  const c = typeof coopLogo === 'string' ? coopLogo.trim() : '';
  if (s && s !== DEFAULT_HERO_PLACEHOLDER) return s;
  if (c && c !== DEFAULT_HERO_PLACEHOLDER) return c;
  return s || c || null;
}

function pickPrimaryImage(images: Array<{ image_url: string; is_primary?: boolean; sort_order?: number }> | null | undefined): string | null {
  if (!images || images.length === 0) return null;
  const sorted = [...images].sort((a, b) => {
    if (Boolean(b.is_primary) !== Boolean(a.is_primary)) return b.is_primary ? 1 : -1;
    return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
  });
  return sorted[0]?.image_url ?? null;
}

function flattenProductRow(p: Record<string, unknown>): Record<string, unknown> {
  const coop = (Array.isArray(p.cooperatives) ? p.cooperatives[0] : p.cooperatives) as Record<string, unknown> | null;
  const storesRel = coop?.stores;
  const store = (Array.isArray(storesRel) ? storesRel[0] : storesRel) as Record<string, unknown> | null;
  const cat = (Array.isArray(p.global_categories) ? p.global_categories[0] : p.global_categories) as Record<
    string,
    unknown
  > | null;
  const imgs = p.product_images as Array<{ image_url: string; is_primary?: boolean; sort_order?: number }> | undefined;

  const { cooperatives: _c, global_categories: _gc, product_images: _pi, ...rest } = p;
  return {
    ...rest,
    ai_details_json: parseJsonField(p.ai_details_json, {}),
    seo_keywords_json: parseJsonField(p.seo_keywords_json, []),
    image_url: pickPrimaryImage(imgs),
    cooperative_slug: coop?.slug ?? null,
    cooperative_name_ne: coop?.name_ne ?? null,
    cooperative_name_en: coop?.name_en ?? null,
    cooperative_district: coop?.district ?? null,
    cooperative_province: coop?.province ?? null,
    cooperative_municipality: coop?.municipality ?? null,
    registration_number: coop?.registration_number ?? null,
    cooperative_status: coop?.status ?? null,
    store_name_ne: store?.store_name_ne ?? null,
    store_name_en: store?.store_name_en ?? null,
    store_logo_url: store?.logo_url ?? null,
    primary_color: store?.primary_color ?? null,
    category_name_ne: cat?.name_ne ?? null,
    category_name_en: cat?.name_en ?? null,
    category_slug: cat?.slug ?? null,
  };
}

publicRouter.get('/marketplace', async (_req, res) => {
  try {
    const sb = requireSupabaseAdmin();

    const [catsRes, coopsRes, prodsRes, plansRes, brandingRes] = await Promise.all([
      sb.from('global_categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      sb
        .from('cooperatives')
        .select(
          `id, slug, name_ne, name_en, cooperative_type, province, district, municipality, logo_url, is_featured, created_at,
           stores!inner (store_name_ne, store_name_en, tagline_ne, tagline_en, logo_url, banner_url, primary_color, is_published),
           products (id, status, is_prohibited)`
        )
        .eq('status', 'approved')
        .is('deleted_at', null)
        .eq('stores.is_published', true)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(12),
      sb
        .from('products')
        .select(
          `*,
           product_images (image_url, is_primary, sort_order),
           global_categories (name_ne, name_en, slug),
           cooperatives!inner (id, slug, name_ne, name_en, district, status, deleted_at, stores!inner (store_name_ne, store_name_en, logo_url, is_published))`
        )
        .eq('status', 'published')
        .is('deleted_at', null)
        .eq('is_prohibited', false)
        .eq('cooperatives.status', 'approved')
        .is('cooperatives.deleted_at', null)
        .eq('cooperatives.stores.is_published', true)
        .order('is_platform_featured', { ascending: false })
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(24),
      sb.from('subscription_plans').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      sb.from('platform_settings').select('value_json').eq('key', 'branding').maybeSingle(),
    ]);

    const featuredCooperatives = (coopsRes.data || []).map((c: Record<string, unknown>) => {
      const store = (Array.isArray(c.stores) ? c.stores[0] : c.stores) as Record<string, unknown>;
      const prods = (c.products as Array<{ status: string; is_prohibited: boolean }>) || [];
      return {
        id: c.id,
        slug: c.slug,
        name_ne: c.name_ne,
        name_en: c.name_en,
        cooperative_type: c.cooperative_type,
        province: c.province,
        district: c.district,
        municipality: c.municipality,
        logo_url: resolveStoreLogo(store?.logo_url, c.logo_url),
        is_featured: c.is_featured,
        store_name_ne: store?.store_name_ne,
        store_name_en: store?.store_name_en,
        tagline_ne: store?.tagline_ne,
        tagline_en: store?.tagline_en,
        banner_url: store?.banner_url,
        primary_color: store?.primary_color,
        product_count: prods.filter((p) => p.status === 'published' && !p.is_prohibited).length,
      };
    });

    const featuredProducts = (prodsRes.data || []).map((p) => flattenProductRow(p as Record<string, unknown>));

    const plans = (plansRes.data || []).map((p: Record<string, unknown>) => ({
      ...p,
      features: parseJsonField(p.features_json, {}),
    }));

    const branding = brandingRes.data ? parseJsonField(brandingRes.data.value_json, {}) : {};

    const [{ count: approvedCount }, { data: allApprovedDistricts }] = await Promise.all([
      sb.from('cooperatives').select('*', { count: 'exact', head: true }).eq('status', 'approved').is('deleted_at', null),
      sb.from('cooperatives').select('district').eq('status', 'approved').is('deleted_at', null),
    ]);
    const { count: publishedCount } = await sb
      .from('products')
      .select('id, cooperatives!inner(status, deleted_at)', { count: 'exact', head: true })
      .eq('status', 'published')
      .is('deleted_at', null)
      .eq('is_prohibited', false)
      .eq('cooperatives.status', 'approved')
      .is('cooperatives.deleted_at', null);

    const coveredDistricts = new Set((allApprovedDistricts || []).map((d: { district: string }) => d.district)).size;

    res.json({
      categories: catsRes.data || [],
      featuredCooperatives,
      featuredProducts,
      plans,
      branding,
      stats: {
        approved_cooperatives: approvedCount || 0,
        published_products: publishedCount || 0,
        covered_districts: coveredDistricts,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Marketplace fetch failed' });
  }
});

publicRouter.get('/cooperatives', async (req, res) => {
  try {
    const sb = requireSupabaseAdmin();
    const { q, province, district, type } = req.query;

    let query = sb
      .from('cooperatives')
      .select(
        `id, slug, name_ne, name_en, cooperative_type, province, district, municipality, ward_number,
         logo_url, is_featured, registration_number, approved_at,
         stores!inner (store_name_ne, store_name_en, tagline_ne, tagline_en, logo_url, banner_url, primary_color, is_published),
         products (id, status, is_prohibited)`
      )
      .eq('status', 'approved')
      .is('deleted_at', null)
      .eq('stores.is_published', true)
      .order('is_featured', { ascending: false })
      .order('name_en', { ascending: true });

    if (province && String(province).trim()) query = query.eq('province', String(province).trim());
    if (district && String(district).trim()) query = query.eq('district', String(district).trim());
    if (type && String(type).trim()) query = query.eq('cooperative_type', String(type).trim());

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const search = q && String(q).trim().toLowerCase();
    const cooperatives = (data || [])
      .map((c: Record<string, unknown>) => {
        const store = (Array.isArray(c.stores) ? c.stores[0] : c.stores) as Record<string, unknown>;
        const prods = (c.products as Array<{ status: string; is_prohibited: boolean }>) || [];
        return {
          id: c.id,
          slug: c.slug,
          name_ne: c.name_ne,
          name_en: c.name_en,
          cooperative_type: c.cooperative_type,
          province: c.province,
          district: c.district,
          municipality: c.municipality,
          ward_number: c.ward_number,
          logo_url: resolveStoreLogo(store?.logo_url, c.logo_url),
          is_featured: c.is_featured,
          registration_number: c.registration_number,
          approved_at: c.approved_at,
          store_name_ne: store?.store_name_ne,
          store_name_en: store?.store_name_en,
          tagline_ne: store?.tagline_ne,
          tagline_en: store?.tagline_en,
          banner_url: store?.banner_url,
          primary_color: store?.primary_color,
          product_count: prods.filter((p) => p.status === 'published' && !p.is_prohibited).length,
        };
      })
      .filter((c) => {
        if (!search) return true;
        return [c.name_ne, c.name_en, c.store_name_ne, c.store_name_en, c.district]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(search));
      });

    res.json({ cooperatives });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Cooperatives fetch failed' });
  }
});

publicRouter.get('/stores/:slug', async (req, res) => {
  try {
    const sb = requireSupabaseAdmin();
    const preview = req.query.preview === '1';

    const { data: coop } = await sb
      .from('cooperatives')
      .select('*')
      .eq('slug', req.params.slug)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (!coop) {
      return res.status(404).json({ error: 'सहकारी पसल फेला परेन।' });
    }

    const isOwnerOrAdmin =
      req.authUser?.role === 'super_admin' ||
      (req.authUser?.cooperative_id && req.authUser.cooperative_id === coop.id);

    if (coop.status !== 'approved' && !(preview && isOwnerOrAdmin)) {
      return res.status(404).json({ error: 'यो सहकारी पसल हाल सार्वजनिक गरिएको छैन।' });
    }

    const { data: store } = await sb
      .from('stores')
      .select('*')
      .eq('cooperative_id', coop.id)
      .maybeSingle();

    if (!store || (!store.is_published && !(preview && isOwnerOrAdmin))) {
      return res.status(404).json({ error: 'पसल प्रकाशित गरिएको छैन।' });
    }

    const [catsRes, delivRes, prodsRes] = await Promise.all([
      sb
        .from('cooperative_categories')
        .select('*')
        .eq('cooperative_id', coop.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      sb.from('delivery_configs').select('*').eq('cooperative_id', coop.id).maybeSingle(),
      sb
        .from('products')
        .select('*, product_images (image_url, is_primary, sort_order), global_categories (name_ne, name_en, slug)')
        .eq('cooperative_id', coop.id)
        .eq('status', 'published')
        .is('deleted_at', null)
        .eq('is_prohibited', false)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    let activeStore: Record<string, unknown> = store;
    if (preview && isOwnerOrAdmin && store.draft_config_json) {
      const draft = parseJsonField<Record<string, unknown> | null>(store.draft_config_json, null);
      if (draft) activeStore = { ...store, ...draft };
    }

    const products = (prodsRes.data || []).map((p: Record<string, unknown>) => ({
      ...flattenProductRow(p),
      cooperative_slug: coop.slug,
      cooperative_name_ne: coop.name_ne,
      cooperative_name_en: coop.name_en,
      store_name_ne: activeStore.store_name_ne,
      store_name_en: activeStore.store_name_en,
    }));

    const resolvedLogo = resolveStoreLogo(activeStore.logo_url, coop.logo_url);

    res.json({
      cooperative: {
        id: coop.id,
        slug: coop.slug,
        name_ne: coop.name_ne,
        name_en: coop.name_en,
        registration_number: coop.registration_number,
        registration_authority: coop.registration_authority,
        registration_date_bs: coop.registration_date_bs,
        cooperative_type: coop.cooperative_type,
        province: coop.province,
        district: coop.district,
        municipality: coop.municipality,
        ward_number: coop.ward_number,
        tole_address: coop.tole_address,
        contact_phone: coop.contact_phone,
        contact_email: coop.contact_email,
        logo_url: resolvedLogo,
        status: coop.status,
      },
      store: {
        ...activeStore,
        logo_url: resolvedLogo,
        sections: parseJsonField(activeStore.sections ?? activeStore.sections_json, []),
        socialLinks: parseJsonField(activeStore.socialLinks ?? activeStore.social_links_json, {}),
      },
      coopCategories: catsRes.data || [],
      deliveryConfig: delivRes.data
        ? {
            ...delivRes.data,
            delivery_areas: parseJsonField(delivRes.data.delivery_areas_json, []),
          }
        : null,
      products,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Store fetch failed' });
  }
});

publicRouter.get('/products', async (req, res) => {
  try {
    const sb = requireSupabaseAdmin();
    const { q, category, cooperativeId, district, discounted, sort } = req.query;

    let query = sb
      .from('products')
      .select(
        `*,
         product_images (image_url, is_primary, sort_order),
         global_categories (name_ne, name_en, slug),
         cooperatives!inner (id, slug, name_ne, name_en, district, status, deleted_at, stores!inner (store_name_ne, store_name_en, is_published))`
      )
      .eq('status', 'published')
      .is('deleted_at', null)
      .eq('is_prohibited', false)
      .eq('cooperatives.status', 'approved')
      .is('cooperatives.deleted_at', null)
      .eq('cooperatives.stores.is_published', true);

    if (cooperativeId && String(cooperativeId).trim()) {
      query = query.eq('cooperative_id', String(cooperativeId).trim());
    }
    if (district && String(district).trim()) {
      query = query.eq('cooperatives.district', String(district).trim());
    }

    const { data, error } = await query.limit(100);
    if (error) throw new Error(error.message);

    const search = q && String(q).trim().toLowerCase();
    const catSlug = category && String(category).trim();

    let products = (data || [])
      .map((p) => flattenProductRow(p as Record<string, unknown>))
      .filter((p) => {
        if (catSlug && p.category_slug !== catSlug) return false;
        if (discounted === '1') {
          if (p.discount_price_npr === null || Number(p.discount_price_npr) >= Number(p.price_npr)) return false;
        }
        if (search) {
          const hay = [
            p.name_ne,
            p.name_en,
            p.description_ne,
            p.description_en,
            p.cooperative_name_ne,
            p.cooperative_name_en,
          ];
          if (!hay.filter(Boolean).some((v) => String(v).toLowerCase().includes(search))) return false;
        }
        return true;
      });

    const effectivePrice = (p: Record<string, unknown>) =>
      p.discount_price_npr !== null && Number(p.discount_price_npr) > 0
        ? Number(p.discount_price_npr)
        : Number(p.price_npr);

    if (sort === 'price_asc') {
      products.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    } else if (sort === 'price_desc') {
      products.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    } else if (sort === 'newest') {
      products.sort((a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime());
    } else {
      products.sort((a, b) => {
        if (Boolean(b.is_platform_featured) !== Boolean(a.is_platform_featured)) {
          return b.is_platform_featured ? 1 : -1;
        }
        return new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime();
      });
    }

    products = products.slice(0, 60);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Products fetch failed' });
  }
});

publicRouter.get('/products/:slug', async (req, res) => {
  try {
    const sb = requireSupabaseAdmin();

    const { data: rawProduct } = await sb
      .from('products')
      .select(
        `*,
         product_images (*),
         global_categories (name_ne, name_en, slug),
         cooperatives!inner (id, slug, name_ne, name_en, district, province, municipality, registration_number, status, deleted_at,
           stores!inner (store_name_ne, store_name_en, logo_url, primary_color, is_published))`
      )
      .eq('slug', req.params.slug)
      .eq('status', 'published')
      .is('deleted_at', null)
      .eq('is_prohibited', false)
      .eq('cooperatives.status', 'approved')
      .is('cooperatives.deleted_at', null)
      .eq('cooperatives.stores.is_published', true)
      .limit(1)
      .maybeSingle();

    if (!rawProduct) {
      return res.status(404).json({ error: 'उत्पादन फेला परेन।' });
    }

    const images = ((rawProduct.product_images as Array<Record<string, unknown>>) || []).sort((a, b) => {
      if (Boolean(b.is_primary) !== Boolean(a.is_primary)) return b.is_primary ? 1 : -1;
      return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    });
    const product = flattenProductRow(rawProduct as Record<string, unknown>);

    const [delivRes, relatedRes] = await Promise.all([
      sb.from('delivery_configs').select('*').eq('cooperative_id', product.cooperative_id).maybeSingle(),
      sb
        .from('products')
        .select('*, product_images (image_url, is_primary, sort_order), cooperatives!inner (slug, deleted_at, stores!inner (store_name_ne, store_name_en, is_published))')
        .eq('cooperative_id', product.cooperative_id)
        .neq('id', product.id)
        .eq('status', 'published')
        .is('deleted_at', null)
        .eq('is_prohibited', false)
        .is('cooperatives.deleted_at', null)
        .eq('cooperatives.stores.is_published', true)
        .limit(4),
    ]);

    const related = (relatedRes.data || []).map((r) => flattenProductRow(r as Record<string, unknown>));

    res.json({
      product,
      images,
      deliveryConfig: delivRes.data
        ? { ...delivRes.data, delivery_areas: parseJsonField(delivRes.data.delivery_areas_json, []) }
        : null,
      related,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Product fetch failed' });
  }
});

publicRouter.get('/legal/:doc', async (req, res) => {
  const allowed = ['about', 'faq', 'terms', 'privacy'];
  const doc = String(req.params.doc || '');
  if (!allowed.includes(doc)) {
    return res.status(404).json({ error: 'Document not found' });
  }
  const sb = requireSupabaseAdmin();
  const { data } = await sb.from('platform_settings').select('value_json').eq('key', `legal_${doc}`).maybeSingle();
  res.json({ doc, custom: data ? parseJsonField(data.value_json, null) : null });
});
