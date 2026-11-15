import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.ts';
import { seedDatabase } from './server/seed.ts';
import { attachAuth } from './server/auth.ts';
import { authRouter } from './server/routes/auth.ts';
import { publicRouter } from './server/routes/public.ts';
import { cooperativesRouter } from './server/routes/cooperatives.ts';
import { checkoutRouter } from './server/routes/checkout.ts';
import { coopDashboardRouter } from './server/routes/coop-dashboard.ts';
import { adminRouter } from './server/routes/admin.ts';

async function startServer() {
  // Initialize SQLite schema & idempotent seed data
  seedDatabase();

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
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timezone: 'Asia/Kathmandu', timestamp: new Date().toISOString() });
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
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`;
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /cooperative\nDisallow: /super-admin\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`;
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

  // Vite middleware in dev; static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Sahakari Bazar server listening on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
