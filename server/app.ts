import express from 'express';
import path from 'path';
import { attachAuth } from './auth.ts';
import { authRouter } from './routes/auth.ts';
import { publicRouter } from './routes/public.ts';
import { cooperativesRouter } from './routes/cooperatives.ts';
import { buyerRouter, checkoutRouter } from './routes/checkout.ts';
import { coopDashboardRouter } from './routes/coop-dashboard.ts';
import { adminRouter } from './routes/admin.ts';
import { getSupabaseAdminClient } from './supabase-admin.ts';

export function createExpressApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    // Parse cookies without requiring external state
    const raw = req.headers.cookie;
    const parsed: Record<string, string> = {};
    if (raw) {
      for (const part of raw.split(';')) {
        const idx = part.indexOf('=');
        if (idx > 0) {
          const k = part.slice(0, idx).trim();
          const v = part.slice(idx + 1).trim();
          try {
            parsed[k] = decodeURIComponent(v);
          } catch {
            parsed[k] = v;
          }
        }
      }
    }
    req.cookies = parsed;
    next();
  });
  app.use(attachAuth);

  // Serve generated static storefront showcase images and root favicons
  app.use('/images', express.static(path.join(process.cwd(), 'public', 'images')));
  for (const iconFile of ['favicon.ico', 'favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png']) {
    app.get(`/${iconFile}`, (_req, res) => {
      res.sendFile(path.join(process.cwd(), 'public', iconFile));
    });
  }

  // Health Check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      database: 'supabase_postgresql',
      timezone: 'Asia/Kathmandu',
      runtime: process.env.VERCEL ? 'vercel' : 'node',
      timestamp: new Date().toISOString(),
    });
  });

  // API Routers
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/cooperatives', cooperativesRouter);
  app.use('/api/checkout', checkoutRouter);
  app.use('/api/buyer', buyerRouter);
  app.use('/api/orders', checkoutRouter);
  app.use('/api/coop-dashboard', coopDashboardRouter);
  app.use('/api/admin', adminRouter);

  // Dynamic OpenGraph Preview HTML for WhatsApp / Facebook / Telegram / X crawlers on /store/:slug & /product/:slug
  const escapeHtml = (str: string) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const resolvePublicBaseUrl = (req: express.Request) => {
    const rawEnv = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (rawEnv) return rawEnv.replace(/\/+$/, '');
    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    if (host) return `${proto}://${host}`;
    return 'https://coopmarketnepal.vercel.app';
  };

  const resolveOgImageUrl = (rawUrl: unknown, baseUrl: string) => {
    const fallback = `${baseUrl}/images/og-sahakari-bazar.jpg`;
    if (typeof rawUrl !== 'string') return fallback;
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('data:')) return fallback;
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
    if (trimmed.startsWith('/')) return `${baseUrl}${trimmed}`;
    return fallback;
  };

  const handleOgRequest = async (req: express.Request, res: express.Response) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const type = String(req.query.type || '');
    const slug = String(req.query.slug || '').trim();

    let title = 'सहकारी बजार नेपाल — राष्ट्रिय सहकारी अनलाइन बजार';
    let description =
      'नेपालभरका दर्ता र स्वीकृत सहकारी संस्थाहरूका अर्गानिक कृषि, दुग्ध, मह, चिया तथा हस्तकला उत्पादनहरू सिधै खरिद गर्नुहोस्।';
    let imageUrl = `${baseUrl}/images/og-sahakari-bazar.jpg`;
    let canonicalUrl = `${baseUrl}/`;
    let ogType = 'website';

    const sb = getSupabaseAdminClient();
    if (sb && slug) {
      if (type === 'store') {
        canonicalUrl = `${baseUrl}/store/${encodeURIComponent(slug)}`;
        const { data: coop } = await sb
          .from('cooperatives')
          .select('name_ne, name_en, district, province, status, deleted_at, stores!inner(store_name_ne, store_name_en, tagline_ne, description_ne, banner_url, logo_url, is_published)')
          .eq('slug', slug)
          .eq('status', 'approved')
          .is('deleted_at', null)
          .maybeSingle();

        const store = coop ? (Array.isArray(coop.stores) ? coop.stores[0] : coop.stores) as Record<string, unknown> | null : null;
        if (coop && store && store.is_published) {
          const storeName = String(store.store_name_ne || coop.name_ne || store.store_name_en || coop.name_en);
          title = `${storeName} — सहकारी बजार नेपाल`;
          const rawDesc =
            store.tagline_ne ||
            store.description_ne ||
            `${coop.name_ne} (${coop.district}, ${coop.province}) का प्रमाणित स्थानीय तथा अर्गानिक उत्पादनहरू सिधै खरिद गर्नुहोस्।`;
          description = String(rawDesc).slice(0, 160);
          imageUrl = resolveOgImageUrl(store.banner_url || store.logo_url, baseUrl);
        }
      } else if (type === 'product') {
        canonicalUrl = `${baseUrl}/product/${encodeURIComponent(slug)}`;
        const { data: prod } = await sb
          .from('products')
          .select('name_ne, name_en, short_desc_ne, price_npr, discount_price_npr, unit_label_ne, status, deleted_at, is_prohibited, product_images(image_url, is_primary), cooperatives!inner(name_ne, status, deleted_at, stores!inner(store_name_ne, is_published))')
          .eq('slug', slug)
          .eq('status', 'published')
          .is('deleted_at', null)
          .eq('is_prohibited', false)
          .maybeSingle();

        const coop = prod ? (Array.isArray(prod.cooperatives) ? prod.cooperatives[0] : prod.cooperatives) as Record<string, unknown> | null : null;
        const store = coop ? (Array.isArray(coop.stores) ? coop.stores[0] : coop.stores) as Record<string, unknown> | null : null;
        if (prod && coop && coop.status === 'approved' && !coop.deleted_at && store?.is_published) {
          const activePrice = prod.discount_price_npr && Number(prod.discount_price_npr) > 0 ? prod.discount_price_npr : prod.price_npr;
          const storeName = String(store.store_name_ne || coop.name_ne || 'सहकारी बजार नेपाल');
          title = `${prod.name_ne} (रु. ${activePrice}/${prod.unit_label_ne}) — ${storeName}`;
          description = String(prod.short_desc_ne || `${storeName} बाट प्रमाणित ${prod.name_ne} सिधै अर्डर गर्नुहोस्।`).slice(0, 160);
          const imgs = (prod.product_images as Array<{ image_url: string; is_primary?: boolean }>) || [];
          const primaryImg = imgs.find((i) => i.is_primary)?.image_url || imgs[0]?.image_url;
          imageUrl = resolveOgImageUrl(primaryImg, baseUrl);
          ogType = 'product';
        }
      }
    }

    const html = `<!doctype html>
<html lang="ne">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:site_name" content="सहकारी बजार नेपाल — Sahakari Bazar Nepal" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  </head>
  <body>
    <p><a href="${escapeHtml(canonicalUrl)}">${escapeHtml(title)}</a></p>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.send(html);
  };

  app.get('/api/og', handleOgRequest);
  app.use((req, res, next) => {
    if (req.query.__og === '1') {
      void handleOgRequest(req, res);
      return;
    }
    next();
  });

  // Dynamic SEO Sitemap & Robots.txt backed by Supabase PostgreSQL
  app.get('/robots.txt', (req, res) => {
    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${req.protocol}://${req.get('host')}`);
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /cooperative\nDisallow: /super-admin\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', async (req, res) => {
    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${req.protocol}://${req.get('host')}`);

    let storeSlugs: string[] = [];
    let productSlugs: string[] = [];
    const sb = getSupabaseAdminClient();
    if (sb) {
      const [sRes, pRes] = await Promise.all([
        sb
          .from('cooperatives')
          .select('slug, stores!inner(is_published)')
          .eq('status', 'approved')
          .is('deleted_at', null)
          .eq('stores.is_published', true),
        sb
          .from('products')
          .select('slug, cooperatives!inner(status, deleted_at)')
          .eq('status', 'published')
          .is('deleted_at', null)
          .eq('is_prohibited', false)
          .eq('cooperatives.status', 'approved')
          .is('cooperatives.deleted_at', null),
      ]);
      storeSlugs = (sRes.data || []).map((s: { slug: string }) => s.slug);
      productSlugs = (pRes.data || []).map((p: { slug: string }) => p.slug);
    }

    const urls = [
      '/',
      '/cooperatives',
      '/marketplace',
      '/register-cooperative',
      '/track-order',
      '/about',
      '/faq',
      '/terms',
      '/privacy',
      ...storeSlugs.map((slug) => `/store/${slug}`),
      ...productSlugs.map((slug) => `/product/${slug}`),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${baseUrl}${u}</loc></url>`)
      .join('\n')}\n</urlset>`;
    res.type('application/xml').send(xml);
  });

  return app;
}
