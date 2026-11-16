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

  // Serve generated static storefront showcase images
  app.use('/images', express.static(path.join(process.cwd(), 'public', 'images')));

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
