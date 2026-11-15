import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { db } from '../db.ts';
import { hashPassword, requireCooperativeAccess, writeAuditLog } from '../auth.ts';
import { normalizeNepalPhone, sendAkashSms } from '../akash-sms.ts';

export const coopDashboardRouter = Router();

function saveImageUpload(dataUrl: string, prefix: string): string {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('अमान्य छवि ढाँचा (PNG/JPG/WEBP मात्र)।');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) throw new Error('छवि साइज ५ MB भन्दा कम हुनुपर्छ।');
  const fileName = `${prefix}-${crypto.randomUUID()}.${match[1].split('/')[1]}`;
  const dir = path.join(process.cwd(), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return `/uploads/${fileName}`;
}

function getCoopAndSub(coopId: string) {
  const coop = db.prepare(`SELECT * FROM cooperatives WHERE id = ?`).get(coopId) as Record<string, unknown>;
  const sub = db
    .prepare(
      `SELECT s.*, sp.code AS plan_code, sp.name_ne AS plan_name_ne, sp.name_en AS plan_name_en,
              sp.max_products, sp.max_staff, sp.max_storage_mb, sp.features_json
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.cooperative_id = ?
       ORDER BY s.created_at DESC LIMIT 1`
    )
    .get(coopId) as Record<string, unknown> | undefined;
  return { coop, sub };
}

// 1. Overview & Analytics
coopDashboardRouter.get('/overview', requireCooperativeAccess(), (req, res) => {
  const coopId = req.cooperativeId!;
  const { coop, sub } = getCoopAndSub(coopId);

  const metrics = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_npr ELSE 0 END), 0) AS total_sales,
        COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') AND date(created_at, '+345 minutes') = date('now', '+345 minutes') THEN total_npr ELSE 0 END), 0) AS today_sales,
        COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN total_npr ELSE 0 END), 0) AS monthly_sales,
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_orders
       FROM orders WHERE cooperative_id = ?`
    )
    .get(coopId);

  const productStats = db
    .prepare(
      `SELECT
        COUNT(*) AS total_products,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_products,
        SUM(CASE WHEN stock_quantity <= low_stock_threshold THEN 1 ELSE 0 END) AS low_stock_count
       FROM products WHERE cooperative_id = ?`
    )
    .get(coopId);

  const lowStockItems = db
    .prepare(
      `SELECT id, sku, name_ne, name_en, stock_quantity, low_stock_threshold
       FROM products
       WHERE cooperative_id = ? AND stock_quantity <= low_stock_threshold
       ORDER BY stock_quantity ASC LIMIT 10`
    )
    .all(coopId);

  const dailySales = db
    .prepare(
      `SELECT date(created_at, '+345 minutes') AS day,
              COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_npr ELSE 0 END), 0) AS revenue,
              COUNT(*) AS order_count
       FROM orders
       WHERE cooperative_id = ? AND created_at >= datetime('now', '-14 days')
       GROUP BY day
       ORDER BY day ASC`
    )
    .all(coopId);

  const recentOrders = db
    .prepare(`SELECT * FROM orders WHERE cooperative_id = ? ORDER BY created_at DESC LIMIT 8`)
    .all(coopId);

  res.json({
    cooperative: coop,
    subscription: sub,
    metrics,
    productStats,
    lowStockItems,
    dailySales,
    recentOrders,
  });
});

// 2. Store Builder & Settings
coopDashboardRouter.get('/store', requireCooperativeAccess(), (req, res) => {
  const coopId = req.cooperativeId!;
  const store = db.prepare(`SELECT * FROM stores WHERE cooperative_id = ?`).get(coopId) as Record<string, unknown>;
  const coop = db.prepare(`SELECT slug, status FROM cooperatives WHERE id = ?`).get(coopId);
  res.json({
    cooperative: coop,
    store: {
      ...store,
      sections: JSON.parse(String(store.sections_json || '[]')),
      socialLinks: JSON.parse(String(store.social_links_json || '{}')),
      draftConfig: store.draft_config_json ? JSON.parse(String(store.draft_config_json)) : null,
    },
  });
});

coopDashboardRouter.put('/store', requireCooperativeAccess('manage_store'), (req, res) => {
  const coopId = req.cooperativeId!;
  const { coop } = getCoopAndSub(coopId);
  const body = req.body || {};

  let logoUrl = body.logo_url;
  let bannerUrl = body.banner_url;
  try {
    if (body.logoBase64 && String(body.logoBase64).startsWith('data:')) {
      logoUrl = saveImageUpload(String(body.logoBase64), 'store-logo');
    }
    if (body.bannerBase64 && String(body.bannerBase64).startsWith('data:')) {
      bannerUrl = saveImageUpload(String(body.bannerBase64), 'store-banner');
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
    social_links_json: JSON.stringify(body.socialLinks || {}),
    sections_json: JSON.stringify(sanitizedSections),
  };

  if (publishRequested) {
    db.prepare(
      `UPDATE stores SET
        store_name_ne = ?, store_name_en = ?, tagline_ne = ?, tagline_en = ?,
        theme_key = ?, primary_color = ?, accent_color = ?, font_key = ?,
        logo_url = ?, banner_url = ?, intro_ne = ?, intro_en = ?,
        mission_ne = ?, mission_en = ?, vision_ne = ?, vision_en = ?,
        notice_ne = ?, notice_en = ?, footer_text_ne = ?, footer_text_en = ?,
        contact_phone = ?, contact_email = ?, address_text = ?, custom_domain = ?,
        social_links_json = ?, sections_json = ?, draft_config_json = NULL,
        is_published = 1, published_at = datetime('now'), updated_at = datetime('now')
       WHERE cooperative_id = ?`
    ).run(
      updatePayload.store_name_ne,
      updatePayload.store_name_en,
      updatePayload.tagline_ne,
      updatePayload.tagline_en,
      updatePayload.theme_key,
      updatePayload.primary_color,
      updatePayload.accent_color,
      updatePayload.font_key,
      updatePayload.logo_url,
      updatePayload.banner_url,
      updatePayload.intro_ne,
      updatePayload.intro_en,
      updatePayload.mission_ne,
      updatePayload.mission_en,
      updatePayload.vision_ne,
      updatePayload.vision_en,
      updatePayload.notice_ne,
      updatePayload.notice_en,
      updatePayload.footer_text_ne,
      updatePayload.footer_text_en,
      updatePayload.contact_phone,
      updatePayload.contact_email,
      updatePayload.address_text,
      updatePayload.custom_domain,
      updatePayload.social_links_json,
      updatePayload.sections_json,
      coopId
    );
  } else {
    db.prepare(`UPDATE stores SET draft_config_json = ?, updated_at = datetime('now') WHERE cooperative_id = ?`).run(
      JSON.stringify({ ...updatePayload, sections: sanitizedSections, socialLinks: body.socialLinks || {} }),
      coopId
    );
  }

  writeAuditLog({
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
coopDashboardRouter.get('/categories', requireCooperativeAccess(), (req, res) => {
  const globalCategories = db.prepare(`SELECT * FROM global_categories WHERE is_active = 1 ORDER BY sort_order ASC`).all();
  const coopCategories = db
    .prepare(`SELECT * FROM cooperative_categories WHERE cooperative_id = ? ORDER BY sort_order ASC`)
    .all(req.cooperativeId!);
  res.json({ globalCategories, coopCategories });
});

coopDashboardRouter.post('/categories', requireCooperativeAccess('manage_products'), (req, res) => {
  const { nameNe, nameEn } = req.body || {};
  if (!nameNe || !nameEn) return res.status(400).json({ error: 'नेपाली र अंग्रेजी वर्ग नाम आवश्यक छ।' });
  const id = crypto.randomUUID();
  const slug =
    String(nameEn)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `cat-${Date.now()}`;
  db.prepare(
    `INSERT INTO cooperative_categories (id, cooperative_id, slug, name_ne, name_en) VALUES (?, ?, ?, ?, ?)`
  ).run(id, req.cooperativeId!, `${slug}-${crypto.randomBytes(2).toString('hex')}`, nameNe, nameEn);
  res.status(201).json({ id });
});

coopDashboardRouter.delete('/categories/:id', requireCooperativeAccess('manage_products'), (req, res) => {
  db.prepare(`DELETE FROM cooperative_categories WHERE id = ? AND cooperative_id = ?`).run(
    req.params.id,
    req.cooperativeId!
  );
  res.json({ ok: true });
});

// 4. Products & Inventory
coopDashboardRouter.get('/products', requireCooperativeAccess(), (req, res) => {
  const products = db
    .prepare(
      `SELECT p.*,
              (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC LIMIT 1) AS image_url,
              gc.name_ne AS category_name_ne, gc.name_en AS category_name_en
       FROM products p
       LEFT JOIN global_categories gc ON gc.id = p.global_category_id
       WHERE p.cooperative_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(req.cooperativeId!);
  res.json({ products });
});

coopDashboardRouter.post('/products', requireCooperativeAccess('manage_products'), (req, res) => {
  const coopId = req.cooperativeId!;
  const { coop, sub } = getCoopAndSub(coopId);
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

  const currentCount = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM products WHERE cooperative_id = ? AND status != 'archived'`).get(coopId) as {
      cnt: number;
    }
  ).cnt;
  const maxProducts = Number(sub?.max_products || 15);
  if (currentCount >= maxProducts) {
    return res.status(403).json({ error: `तपाईंको योजनाको अधिकतम उत्पादन सीमा (${maxProducts}) पूरा भएको छ।` });
  }

  let imageUrl = b.imageUrl || '/images/product-ilam-tea.jpg';
  if (b.imageBase64 && String(b.imageBase64).startsWith('data:')) {
    try {
      imageUrl = saveImageUpload(String(b.imageBase64), 'prod');
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'छवि अपलोड असफल।' });
    }
  }

  const productId = crypto.randomUUID();
  const slugBase =
    String(b.nameEn)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'product';
  const slug = `${slugBase}-${crypto.randomBytes(2).toString('hex')}`;
  const stockQty = Math.max(0, Math.floor(Number(b.stockQuantity || 0)));

  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO products (
          id, cooperative_id, global_category_id, coop_category_id, slug, sku,
          name_ne, name_en, description_ne, description_en,
          price_npr, discount_price_npr, unit_label_ne, unit_label_en,
          stock_quantity, low_stock_threshold, availability_status,
          origin_district, producer_name, is_featured, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        productId,
        coopId,
        b.globalCategoryId || null,
        b.coopCategoryId || null,
        slug,
        String(b.sku).trim().toUpperCase(),
        String(b.nameNe).trim(),
        String(b.nameEn).trim(),
        b.descriptionNe || '',
        b.descriptionEn || '',
        Number(b.priceNpr),
        b.discountPriceNpr ? Number(b.discountPriceNpr) : null,
        b.unitLabelNe || 'के.जी.',
        b.unitLabelEn || 'kg',
        stockQty,
        Math.max(0, Number(b.lowStockThreshold ?? 5)),
        stockQty > 0 ? 'in_stock' : 'out_of_stock',
        b.originDistrict || null,
        b.producerName || null,
        b.isFeatured ? 1 : 0,
        desiredStatus
      );

      db.prepare(
        `INSERT INTO product_images (id, product_id, cooperative_id, image_url, alt_text, is_primary)
         VALUES (?, ?, ?, ?, ?, 1)`
      ).run(crypto.randomUUID(), productId, coopId, imageUrl, String(b.nameEn));

      db.prepare(
        `INSERT INTO inventory_movements (id, cooperative_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, note, created_by)
         VALUES (?, ?, ?, 'initial', ?, 0, ?, 'प्रारम्भिक स्टक', ?)`
      ).run(crypto.randomUUID(), coopId, productId, stockQty, stockQty, req.authUser!.id);
    })();
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error && err.message.includes('UNIQUE') ? 'यो SKU पहिले नै प्रयोग भइसकेको छ।' : 'उत्पादन थप्न सकिएन।',
    });
  }

  res.status(201).json({ id: productId, slug });
});

coopDashboardRouter.patch('/products/:id', requireCooperativeAccess('manage_products'), (req, res) => {
  const coopId = req.cooperativeId!;
  const existing = db
    .prepare(`SELECT * FROM products WHERE id = ? AND cooperative_id = ?`)
    .get(req.params.id, coopId) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'उत्पादन फेला परेन।' });

  const b = req.body || {};
  const { coop } = getCoopAndSub(coopId);

  if (b.status === 'published' && coop.status !== 'approved') {
    return res.status(403).json({ error: 'सहकारी स्वीकृत नभई उत्पादन प्रकाशित गर्न मिल्दैन।' });
  }

  db.prepare(
    `UPDATE products SET
      name_ne = COALESCE(?, name_ne),
      name_en = COALESCE(?, name_en),
      description_ne = COALESCE(?, description_ne),
      description_en = COALESCE(?, description_en),
      price_npr = COALESCE(?, price_npr),
      discount_price_npr = ?,
      unit_label_ne = COALESCE(?, unit_label_ne),
      unit_label_en = COALESCE(?, unit_label_en),
      global_category_id = COALESCE(?, global_category_id),
      is_featured = COALESCE(?, is_featured),
      status = COALESCE(?, status),
      updated_at = datetime('now')
     WHERE id = ? AND cooperative_id = ?`
  ).run(
    b.nameNe ?? null,
    b.nameEn ?? null,
    b.descriptionNe ?? null,
    b.descriptionEn ?? null,
    b.priceNpr !== undefined ? Number(b.priceNpr) : null,
    b.discountPriceNpr === null || b.discountPriceNpr === '' ? null : b.discountPriceNpr !== undefined ? Number(b.discountPriceNpr) : existing.discount_price_npr,
    b.unitLabelNe ?? null,
    b.unitLabelEn ?? null,
    b.globalCategoryId ?? null,
    b.isFeatured !== undefined ? (b.isFeatured ? 1 : 0) : null,
    b.status ?? null,
    req.params.id,
    coopId
  );

  res.json({ ok: true });
});

coopDashboardRouter.post('/products/:id/adjust-stock', requireCooperativeAccess('manage_inventory'), (req, res) => {
  const coopId = req.cooperativeId!;
  const { delta, movementType, note } = req.body || {};
  const qtyDelta = Math.floor(Number(delta));
  if (!qtyDelta) return res.status(400).json({ error: 'मान्य परिमाण परिवर्तन प्रविष्ट गर्नुहोस्।' });

  const product = db
    .prepare(`SELECT id, stock_quantity FROM products WHERE id = ? AND cooperative_id = ?`)
    .get(req.params.id, coopId) as { id: string; stock_quantity: number } | undefined;
  if (!product) return res.status(404).json({ error: 'उत्पादन फेला परेन।' });

  const newQty = Math.max(0, product.stock_quantity + qtyDelta);
  db.transaction(() => {
    db.prepare(
      `UPDATE products SET stock_quantity = ?, availability_status = ?, updated_at = datetime('now') WHERE id = ? AND cooperative_id = ?`
    ).run(newQty, newQty > 0 ? 'in_stock' : 'out_of_stock', product.id, coopId);

    db.prepare(
      `INSERT INTO inventory_movements (id, cooperative_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      coopId,
      product.id,
      movementType || 'adjustment',
      newQty - product.stock_quantity,
      product.stock_quantity,
      newQty,
      note || 'Manual adjustment',
      req.authUser!.id
    );
  })();

  res.json({ ok: true, newQuantity: newQty });
});

coopDashboardRouter.get('/inventory-movements', requireCooperativeAccess('manage_inventory'), (req, res) => {
  const movements = db
    .prepare(
      `SELECT im.*, p.name_ne, p.name_en, p.sku
       FROM inventory_movements im
       JOIN products p ON p.id = im.product_id
       WHERE im.cooperative_id = ?
       ORDER BY im.created_at DESC LIMIT 100`
    )
    .all(req.cooperativeId!);
  res.json({ movements });
});

// 5. Orders & Payments (Tenant-Scoped)
coopDashboardRouter.get('/orders', requireCooperativeAccess('manage_orders'), (req, res) => {
  const status = req.query.status ? String(req.query.status) : '';
  const where = status ? `AND status = ?` : '';
  const params = status ? [req.cooperativeId!, status] : [req.cooperativeId!];

  const orders = db
    .prepare(`SELECT * FROM orders WHERE cooperative_id = ? ${where} ORDER BY created_at DESC LIMIT 100`)
    .all(...params) as Record<string, unknown>[];

  const enriched = orders.map((o) => ({
    ...o,
    items: db.prepare(`SELECT * FROM order_items WHERE order_id = ? AND cooperative_id = ?`).all(o.id, req.cooperativeId!),
    payment: db.prepare(`SELECT * FROM payments WHERE order_id = ? AND cooperative_id = ? LIMIT 1`).get(o.id, req.cooperativeId!),
  }));
  res.json({ orders: enriched });
});

coopDashboardRouter.patch('/orders/:id/status', requireCooperativeAccess('manage_orders'), async (req, res) => {
  const coopId = req.cooperativeId!;
  const { status, note, paymentStatus } = req.body || {};

  const order = db
    .prepare(`SELECT * FROM orders WHERE id = ? AND cooperative_id = ?`)
    .get(req.params.id, coopId) as Record<string, unknown> | undefined;
  if (!order) return res.status(404).json({ error: 'अर्डर फेला परेन।' });

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

  db.transaction(() => {
    if (status && allowedStatuses.includes(status) && status !== order.status) {
      db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND cooperative_id = ?`).run(
        status,
        order.id,
        coopId
      );
      db.prepare(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, note, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), order.id, order.status, status, note || null, req.authUser!.id);

      // Restock items if cancelled or returned from an active status
      if (['cancelled', 'returned'].includes(status) && !['cancelled', 'returned', 'refunded'].includes(String(order.status))) {
        const items = db
          .prepare(`SELECT product_id, quantity FROM order_items WHERE order_id = ? AND cooperative_id = ?`)
          .all(order.id, coopId) as { product_id: string; quantity: number }[];
        for (const item of items) {
          const prod = db.prepare(`SELECT stock_quantity FROM products WHERE id = ?`).get(item.product_id) as {
            stock_quantity: number;
          };
          const newQty = prod.stock_quantity + item.quantity;
          db.prepare(`UPDATE products SET stock_quantity = ?, availability_status = 'in_stock' WHERE id = ?`).run(
            newQty,
            item.product_id
          );
          db.prepare(
            `INSERT INTO inventory_movements (id, cooperative_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, reference_id, note, created_by)
             VALUES (?, ?, ?, 'order_restock', ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            coopId,
            item.product_id,
            item.quantity,
            prod.stock_quantity,
            newQty,
            order.order_number,
            `Restocked on order ${status}`,
            req.authUser!.id
          );
        }
      }
    }

    if (paymentStatus && ['pending', 'submitted', 'verified', 'failed', 'refunded'].includes(paymentStatus)) {
      db.prepare(`UPDATE orders SET payment_status = ?, updated_at = datetime('now') WHERE id = ? AND cooperative_id = ?`).run(
        paymentStatus,
        order.id,
        coopId
      );
      db.prepare(
        `UPDATE payments SET status = ?, verified_by = ?, verified_at = datetime('now') WHERE order_id = ? AND cooperative_id = ?`
      ).run(paymentStatus, req.authUser!.id, order.id, coopId);
    }
  })();

  if (status && order.customer_phone) {
    await sendAkashSms({
      to: String(order.customer_phone),
      text: `तपाईंको अर्डर ${order.order_number} को स्थिति "${status}" मा अद्यावधिक गरिएको छ। - सहकारी बजार`,
      purpose: 'order_status_update',
      cooperativeId: coopId,
    });
  }

  res.json({ ok: true });
});

// 6. Customers (derived strictly from cooperative's own orders)
coopDashboardRouter.get('/customers', requireCooperativeAccess(), (req, res) => {
  const customers = db
    .prepare(
      `SELECT customer_name, customer_phone, customer_email, delivery_district,
              COUNT(*) AS order_count,
              SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_npr ELSE 0 END) AS total_spent,
              MAX(created_at) AS last_order_at
       FROM orders
       WHERE cooperative_id = ?
       GROUP BY customer_phone
       ORDER BY last_order_at DESC`
    )
    .all(req.cooperativeId!);
  res.json({ customers });
});

// 7. Reports & CSV Export
coopDashboardRouter.get('/reports', requireCooperativeAccess('view_reports'), (req, res) => {
  const coopId = req.cooperativeId!;
  const monthly = db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS period,
              COUNT(*) AS orders,
              SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_npr ELSE 0 END) AS revenue
       FROM orders WHERE cooperative_id = ?
       GROUP BY period ORDER BY period DESC LIMIT 12`
    )
    .all(coopId);

  const productWise = db
    .prepare(
      `SELECT oi.sku, oi.product_name_ne, oi.product_name_en,
              SUM(oi.quantity) AS units_sold,
              SUM(oi.line_total_npr) AS gross_revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.cooperative_id = ? AND o.status NOT IN ('cancelled','refunded')
       GROUP BY oi.product_id
       ORDER BY gross_revenue DESC`
    )
    .all(coopId);

  res.json({ monthly, productWise });
});

coopDashboardRouter.get('/reports/export.csv', requireCooperativeAccess('view_reports'), (req, res) => {
  const orders = db
    .prepare(
      `SELECT order_number, invoice_number, customer_name, customer_phone, delivery_district,
              subtotal_npr, discount_npr, delivery_fee_npr, total_npr, status, payment_method, payment_status, created_at
       FROM orders WHERE cooperative_id = ? ORDER BY created_at DESC`
    )
    .all(req.cooperativeId!) as Record<string, unknown>[];

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
  const rows = orders.map((o) =>
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
coopDashboardRouter.get('/promotions', requireCooperativeAccess(), (req, res) => {
  const promotions = db
    .prepare(`SELECT * FROM promotions WHERE cooperative_id = ? ORDER BY created_at DESC`)
    .all(req.cooperativeId!);
  res.json({ promotions });
});

coopDashboardRouter.post('/promotions', requireCooperativeAccess('manage_settings'), (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.titleNe || !b.discountValue) {
    return res.status(400).json({ error: 'कूपन कोड, शीर्षक र छुट मान आवश्यक छ।' });
  }
  const id = crypto.randomUUID();
  try {
    db.prepare(
      `INSERT INTO promotions (id, cooperative_id, code, title_ne, title_en, discount_type, discount_value, min_order_npr, max_uses, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now', '+30 days')))`
    ).run(
      id,
      req.cooperativeId!,
      String(b.code).trim().toUpperCase(),
      b.titleNe,
      b.titleEn || b.titleNe,
      b.discountType === 'flat' ? 'flat' : 'percentage',
      Number(b.discountValue),
      Number(b.minOrderNpr || 0),
      b.maxUses ? Number(b.maxUses) : null,
      b.startsAt || null,
      b.endsAt || null
    );
    res.status(201).json({ id });
  } catch {
    res.status(400).json({ error: 'यो कूपन कोड पहिले नै छ।' });
  }
});

coopDashboardRouter.delete('/promotions/:id', requireCooperativeAccess('manage_settings'), (req, res) => {
  db.prepare(`DELETE FROM promotions WHERE id = ? AND cooperative_id = ?`).run(req.params.id, req.cooperativeId!);
  res.json({ ok: true });
});

coopDashboardRouter.get('/delivery', requireCooperativeAccess(), (req, res) => {
  const config = db.prepare(`SELECT * FROM delivery_configs WHERE cooperative_id = ?`).get(req.cooperativeId!) as
    | Record<string, unknown>
    | undefined;
  res.json({
    config: config
      ? { ...config, delivery_areas: JSON.parse(String(config.delivery_areas_json || '[]')) }
      : null,
  });
});

coopDashboardRouter.put('/delivery', requireCooperativeAccess('manage_settings'), (req, res) => {
  const b = req.body || {};
  const areas = Array.isArray(b.delivery_areas)
    ? b.delivery_areas
    : String(b.delivery_areas_text || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  db.prepare(
    `UPDATE delivery_configs SET
      delivery_areas_json = ?, default_fee_npr = ?, free_delivery_threshold_npr = ?, minimum_order_npr = ?,
      pickup_enabled = ?, pickup_address_ne = ?, pickup_address_en = ?,
      delivery_instructions_ne = ?, bank_payment_instructions_ne = ?, updated_at = datetime('now')
     WHERE cooperative_id = ?`
  ).run(
    JSON.stringify(areas),
    Number(b.default_fee_npr ?? 100),
    Number(b.free_delivery_threshold_npr ?? 2500),
    Number(b.minimum_order_npr ?? 0),
    b.pickup_enabled ? 1 : 0,
    b.pickup_address_ne || '',
    b.pickup_address_en || '',
    b.delivery_instructions_ne || '',
    b.bank_payment_instructions_ne || '',
    req.cooperativeId!
  );
  res.json({ ok: true });
});

// 9. Staff & Permissions
coopDashboardRouter.get('/staff', requireCooperativeAccess('manage_staff'), (req, res) => {
  const staff = (
    db
      .prepare(
        `SELECT cs.*, u.full_name, u.email, u.phone
         FROM cooperative_staff cs
         JOIN users u ON u.id = cs.user_id
         WHERE cs.cooperative_id = ?
         ORDER BY cs.created_at DESC`
      )
      .all(req.cooperativeId!) as Record<string, unknown>[]
  ).map((s) => ({
      ...s,
      permissions: JSON.parse(String(s.permissions_json || '{}')),
    }));
  res.json({ staff });
});

coopDashboardRouter.post('/staff', requireCooperativeAccess('manage_staff'), (req, res) => {
  const coopId = req.cooperativeId!;
  const { sub } = getCoopAndSub(coopId);
  const currentStaff = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM cooperative_staff WHERE cooperative_id = ? AND is_active = 1`).get(coopId) as {
      cnt: number;
    }
  ).cnt;
  const maxStaff = Number(sub?.max_staff || 2);
  if (currentStaff >= maxStaff) {
    return res.status(403).json({ error: `सदस्यता योजनाको अधिकतम कर्मचारी सीमा (${maxStaff}) पूरा भयो।` });
  }

  const { fullName, email, phone, password, staffRole, permissions } = req.body || {};
  if (!fullName || !password || (!email && !phone)) {
    return res.status(400).json({ error: 'कर्मचारीको नाम, इमेल/फोन र पासवर्ड आवश्यक छ।' });
  }

  const userId = crypto.randomUUID();
  const staffId = crypto.randomUUID();
  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id, full_name, full_name_ne, email, phone, password_hash, role, preferred_language)
         VALUES (?, ?, ?, ?, ?, ?, 'cooperative_staff', 'ne')`
      ).run(
        userId,
        fullName,
        fullName,
        email ? String(email).trim().toLowerCase() : null,
        phone ? normalizeNepalPhone(String(phone)) : null,
        hashPassword(String(password))
      );

      db.prepare(
        `INSERT INTO cooperative_staff (id, cooperative_id, user_id, staff_role, permissions_json, invited_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(staffId, coopId, userId, staffRole || 'manager', JSON.stringify(permissions || {}), req.authUser!.id);
    })();
    res.status(201).json({ id: staffId });
  } catch {
    res.status(400).json({ error: 'यो इमेल वा फोन पहिले नै दर्ता छ।' });
  }
});

coopDashboardRouter.delete('/staff/:id', requireCooperativeAccess('manage_staff'), (req, res) => {
  db.prepare(`DELETE FROM cooperative_staff WHERE id = ? AND cooperative_id = ?`).run(req.params.id, req.cooperativeId!);
  res.json({ ok: true });
});

// 10. Subscription, Billing, Notifications, Documents & Support
coopDashboardRouter.get('/billing', requireCooperativeAccess(), (req, res) => {
  const coopId = req.cooperativeId!;
  const { sub } = getCoopAndSub(coopId);
  const plans = db.prepare(`SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC`).all();
  const payments = db
    .prepare(
      `SELECT sp.*, pl.name_ne AS plan_name_ne, pl.name_en AS plan_name_en
       FROM subscription_payments sp
       JOIN subscription_plans pl ON pl.id = sp.plan_id
       WHERE sp.cooperative_id = ?
       ORDER BY sp.created_at DESC`
    )
    .all(coopId);
  res.json({ subscription: sub, plans, payments });
});

coopDashboardRouter.post('/billing/submit-payment', requireCooperativeAccess(), (req, res) => {
  const { planId, billingCycle, paymentMethod, referenceNumber, notes } = req.body || {};
  const plan = db.prepare(`SELECT * FROM subscription_plans WHERE id = ?`).get(planId) as
    | { id: string; monthly_price_npr: number; annual_price_npr: number }
    | undefined;
  if (!plan) return res.status(404).json({ error: 'योजना फेला परेन।' });

  const amount = billingCycle === 'annual' ? plan.annual_price_npr : plan.monthly_price_npr;
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO subscription_payments (id, cooperative_id, plan_id, amount_npr, billing_cycle, payment_method, reference_number, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(
    id,
    req.cooperativeId!,
    plan.id,
    amount,
    billingCycle === 'annual' ? 'annual' : 'monthly',
    paymentMethod || 'bank_transfer',
    referenceNumber || null,
    notes || null
  );
  res.status(201).json({ id });
});

coopDashboardRouter.get('/notifications', requireCooperativeAccess(), (req, res) => {
  const notifications = db
    .prepare(
      `SELECT * FROM notifications
       WHERE cooperative_id = ? OR recipient_user_id = ?
       ORDER BY created_at DESC LIMIT 40`
    )
    .all(req.cooperativeId!, req.authUser!.id);
  res.json({ notifications });
});

coopDashboardRouter.post('/notifications/read-all', requireCooperativeAccess(), (req, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE cooperative_id = ? OR recipient_user_id = ?`).run(
    req.cooperativeId!,
    req.authUser!.id
  );
  res.json({ ok: true });
});

coopDashboardRouter.get('/documents', requireCooperativeAccess(), (req, res) => {
  const documents = db
    .prepare(`SELECT * FROM cooperative_documents WHERE cooperative_id = ? ORDER BY created_at DESC`)
    .all(req.cooperativeId!);
  res.json({ documents });
});

coopDashboardRouter.get('/support', requireCooperativeAccess(), (req, res) => {
  const tickets = (
    db
      .prepare(`SELECT * FROM support_tickets WHERE cooperative_id = ? ORDER BY updated_at DESC`)
      .all(req.cooperativeId!) as Record<string, unknown>[]
  ).map((t) => ({
      ...t,
      messages: db.prepare(`SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC`).all(t.id),
    }));
  res.json({ tickets });
});

coopDashboardRouter.post('/support', requireCooperativeAccess(), (req, res) => {
  const { subject, category, priority, message } = req.body || {};
  if (!subject || !message) return res.status(400).json({ error: 'विषय र सन्देश आवश्यक छ।' });
  const ticketId = crypto.randomUUID();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO support_tickets (id, cooperative_id, user_id, subject, category, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`
    ).run(ticketId, req.cooperativeId!, req.authUser!.id, subject, category || 'general', priority || 'normal');
    db.prepare(
      `INSERT INTO support_messages (id, ticket_id, sender_user_id, sender_role, message)
       VALUES (?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), ticketId, req.authUser!.id, req.authUser!.role, message);
  })();
  res.status(201).json({ id: ticketId });
});
