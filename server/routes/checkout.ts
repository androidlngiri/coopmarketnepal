import { Router } from 'express';
import { rateLimit, requireAuth } from '../auth.ts';
import { isValidNepalMobile, normalizeNepalPhone, sendAkashSms, verifyOtpCode } from '../akash-sms.ts';
import { requireSupabaseAdmin } from '../supabase-admin.ts';

export const checkoutRouter = Router();

interface CartItemInput {
  productId: string;
  quantity: number;
}

interface CoopCheckoutOption {
  deliveryMode?: 'delivery' | 'pickup';
  promoCode?: string;
}

async function buildValidatedGroups(
  items: CartItemInput[],
  coopOptions: Record<string, CoopCheckoutOption> = {}
) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('कार्ट खाली छ।');
  }

  const sb = requireSupabaseAdmin();
  const productIds = Array.from(new Set(items.map((i) => String(i.productId)).filter(Boolean)));
  if (productIds.length === 0) {
    throw new Error('कार्ट खाली छ।');
  }

  const { data: rawProducts, error: prodErr } = await sb
    .from('products')
    .select(
      `*,
       product_images (image_url, is_primary, sort_order),
       cooperatives!inner (id, name_ne, name_en, slug, status, deleted_at, stores!inner (store_name_ne, store_name_en, is_published))`
    )
    .is('deleted_at', null)
    .in('id', productIds);

  if (prodErr) throw new Error(prodErr.message);

  const productMap = new Map<string, Record<string, unknown>>();
  for (const raw of rawProducts || []) {
    productMap.set(String(raw.id), raw as Record<string, unknown>);
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
      promoApplied: boolean;
      promoError: string | null;
      deliveryMode: 'delivery' | 'pickup';
    }
  >();

  for (const item of items) {
    const qty = Math.floor(Number(item.quantity));
    if (!item.productId || qty < 1 || qty > 500) {
      throw new Error('अमान्य उत्पादन परिमाण।');
    }

    const raw = productMap.get(String(item.productId));
    if (!raw) {
      throw new Error('कार्टमा रहेको एउटा उत्पादन फेला परेन।');
    }

    const coop = (Array.isArray(raw.cooperatives) ? raw.cooperatives[0] : raw.cooperatives) as Record<string, unknown>;
    const store = (Array.isArray(coop?.stores) ? coop.stores[0] : coop?.stores) as Record<string, unknown>;
    const imgs = (raw.product_images as Array<{ image_url: string; is_primary?: boolean }>) || [];
    const primaryImg = imgs.find((i) => i.is_primary)?.image_url || imgs[0]?.image_url || null;

    if (coop.status !== 'approved' || coop.deleted_at || !store?.is_published) {
      throw new Error(`सहकारी पसल स्वीकृत वा प्रकाशित छैन (${coop.name_ne})।`);
    }
    if (raw.status !== 'published' || raw.is_prohibited || raw.availability_status === 'discontinued') {
      throw new Error(`उत्पादन हाल उपलब्ध छैन (${raw.name_ne})।`);
    }
    if (raw.availability_status === 'out_of_stock' || Number(raw.stock_quantity) < qty) {
      throw new Error(`"${raw.name_ne}" को स्टक अपुग छ (उपलब्ध: ${raw.stock_quantity})।`);
    }

    const coopId = String(coop.id);
    if (!byCoop.has(coopId)) {
      const [{ data: activeSub }, { data: deliveryConfig }] = await Promise.all([
        sb
          .from('subscriptions')
          .select('id')
          .eq('cooperative_id', coopId)
          .in('status', ['trial', 'active'])
          .gt('ends_at', new Date().toISOString())
          .limit(1)
          .maybeSingle(),
        sb.from('delivery_configs').select('*').eq('cooperative_id', coopId).maybeSingle(),
      ]);

      if (!activeSub) {
        throw new Error(`${coop.name_ne} को सदस्यता अवधि सक्रिय छैन।`);
      }

      const opt = coopOptions[coopId] || {};
      byCoop.set(coopId, {
        cooperative: {
          id: coopId,
          slug: coop.slug,
          name_ne: coop.name_ne,
          name_en: coop.name_en,
          store_name_ne: store.store_name_ne,
          store_name_en: store.store_name_en,
        },
        deliveryConfig: deliveryConfig || undefined,
        items: [],
        subtotal: 0,
        discount: 0,
        deliveryFee: 0,
        total: 0,
        promoCode: opt.promoCode ? String(opt.promoCode).trim().toUpperCase() : null,
        promoApplied: false,
        promoError: null,
        deliveryMode: opt.deliveryMode === 'pickup' && deliveryConfig?.pickup_enabled ? 'pickup' : 'delivery',
      });
    }

    const unitPrice =
      raw.discount_price_npr !== null && Number(raw.discount_price_npr) > 0
        ? Number(raw.discount_price_npr)
        : Number(raw.price_npr);
    const lineTotal = Number((unitPrice * qty).toFixed(2));

    const { cooperatives: _coops, product_images: _imgs, ...productRest } = raw;
    const productSummary: Record<string, unknown> = { ...productRest, image_url: primaryImg };

    const group = byCoop.get(coopId)!;
    group.items.push({ product: productSummary, quantity: qty, unitPrice, lineTotal });
    group.subtotal = Number((group.subtotal + lineTotal).toFixed(2));
  }

  const groups = Array.from(byCoop.values());
  const nowIso = new Date().toISOString();

  for (const g of groups) {
    const minOrder = Number(g.deliveryConfig?.minimum_order_npr || 0);
    if (minOrder > 0 && g.subtotal < minOrder) {
      throw new Error(`${g.cooperative.store_name_ne} को न्यूनतम अर्डर रकम रु. ${minOrder} छ।`);
    }

    if (g.promoCode) {
      const { data: promos } = await sb
        .from('promotions')
        .select('*')
        .eq('cooperative_id', g.cooperative.id)
        .eq('is_active', true)
        .lte('starts_at', nowIso)
        .gte('ends_at', nowIso);

      const promo = (promos || []).find(
        (p: Record<string, unknown>) =>
          String(p.code).toUpperCase() === g.promoCode &&
          (p.max_uses === null || Number(p.used_count) < Number(p.max_uses))
      ) as
        | { discount_type: 'percentage' | 'flat'; discount_value: number; min_order_npr: number }
        | undefined;

      if (promo) {
        if (g.subtotal >= Number(promo.min_order_npr)) {
          g.discount =
            promo.discount_type === 'percentage'
              ? Number(((g.subtotal * Number(promo.discount_value)) / 100).toFixed(2))
              : Math.min(g.subtotal, Number(promo.discount_value));
          g.promoApplied = true;
        } else {
          g.promoError = `कूपन "${g.promoCode}" का लागि न्यूनतम अर्डर रु. ${promo.min_order_npr} आवश्यक छ।`;
          g.promoCode = null;
        }
      } else {
        g.promoError = `कूपन "${g.promoCode}" मान्य छैन वा म्याद सकिएको छ।`;
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

checkoutRouter.post('/validate-cart', async (req, res) => {
  try {
    const groups = await buildValidatedGroups(req.body?.items || [], req.body?.coopOptions || {});
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
    const otpCheck = await verifyOtpCode({
      phone: normalizedPhone,
      purpose: 'guest_checkout',
      code: String(otpCode),
    });
    if (!otpCheck.valid) {
      return res.status(400).json({ error: otpCheck.error || 'गलत OTP कोड।' });
    }
  }

  try {
    const sb = requireSupabaseAdmin();
    const groups = await buildValidatedGroups(items, coopOptions);

    for (const g of groups) {
      if (g.deliveryMode === 'delivery' && (!deliveryProvince || !deliveryDistrict || !deliveryAddress)) {
        return res.status(400).json({ error: 'डेलिभरीको लागि प्रदेश, जिल्ला र ठेगाना आवश्यक छ।' });
      }
    }

    const payload = {
      idempotencyKey: idempotencyKey ? String(idempotencyKey).slice(0, 64) : null,
      buyerUserId: req.authUser?.id ?? null,
      customerName: String(customerName).trim(),
      customerPhone: normalizedPhone,
      customerEmail: customerEmail ? String(customerEmail).trim() : null,
      deliveryProvince: deliveryProvince || null,
      deliveryDistrict: deliveryDistrict || null,
      deliveryMunicipality: deliveryMunicipality || null,
      deliveryWard: deliveryWard || null,
      deliveryAddress: deliveryAddress || null,
      deliveryNote: deliveryNote || null,
      paymentMethod,
      paymentReference: paymentReference ? String(paymentReference).trim() : null,
      groups: groups.map((g) => ({
        cooperativeId: g.cooperative.id,
        deliveryMode: g.deliveryMode,
        promoCode: g.promoCode,
        items: g.items.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      })),
    };

    const { data: rpcResult, error: rpcErr } = await sb.rpc('place_multi_coop_checkout', {
      p_payload: payload,
    });

    if (rpcErr) {
      return res.status(400).json({ error: rpcErr.message || 'अर्डर प्रक्रिया असफल।' });
    }

    const result = rpcResult as {
      duplicatePrevented?: boolean;
      orders?: Array<{
        orderNumber?: string;
        totalNpr?: number;
      }>;
    };

    if (result.duplicatePrevented) {
      return res.json({ duplicatePrevented: true, orders: result.orders || [] });
    }

    const createdOrders = result.orders || [];
    const orderListText = createdOrders.map((o) => `${o.orderNumber} (Rs.${o.totalNpr})`).join(', ');
    await sendAkashSms({
      to: normalizedPhone,
      text: `Sahakari Bazar: Order confirmed (${orderListText}). Thank you!`,
      purpose: 'order_confirmation',
    });

    res.status(201).json({ orders: createdOrders });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'अर्डर प्रक्रिया असफल।' });
  }
});

// Secure Guest Order Tracking (requires unguessable guestAccessToken)
checkoutRouter.get('/track', async (req, res) => {
  const { orderNumber, token } = req.query;
  if (!orderNumber || !token) {
    return res.status(400).json({ error: 'अर्डर नम्बर र सुरक्षा टोकन आवश्यक छ।' });
  }

  const sb = requireSupabaseAdmin();
  const { data: rawOrder } = await sb
    .from('orders')
    .select(
      `*,
       cooperatives!inner (name_ne, name_en, slug, contact_phone, stores!inner (store_name_ne, store_name_en))`
    )
    .eq('order_number', String(orderNumber).trim())
    .eq('guest_access_token', String(token).trim())
    .limit(1)
    .maybeSingle();

  if (!rawOrder) {
    return res.status(404).json({ error: 'अर्डर फेला परेन वा सुरक्षा टोकन मिलेन।' });
  }

  const coop = (Array.isArray(rawOrder.cooperatives) ? rawOrder.cooperatives[0] : rawOrder.cooperatives) as Record<
    string,
    unknown
  >;
  const store = (Array.isArray(coop?.stores) ? coop.stores[0] : coop?.stores) as Record<string, unknown>;
  const { cooperatives: _c, ...orderRest } = rawOrder as Record<string, unknown>;
  const order = {
    ...orderRest,
    cooperative_name_ne: coop?.name_ne,
    cooperative_name_en: coop?.name_en,
    cooperative_slug: coop?.slug,
    cooperative_phone: coop?.contact_phone,
    store_name_ne: store?.store_name_ne,
    store_name_en: store?.store_name_en,
  };

  const [itemsRes, histRes] = await Promise.all([
    sb.from('order_items').select('*').eq('order_id', rawOrder.id),
    sb.from('order_status_history').select('*').eq('order_id', rawOrder.id).order('created_at', { ascending: true }),
  ]);

  res.json({ order, items: itemsRes.data || [], history: histRes.data || [] });
});

// Registered Buyer Account Router (mounted at /api/buyer and /api/checkout/buyer for compatibility)
export const buyerRouter = Router();

buyerRouter.get('/orders', requireAuth, async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: orders, error } = await sb
    .from('orders')
    .select(
      `*,
       cooperatives (id, slug, stores (store_name_ne, store_name_en)),
       order_items (*, products (slug, stock_quantity, availability_status, status, product_images (image_url, is_primary)))`
    )
    .eq('buyer_user_id', req.authUser!.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const enriched = (orders || []).map((o: Record<string, unknown>) => {
    const coop = (Array.isArray(o.cooperatives) ? o.cooperatives[0] : o.cooperatives) as Record<string, unknown> | null;
    const store = (Array.isArray(coop?.stores) ? coop.stores[0] : coop?.stores) as Record<string, unknown> | null;
    const rawItems = (o.order_items as Array<Record<string, unknown>>) || [];
    const items = rawItems.map((it) => {
      const prod = (Array.isArray(it.products) ? it.products[0] : it.products) as Record<string, unknown> | null;
      const imgs = (prod?.product_images as Array<{ image_url: string; is_primary?: boolean }>) || [];
      const { products: _p, ...itRest } = it;
      return {
        ...itRest,
        cooperative_id: o.cooperative_id,
        cooperative_slug: coop?.slug ?? null,
        store_name_ne: store?.store_name_ne ?? null,
        store_name_en: store?.store_name_en ?? null,
        product_slug: prod?.slug ?? null,
        stock_quantity: prod?.stock_quantity ?? 0,
        availability_status: prod?.availability_status ?? 'out_of_stock',
        product_status: prod?.status ?? 'draft',
        image_url: imgs.find((i) => i.is_primary)?.image_url || imgs[0]?.image_url || null,
      };
    });
    const { cooperatives: _c, order_items: _items, ...rest } = o;
    return {
      ...rest,
      cooperative_slug: coop?.slug ?? null,
      store_name_ne: store?.store_name_ne ?? null,
      store_name_en: store?.store_name_en ?? null,
      items,
    };
  });

  res.json({ orders: enriched });
});

buyerRouter.get('/addresses', requireAuth, async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: addresses, error } = await sb
    .from('buyer_addresses')
    .select('*')
    .eq('user_id', req.authUser!.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ addresses: addresses || [] });
});

buyerRouter.post('/addresses', requireAuth, async (req, res) => {
  const { label, recipientName, phone, province, district, municipality, wardNumber, streetAddress } = req.body || {};
  if (!recipientName || !phone || !province || !district || !municipality || !wardNumber || !streetAddress) {
    return res.status(400).json({ error: 'ठेगानाका सबै विवरण आवश्यक छन्।' });
  }
  const normalized = normalizeNepalPhone(String(phone));
  if (!isValidNepalMobile(normalized)) {
    return res.status(400).json({ error: 'मान्य नेपाली मोबाइल नम्बर प्रविष्ट गर्नुहोस्।' });
  }
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb
    .from('buyer_addresses')
    .insert({
      user_id: req.authUser!.id,
      label: label || 'Home',
      recipient_name: String(recipientName).trim(),
      phone: normalized,
      province,
      district,
      municipality,
      ward_number: wardNumber,
      street_address: String(streetAddress).trim(),
    })
    .select('id')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ id: data.id });
});

buyerRouter.delete('/addresses/:id', requireAuth, async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { error } = await sb
    .from('buyer_addresses')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.authUser!.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

buyerRouter.get('/wishlist', requireAuth, async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: rows, error } = await sb
    .from('wishlists')
    .select(
      `product_id,
       products!inner (
         *,
         product_images (image_url, is_primary),
         cooperatives!inner (slug, stores!inner (store_name_ne, store_name_en))
       )`
    )
    .eq('user_id', req.authUser!.id);

  if (error) return res.status(500).json({ error: error.message });

  const items = (rows || []).map((r: Record<string, unknown>) => {
    const p = (Array.isArray(r.products) ? r.products[0] : r.products) as Record<string, unknown>;
    const imgs = (p.product_images as Array<{ image_url: string; is_primary?: boolean }>) || [];
    const coop = (Array.isArray(p.cooperatives) ? p.cooperatives[0] : p.cooperatives) as Record<string, unknown>;
    const store = (Array.isArray(coop?.stores) ? coop.stores[0] : coop?.stores) as Record<string, unknown>;
    const { product_images: _pi, cooperatives: _c, ...rest } = p;
    return {
      ...rest,
      image_url: imgs.find((i) => i.is_primary)?.image_url || imgs[0]?.image_url || null,
      cooperative_slug: coop?.slug,
      store_name_ne: store?.store_name_ne,
      store_name_en: store?.store_name_en,
    };
  });

  res.json({ items });
});

buyerRouter.post('/wishlist/toggle', requireAuth, async (req, res) => {
  const { productId } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'उत्पादन ID आवश्यक छ।' });
  const sb = requireSupabaseAdmin();

  const { data: existing } = await sb
    .from('wishlists')
    .select('id')
    .eq('user_id', req.authUser!.id)
    .eq('product_id', productId)
    .maybeSingle();

  if (existing) {
    const { error } = await sb.from('wishlists').delete().eq('id', existing.id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ saved: false });
  }
  const { error } = await sb.from('wishlists').insert({ user_id: req.authUser!.id, product_id: productId });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ saved: true });
});

checkoutRouter.use('/buyer', buyerRouter);
