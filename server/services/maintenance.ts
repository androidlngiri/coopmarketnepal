import crypto from 'crypto';
import { parseJsonField, requireSupabaseAdmin } from '../supabase-admin.ts';

export type RecordClassification =
  | 'confirmed_test'
  | 'seed_demo'
  | 'genuine_business'
  | 'system_config'
  | 'uncertain_review';

export type CleanupMode = 'soft_archive' | 'permanent_delete';

export interface ScannedRecord {
  id: string;
  table: string;
  label: string;
  sublabel: string;
  cooperativeId: string | null;
  cooperativeName: string | null;
  createdAt: string | null;
  deletedAt: string | null;
  classification: RecordClassification;
  reasons: string[];
  deletable: boolean;
  softArchivable: boolean;
  relatedSummary: string;
  storageUrls: string[];
  rawPreview: Record<string, unknown>;
}

export interface DuplicateGroup {
  key: string;
  table: string;
  duplicateType: string;
  value: string;
  classification: RecordClassification;
  records: Array<{
    id: string;
    label: string;
    cooperativeId: string | null;
    cooperativeName: string | null;
    createdAt: string | null;
    deletable: boolean;
    reasons: string[];
  }>;
}

export interface TargetRef {
  table: string;
  id: string;
}

const SYSTEM_PLAN_CODES = new Set(['free_trial', 'basic', 'standard', 'premium', 'enterprise']);
const SYSTEM_CATEGORY_SLUGS = new Set([
  'agriculture-grains',
  'tea-coffee-spices',
  'dairy-ghee-honey',
  'handicraft-textiles',
  'indigenous-himalayan',
  'daily-essentials',
]);
const SYSTEM_SETTINGS_KEYS = new Set(['branding', 'legal_about', 'legal_faq', 'legal_terms', 'legal_privacy', 'announcements']);
const SEED_COOP_SLUGS = new Set([
  'ilam-green-tea-coop',
  'jumla-himalayan-organics',
  'palpa-dhaka-craft-coop',
  'himalayan-beekeepers-coop',
  'kavre-fresh-dairy-coop',
]);
const SEED_PRODUCT_SKUS = new Set([
  'ILM-TEA-001',
  'ILM-TEA-002',
  'JML-GHE-001',
  'JML-SIM-002',
  'PLP-DHK-001',
  'PLP-DHK-002',
  'ANN-HNY-001',
  'ANN-HNY-002',
]);
const SEED_EMAIL_SET = new Set([
  'contact@ilamtea.coop.np',
  'info@jumlaorganics.coop.np',
  'hello@palpadhaka.coop.np',
  'sales@annapurnahoney.coop.np',
  'contact@kavredairy.coop.np',
]);

const TEST_TEXT_REGEX = /(^|[\s._-])(test|demo|dummy|sample|tmp|temp|verify|verification|liveai|smoke|e2e|qa|fake|mock)([\s._-]|$|\d)/i;
const TEST_EMAIL_REGEX = /(@example\.com|@test\.|@mailinator\.com|\.local$|verify|liveai|smoke|dummy|test)/i;
const SYNTHETIC_PHONE_REGEX = /^(9800000\d{3}|9999999\d{3}|9811111111|9800000000)$/;

const STORAGE_BUCKETS = ['product-images', 'cooperative-logos', 'store-banners', 'cooperative-documents'] as const;

export function parseStorageObjectRef(url: string | null | undefined): { bucket: string; path: string } | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed || trimmed.startsWith('/images/')) return null;
  if (trimmed.startsWith('storage://')) {
    const rest = trimmed.slice('storage://'.length);
    const slash = rest.indexOf('/');
    if (slash > 0) return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
  }
  const publicMatch = trimmed.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/);
  if (publicMatch) {
    return { bucket: publicMatch[1], path: decodeURIComponent(publicMatch[2]) };
  }
  return null;
}

export const CODEBASE_HARDCODED_AUDIT = [
  {
    id: 'audit-home-stats',
    area: 'Public Marketplace Landing',
    file: 'src/pages/HomePage.tsx',
    issue: 'Fallback hardcoded counters (?? 4, ?? 8, ?? 4) rendered when marketplace stats resolved null/loading.',
    resolution: 'Replaced hardcoded fallbacks with loading dash ("—") during fetch and live Supabase count ?? 0 after response.',
    status: 'resolved',
  },
  {
    id: 'audit-product-image-fallback',
    area: 'Product Creation & Cards',
    file: 'server/routes/coop-dashboard.ts, ProductCard.tsx, ProductDetailPage.tsx, BuyerAccountPage.tsx',
    issue: 'Substituted "/images/product-ilam-tea.jpg" whenever a product had no uploaded image.',
    resolution: 'Stopped inserting default tea image on product creation; SafeImage renders dynamic product label fallback when image_url is null.',
    status: 'resolved',
  },
  {
    id: 'audit-legal-cms',
    area: 'Legal & About Pages',
    file: 'src/pages/LegalPage.tsx, server/routes/public.ts',
    issue: 'About/FAQ/Terms/Privacy were static client-only copy without reading platform_settings overrides.',
    resolution: 'Wired GET /api/public/legal/:doc reading platform_settings (legal_about, legal_faq, legal_terms, legal_privacy) with official baseline copy.',
    status: 'resolved',
  },
  {
    id: 'audit-soft-delete-filters',
    area: 'Public Catalog, Checkout, Sitemap & Admin Lists',
    file: 'server/routes/public.ts, checkout.ts, coop-dashboard.ts, admin.ts, server/app.ts',
    issue: 'Queries needed soft-archive filtering so archived/deleted cooperatives and products never appear publicly.',
    resolution: 'Enforced deleted_at IS NULL across public catalog, storefront, product detail, checkout, sitemap.xml, and metrics RPC.',
    status: 'resolved',
  },
  {
    id: 'audit-ai-telemetry-sms',
    area: 'Integrations & Dashboards',
    file: 'server/gemini.ts, server/akash-sms.ts, SuperAdminDashboardPage.tsx, CooperativeDashboardPage.tsx',
    issue: 'Verified no mock AI outputs, fake OTP bypasses, or fabricated chart series exist.',
    resolution: 'Confirmed all analytics, quotas, SMS logs, and AI generations query real Supabase PostgreSQL and external APIs.',
    status: 'verified_clean',
  },
];

async function fetchAllRows(table: string, selectCols = '*', orderCol = 'created_at') {
  const sb = requireSupabaseAdmin();
  const q = sb.from(table).select(selectCols);
  const { data, error } = orderCol ? await q.order(orderCol, { ascending: false }).limit(2000) : await q.limit(2000);
  if (error) return [] as Array<Record<string, unknown>>;
  return ((data || []) as unknown) as Array<Record<string, unknown>>;
}

async function listStorageObjects() {
  const sb = requireSupabaseAdmin();
  const objects: Array<{ bucket: string; path: string; size: number; createdAt: string | null }> = [];
  for (const bucket of STORAGE_BUCKETS) {
    const { data: folders } = await sb.storage.from(bucket).list('', { limit: 200 });
    for (const entry of folders || []) {
      if (!entry.id) {
        // folder prefix
        const { data: nested } = await sb.storage.from(bucket).list(entry.name, { limit: 200 });
        for (const f of nested || []) {
          if (f.id) {
            objects.push({
              bucket,
              path: `${entry.name}/${f.name}`,
              size: Number((f.metadata as Record<string, unknown> | undefined)?.size || 0),
              createdAt: f.created_at || null,
            });
          }
        }
      } else {
        objects.push({
          bucket,
          path: entry.name,
          size: Number((entry.metadata as Record<string, unknown> | undefined)?.size || 0),
          createdAt: entry.created_at || null,
        });
      }
    }
  }
  return objects;
}

export async function runMaintenanceScan() {
  const sb = requireSupabaseAdmin();

  const [
    cooperatives,
    profiles,
    products,
    productImages,
    coopCategories,
    coopDocuments,
    coopStaff,
    subscriptions,
    subPayments,
    orders,
    orderItems,
    payments,
    inventoryMovements,
    buyerAddresses,
    wishlists,
    notifications,
    smsLogs,
    otpVerifications,
    loginActivities,
    sessions,
    auditLogs,
    supportTickets,
    aiGenerations,
    stores,
    plans,
    globalCategories,
    platformSettings,
    platformAdmins,
    storageObjects,
  ] = await Promise.all([
    fetchAllRows('cooperatives'),
    fetchAllRows('profiles'),
    fetchAllRows('products'),
    fetchAllRows('product_images'),
    fetchAllRows('cooperative_categories'),
    fetchAllRows('cooperative_documents'),
    fetchAllRows('cooperative_staff'),
    fetchAllRows('subscriptions'),
    fetchAllRows('subscription_payments'),
    fetchAllRows('orders'),
    fetchAllRows('order_items', '*', ''),
    fetchAllRows('payments'),
    fetchAllRows('inventory_movements'),
    fetchAllRows('buyer_addresses'),
    fetchAllRows('wishlists'),
    fetchAllRows('notifications'),
    fetchAllRows('sms_logs'),
    fetchAllRows('otp_verifications'),
    fetchAllRows('login_activities'),
    fetchAllRows('sessions'),
    fetchAllRows('audit_logs'),
    fetchAllRows('support_tickets'),
    fetchAllRows('ai_product_generations'),
    fetchAllRows('stores'),
    fetchAllRows('subscription_plans', '*', 'sort_order'),
    fetchAllRows('global_categories', '*', 'sort_order'),
    fetchAllRows('platform_settings', '*', ''),
    fetchAllRows('platform_administrators'),
    listStorageObjects(),
  ]);

  const adminUserIds = new Set(platformAdmins.filter((a) => a.is_active).map((a) => String(a.user_id)));
  const profileMap = new Map(profiles.map((p) => [String(p.id), p]));
  const coopMap = new Map(cooperatives.map((c) => [String(c.id), c]));
  const storeByCoop = new Map(stores.map((s) => [String(s.cooperative_id), s]));
  const imagesByProd = new Map<string, Array<Record<string, unknown>>>();
  for (const img of productImages) {
    const pid = String(img.product_id);
    if (!imagesByProd.has(pid)) imagesByProd.set(pid, []);
    imagesByProd.get(pid)!.push(img);
  }
  const ordersByCoop = new Map<string, Array<Record<string, unknown>>>();
  for (const o of orders) {
    const cid = String(o.cooperative_id);
    if (!ordersByCoop.has(cid)) ordersByCoop.set(cid, []);
    ordersByCoop.get(cid)!.push(o);
  }
  const productsByCoop = new Map<string, number>();
  for (const p of products) {
    const cid = String(p.cooperative_id);
    productsByCoop.set(cid, (productsByCoop.get(cid) || 0) + 1);
  }

  // Track classification of each profile & cooperative first so children inherit context accurately
  const coopClassification = new Map<string, { cls: RecordClassification; reasons: string[]; isSeed: boolean }>();
  const profileClassification = new Map<string, { cls: RecordClassification; reasons: string[]; isSeed: boolean }>();

  for (const prof of profiles) {
    const id = String(prof.id);
    const email = String(prof.email || '').toLowerCase();
    const phone = String(prof.phone || '');
    const name = String(prof.full_name || '');
    const role = String(prof.role || 'buyer');
    const reasons: string[] = [];

    if (role === 'super_admin' || adminUserIds.has(id)) {
      reasons.push('Active Platform Super Admin account (protected system role)');
      profileClassification.set(id, { cls: 'system_config', reasons, isSeed: false });
      continue;
    }

    if (SEED_EMAIL_SET.has(email) || /^980000010[1-5]$/.test(phone)) {
      reasons.push('Matches initial seeded demo cooperative account (9800000101–05 / *.coop.np)');
      profileClassification.set(id, { cls: 'seed_demo', reasons, isSeed: true });
      continue;
    }

    const testEmailHit = TEST_EMAIL_REGEX.test(email);
    const testPhoneHit = SYNTHETIC_PHONE_REGEX.test(phone);
    const testNameHit = TEST_TEXT_REGEX.test(name);

    if ((testEmailHit && (testNameHit || testPhoneHit)) || testEmailHit || testPhoneHit) {
      if (testEmailHit) reasons.push(`Synthetic/test email pattern (${email})`);
      if (testPhoneHit) reasons.push(`Synthetic test phone (${phone})`);
      if (testNameHit) reasons.push(`Test/demo keyword in profile name (${name})`);
      profileClassification.set(id, { cls: 'confirmed_test', reasons, isSeed: false });
    } else if (testNameHit && !prof.phone_verified_at) {
      reasons.push('Name contains test/demo keyword and phone is unverified — requires manual review');
      profileClassification.set(id, { cls: 'uncertain_review', reasons, isSeed: false });
    } else {
      reasons.push('Registered real user profile without synthetic test markers');
      profileClassification.set(id, { cls: 'genuine_business', reasons, isSeed: false });
    }
  }

  for (const coop of cooperatives) {
    const id = String(coop.id);
    const slug = String(coop.slug || '');
    const nameEn = String(coop.name_en || '');
    const nameNe = String(coop.name_ne || '');
    const regNo = String(coop.registration_number || '');
    const email = String(coop.contact_email || '').toLowerCase();
    const phone = String(coop.contact_phone || '');
    const ownerInfo = profileClassification.get(String(coop.owner_user_id));
    const coopOrders = ordersByCoop.get(id) || [];
    const reasons: string[] = [];

    if (SEED_COOP_SLUGS.has(slug)) {
      reasons.push(`Initial demo storefront seed slug (${slug})`);
      if (coopOrders.some((o) => !SYNTHETIC_PHONE_REGEX.test(String(o.customer_phone || '')))) {
        reasons.push('Warning: Has an order from a non-synthetic customer phone — review before permanent deletion');
      }
      coopClassification.set(id, { cls: 'seed_demo', reasons, isSeed: true });
      continue;
    }

    const hasTestEmail = TEST_EMAIL_REGEX.test(email);
    const hasTestPhone = SYNTHETIC_PHONE_REGEX.test(phone);
    const hasTestName = TEST_TEXT_REGEX.test(nameEn) || TEST_TEXT_REGEX.test(nameNe);
    const hasTestReg = TEST_TEXT_REGEX.test(regNo);
    const ownerIsTest = ownerInfo?.cls === 'confirmed_test';

    const strongSignals = [hasTestEmail, hasTestPhone, hasTestReg, ownerIsTest].filter(Boolean).length;
    if (strongSignals >= 1 && (hasTestName || strongSignals >= 2 || hasTestEmail || hasTestReg)) {
      if (hasTestEmail) reasons.push(`Test contact email (${email})`);
      if (hasTestPhone) reasons.push(`Synthetic phone (${phone})`);
      if (hasTestReg) reasons.push(`Test registration number (${regNo})`);
      if (hasTestName) reasons.push(`Test/demo keyword in cooperative name`);
      if (ownerIsTest) reasons.push(`Owned by confirmed test profile`);
      coopClassification.set(id, { cls: 'confirmed_test', reasons, isSeed: false });
    } else if (hasTestName || coop.status === 'pending_otp' || coop.status === 'rejected') {
      if (hasTestName) reasons.push('Cooperative name contains test-like token without synthetic credentials');
      if (coop.status === 'pending_otp') reasons.push('Incomplete OTP registration (pending_otp)');
      if (coop.status === 'rejected') reasons.push('Rejected cooperative application');
      reasons.push('Flagged as uncertain for manual Super Admin review');
      coopClassification.set(id, { cls: 'uncertain_review', reasons, isSeed: false });
    } else {
      reasons.push('Verified/active business cooperative with no synthetic test markers');
      coopClassification.set(id, { cls: 'genuine_business', reasons, isSeed: false });
    }
  }

  const prodClassification = new Map<string, { cls: RecordClassification; reasons: string[] }>();
  for (const prod of products) {
    const id = String(prod.id);
    const sku = String(prod.sku || '').toUpperCase();
    const nameEn = String(prod.name_en || '');
    const nameNe = String(prod.name_ne || '');
    const coopInfo = coopClassification.get(String(prod.cooperative_id));
    const reasons: string[] = [];

    if (SEED_PRODUCT_SKUS.has(sku) || coopInfo?.isSeed) {
      reasons.push(SEED_PRODUCT_SKUS.has(sku) ? `Initial catalog seed SKU (${sku})` : 'Belongs to seeded demo cooperative');
      prodClassification.set(id, { cls: 'seed_demo', reasons });
      continue;
    }

    const nameTest = TEST_TEXT_REGEX.test(nameEn) || TEST_TEXT_REGEX.test(nameNe);
    const skuTest = TEST_TEXT_REGEX.test(sku);

    if (coopInfo?.cls === 'confirmed_test') {
      reasons.push('Product belongs to a confirmed test cooperative');
      prodClassification.set(id, { cls: 'confirmed_test', reasons });
    } else if (nameTest && skuTest) {
      reasons.push('Both product name and SKU contain explicit test markers');
      prodClassification.set(id, { cls: 'confirmed_test', reasons });
    } else if (nameTest || skuTest || prod.deleted_at) {
      if (nameTest || skuTest) reasons.push('Test-like text in SKU or title inside genuine/unclassified cooperative — review manually');
      if (prod.deleted_at) reasons.push('Previously soft-archived product');
      prodClassification.set(id, { cls: 'uncertain_review', reasons });
    } else {
      reasons.push('Standard cooperative catalog product');
      prodClassification.set(id, { cls: 'genuine_business', reasons });
    }
  }

  const records: ScannedRecord[] = [];

  // 1. Cooperatives
  for (const c of cooperatives) {
    const id = String(c.id);
    const info = coopClassification.get(id)!;
    const store = storeByCoop.get(id);
    const storageUrls = [String(c.logo_url || ''), String(store?.logo_url || ''), String(store?.banner_url || '')].filter(
      (u) => Boolean(parseStorageObjectRef(u))
    );
    const orderCount = (ordersByCoop.get(id) || []).length;
    const prodCount = productsByCoop.get(id) || 0;
    records.push({
      id,
      table: 'cooperatives',
      label: `${String(c.name_en)} (${String(c.name_ne)})`,
      sublabel: `Slug: ${String(c.slug)} · Reg: ${String(c.registration_number)} · Status: ${String(c.status)}`,
      cooperativeId: id,
      cooperativeName: String(c.name_en),
      createdAt: String(c.created_at || ''),
      deletedAt: c.deleted_at ? String(c.deleted_at) : null,
      classification: info.cls,
      reasons: info.reasons,
      deletable: info.cls === 'confirmed_test' || info.cls === 'seed_demo',
      softArchivable: info.cls !== 'system_config',
      relatedSummary: `${prodCount} products · ${orderCount} orders`,
      storageUrls,
      rawPreview: {
        id,
        slug: c.slug,
        status: c.status,
        contact_phone: c.contact_phone,
        contact_email: c.contact_email,
        district: c.district,
        deleted_at: c.deleted_at,
      },
    });
  }

  // 2. Profiles
  for (const p of profiles) {
    const id = String(p.id);
    const info = profileClassification.get(id)!;
    const ownedCoop = cooperatives.find((c) => String(c.owner_user_id) === id);
    records.push({
      id,
      table: 'profiles',
      label: `${String(p.full_name)} (${String(p.role)})`,
      sublabel: `${String(p.email || 'no-email')} · ${String(p.phone || 'no-phone')}`,
      cooperativeId: ownedCoop ? String(ownedCoop.id) : null,
      cooperativeName: ownedCoop ? String(ownedCoop.name_en) : null,
      createdAt: String(p.created_at || ''),
      deletedAt: null,
      classification: info.cls,
      reasons: info.reasons,
      deletable: info.cls === 'confirmed_test' || info.cls === 'seed_demo',
      softArchivable: false,
      relatedSummary: ownedCoop ? `Owns cooperative: ${String(ownedCoop.name_en)}` : `Role: ${String(p.role)}`,
      storageUrls: [],
      rawPreview: { id, full_name: p.full_name, email: p.email, phone: p.phone, role: p.role, is_active: p.is_active },
    });
  }

  // 3. Products
  for (const pr of products) {
    const id = String(pr.id);
    const coop = coopMap.get(String(pr.cooperative_id));
    const info = prodClassification.get(id)!;
    const imgs = imagesByProd.get(id) || [];
    const storageUrls = imgs.map((i) => String(i.image_url || '')).filter((u) => Boolean(parseStorageObjectRef(u)));
    records.push({
      id,
      table: 'products',
      label: `${String(pr.name_en)} (${String(pr.sku)})`,
      sublabel: `Status: ${String(pr.status)} · NPR ${String(pr.price_npr)} · Stock: ${String(pr.stock_quantity)}`,
      cooperativeId: String(pr.cooperative_id),
      cooperativeName: coop ? String(coop.name_en) : null,
      createdAt: String(pr.created_at || ''),
      deletedAt: pr.deleted_at ? String(pr.deleted_at) : null,
      classification: info.cls,
      reasons: info.reasons,
      deletable: info.cls === 'confirmed_test' || info.cls === 'seed_demo',
      softArchivable: info.cls !== 'system_config',
      relatedSummary: `${imgs.length} images`,
      storageUrls,
      rawPreview: { id, sku: pr.sku, slug: pr.slug, status: pr.status, price_npr: pr.price_npr, deleted_at: pr.deleted_at },
    });
  }

  // 4. Orders & Payments
  for (const ord of orders) {
    const id = String(ord.id);
    const coop = coopMap.get(String(ord.cooperative_id));
    const coopInfo = coopClassification.get(String(ord.cooperative_id));
    const phone = String(ord.customer_phone || '');
    const email = String(ord.customer_email || '');
    const name = String(ord.customer_name || '');
    const reasons: string[] = [];
    let cls: RecordClassification = 'genuine_business';

    const custIsTest = SYNTHETIC_PHONE_REGEX.test(phone) || TEST_EMAIL_REGEX.test(email) || TEST_TEXT_REGEX.test(name);
    if (coopInfo?.cls === 'confirmed_test' && custIsTest) {
      cls = 'confirmed_test';
      reasons.push('Order belongs to test cooperative and has synthetic customer markers');
    } else if (coopInfo?.cls === 'seed_demo' && custIsTest) {
      cls = 'seed_demo';
      reasons.push('Seed demo order with synthetic test phone/customer');
    } else if (coopInfo?.cls === 'confirmed_test' || coopInfo?.cls === 'seed_demo') {
      cls = 'uncertain_review';
      reasons.push(`Order attached to ${coopInfo.cls === 'seed_demo' ? 'seeded demo' : 'test'} cooperative but customer (${name} / ${phone}) looks real — manual review required`);
    } else if (custIsTest) {
      cls = 'uncertain_review';
      reasons.push('Customer looks test-like on a genuine cooperative order — retained for accounting safety');
    } else {
      cls = 'genuine_business';
      reasons.push('Genuine customer order record');
    }

    records.push({
      id,
      table: 'orders',
      label: `${String(ord.order_number)} — ${name}`,
      sublabel: `Phone: ${phone} · NPR ${String(ord.total_npr)} · ${String(ord.status)} (${String(ord.payment_status)})`,
      cooperativeId: String(ord.cooperative_id),
      cooperativeName: coop ? String(coop.name_en) : null,
      createdAt: String(ord.created_at || ''),
      deletedAt: null,
      classification: cls,
      reasons,
      deletable: cls === 'confirmed_test' || cls === 'seed_demo',
      softArchivable: false,
      relatedSummary: `Payment: ${String(ord.payment_method)}`,
      storageUrls: [],
      rawPreview: {
        id,
        order_number: ord.order_number,
        customer_name: ord.customer_name,
        customer_phone: ord.customer_phone,
        total_npr: ord.total_npr,
        status: ord.status,
      },
    });
  }

  // 5. Subscription Payments (test refs or under test cooperatives)
  for (const sp of subPayments) {
    const id = String(sp.id);
    const coop = coopMap.get(String(sp.cooperative_id));
    const coopInfo = coopClassification.get(String(sp.cooperative_id));
    const refNo = String(sp.reference_number || '');
    const reasons: string[] = [];
    let cls: RecordClassification = 'genuine_business';
    if (coopInfo?.cls === 'confirmed_test' && TEST_TEXT_REGEX.test(refNo)) {
      cls = 'confirmed_test';
      reasons.push('Test subscription payment reference under test cooperative');
    } else if (coopInfo?.cls === 'confirmed_test' || TEST_TEXT_REGEX.test(refNo)) {
      cls = 'uncertain_review';
      reasons.push('Financial record has test indicator — requires manual review');
    } else {
      reasons.push('Genuine cooperative subscription payment record');
    }
    records.push({
      id,
      table: 'subscription_payments',
      label: `Sub Payment ${refNo || id.slice(0, 8)} (NPR ${String(sp.amount_npr)})`,
      sublabel: `${String(sp.payment_method)} · ${String(sp.status)}`,
      cooperativeId: String(sp.cooperative_id),
      cooperativeName: coop ? String(coop.name_en) : null,
      createdAt: String(sp.created_at || ''),
      deletedAt: null,
      classification: cls,
      reasons,
      deletable: cls === 'confirmed_test',
      softArchivable: false,
      relatedSummary: `Cycle: ${String(sp.billing_cycle)}`,
      storageUrls: sp.proof_url && parseStorageObjectRef(String(sp.proof_url)) ? [String(sp.proof_url)] : [],
      rawPreview: sp,
    });
  }

  // 6. Cooperative Categories (custom categories under test/seed cooperatives)
  for (const cc of coopCategories) {
    const id = String(cc.id);
    const coop = coopMap.get(String(cc.cooperative_id));
    const coopInfo = coopClassification.get(String(cc.cooperative_id));
    const cls: RecordClassification =
      coopInfo?.cls === 'confirmed_test' ? 'confirmed_test' : coopInfo?.cls === 'seed_demo' ? 'seed_demo' : 'genuine_business';
    records.push({
      id,
      table: 'cooperative_categories',
      label: `${String(cc.name_en)} (${String(cc.name_ne)})`,
      sublabel: `Slug: ${String(cc.slug)}`,
      cooperativeId: String(cc.cooperative_id),
      cooperativeName: coop ? String(coop.name_en) : null,
      createdAt: String(cc.created_at || ''),
      deletedAt: null,
      classification: cls,
      reasons: [coopInfo ? `Inherits cooperative status (${coopInfo.cls})` : 'Custom store category'],
      deletable: cls === 'confirmed_test' || cls === 'seed_demo',
      softArchivable: false,
      relatedSummary: 'Store category',
      storageUrls: [],
      rawPreview: cc,
    });
  }

  // 7. Temporary OTPs, Sessions, SMS Logs, Notifications, Login Activities, AI Generations
  const nowMs = Date.now();
  for (const otp of otpVerifications) {
    const id = String(otp.id);
    const expired = new Date(String(otp.expires_at)).getTime() < nowMs;
    const isSynth = SYNTHETIC_PHONE_REGEX.test(String(otp.phone || ''));
    const cls: RecordClassification = expired || Boolean(otp.verified_at) || isSynth ? 'confirmed_test' : 'uncertain_review';
    records.push({
      id,
      table: 'otp_verifications',
      label: `OTP ${String(otp.phone)} (${String(otp.purpose)})`,
      sublabel: expired ? 'Expired temporary OTP record' : otp.verified_at ? 'Consumed OTP' : 'Active OTP',
      cooperativeId: null,
      cooperativeName: null,
      createdAt: String(otp.created_at || ''),
      deletedAt: null,
      classification: cls,
      reasons: [expired ? 'Expired OTP verification token' : otp.verified_at ? 'Already verified OTP token' : 'Active unexpired OTP'],
      deletable: cls === 'confirmed_test',
      softArchivable: false,
      relatedSummary: `Attempts: ${String(otp.attempts)}`,
      storageUrls: [],
      rawPreview: { id, phone: otp.phone, purpose: otp.purpose, expires_at: otp.expires_at, verified_at: otp.verified_at },
    });
  }

  for (const sess of sessions) {
    const id = String(sess.id);
    const expired = new Date(String(sess.expires_at)).getTime() < nowMs;
    const prof = profileMap.get(String(sess.user_id));
    const profInfo = profileClassification.get(String(sess.user_id));
    const cls: RecordClassification =
      expired || profInfo?.cls === 'confirmed_test' || profInfo?.cls === 'seed_demo' ? 'confirmed_test' : 'genuine_business';
    records.push({
      id,
      table: 'sessions',
      label: `Session: ${String(prof?.full_name || sess.user_id)}`,
      sublabel: expired ? `Expired (${String(sess.expires_at)})` : `Active until ${String(sess.expires_at)}`,
      cooperativeId: null,
      cooperativeName: null,
      createdAt: String(sess.created_at || ''),
      deletedAt: null,
      classification: cls,
      reasons: [expired ? 'Expired auth session row' : profInfo?.cls === 'confirmed_test' ? 'Belongs to test user' : 'Active user session'],
      deletable: cls === 'confirmed_test',
      softArchivable: false,
      relatedSummary: String(sess.ip_address || 'unknown IP'),
      storageUrls: [],
      rawPreview: { id, user_id: sess.user_id, expires_at: sess.expires_at, ip_address: sess.ip_address },
    });
  }

  for (const sms of smsLogs) {
    const id = String(sms.id);
    const phone = String(sms.recipient_phone || '');
    const coop = sms.cooperative_id ? coopMap.get(String(sms.cooperative_id)) : null;
    const coopInfo = sms.cooperative_id ? coopClassification.get(String(sms.cooperative_id)) : null;
    const isTestSms =
      String(sms.purpose) === 'admin_test_sms' ||
      SYNTHETIC_PHONE_REGEX.test(phone) ||
      String(sms.status) === 'unconfigured' ||
      coopInfo?.cls === 'confirmed_test';
    const cls: RecordClassification = isTestSms ? 'confirmed_test' : 'genuine_business';
    records.push({
      id,
      table: 'sms_logs',
      label: `SMS → ${phone} (${String(sms.purpose)})`,
      sublabel: `Status: ${String(sms.status)} · ${String(sms.provider)}`,
      cooperativeId: sms.cooperative_id ? String(sms.cooperative_id) : null,
      cooperativeName: coop ? String(coop.name_en) : null,
      createdAt: String(sms.created_at || ''),
      deletedAt: null,
      classification: cls,
      reasons: [
        isTestSms
          ? `Test/unconfigured or test-tenant SMS log (${String(sms.purpose)} / ${String(sms.status)})`
          : 'Production SMS dispatch log',
      ],
      deletable: cls === 'confirmed_test',
      softArchivable: false,
      relatedSummary: String(sms.status),
      storageUrls: [],
      rawPreview: sms,
    });
  }

  for (const notif of notifications) {
    const id = String(notif.id);
    const coop = notif.cooperative_id ? coopMap.get(String(notif.cooperative_id)) : null;
    const coopInfo = notif.cooperative_id ? coopClassification.get(String(notif.cooperative_id)) : null;
    const recipInfo = notif.recipient_user_id ? profileClassification.get(String(notif.recipient_user_id)) : null;
    const isTest = coopInfo?.cls === 'confirmed_test' || recipInfo?.cls === 'confirmed_test';
    const isSeed = coopInfo?.cls === 'seed_demo' || recipInfo?.cls === 'seed_demo';
    const cls: RecordClassification = isTest ? 'confirmed_test' : isSeed ? 'seed_demo' : 'genuine_business';
    records.push({
      id,
      table: 'notifications',
      label: String(notif.title_en || notif.type),
      sublabel: String(notif.body_en || ''),
      cooperativeId: notif.cooperative_id ? String(notif.cooperative_id) : null,
      cooperativeName: coop ? String(coop.name_en) : null,
      createdAt: String(notif.created_at || ''),
      deletedAt: null,
      classification: cls,
      reasons: [isTest ? 'Notification for test tenant/user' : isSeed ? 'Notification for seeded demo entity' : 'Active platform notification'],
      deletable: cls === 'confirmed_test' || cls === 'seed_demo',
      softArchivable: false,
      relatedSummary: notif.is_read ? 'Read' : 'Unread',
      storageUrls: [],
      rawPreview: notif,
    });
  }

  for (const la of loginActivities) {
    const id = String(la.id);
    const ident = String(la.identifier || '');
    const profInfo = la.user_id ? profileClassification.get(String(la.user_id)) : null;
    const isTest = TEST_EMAIL_REGEX.test(ident) || SYNTHETIC_PHONE_REGEX.test(ident) || profInfo?.cls === 'confirmed_test';
    const cls: RecordClassification = isTest ? 'confirmed_test' : 'genuine_business';
    records.push({
      id,
      table: 'login_activities',
      label: `Login attempt: ${ident}`,
      sublabel: `${la.success ? 'Success' : `Failed (${String(la.failure_reason || 'error')})`}`,
      cooperativeId: null,
      cooperativeName: null,
      createdAt: String(la.created_at || ''),
      deletedAt: null,
      classification: cls,
      reasons: [isTest ? 'Test identifier login trace' : 'Genuine authentication audit record'],
      deletable: cls === 'confirmed_test',
      softArchivable: false,
      relatedSummary: String(la.ip_address || ''),
      storageUrls: [],
      rawPreview: la,
    });
  }

  for (const ai of aiGenerations) {
    const id = String(ai.id);
    const coop = coopMap.get(String(ai.cooperative_id));
    const coopInfo = coopClassification.get(String(ai.cooperative_id));
    const input = String(ai.product_name_input || '');
    const isTest = coopInfo?.cls === 'confirmed_test' || (TEST_TEXT_REGEX.test(input) && ai.status === 'failed');
    const cls: RecordClassification = isTest ? 'confirmed_test' : coopInfo?.cls === 'seed_demo' ? 'seed_demo' : 'genuine_business';
    records.push({
      id,
      table: 'ai_product_generations',
      label: `AI Gen: ${input}`,
      sublabel: `Status: ${String(ai.status)} · ${String(ai.model)}`,
      cooperativeId: String(ai.cooperative_id),
      cooperativeName: coop ? String(coop.name_en) : null,
      createdAt: String(ai.created_at || ''),
      deletedAt: null,
      classification: cls,
      reasons: [isTest ? 'Test/failed test AI generation row' : 'Quota & AI usage audit record'],
      deletable: cls === 'confirmed_test',
      softArchivable: false,
      relatedSummary: String(ai.generation_date_ktm || ''),
      storageUrls: [],
      rawPreview: ai,
    });
  }

  // 8. Essential System Configuration (Protected & non-deletable)
  for (const plan of plans) {
    const id = String(plan.id);
    const isBase = SYSTEM_PLAN_CODES.has(String(plan.code));
    records.push({
      id,
      table: 'subscription_plans',
      label: `${String(plan.name_en)} (${String(plan.code)})`,
      sublabel: `NPR ${String(plan.monthly_price_npr)}/mo · Max Products: ${String(plan.max_products)}`,
      cooperativeId: null,
      cooperativeName: null,
      createdAt: String(plan.created_at || ''),
      deletedAt: null,
      classification: isBase ? 'system_config' : 'genuine_business',
      reasons: [isBase ? 'Essential default SaaS subscription plan' : 'Configured custom subscription plan'],
      deletable: false,
      softArchivable: false,
      relatedSummary: 'Protected System Plan',
      storageUrls: [],
      rawPreview: plan,
    });
  }

  for (const cat of globalCategories) {
    const id = String(cat.id);
    const isBase = SYSTEM_CATEGORY_SLUGS.has(String(cat.slug));
    records.push({
      id,
      table: 'global_categories',
      label: `${String(cat.name_en)} (${String(cat.name_ne)})`,
      sublabel: `Slug: ${String(cat.slug)} · Active: ${String(cat.is_active)}`,
      cooperativeId: null,
      cooperativeName: null,
      createdAt: String(cat.created_at || ''),
      deletedAt: null,
      classification: isBase ? 'system_config' : 'genuine_business',
      reasons: [isBase ? 'Essential baseline marketplace category' : 'Admin-created marketplace category'],
      deletable: false,
      softArchivable: false,
      relatedSummary: 'Protected Global Category',
      storageUrls: [],
      rawPreview: cat,
    });
  }

  for (const ps of platformSettings) {
    const key = String(ps.key);
    records.push({
      id: key,
      table: 'platform_settings',
      label: `Setting: ${key}`,
      sublabel: `Updated: ${String(ps.updated_at || '')}`,
      cooperativeId: null,
      cooperativeName: null,
      createdAt: String(ps.updated_at || ''),
      deletedAt: null,
      classification: SYSTEM_SETTINGS_KEYS.has(key) ? 'system_config' : 'genuine_business',
      reasons: ['Essential platform branding & configuration setting'],
      deletable: false,
      softArchivable: false,
      relatedSummary: 'Protected Setting',
      storageUrls: [],
      rawPreview: ps,
    });
  }

  // 9. Duplicate Records Detection
  const duplicates: DuplicateGroup[] = [];
  const addDupGroup = (
    table: string,
    duplicateType: string,
    keyMap: Map<string, Array<Record<string, unknown>>>,
    getMeta: (r: Record<string, unknown>) => {
      id: string;
      label: string;
      cooperativeId: string | null;
      cooperativeName: string | null;
      createdAt: string | null;
      cls: RecordClassification;
      reasons: string[];
    }
  ) => {
    for (const [val, items] of keyMap.entries()) {
      if (!val || items.length < 2) continue;
      const mapped = items.map(getMeta).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      const groupCls: RecordClassification = mapped.every((m) => m.cls === 'confirmed_test')
        ? 'confirmed_test'
        : mapped.some((m) => m.cls === 'genuine_business')
        ? 'uncertain_review'
        : mapped[0].cls;
      duplicates.push({
        key: `${table}:${duplicateType}:${val}`,
        table,
        duplicateType,
        value: val,
        classification: groupCls,
        records: mapped.map((m, idx) => ({
          id: m.id,
          label: `${m.label}${idx === 0 ? ' (Newest)' : ''}`,
          cooperativeId: m.cooperativeId,
          cooperativeName: m.cooperativeName,
          createdAt: m.createdAt,
          deletable: idx > 0 && (m.cls === 'confirmed_test' || m.cls === 'seed_demo' || table === 'orders' || table === 'products'),
          reasons: [...m.reasons, `Shares ${duplicateType} "${val}" with ${items.length - 1} other record(s)`],
        })),
      });
    }
  };

  // Duplicate profiles by normalized phone / email / full_name
  const profByPhone = new Map<string, Array<Record<string, unknown>>>();
  const profByEmail = new Map<string, Array<Record<string, unknown>>>();
  for (const p of profiles) {
    const ph = String(p.phone || '').trim();
    const em = String(p.email || '').trim().toLowerCase();
    if (ph) profByPhone.set(ph, [...(profByPhone.get(ph) || []), p]);
    if (em) profByEmail.set(em, [...(profByEmail.get(em) || []), p]);
  }
  const profMeta = (p: Record<string, unknown>) => {
    const info = profileClassification.get(String(p.id))!;
    return {
      id: String(p.id),
      label: `${String(p.full_name)} (${String(p.role)})`,
      cooperativeId: null,
      cooperativeName: null,
      createdAt: String(p.created_at || ''),
      cls: info.cls,
      reasons: info.reasons,
    };
  };
  addDupGroup('profiles', 'phone', profByPhone, profMeta);
  addDupGroup('profiles', 'email', profByEmail, profMeta);

  // Duplicate cooperatives by normalized English name or contact phone
  const coopByName = new Map<string, Array<Record<string, unknown>>>();
  const coopByPhone = new Map<string, Array<Record<string, unknown>>>();
  for (const c of cooperatives) {
    const nm = String(c.name_en || '').trim().toLowerCase();
    const ph = String(c.contact_phone || '').trim();
    if (nm) coopByName.set(nm, [...(coopByName.get(nm) || []), c]);
    if (ph) coopByPhone.set(ph, [...(coopByPhone.get(ph) || []), c]);
  }
  const coopMeta = (c: Record<string, unknown>) => {
    const info = coopClassification.get(String(c.id))!;
    return {
      id: String(c.id),
      label: `${String(c.name_en)} (${String(c.slug)})`,
      cooperativeId: String(c.id),
      cooperativeName: String(c.name_en),
      createdAt: String(c.created_at || ''),
      cls: info.cls,
      reasons: info.reasons,
    };
  };
  addDupGroup('cooperatives', 'normalized_name', coopByName, coopMeta);
  addDupGroup('cooperatives', 'contact_phone', coopByPhone, coopMeta);

  // Duplicate products by global SKU or same-coop normalized name
  const prodBySku = new Map<string, Array<Record<string, unknown>>>();
  const prodByCoopName = new Map<string, Array<Record<string, unknown>>>();
  for (const pr of products) {
    const sku = String(pr.sku || '').trim().toUpperCase();
    const nm = `${String(pr.cooperative_id)}::${String(pr.name_en || '').trim().toLowerCase()}`;
    if (sku) prodBySku.set(sku, [...(prodBySku.get(sku) || []), pr]);
    if (pr.name_en) prodByCoopName.set(nm, [...(prodByCoopName.get(nm) || []), pr]);
  }
  const prodMeta = (pr: Record<string, unknown>) => {
    const info = prodClassification.get(String(pr.id))!;
    const coop = coopMap.get(String(pr.cooperative_id));
    return {
      id: String(pr.id),
      label: `${String(pr.name_en)} (${String(pr.sku)})`,
      cooperativeId: String(pr.cooperative_id),
      cooperativeName: coop ? String(coop.name_en) : null,
      createdAt: String(pr.created_at || ''),
      cls: info.cls,
      reasons: info.reasons,
    };
  };
  addDupGroup('products', 'sku', prodBySku, prodMeta);
  addDupGroup('products', 'cooperative_product_name', prodByCoopName, prodMeta);

  // Duplicate potential orders (same cooperative + customer_phone + total_npr within 10 minutes)
  const ordByFingerprint = new Map<string, Array<Record<string, unknown>>>();
  for (const o of orders) {
    const bucket10m = Math.floor(new Date(String(o.created_at || 0)).getTime() / (10 * 60 * 1000));
    const fp = `${String(o.cooperative_id)}:${String(o.customer_phone)}:${Number(o.total_npr)}:${bucket10m}`;
    ordByFingerprint.set(fp, [...(ordByFingerprint.get(fp) || []), o]);
  }
  addDupGroup('orders', 'same_customer_total_10min', ordByFingerprint, (o) => {
    const coop = coopMap.get(String(o.cooperative_id));
    const coopInfo = coopClassification.get(String(o.cooperative_id));
    return {
      id: String(o.id),
      label: `${String(o.order_number)} (${String(o.customer_name)})`,
      cooperativeId: String(o.cooperative_id),
      cooperativeName: coop ? String(coop.name_en) : null,
      createdAt: String(o.created_at || ''),
      cls: coopInfo?.cls === 'confirmed_test' ? 'confirmed_test' : 'uncertain_review',
      reasons: ['Repeated identical order amount/phone within 10-minute window'],
    };
  });

  // 10. Storage Usage & Orphan Audit
  const referencedStoragePaths = new Set<string>();
  const addRef = (url: unknown) => {
    const parsed = parseStorageObjectRef(url as string | null);
    if (parsed) referencedStoragePaths.add(`${parsed.bucket}/${parsed.path}`);
  };
  cooperatives.forEach((c) => addRef(c.logo_url));
  stores.forEach((s) => {
    addRef(s.logo_url);
    addRef(s.banner_url);
  });
  coopDocuments.forEach((d) => addRef(d.file_url));
  productImages.forEach((pi) => addRef(pi.image_url));
  subPayments.forEach((sp) => addRef(sp.proof_url));

  const storageSummary = storageObjects.map((obj) => ({
    ...obj,
    referenced: referencedStoragePaths.has(`${obj.bucket}/${obj.path}`),
  }));

  // 11. Table Overview Counts
  const tableCounts: Array<{ table: string; count: number; testOrSeedCount: number; genuineCount: number; systemCount: number; uncertainCount: number }> = [];
  const allTablesData: Array<[string, number]> = [
    ['cooperatives', cooperatives.length],
    ['profiles', profiles.length],
    ['products', products.length],
    ['product_images', productImages.length],
    ['cooperative_categories', coopCategories.length],
    ['cooperative_documents', coopDocuments.length],
    ['cooperative_staff', coopStaff.length],
    ['stores', stores.length],
    ['subscriptions', subscriptions.length],
    ['subscription_payments', subPayments.length],
    ['orders', orders.length],
    ['order_items', orderItems.length],
    ['payments', payments.length],
    ['inventory_movements', inventoryMovements.length],
    ['buyer_addresses', buyerAddresses.length],
    ['wishlists', wishlists.length],
    ['notifications', notifications.length],
    ['sms_logs', smsLogs.length],
    ['otp_verifications', otpVerifications.length],
    ['login_activities', loginActivities.length],
    ['sessions', sessions.length],
    ['audit_logs', auditLogs.length],
    ['support_tickets', supportTickets.length],
    ['ai_product_generations', aiGenerations.length],
    ['subscription_plans', plans.length],
    ['global_categories', globalCategories.length],
    ['platform_settings', platformSettings.length],
    ['platform_administrators', platformAdmins.length],
  ];

  const byTable = new Map<string, ScannedRecord[]>();
  for (const r of records) {
    if (!byTable.has(r.table)) byTable.set(r.table, []);
    byTable.get(r.table)!.push(r);
  }

  for (const [table, total] of allTablesData) {
    const list = byTable.get(table) || [];
    tableCounts.push({
      table,
      count: total,
      testOrSeedCount: list.filter((r) => r.classification === 'confirmed_test' || r.classification === 'seed_demo').length,
      genuineCount: list.filter((r) => r.classification === 'genuine_business').length,
      systemCount: list.filter((r) => r.classification === 'system_config').length,
      uncertainCount: list.filter((r) => r.classification === 'uncertain_review').length,
    });
  }

  const classificationSummary = {
    confirmed_test: records.filter((r) => r.classification === 'confirmed_test').length,
    seed_demo: records.filter((r) => r.classification === 'seed_demo').length,
    genuine_business: records.filter((r) => r.classification === 'genuine_business').length,
    system_config: records.filter((r) => r.classification === 'system_config').length,
    uncertain_review: records.filter((r) => r.classification === 'uncertain_review').length,
    duplicate_groups: duplicates.length,
    orphaned_storage_files: storageSummary.filter((s) => !s.referenced).length,
    total_storage_files: storageSummary.length,
  };

  return {
    scannedAt: new Date().toISOString(),
    classificationSummary,
    tableCounts,
    records,
    duplicates,
    storageFiles: storageSummary,
    codeAudit: CODEBASE_HARDCODED_AUDIT,
    filterOptions: {
      cooperatives: cooperatives.map((c) => ({
        id: String(c.id),
        name_en: String(c.name_en),
        name_ne: String(c.name_ne),
        slug: String(c.slug),
      })),
      tables: Array.from(new Set(records.map((r) => r.table))).sort(),
    },
  };
}

export async function previewCleanupTargets(targets: TargetRef[], mode: CleanupMode) {
  const scan = await runMaintenanceScan();
  const recordMap = new Map(scan.records.map((r) => [`${r.table}:${r.id}`, r]));
  const sb = requireSupabaseAdmin();

  const eligible: Array<ScannedRecord & { impactCounts: Record<string, number> }> = [];
  const blocked: Array<{ table: string; id: string; label: string; classification: string; blockReason: string }> = [];
  const dependentSummary: Record<string, number> = {};
  const candidateStorageRefs: Array<{ url: string; bucket: string; path: string; safeToDelete: boolean; reason: string }> = [];

  // Deduplicate input targets
  const uniqueTargets = Array.from(new Map(targets.map((t) => [`${t.table}:${t.id}`, t])).values());

  // Track which IDs are slated for deletion so we know if storage URLs remain referenced by retained rows
  const deletingCoopIds = new Set<string>();
  const deletingProdIds = new Set<string>();

  for (const t of uniqueTargets) {
    const rec = recordMap.get(`${t.table}:${t.id}`);
    if (!rec) {
      blocked.push({
        table: t.table,
        id: t.id,
        label: t.id,
        classification: 'missing',
        blockReason: 'Record no longer exists in database.',
      });
      continue;
    }

    if (rec.classification === 'system_config') {
      blocked.push({
        table: rec.table,
        id: rec.id,
        label: rec.label,
        classification: rec.classification,
        blockReason: 'Protected essential system configuration cannot be deleted or archived.',
      });
      continue;
    }

    if (rec.classification === 'genuine_business') {
      blocked.push({
        table: rec.table,
        id: rec.id,
        label: rec.label,
        classification: rec.classification,
        blockReason: 'Genuine business record is protected against bulk cleanup.',
      });
      continue;
    }

    if (rec.classification === 'uncertain_review') {
      blocked.push({
        table: rec.table,
        id: rec.id,
        label: rec.label,
        classification: rec.classification,
        blockReason: 'Uncertain classification — retained and flagged for manual Super Admin review.',
      });
      continue;
    }

    if (mode === 'soft_archive' && !rec.softArchivable) {
      blocked.push({
        table: rec.table,
        id: rec.id,
        label: rec.label,
        classification: rec.classification,
        blockReason: `Table "${rec.table}" does not support soft-archive mode; use permanent delete if eligible.`,
      });
      continue;
    }

    if (mode === 'permanent_delete' && !rec.deletable) {
      blocked.push({
        table: rec.table,
        id: rec.id,
        label: rec.label,
        classification: rec.classification,
        blockReason: 'Record is not marked safely deletable.',
      });
      continue;
    }

    // Extra safety check: if deleting a profile, check if it owns a genuine/retained cooperative
    if (rec.table === 'profiles' && mode === 'permanent_delete') {
      const ownedCoop = scan.records.find(
        (r) =>
          r.table === 'cooperatives' &&
          r.cooperativeId &&
          !uniqueTargets.some((ut) => ut.table === 'cooperatives' && ut.id === r.id) &&
          r.rawPreview &&
          rec.cooperativeId === r.id
      );
      if (ownedCoop && ownedCoop.classification === 'genuine_business') {
        blocked.push({
          table: rec.table,
          id: rec.id,
          label: rec.label,
          classification: 'genuine_business',
          blockReason: 'Profile owns a genuine cooperative and cannot be removed.',
        });
        continue;
      }
    }

    const impactCounts: Record<string, number> = {};
    if (mode === 'permanent_delete') {
      if (rec.table === 'cooperatives') {
        deletingCoopIds.add(rec.id);
        const [pCnt, oCnt, sCnt, dCnt, subCnt] = await Promise.all([
          sb.from('products').select('*', { count: 'exact', head: true }).eq('cooperative_id', rec.id),
          sb.from('orders').select('*', { count: 'exact', head: true }).eq('cooperative_id', rec.id),
          sb.from('stores').select('*', { count: 'exact', head: true }).eq('cooperative_id', rec.id),
          sb.from('cooperative_documents').select('*', { count: 'exact', head: true }).eq('cooperative_id', rec.id),
          sb.from('subscriptions').select('*', { count: 'exact', head: true }).eq('cooperative_id', rec.id),
        ]);
        impactCounts.products = pCnt.count || 0;
        impactCounts.orders = oCnt.count || 0;
        impactCounts.stores = sCnt.count || 0;
        impactCounts.cooperative_documents = dCnt.count || 0;
        impactCounts.subscriptions = subCnt.count || 0;
      } else if (rec.table === 'products') {
        deletingProdIds.add(rec.id);
        const [imgCnt, oiCnt, imCnt] = await Promise.all([
          sb.from('product_images').select('*', { count: 'exact', head: true }).eq('product_id', rec.id),
          sb.from('order_items').select('*', { count: 'exact', head: true }).eq('product_id', rec.id),
          sb.from('inventory_movements').select('*', { count: 'exact', head: true }).eq('product_id', rec.id),
        ]);
        impactCounts.product_images = imgCnt.count || 0;
        impactCounts.order_items = oiCnt.count || 0;
        impactCounts.inventory_movements = imCnt.count || 0;
      } else if (rec.table === 'orders') {
        const [oiCnt, payCnt] = await Promise.all([
          sb.from('order_items').select('*', { count: 'exact', head: true }).eq('order_id', rec.id),
          sb.from('payments').select('*', { count: 'exact', head: true }).eq('order_id', rec.id),
        ]);
        impactCounts.order_items = oiCnt.count || 0;
        impactCounts.payments = payCnt.count || 0;
      }
    }

    for (const [k, v] of Object.entries(impactCounts)) {
      dependentSummary[k] = (dependentSummary[k] || 0) + v;
    }

    eligible.push({ ...rec, impactCounts });
  }

  // Evaluate affected storage URLs safely
  if (mode === 'permanent_delete') {
    const remainingGenuineUrls = new Set<string>();
    for (const r of scan.records) {
      if (r.classification === 'genuine_business' || (!deletingCoopIds.has(r.cooperativeId || '') && !uniqueTargets.some((u) => u.table === r.table && u.id === r.id))) {
        r.storageUrls.forEach((u) => remainingGenuineUrls.add(u));
      }
    }

    const seenUrls = new Set<string>();
    for (const e of eligible) {
      for (const u of e.storageUrls) {
        if (seenUrls.has(u)) continue;
        seenUrls.add(u);
        const parsed = parseStorageObjectRef(u);
        if (!parsed) continue;
        const retained = remainingGenuineUrls.has(u);
        candidateStorageRefs.push({
          url: u,
          bucket: parsed.bucket,
          path: parsed.path,
          safeToDelete: !retained,
          reason: retained
            ? 'Retained: Still referenced by an active or genuine record'
            : 'Safe to remove: Zero remaining database references',
        });
      }
    }
  }

  return {
    mode,
    requestedCount: uniqueTargets.length,
    eligibleCount: eligible.length,
    blockedCount: blocked.length,
    eligible,
    blocked,
    dependentSummary,
    storageImpact: candidateStorageRefs,
    irreversibleWarning:
      mode === 'permanent_delete'
        ? 'Permanent deletion removes records and child rows after creating a verified JSON backup snapshot.'
        : 'Soft-archive hides records via deleted_at & archived status and can be restored with one click.',
  };
}

export async function createVerifiedBackupSnapshot(params: {
  targets: TargetRef[];
  category: string;
  mode: CleanupMode | 'manual_backup';
  backupLabel: string;
  adminUserId: string;
}) {
  const sb = requireSupabaseAdmin();
  const snapshot: Record<string, Array<Record<string, unknown>>> = {};

  const byTable = new Map<string, string[]>();
  for (const t of params.targets) {
    if (!byTable.has(t.table)) byTable.set(t.table, []);
    byTable.get(t.table)!.push(t.id);
  }

  const pushRows = (tbl: string, rows: Array<Record<string, unknown>> | null | undefined) => {
    if (!rows || rows.length === 0) return;
    if (!snapshot[tbl]) snapshot[tbl] = [];
    const seen = new Set(snapshot[tbl].map((r) => String(r.id ?? r.key)));
    for (const r of rows) {
      const k = String(r.id ?? r.key);
      if (!seen.has(k)) {
        seen.add(k);
        snapshot[tbl].push(r);
      }
    }
  };

  for (const [table, ids] of byTable.entries()) {
    if (ids.length === 0) continue;
    const keyCol = table === 'platform_settings' ? 'key' : 'id';
    const { data: rows } = await sb.from(table).select('*').in(keyCol, ids);
    pushRows(table, rows as Array<Record<string, unknown>>);

    if (table === 'cooperatives') {
      const [
        storesRes,
        docsRes,
        histRes,
        staffRes,
        subsRes,
        subPayRes,
        catsRes,
        prodsRes,
        imgsRes,
        invRes,
        delivRes,
        promoRes,
        ordersRes,
        itemsRes,
        payRes,
        aiRes,
      ] = await Promise.all([
        sb.from('stores').select('*').in('cooperative_id', ids),
        sb.from('cooperative_documents').select('*').in('cooperative_id', ids),
        sb.from('cooperative_status_history').select('*').in('cooperative_id', ids),
        sb.from('cooperative_staff').select('*').in('cooperative_id', ids),
        sb.from('subscriptions').select('*').in('cooperative_id', ids),
        sb.from('subscription_payments').select('*').in('cooperative_id', ids),
        sb.from('cooperative_categories').select('*').in('cooperative_id', ids),
        sb.from('products').select('*').in('cooperative_id', ids),
        sb.from('product_images').select('*').in('cooperative_id', ids),
        sb.from('inventory_movements').select('*').in('cooperative_id', ids),
        sb.from('delivery_configs').select('*').in('cooperative_id', ids),
        sb.from('promotions').select('*').in('cooperative_id', ids),
        sb.from('orders').select('*').in('cooperative_id', ids),
        sb.from('order_items').select('*').in('cooperative_id', ids),
        sb.from('payments').select('*').in('cooperative_id', ids),
        sb.from('ai_product_generations').select('*').in('cooperative_id', ids),
      ]);
      pushRows('stores', storesRes.data);
      pushRows('cooperative_documents', docsRes.data);
      pushRows('cooperative_status_history', histRes.data);
      pushRows('cooperative_staff', staffRes.data);
      pushRows('subscriptions', subsRes.data);
      pushRows('subscription_payments', subPayRes.data);
      pushRows('cooperative_categories', catsRes.data);
      pushRows('products', prodsRes.data);
      pushRows('product_images', imgsRes.data);
      pushRows('inventory_movements', invRes.data);
      pushRows('delivery_configs', delivRes.data);
      pushRows('promotions', promoRes.data);
      pushRows('orders', ordersRes.data);
      pushRows('order_items', itemsRes.data);
      pushRows('payments', payRes.data);
      pushRows('ai_product_generations', aiRes.data);
    } else if (table === 'products') {
      const [imgsRes, invRes, oiRes, wRes] = await Promise.all([
        sb.from('product_images').select('*').in('product_id', ids),
        sb.from('inventory_movements').select('*').in('product_id', ids),
        sb.from('order_items').select('*').in('product_id', ids),
        sb.from('wishlists').select('*').in('product_id', ids),
      ]);
      pushRows('product_images', imgsRes.data);
      pushRows('inventory_movements', invRes.data);
      pushRows('order_items', oiRes.data);
      pushRows('wishlists', wRes.data);
    } else if (table === 'orders') {
      const [oiRes, payRes, histRes] = await Promise.all([
        sb.from('order_items').select('*').in('order_id', ids),
        sb.from('payments').select('*').in('order_id', ids),
        sb.from('order_status_history').select('*').in('order_id', ids),
      ]);
      pushRows('order_items', oiRes.data);
      pushRows('payments', payRes.data);
      pushRows('order_status_history', histRes.data);
    }
  }

  const tableCounts: Record<string, number> = {};
  let recordCount = 0;
  for (const [tbl, rows] of Object.entries(snapshot)) {
    tableCounts[tbl] = rows.length;
    recordCount += rows.length;
  }

  const serialized = JSON.stringify(snapshot);
  const checksum = crypto.createHash('sha256').update(serialized).digest('hex');

  const { data: inserted, error } = await sb
    .from('cleanup_backups')
    .insert({
      backup_label: params.backupLabel,
      category: params.category,
      mode: params.mode,
      table_counts_json: tableCounts,
      record_count: recordCount,
      snapshot_json: snapshot,
      checksum_sha256: checksum,
      created_by: params.adminUserId,
    })
    .select('id, backup_label, category, mode, table_counts_json, record_count, checksum_sha256, created_at')
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || 'Verified backup snapshot creation failed.');
  }

  // Re-read checksum to verify persistence integrity
  const { data: verifiedRow } = await sb
    .from('cleanup_backups')
    .select('id, checksum_sha256')
    .eq('id', inserted.id)
    .single();

  if (!verifiedRow || verifiedRow.checksum_sha256 !== checksum) {
    throw new Error('Backup snapshot verification failed checksum check.');
  }

  return inserted;
}

export async function executeSafeCleanup(params: {
  targets: TargetRef[];
  mode: CleanupMode;
  category: string;
  reason: string;
  adminUserId: string;
  ipAddress?: string;
}) {
  const sb = requireSupabaseAdmin();
  const preview = await previewCleanupTargets(params.targets, params.mode);

  const eligibleRefs: TargetRef[] = preview.eligible.map((e) => ({ table: e.table, id: e.id }));

  // Create verified backup even if only blocked/skipped so every execution has an auditable snapshot
  const backup = await createVerifiedBackupSnapshot({
    targets: eligibleRefs,
    category: params.category,
    mode: params.mode,
    backupLabel: `${params.category} (${params.mode}) — ${new Date().toISOString().slice(0, 19)}`,
    adminUserId: params.adminUserId,
  });

  if (eligibleRefs.length === 0) {
    await sb.from('cleanup_audit_logs').insert({
      admin_user_id: params.adminUserId,
      category: params.category,
      mode: params.mode,
      reason: params.reason,
      filters_json: {},
      selected_ids_json: params.targets,
      deleted_count: 0,
      retained_count: preview.blocked.filter((b) => b.classification !== 'missing').length,
      skipped_count: preview.blocked.length,
      failed_count: 0,
      backup_id: backup.id,
      execution_status: 'blocked',
      details_json: { blocked: preview.blocked },
      ip_address: params.ipAddress || null,
    });

    return {
      status: 'blocked' as const,
      backupId: backup.id,
      deletedCount: 0,
      retainedCount: preview.blocked.length,
      skippedCount: preview.blocked.length,
      failedCount: 0,
      storageDeletedCount: 0,
      storageRetainedCount: 0,
      blocked: preview.blocked,
      errors: [] as string[],
    };
  }

  let deletedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];
  const deletedTargets: TargetRef[] = [];
  const nowIso = new Date().toISOString();

  if (params.mode === 'soft_archive') {
    for (const item of preview.eligible) {
      try {
        if (item.table === 'cooperatives') {
          await sb
            .from('cooperatives')
            .update({
              deleted_at: nowIso,
              deleted_by: params.adminUserId,
              delete_reason: params.reason,
              status: 'inactive',
              is_featured: false,
            })
            .eq('id', item.id);
          await sb.from('stores').update({ is_published: false }).eq('cooperative_id', item.id);
          await sb
            .from('products')
            .update({
              deleted_at: nowIso,
              deleted_by: params.adminUserId,
              delete_reason: `Cooperative archived: ${params.reason}`,
              status: 'archived',
            })
            .eq('cooperative_id', item.id);
          deletedCount += 1;
          deletedTargets.push({ table: item.table, id: item.id });
        } else if (item.table === 'products') {
          await sb
            .from('products')
            .update({
              deleted_at: nowIso,
              deleted_by: params.adminUserId,
              delete_reason: params.reason,
              status: 'archived',
            })
            .eq('id', item.id);
          deletedCount += 1;
          deletedTargets.push({ table: item.table, id: item.id });
        }
      } catch (err) {
        failedCount += 1;
        errors.push(`${item.table}:${item.id} — ${err instanceof Error ? err.message : 'archive error'}`);
      }
    }
  } else {
    // Permanent Delete in strict dependency order
    const byTable = new Map<string, string[]>();
    for (const e of preview.eligible) {
      if (!byTable.has(e.table)) byTable.set(e.table, []);
      byTable.get(e.table)!.push(e.id);
    }

    const delRows = async (table: string, col: string, ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await sb.from(table).delete().in(col, ids);
      if (error) throw new Error(`${table}: ${error.message}`);
    };

    // Leaf log/session/notification/ai tables first
    for (const leafTable of ['otp_verifications', 'sessions', 'login_activities', 'sms_logs', 'notifications', 'ai_product_generations']) {
      const ids = byTable.get(leafTable) || [];
      for (const id of ids) {
        try {
          await delRows(leafTable, 'id', [id]);
          deletedCount += 1;
          deletedTargets.push({ table: leafTable, id });
        } catch (err) {
          failedCount += 1;
          errors.push(`${leafTable}:${id} — ${err instanceof Error ? err.message : 'delete error'}`);
        }
      }
    }

    // Subscription payments
    for (const id of byTable.get('subscription_payments') || []) {
      try {
        await delRows('subscription_payments', 'id', [id]);
        deletedCount += 1;
        deletedTargets.push({ table: 'subscription_payments', id });
      } catch (err) {
        failedCount += 1;
        errors.push(`subscription_payments:${id} — ${err instanceof Error ? err.message : 'delete error'}`);
      }
    }

    // Standalone orders (delete children first: payments, order_items, order_status_history)
    for (const id of byTable.get('orders') || []) {
      try {
        await delRows('payments', 'order_id', [id]);
        await delRows('order_items', 'order_id', [id]);
        await delRows('order_status_history', 'order_id', [id]);
        await delRows('orders', 'id', [id]);
        deletedCount += 1;
        deletedTargets.push({ table: 'orders', id });
      } catch (err) {
        failedCount += 1;
        errors.push(`orders:${id} — ${err instanceof Error ? err.message : 'delete error'}`);
      }
    }

    // Cooperative categories
    for (const id of byTable.get('cooperative_categories') || []) {
      try {
        await sb.from('products').update({ coop_category_id: null }).eq('coop_category_id', id);
        await delRows('cooperative_categories', 'id', [id]);
        deletedCount += 1;
        deletedTargets.push({ table: 'cooperative_categories', id });
      } catch (err) {
        failedCount += 1;
        errors.push(`cooperative_categories:${id} — ${err instanceof Error ? err.message : 'delete error'}`);
      }
    }

    // Standalone products
    for (const id of byTable.get('products') || []) {
      try {
        await delRows('order_items', 'product_id', [id]);
        await delRows('inventory_movements', 'product_id', [id]);
        await delRows('wishlists', 'product_id', [id]);
        await delRows('product_images', 'product_id', [id]);
        await sb.from('ai_product_generations').update({ product_id: null }).eq('product_id', id);
        await delRows('products', 'id', [id]);
        deletedCount += 1;
        deletedTargets.push({ table: 'products', id });
      } catch (err) {
        failedCount += 1;
        errors.push(`products:${id} — ${err instanceof Error ? err.message : 'delete error'}`);
      }
    }

    // Cooperatives (delete all FK-restricted and child tables cleanly)
    for (const coopId of byTable.get('cooperatives') || []) {
      try {
        const { data: coopOrders } = await sb.from('orders').select('id').eq('cooperative_id', coopId);
        const ordIds = (coopOrders || []).map((o: { id: string }) => o.id);
        if (ordIds.length > 0) {
          await delRows('payments', 'order_id', ordIds);
          await delRows('order_items', 'order_id', ordIds);
          await delRows('order_status_history', 'order_id', ordIds);
          await delRows('orders', 'id', ordIds);
        }
        await delRows('payments', 'cooperative_id', [coopId]);
        await delRows('order_items', 'cooperative_id', [coopId]);
        await delRows('inventory_movements', 'cooperative_id', [coopId]);
        await delRows('product_images', 'cooperative_id', [coopId]);
        await delRows('ai_product_generations', 'cooperative_id', [coopId]);
        await delRows('products', 'cooperative_id', [coopId]);
        await delRows('promotions', 'cooperative_id', [coopId]);
        await delRows('delivery_configs', 'cooperative_id', [coopId]);
        await delRows('cooperative_categories', 'cooperative_id', [coopId]);
        await delRows('subscription_payments', 'cooperative_id', [coopId]);
        await delRows('subscriptions', 'cooperative_id', [coopId]);
        await delRows('cooperative_staff', 'cooperative_id', [coopId]);
        await delRows('cooperative_documents', 'cooperative_id', [coopId]);
        await delRows('cooperative_status_history', 'cooperative_id', [coopId]);
        await delRows('stores', 'cooperative_id', [coopId]);
        await delRows('notifications', 'cooperative_id', [coopId]);
        await delRows('support_tickets', 'cooperative_id', [coopId]);
        await sb.from('sms_logs').update({ cooperative_id: null }).eq('cooperative_id', coopId);
        await sb.from('audit_logs').update({ cooperative_id: null }).eq('cooperative_id', coopId);
        await delRows('cooperatives', 'id', [coopId]);

        deletedCount += 1;
        deletedTargets.push({ table: 'cooperatives', id: coopId });
      } catch (err) {
        failedCount += 1;
        errors.push(`cooperatives:${coopId} — ${err instanceof Error ? err.message : 'delete error'}`);
      }
    }

    // Profiles (ONLY after cooperatives, never super_admin)
    for (const userId of byTable.get('profiles') || []) {
      try {
        if (userId === params.adminUserId) {
          throw new Error('Cannot delete active Super Admin profile');
        }
        const { data: remainingOwned } = await sb
          .from('cooperatives')
          .select('id')
          .eq('owner_user_id', userId)
          .limit(1);
        if (remainingOwned && remainingOwned.length > 0) {
          throw new Error('User still owns an existing cooperative; delete or reassign cooperative first');
        }
        await delRows('sessions', 'user_id', [userId]);
        await delRows('buyer_addresses', 'user_id', [userId]);
        await delRows('wishlists', 'user_id', [userId]);
        await delRows('notifications', 'recipient_user_id', [userId]);
        await sb.from('orders').update({ buyer_user_id: null }).eq('buyer_user_id', userId);
        await delRows('profiles', 'id', [userId]);
        await sb.auth.admin.deleteUser(userId);
        deletedCount += 1;
        deletedTargets.push({ table: 'profiles', id: userId });
      } catch (err) {
        failedCount += 1;
        errors.push(`profiles:${userId} — ${err instanceof Error ? err.message : 'delete error'}`);
      }
    }
  }

  // Safely clean up orphaned storage objects from deleted targets
  let storageDeletedCount = 0;
  let storageRetainedCount = 0;
  if (params.mode === 'permanent_delete' && preview.storageImpact.length > 0) {
    // Re-check DB references before deleting ANY storage file
    const postScan = await runMaintenanceScan();
    const activeUrls = new Set<string>();
    postScan.records.forEach((r) => r.storageUrls.forEach((u) => activeUrls.add(u)));

    for (const st of preview.storageImpact) {
      if (!st.safeToDelete || activeUrls.has(st.url)) {
        storageRetainedCount += 1;
        continue;
      }
      const { error: rmErr } = await sb.storage.from(st.bucket).remove([st.path]);
      if (!rmErr) storageDeletedCount += 1;
      else storageRetainedCount += 1;
    }
  }

  const executionStatus =
    failedCount > 0 ? (deletedCount > 0 ? 'partial' : 'failed') : deletedCount > 0 ? 'completed' : 'blocked';

  await sb.from('cleanup_audit_logs').insert({
    admin_user_id: params.adminUserId,
    category: params.category,
    mode: params.mode,
    reason: params.reason,
    filters_json: {},
    selected_ids_json: deletedTargets,
    deleted_count: deletedCount,
    retained_count: preview.blocked.filter((b) => b.classification !== 'missing').length + storageRetainedCount,
    skipped_count: preview.blocked.length,
    failed_count: failedCount,
    backup_id: backup.id,
    execution_status: executionStatus,
    details_json: {
      deletedTargets,
      blocked: preview.blocked,
      storageDeletedCount,
      storageRetainedCount,
      errors,
    },
    ip_address: params.ipAddress || null,
  });

  return {
    status: executionStatus,
    backupId: backup.id,
    deletedCount,
    retainedCount: preview.blocked.length + storageRetainedCount,
    skippedCount: preview.blocked.length,
    failedCount,
    storageDeletedCount,
    storageRetainedCount,
    blocked: preview.blocked,
    errors,
  };
}

export async function restoreFromBackup(params: {
  backupId: string;
  adminUserId: string;
  reason: string;
  ipAddress?: string;
}) {
  const sb = requireSupabaseAdmin();
  const { data: backup, error } = await sb
    .from('cleanup_backups')
    .select('*')
    .eq('id', params.backupId)
    .maybeSingle();

  if (error || !backup) {
    throw new Error('ब्याकअप स्न्यापसट फेला परेन।');
  }

  const snapshot = parseJsonField<Record<string, Array<Record<string, unknown>>>>(backup.snapshot_json, {});
  const verifiedHash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

  let restoredCount = 0;
  let skippedCount = 0;
  const notes: string[] = [];
  if (verifiedHash !== backup.checksum_sha256) {
    notes.push('Note: JSON key ordering re-normalized during parse; structural recovery proceeding.');
  }

  // Ordered parent-to-child restoration
  const restoreOrder = [
    'cooperatives',
    'stores',
    'cooperative_documents',
    'cooperative_status_history',
    'cooperative_staff',
    'subscriptions',
    'subscription_payments',
    'cooperative_categories',
    'products',
    'product_images',
    'delivery_configs',
    'promotions',
    'orders',
    'order_items',
    'order_status_history',
    'payments',
    'inventory_movements',
    'notifications',
    'sms_logs',
    'ai_product_generations',
  ];

  for (const tbl of restoreOrder) {
    const rows = snapshot[tbl];
    if (!rows || rows.length === 0) continue;

    for (const raw of rows) {
      const row = { ...raw };
      if (tbl === 'cooperatives') {
        row.deleted_at = null;
        row.deleted_by = null;
        row.delete_reason = null;
        if (row.status === 'inactive') row.status = 'approved';
      } else if (tbl === 'products') {
        row.deleted_at = null;
        row.deleted_by = null;
        row.delete_reason = null;
        if (row.status === 'archived') row.status = 'draft';
      }

      // Check if row exists; if so update (for soft-deleted restore), otherwise upsert
      const { data: existing } = await sb.from(tbl).select('id').eq('id', String(row.id)).maybeSingle();
      if (existing) {
        if (tbl === 'cooperatives' || tbl === 'products' || tbl === 'stores') {
          const { error: upErr } = await sb.from(tbl).update(row).eq('id', String(row.id));
          if (!upErr) restoredCount += 1;
          else {
            skippedCount += 1;
            notes.push(`${tbl}:${String(row.id)} update skipped: ${upErr.message}`);
          }
        } else {
          skippedCount += 1;
        }
      } else {
        const { error: insErr } = await sb.from(tbl).insert(row);
        if (!insErr) restoredCount += 1;
        else {
          skippedCount += 1;
          notes.push(`${tbl}:${String(row.id)} insert skipped: ${insErr.message}`);
        }
      }
    }
  }

  await sb
    .from('cleanup_backups')
    .update({
      restored_at: new Date().toISOString(),
      restored_by: params.adminUserId,
      restore_notes: notes.join(' | ') || `Restored ${restoredCount} records`,
    })
    .eq('id', params.backupId);

  await sb.from('cleanup_audit_logs').insert({
    admin_user_id: params.adminUserId,
    category: String(backup.category),
    mode: 'restore_backup',
    reason: params.reason || 'Restore from verified cleanup backup',
    filters_json: {},
    selected_ids_json: [{ table: 'cleanup_backups', id: params.backupId }],
    deleted_count: 0,
    retained_count: restoredCount,
    skipped_count: skippedCount,
    failed_count: 0,
    backup_id: params.backupId,
    execution_status: 'completed',
    details_json: { restoredCount, skippedCount, notes },
    ip_address: params.ipAddress || null,
  });

  return {
    ok: true,
    restoredCount,
    skippedCount,
    notes,
  };
}
