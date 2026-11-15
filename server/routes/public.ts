import { Router } from 'express';
import { db } from '../db.ts';

export const publicRouter = Router();

publicRouter.get('/marketplace', (_req, res) => {
  const categories = db
    .prepare(`SELECT * FROM global_categories WHERE is_active = 1 ORDER BY sort_order ASC`)
    .all();

  const featuredCooperatives = db
    .prepare(
      `SELECT c.id, c.slug, c.name_ne, c.name_en, c.cooperative_type, c.province, c.district, c.municipality,
              c.logo_url, c.is_featured, s.store_name_ne, s.store_name_en, s.tagline_ne, s.tagline_en, s.banner_url, s.primary_color,
              (SELECT COUNT(*) FROM products p WHERE p.cooperative_id = c.id AND p.status = 'published' AND p.is_prohibited = 0) AS product_count
       FROM cooperatives c
       JOIN stores s ON s.cooperative_id = c.id
       WHERE c.status = 'approved' AND s.is_published = 1
       ORDER BY c.is_featured DESC, c.created_at DESC
       LIMIT 12`
    )
    .all();

  const featuredProducts = db
    .prepare(
      `SELECT p.*,
              (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS image_url,
              c.slug AS cooperative_slug, c.name_ne AS cooperative_name_ne, c.name_en AS cooperative_name_en, c.district AS cooperative_district,
              s.store_name_ne, s.store_name_en,
              gc.name_ne AS category_name_ne, gc.name_en AS category_name_en, gc.slug AS category_slug
       FROM products p
       JOIN cooperatives c ON c.id = p.cooperative_id
       JOIN stores s ON s.cooperative_id = c.id
       LEFT JOIN global_categories gc ON gc.id = p.global_category_id
       WHERE p.status = 'published' AND p.is_prohibited = 0 AND c.status = 'approved' AND s.is_published = 1
       ORDER BY p.is_platform_featured DESC, p.is_featured DESC, p.created_at DESC
       LIMIT 24`
    )
    .all();

  const plans = (
    db.prepare(`SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC`).all() as Record<
      string,
      unknown
    >[]
  ).map((p) => ({
    ...p,
    features: JSON.parse(String(p.features_json || '{}')),
  }));

  const brandingRow = db.prepare(`SELECT value_json FROM platform_settings WHERE key = 'branding'`).get() as
    | { value_json: string }
    | undefined;
  const branding = brandingRow ? JSON.parse(brandingRow.value_json) : {};

  const stats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM cooperatives WHERE status = 'approved') AS approved_cooperatives,
        (SELECT COUNT(*) FROM products p JOIN cooperatives c ON c.id = p.cooperative_id WHERE p.status = 'published' AND p.is_prohibited = 0 AND c.status = 'approved') AS published_products,
        (SELECT COUNT(DISTINCT district) FROM cooperatives WHERE status = 'approved') AS covered_districts`
    )
    .get();

  res.json({
    categories,
    featuredCooperatives,
    featuredProducts,
    plans,
    branding,
    stats,
  });
});

publicRouter.get('/cooperatives', (req, res) => {
  const { q, province, district, type } = req.query;
  const where: string[] = [`c.status = 'approved'`, `s.is_published = 1`];
  const params: unknown[] = [];

  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    where.push(`(c.name_ne LIKE ? OR c.name_en LIKE ? OR s.store_name_ne LIKE ? OR s.store_name_en LIKE ? OR c.district LIKE ?)`);
    params.push(like, like, like, like, like);
  }
  if (province && String(province).trim()) {
    where.push(`c.province = ?`);
    params.push(String(province).trim());
  }
  if (district && String(district).trim()) {
    where.push(`c.district = ?`);
    params.push(String(district).trim());
  }
  if (type && String(type).trim()) {
    where.push(`c.cooperative_type = ?`);
    params.push(String(type).trim());
  }

  const cooperatives = db
    .prepare(
      `SELECT c.id, c.slug, c.name_ne, c.name_en, c.cooperative_type, c.province, c.district, c.municipality, c.ward_number,
              c.logo_url, c.is_featured, c.registration_number, c.approved_at,
              s.store_name_ne, s.store_name_en, s.tagline_ne, s.tagline_en, s.banner_url, s.primary_color,
              (SELECT COUNT(*) FROM products p WHERE p.cooperative_id = c.id AND p.status = 'published' AND p.is_prohibited = 0) AS product_count
       FROM cooperatives c
       JOIN stores s ON s.cooperative_id = c.id
       WHERE ${where.join(' AND ')}
       ORDER BY c.is_featured DESC, c.name_en ASC`
    )
    .all(...params);

  res.json({ cooperatives });
});

publicRouter.get('/stores/:slug', (req, res) => {
  const preview = req.query.preview === '1';
  const coop = db
    .prepare(`SELECT * FROM cooperatives WHERE slug = ? LIMIT 1`)
    .get(req.params.slug) as Record<string, unknown> | undefined;

  if (!coop) {
    return res.status(404).json({ error: 'सहकारी पसल फेला परेन।' });
  }

  const isOwnerOrAdmin =
    req.authUser?.role === 'super_admin' ||
    (req.authUser?.cooperative_id && req.authUser.cooperative_id === coop.id);

  if (coop.status !== 'approved' && !(preview && isOwnerOrAdmin)) {
    return res.status(404).json({ error: 'यो सहकारी पसल हाल सार्वजनिक गरिएको छैन।' });
  }

  const store = db.prepare(`SELECT * FROM stores WHERE cooperative_id = ?`).get(coop.id) as
    | Record<string, unknown>
    | undefined;

  if (!store || (!store.is_published && !(preview && isOwnerOrAdmin))) {
    return res.status(404).json({ error: 'पसल प्रकाशित गरिएको छैन।' });
  }

  const coopCategories = db
    .prepare(`SELECT * FROM cooperative_categories WHERE cooperative_id = ? AND is_active = 1 ORDER BY sort_order ASC`)
    .all(coop.id);

  const deliveryConfig = db
    .prepare(`SELECT * FROM delivery_configs WHERE cooperative_id = ?`)
    .get(coop.id) as Record<string, unknown> | undefined;

  const products = db
    .prepare(
      `SELECT p.*,
              (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS image_url,
              gc.name_ne AS category_name_ne, gc.name_en AS category_name_en
       FROM products p
       LEFT JOIN global_categories gc ON gc.id = p.global_category_id
       WHERE p.cooperative_id = ? AND p.status = 'published' AND p.is_prohibited = 0
       ORDER BY p.is_featured DESC, p.created_at DESC`
    )
    .all(coop.id);

  // If previewing draft store builder config
  let activeStore = store;
  if (preview && isOwnerOrAdmin && store.draft_config_json) {
    try {
      const draft = JSON.parse(String(store.draft_config_json));
      activeStore = { ...store, ...draft };
    } catch {
      // keep published store
    }
  }

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
      status: coop.status,
    },
    store: {
      ...activeStore,
      sections: JSON.parse(String(activeStore.sections_json || '[]')),
      socialLinks: JSON.parse(String(activeStore.social_links_json || '{}')),
    },
    coopCategories,
    deliveryConfig: deliveryConfig
      ? {
          ...deliveryConfig,
          delivery_areas: JSON.parse(String(deliveryConfig.delivery_areas_json || '[]')),
        }
      : null,
    products,
  });
});

publicRouter.get('/products', (req, res) => {
  const { q, category, cooperativeId, district, discounted, sort } = req.query;
  const where: string[] = [
    `p.status = 'published'`,
    `p.is_prohibited = 0`,
    `c.status = 'approved'`,
    `s.is_published = 1`,
  ];
  const params: unknown[] = [];

  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    where.push(`(p.name_ne LIKE ? OR p.name_en LIKE ? OR p.description_ne LIKE ? OR p.description_en LIKE ? OR c.name_ne LIKE ? OR c.name_en LIKE ?)`);
    params.push(like, like, like, like, like, like);
  }
  if (category && String(category).trim()) {
    where.push(`gc.slug = ?`);
    params.push(String(category).trim());
  }
  if (cooperativeId && String(cooperativeId).trim()) {
    where.push(`p.cooperative_id = ?`);
    params.push(String(cooperativeId).trim());
  }
  if (district && String(district).trim()) {
    where.push(`c.district = ?`);
    params.push(String(district).trim());
  }
  if (discounted === '1') {
    where.push(`p.discount_price_npr IS NOT NULL AND p.discount_price_npr < p.price_npr`);
  }

  let orderBy = `p.is_platform_featured DESC, p.created_at DESC`;
  if (sort === 'price_asc') orderBy = `COALESCE(p.discount_price_npr, p.price_npr) ASC`;
  else if (sort === 'price_desc') orderBy = `COALESCE(p.discount_price_npr, p.price_npr) DESC`;
  else if (sort === 'newest') orderBy = `p.created_at DESC`;

  const products = db
    .prepare(
      `SELECT p.*,
              (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS image_url,
              c.slug AS cooperative_slug, c.name_ne AS cooperative_name_ne, c.name_en AS cooperative_name_en, c.district AS cooperative_district,
              s.store_name_ne, s.store_name_en,
              gc.name_ne AS category_name_ne, gc.name_en AS category_name_en, gc.slug AS category_slug
       FROM products p
       JOIN cooperatives c ON c.id = p.cooperative_id
       JOIN stores s ON s.cooperative_id = c.id
       LEFT JOIN global_categories gc ON gc.id = p.global_category_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT 60`
    )
    .all(...params);

  res.json({ products });
});

publicRouter.get('/products/:slug', (req, res) => {
  const product = db
    .prepare(
      `SELECT p.*,
              c.slug AS cooperative_slug, c.name_ne AS cooperative_name_ne, c.name_en AS cooperative_name_en,
              c.district AS cooperative_district, c.province AS cooperative_province, c.municipality AS cooperative_municipality,
              c.registration_number, c.status AS cooperative_status,
              s.store_name_ne, s.store_name_en, s.logo_url AS store_logo_url, s.primary_color,
              gc.name_ne AS category_name_ne, gc.name_en AS category_name_en, gc.slug AS category_slug
       FROM products p
       JOIN cooperatives c ON c.id = p.cooperative_id
       JOIN stores s ON s.cooperative_id = c.id
       LEFT JOIN global_categories gc ON gc.id = p.global_category_id
       WHERE p.slug = ? AND p.status = 'published' AND p.is_prohibited = 0 AND c.status = 'approved'
       LIMIT 1`
    )
    .get(req.params.slug) as Record<string, unknown> | undefined;

  if (!product) {
    return res.status(404).json({ error: 'उत्पादन फेला परेन।' });
  }

  const images = db
    .prepare(`SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC`)
    .all(product.id);

  const deliveryConfig = db
    .prepare(`SELECT * FROM delivery_configs WHERE cooperative_id = ?`)
    .get(product.cooperative_id) as Record<string, unknown> | undefined;

  const related = db
    .prepare(
      `SELECT p.*,
              (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS image_url,
              c.slug AS cooperative_slug, s.store_name_ne, s.store_name_en
       FROM products p
       JOIN cooperatives c ON c.id = p.cooperative_id
       JOIN stores s ON s.cooperative_id = c.id
       WHERE p.cooperative_id = ? AND p.id != ? AND p.status = 'published' AND p.is_prohibited = 0
       LIMIT 4`
    )
    .all(product.cooperative_id, product.id);

  res.json({
    product,
    images,
    deliveryConfig: deliveryConfig
      ? { ...deliveryConfig, delivery_areas: JSON.parse(String(deliveryConfig.delivery_areas_json || '[]')) }
      : null,
    related,
  });
});
