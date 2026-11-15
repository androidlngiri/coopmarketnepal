import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db.ts';
import { rateLimit, requireAuth } from '../auth.ts';
import { isValidNepalMobile, normalizeNepalPhone, sendAkashSms, verifyOtpCode } from '../akash-sms.ts';

export const checkoutRouter = Router();

interface CartItemInput {
  productId: string;
  quantity: number;
}

interface CoopCheckoutOption {
  deliveryMode?: 'delivery' | 'pickup';
  promoCode?: string;
}

function buildValidatedGroups(items: CartItemInput[], coopOptions: Record<string, CoopCheckoutOption> = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('कार्ट खाली छ।');
  }

  const byCoop = new Map<
    string,
    {
      cooperative: Record<string, unknown>;
      deliveryConfig: Record<string, unknown> | undefined;
      items: Array<{
        product: Record<string, unknown>;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }>;
      subtotal: number;
      discount: number;
      deliveryFee: number;
      total: number;
      promoCode: string | null;
      deliveryMode: 'delivery' | 'pickup';
    }
  >();

  for (const item of items) {
    const qty = Math.floor(Number(item.quantity));
    if (!item.productId || qty < 1 || qty > 500) {
      throw new Error('अमान्य उत्पादन परिमाण।');
    }

    const product = db
      .prepare(
        `SELECT p.*, c.id AS coop_id, c.name_ne AS coop_name_ne, c.name_en AS coop_name_en, c.slug AS coop_slug, c.status AS coop_status,
                s.store_name_ne, s.store_name_en, s.is_published,
                (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC LIMIT 1) AS image_url
         FROM products p
         JOIN cooperatives c ON c.id = p.cooperative_id
         JOIN stores s ON s.cooperative_id = c.id
         WHERE p.id = ?`
      )
      .get(item.productId) as Record<string, unknown> | undefined;

    if (!product) {
      throw new Error('कार्टमा रहेको एउटा उत्पादन फेला परेन।');
    }
    if (product.coop_status !== 'approved' || !product.is_published) {
      throw new Error(`सहकारी पसल स्वीकृत वा प्रकाशित छैन (${product.coop_name_ne})।`);
    }
    if (product.status !== 'published' || product.is_prohibited) {
      throw new Error(`उत्पादन हाल उपलब्ध छैन (${product.name_ne})।`);
    }
    if (Number(product.stock_quantity) < qty) {
      throw new Error(`"${product.name_ne}" को स्टक अपुग छ (उपलब्ध: ${product.stock_quantity})।`);
    }

    // Active subscription check
    const activeSub = db
      .prepare(
        `SELECT id FROM subscriptions
         WHERE cooperative_id = ? AND status IN ('trial', 'active') AND ends_at > datetime('now')
         LIMIT 1`
      )
      .get(product.coop_id);
    if (!activeSub) {
      throw new Error(`${product.coop_name_ne} को सदस्यता अवधि सक्रिय छैन।`);
    }

    const unitPrice =
      product.discount_price_npr !== null && Number(product.discount_price_npr) > 0
        ? Number(product.discount_price_npr)
        : Number(product.price_npr);
    const lineTotal = Number((unitPrice * qty).toFixed(2));

    const coopId = String(product.coop_id);
    if (!byCoop.has(coopId)) {
      const deliveryConfig = db
        .prepare(`SELECT * FROM delivery_configs WHERE cooperative_id = ?`)
        .get(coopId) as Record<string, unknown> | undefined;
      const opt = coopOptions[coopId] || {};
      byCoop.set(coopId, {
        cooperative: {
          id: coopId,
          slug: product.coop_slug,
          name_ne: product.coop_name_ne,
          name_en: product.coop_name_en,
          store_name_ne: product.store_name_ne,
          store_name_en: product.store_name_en,
        },
        deliveryConfig,
        items: [],
        subtotal: 0,
        discount: 0,
        deliveryFee: 0,
        total: 0,
        promoCode: opt.promoCode ? String(opt.promoCode).trim().toUpperCase() : null,
        deliveryMode: opt.deliveryMode === 'pickup' && deliveryConfig?.pickup_enabled ? 'pickup' : 'delivery',
      });
    }

    const group = byCoop.get(coopId)!;
    group.items.push({ product, quantity: qty, unitPrice, lineTotal });
    group.subtotal = Number((group.subtotal + lineTotal).toFixed(2));
  }

  const groups = Array.from(byCoop.values());
  for (const g of groups) {
    const minOrder = Number(g.deliveryConfig?.minimum_order_npr || 0);
    if (minOrder > 0 && g.subtotal < minOrder) {
      throw new Error(
        `${g.cooperative.store_name_ne} को न्यूनतम अर्डर रकम रु. ${minOrder} छ।`
      );
    }

    // Apply promo code if provided
    if (g.promoCode) {
      const promo = db
        .prepare(
          `SELECT * FROM promotions
           WHERE cooperative_id = ? AND upper(code) = upper(?) AND is_active = 1
             AND starts_at <= datetime('now') AND ends_at >= datetime('now')
             AND (max_uses IS NULL OR used_count < max_uses)
           LIMIT 1`
        )
        .get(g.cooperative.id, g.promoCode) as
        | {
            id: string;
            discount_type: 'percentage' | 'flat';
            discount_value: number;
            min_order_npr: number;
          }
        | undefined;

      if (promo && g.subtotal >= promo.min_order_npr) {
        g.discount =
          promo.discount_type === 'percentage'
            ? Number(((g.subtotal * promo.discount_value) / 100).toFixed(2))
            : Math.min(g.subtotal, Number(promo.discount_value));
      } else {
        g.promoCode = null;
      }
    }

    const afterDiscount = Math.max(0, g.subtotal - g.discount);
    if (g.deliveryMode === 'pickup') {
      g.deliveryFee = 0;
    } else {
      const threshold = Number(g.deliveryConfig?.free_delivery_threshold_npr || 0);
      const defaultFee = Number(g.deliveryConfig?.default_fee_npr || 0);
      g.deliveryFee = threshold > 0 && afterDiscount >= threshold ? 0 : defaultFee;
    }

    g.total = Number((afterDiscount + g.deliveryFee).toFixed(2));
  }

  return groups;
}

checkoutRouter.post('/validate-cart', (req, res) => {
  try {
    const groups = buildValidatedGroups(req.body?.items || [], req.body?.coopOptions || {});
    const grandTotal = groups.reduce((acc, g) => acc + g.total, 0);
    res.json({ groups, grandTotal });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'कार्ट प्रमाणीकरण असफल।' });
  }
});

checkoutRouter.post('/place-order', rateLimit('place_order', 10, 5 * 60 * 1000), async (req, res) => {
  const {
    items,
    coopOptions,
    customerName,
    customerPhone,
    customerEmail,
    deliveryProvince,
    deliveryDistrict,
    deliveryMunicipality,
    deliveryWard,
    deliveryAddress,
    deliveryNote,
    paymentMethod,
    paymentReference,
    otpCode,
    requireOtp,
    idempotencyKey,
  } = req.body || {};

  if (!customerName || !customerPhone) {
    return res.status(400).json({ error: 'ग्राहकको नाम र मोबाइल नम्बर आवश्यक छ।' });
  }

  const normalizedPhone = normalizeNepalPhone(String(customerPhone));
  if (!isValidNepalMobile(normalizedPhone)) {
    return res.status(400).json({ error: 'मान्य नेपाली मोबाइल नम्बर प्रविष्ट गर्नुहोस्।' });
  }

  const allowedMethods = ['cod', 'bank_transfer', 'qr_manual', 'fonepay', 'nepalpay_qr', 'connectips'];
  if (!allowedMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: 'अमान्य भुक्तानी विधि।' });
  }

  if (requireOtp) {
    if (!otpCode) {
      return res.status(400).json({ error: 'OTP कोड प्रविष्ट गर्नुहोस्।' });
    }
    const otpCheck = verifyOtpCode({
      phone: normalizedPhone,
      purpose: 'guest_checkout',
      code: String(otpCode),
    });
    if (!otpCheck.valid) {
      return res.status(400).json({ error: otpCheck.error || 'गलत OTP कोड।' });
    }
  }

  const idemKey = idempotencyKey ? String(idempotencyKey).slice(0, 64) : null;
  if (idemKey) {
    const existing = db
      .prepare(`SELECT checkout_group_id, order_number, guest_access_token, total_npr, cooperative_id FROM orders WHERE idempotency_key = ?`)
      .all(idemKey);
    if (existing.length > 0) {
      return res.json({ duplicatePrevented: true, orders: existing });
    }
  }

  let createdOrders: Array<{
    id: string;
    orderNumber: string;
    invoiceNumber: string;
    guestAccessToken: string;
    cooperativeNameNe: string;
    cooperativeNameEn: string;
    totalNpr: number;
    paymentMethod: string;
  }> = [];

  try {
    const groups = buildValidatedGroups(items, coopOptions);

    for (const g of groups) {
      if (g.deliveryMode === 'delivery' && (!deliveryProvince || !deliveryDistrict || !deliveryAddress)) {
        return res.status(400).json({ error: 'डेलिभरीको लागि प्रदेश, जिल्ला र ठेगाना आवश्यक छ।' });
      }
    }

    const checkoutGroupId = crypto.randomUUID();
    const buyerUserId = req.authUser?.id ?? null;

    db.transaction(() => {
      for (const g of groups) {
        const orderId = crypto.randomUUID();
        const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        const orderNumber = `SB-${new Date().getFullYear()}-${suffix}`;
        const invoiceNumber = `INV-${new Date().getFullYear()}-${suffix}`;
        const guestAccessToken = crypto.randomBytes(24).toString('hex');

        // Re-verify & atomically decrement stock inside transaction
        for (const line of g.items) {
          const prodRow = db
            .prepare(`SELECT stock_quantity, low_stock_threshold, name_ne, name_en FROM products WHERE id = ?`)
            .get(line.product.id) as {
            stock_quantity: number;
            low_stock_threshold: number;
            name_ne: string;
            name_en: string;
          };
          if (prodRow.stock_quantity < line.quantity) {
            throw new Error(`"${prodRow.name_ne}" को स्टक अपुग भयो।`);
          }
          const newQty = prodRow.stock_quantity - line.quantity;
          db.prepare(
            `UPDATE products
             SET stock_quantity = ?, availability_status = ?, updated_at = datetime('now')
             WHERE id = ?`
          ).run(newQty, newQty === 0 ? 'out_of_stock' : 'in_stock', line.product.id);

          db.prepare(
            `INSERT INTO inventory_movements (id, cooperative_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, reference_id, note, created_by)
             VALUES (?, ?, ?, 'order_deduction', ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            g.cooperative.id,
            line.product.id,
            -line.quantity,
            prodRow.stock_quantity,
            newQty,
            orderNumber,
            `Order ${orderNumber}`,
            buyerUserId
          );

          if (newQty <= prodRow.low_stock_threshold) {
            db.prepare(
              `INSERT INTO notifications (id, cooperative_id, type, title_ne, title_en, body_ne, body_en, action_url)
               VALUES (?, ?, 'low_stock', ?, ?, ?, ?, '/cooperative')`
            ).run(
              crypto.randomUUID(),
              g.cooperative.id,
              'कम स्टक चेतावनी',
              'Low Stock Alert',
              `${prodRow.name_ne} को मौज्दात ${newQty} मात्र बाँकी छ।`,
              `${prodRow.name_en} is down to ${newQty} units.`
            );
          }
        }

        if (g.promoCode) {
          db.prepare(`UPDATE promotions SET used_count = used_count + 1 WHERE cooperative_id = ? AND upper(code) = upper(?)`).run(
            g.cooperative.id,
            g.promoCode
          );
        }

        const initialPaymentStatus =
          paymentMethod === 'bank_transfer' || paymentMethod === 'qr_manual'
            ? paymentReference
              ? 'submitted'
              : 'pending'
            : 'pending';

        db.prepare(
          `INSERT INTO orders (
            id, checkout_group_id, order_number, invoice_number, cooperative_id, buyer_user_id, is_guest, guest_access_token,
            idempotency_key, customer_name, customer_phone, customer_email,
            delivery_mode, delivery_province, delivery_district, delivery_municipality, delivery_ward, delivery_address, delivery_note,
            subtotal_npr, discount_npr, delivery_fee_npr, total_npr, promo_code,
            status, payment_method, payment_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        ).run(
          orderId,
          checkoutGroupId,
          orderNumber,
          invoiceNumber,
          g.cooperative.id,
          buyerUserId,
          buyerUserId ? 0 : 1,
          guestAccessToken,
          idemKey,
          String(customerName).trim(),
          normalizedPhone,
          customerEmail ? String(customerEmail).trim() : null,
          g.deliveryMode,
          deliveryProvince || null,
          deliveryDistrict || null,
          deliveryMunicipality || null,
          deliveryWard || null,
          deliveryAddress || null,
          deliveryNote || null,
          g.subtotal,
          g.discount,
          g.deliveryFee,
          g.total,
          g.promoCode,
          paymentMethod,
          initialPaymentStatus
        );

        for (const line of g.items) {
          db.prepare(
            `INSERT INTO order_items (id, order_id, cooperative_id, product_id, product_name_ne, product_name_en, sku, unit_label, unit_price_npr, quantity, line_total_npr)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            orderId,
            g.cooperative.id,
            line.product.id,
            line.product.name_ne,
            line.product.name_en,
            line.product.sku,
            line.product.unit_label_ne,
            line.unitPrice,
            line.quantity,
            line.lineTotal
          );
        }

        db.prepare(
          `INSERT INTO order_status_history (id, order_id, from_status, to_status, note, changed_by)
           VALUES (?, ?, NULL, 'pending', 'Order placed', ?)`
        ).run(crypto.randomUUID(), orderId, buyerUserId);

        db.prepare(
          `INSERT INTO payments (id, order_id, cooperative_id, method, amount_npr, status, transaction_reference)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          orderId,
          g.cooperative.id,
          paymentMethod,
          g.total,
          initialPaymentStatus,
          paymentReference ? String(paymentReference).trim() : null
        );

        db.prepare(
          `INSERT INTO notifications (id, cooperative_id, type, title_ne, title_en, body_ne, body_en, action_url)
           VALUES (?, ?, 'new_order', ?, ?, ?, ?, '/cooperative')`
        ).run(
          crypto.randomUUID(),
          g.cooperative.id,
          'नयाँ अर्डर प्राप्त भयो',
          'New Order Received',
          `अर्डर ${orderNumber} — रु. ${g.total} (${customerName})`,
          `Order ${orderNumber} — NPR ${g.total} from ${customerName}`
        );

        createdOrders.push({
          id: orderId,
          orderNumber,
          invoiceNumber,
          guestAccessToken,
          cooperativeNameNe: String(g.cooperative.store_name_ne),
          cooperativeNameEn: String(g.cooperative.store_name_en),
          totalNpr: g.total,
          paymentMethod,
        });
      }
    })();

    // Attempt Akash SMS transactional confirmation (non-blocking)
    const orderListText = createdOrders.map((o) => `${o.orderNumber} (रु.${o.totalNpr})`).join(', ');
    await sendAkashSms({
      to: normalizedPhone,
      text: `सहकारी बजारमा तपाईंको अर्डर पुष्टि भयो: ${orderListText}। धन्यवाद!`,
      purpose: 'order_confirmation',
    });

    res.status(201).json({
      orders: createdOrders,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'अर्डर प्रक्रिया असफल।' });
  }
});

// Secure Guest Order Tracking (requires unguessable guestAccessToken)
checkoutRouter.get('/track', (req, res) => {
  const { orderNumber, token } = req.query;
  if (!orderNumber || !token) {
    return res.status(400).json({ error: 'अर्डर नम्बर र सुरक्षा टोकन आवश्यक छ।' });
  }

  const order = db
    .prepare(
      `SELECT o.*, c.name_ne AS cooperative_name_ne, c.name_en AS cooperative_name_en, c.slug AS cooperative_slug,
              s.store_name_ne, s.store_name_en, c.contact_phone AS cooperative_phone
       FROM orders o
       JOIN cooperatives c ON c.id = o.cooperative_id
       JOIN stores s ON s.cooperative_id = c.id
       WHERE o.order_number = ? AND o.guest_access_token = ?
       LIMIT 1`
    )
    .get(String(orderNumber).trim(), String(token).trim()) as Record<string, unknown> | undefined;

  if (!order) {
    return res.status(404).json({ error: 'अर्डर फेला परेन वा सुरक्षा टोकन मिलेन।' });
  }

  const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id);
  const history = db
    .prepare(`SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC`)
    .all(order.id);

  res.json({ order, items, history });
});

// Registered Buyer Account Routes
checkoutRouter.get('/buyer/orders', requireAuth, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, s.store_name_ne, s.store_name_en, c.slug AS cooperative_slug
       FROM orders o
       JOIN cooperatives c ON c.id = o.cooperative_id
       JOIN stores s ON s.cooperative_id = c.id
       WHERE o.buyer_user_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(req.authUser!.id) as Record<string, unknown>[];

  const enriched = orders.map((o) => ({
    ...o,
    items: db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(o.id),
  }));
  res.json({ orders: enriched });
});

checkoutRouter.get('/buyer/addresses', requireAuth, (req, res) => {
  const addresses = db
    .prepare(`SELECT * FROM buyer_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`)
    .all(req.authUser!.id);
  res.json({ addresses });
});

checkoutRouter.post('/buyer/addresses', requireAuth, (req, res) => {
  const { label, recipientName, phone, province, district, municipality, wardNumber, streetAddress } = req.body || {};
  if (!recipientName || !phone || !province || !district || !municipality || !wardNumber || !streetAddress) {
    return res.status(400).json({ error: 'ठेगानाका सबै विवरण आवश्यक छन्।' });
  }
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO buyer_addresses (id, user_id, label, recipient_name, phone, province, district, municipality, ward_number, street_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.authUser!.id, label || 'Home', recipientName, normalizeNepalPhone(phone), province, district, municipality, wardNumber, streetAddress);
  res.status(201).json({ id });
});

checkoutRouter.delete('/buyer/addresses/:id', requireAuth, (req, res) => {
  db.prepare(`DELETE FROM buyer_addresses WHERE id = ? AND user_id = ?`).run(req.params.id, req.authUser!.id);
  res.json({ ok: true });
});

checkoutRouter.get('/buyer/wishlist', requireAuth, (req, res) => {
  const items = db
    .prepare(
      `SELECT p.*,
              (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC LIMIT 1) AS image_url,
              c.slug AS cooperative_slug, s.store_name_ne, s.store_name_en
       FROM wishlists w
       JOIN products p ON p.id = w.product_id
       JOIN cooperatives c ON c.id = p.cooperative_id
       JOIN stores s ON s.cooperative_id = c.id
       WHERE w.user_id = ?`
    )
    .all(req.authUser!.id);
  res.json({ items });
});

checkoutRouter.post('/buyer/wishlist/toggle', requireAuth, (req, res) => {
  const { productId } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'उत्पादन ID आवश्यक छ।' });
  const existing = db
    .prepare(`SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?`)
    .get(req.authUser!.id, productId) as { id: string } | undefined;
  if (existing) {
    db.prepare(`DELETE FROM wishlists WHERE id = ?`).run(existing.id);
    return res.json({ saved: false });
  }
  db.prepare(`INSERT INTO wishlists (id, user_id, product_id) VALUES (?, ?, ?)`).run(
    crypto.randomUUID(),
    req.authUser!.id,
    productId
  );
  res.json({ saved: true });
});
