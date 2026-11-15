# सहकारी बजार — Sahakari Bazar Nepal

National Multi-Tenant Cooperative Marketplace SaaS Platform for Nepal.

## Core Architecture & Features

- **Nepali-First Bilingual Interface**: Unicode Devanagari (`ne`) default with instant English (`en`) switching, NPR (`रु.`) tabular formatting, `Asia/Kathmandu` timezone, and Bikram Sambat (BS) calendar dates.
- **Public Marketplace**: Homepage, searchable/filterable catalog, cooperative directory, independent cooperative storefronts (`/store/[cooperative-slug]`), product detail views (`/product/[product-slug]`), About/FAQ/Terms/Privacy pages, dynamic `/sitemap.xml` and `/robots.txt`.
- **Compulsory Cooperative Onboarding & Approval**: Legal registration fields (Nepali/English names, registration number & authority, BS/AD registration date, PAN/VAT, Province/District/Municipality/Ward, authorized representative, documents & logo), Mobile OTP verification, Super-Admin review & approval workflow. Unapproved cooperatives cannot publish products or stores.
- **Independent Visual Storefront Builder**: Cooperatives customize themes, primary/accent colors, approved fonts, logos, banners, intro/mission/vision, notices, footer, and section ordering with draft preview & publish.
- **Product & Inventory Control**: Full CRUD, Nepali/English descriptions, SKUs, discount pricing, stock alerts, and an immutable `inventory_movements` ledger.
- **Multi-Cooperative Cart & Guest Checkout**: Single cart across multiple cooperatives automatically splits into separate cooperative orders inside an atomic transaction (`checkout_group_id`), generating unique unguessable `guest_access_token` tracking keys, printable invoices, and optional OTP verification.
- **Cooperative & Super-Admin Dashboards**: Tenant-scoped cooperative analytics, CSV export, staff permissions, promotions, delivery configuration, billing, and centralized SaaS Super-Admin oversight (plans, manual payment verification, product moderation, audit logs, SMS logs).
- **Akash SMS Integration**: Server-side HTTP adapter (`server/akash-sms.ts`) with OTP expiry, cooldown, hourly rate limiting, attempt caps, and SMS delivery logs.

## Database Setup (Supabase PostgreSQL + Local Runtime)

1. **Supabase PostgreSQL**:
   Apply the SQL migrations in order via Supabase Dashboard SQL Editor or CLI:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_rls_policies.sql`
   - `supabase/migrations/0003_storage_policies.sql`
   - `supabase/seed.sql`
2. **Local Runtime Persistence**:
   The Express server (`server.ts`) automatically initializes a normalized SQLite relational database (`./data/sahakari.db`) with foreign keys, transactions, and idempotent showcase seed data (`server/seed.ts`) so all workflows run immediately.

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` *(server-only — never expose to browser)*
- `AKASH_SMS_API_URL` (`https://sms.aakashsms.com/sms/v3/send`)
- `AKASH_SMS_API_KEY` *(server-only)*
- `AKASH_SMS_SENDER_ID`
- `NEXT_PUBLIC_APP_URL` / `APP_URL`
- `SESSION_SECRET`
- `SUPER_ADMIN_BOOTSTRAP_SECRET` *(optional bootstrap guard)*

## Local Development & Verification

```bash
npm install
npm run dev
```

## Initial Super-Admin Provisioning

No default admin credentials are hardcoded. On first visit to `/login`, if no platform administrator exists, the **Initial Super-Admin Provisioning** form lets you create the primary Super Admin account securely.

## GitHub & Vercel Deployment

1. Push repository to GitHub (`git init && git add . && git commit -m "Initial Sahakari Bazar SaaS" && git push`).
2. Import the GitHub repository in Vercel.
3. Add all environment variables from `.env.example` in Vercel Project Settings.
4. `vercel.json` configures security headers, API routing, and SPA fallback automatically.
5. Run `npm run build` (`vite build`) and `npm start` (`NODE_ENV=production tsx server.ts`) for full-stack Node hosting.
