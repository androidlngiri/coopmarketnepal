import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { db, UPLOADS_DIR } from './db.ts';
import { seedDatabase } from './seed.ts';
import { attachAuth } from './auth.ts';
import { authRouter } from './routes/auth.ts';
import { publicRouter } from './routes/public.ts';
import { cooperativesRouter } from './routes/cooperatives.ts';
import { checkoutRouter } from './routes/checkout.ts';
import { coopDashboardRouter } from './routes/coop-dashboard.ts';
import { adminRouter } from './routes/admin.ts';

let seeded = false;

export function createExpressApp() {
  if (!seeded) {
    seedDatabase();
    seeded = true;
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const app = express();
  app.set('trust proxy', 1);

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '8mb' }));
  app.use(cookieParser());
  app.use(attachAuth);

  // Serve generated images & uploaded cooperative documents/images safely
  app.use('/images', express.static(path.join(process.cwd(), 'public', 'images')));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Health Check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
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
  app.use('/api/orders', checkoutRouter);
  app.use('/api/coop-dashboard', coopDashboardRouter);
  app.use('/api/admin', adminRouter);

  // Dynamic SEO Sitemap & Robots.txt
  app.get('/robots.txt', (req, res) => {
    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${req.protocol}://${req.get('host')}`);
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /cooperative\nDisallow: /super-admin\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${req.protocol}://${req.get('host')}`);
    const stores = db
      .prepare(`SELECT c.slug FROM cooperatives c JOIN stores s ON s.cooperative_id = c.id WHERE c.status = 'approved' AND s.is_published = 1`)
      .all() as { slug: string }[];
    const products = db
      .prepare(`SELECT p.slug FROM products p JOIN cooperatives c ON c.id = p.cooperative_id WHERE p.status = 'published' AND p.is_prohibited = 0 AND c.status = 'approved'`)
      .all() as { slug: string }[];

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
      ...stores.map((s) => `/store/${s.slug}`),
      ...products.map((p) => `/product/${p.slug}`),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${baseUrl}${u}</loc></url>`)
      .join('\n')}\n</urlset>`;
    res.type('application/xml').send(xml);
  });

  return app;
}
