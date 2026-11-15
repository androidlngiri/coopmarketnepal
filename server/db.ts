import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'sahakari.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      full_name_ne TEXT,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('super_admin', 'cooperative_admin', 'cooperative_staff', 'buyer')),
      preferred_language TEXT NOT NULL DEFAULT 'ne' CHECK (preferred_language IN ('ne', 'en')),
      is_active INTEGER NOT NULL DEFAULT 1,
      phone_verified_at TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_administrators (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Platform Super Administrator',
      is_active INTEGER NOT NULL DEFAULT 1,
      provisioned_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name_ne TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ne TEXT,
      description_en TEXT,
      monthly_price_npr REAL NOT NULL DEFAULT 0,
      annual_price_npr REAL NOT NULL DEFAULT 0,
      trial_days INTEGER NOT NULL DEFAULT 0,
      max_products INTEGER NOT NULL DEFAULT 25,
      max_staff INTEGER NOT NULL DEFAULT 2,
      max_storage_mb INTEGER NOT NULL DEFAULT 250,
      features_json TEXT NOT NULL DEFAULT '{}',
      discount_percent REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cooperatives (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      slug TEXT NOT NULL UNIQUE,
      name_ne TEXT NOT NULL,
      name_en TEXT NOT NULL,
      registration_number TEXT NOT NULL UNIQUE,
      registration_authority TEXT NOT NULL,
      registration_date_ad TEXT NOT NULL,
      registration_date_bs TEXT,
      cooperative_type TEXT NOT NULL,
      pan_vat_number TEXT,
      province TEXT NOT NULL,
      district TEXT NOT NULL,
      municipality TEXT NOT NULL,
      ward_number TEXT NOT NULL,
      tole_address TEXT NOT NULL,
      contact_email TEXT,
      contact_phone TEXT NOT NULL,
      authorized_rep_name TEXT NOT NULL,
      authorized_rep_designation TEXT NOT NULL,
      logo_url TEXT,
      requested_store_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_otp' CHECK (
        status IN ('pending_otp', 'pending_review', 'approved', 'rejected', 'suspended', 'inactive')
      ),
      rejection_reason TEXT,
      is_featured INTEGER NOT NULL DEFAULT 0,
      otp_verified_at TEXT,
      approved_at TEXT,
      approved_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cooperative_documents (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      verified_status TEXT NOT NULL DEFAULT 'pending' CHECK (verified_status IN ('pending', 'verified', 'rejected')),
      verified_by TEXT REFERENCES users(id),
      verified_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cooperative_status_history (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      reason TEXT,
      changed_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cooperative_staff (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      staff_role TEXT NOT NULL DEFAULT 'manager',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      invited_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (cooperative_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'expired', 'suspended', 'cancelled')),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      auto_renew INTEGER NOT NULL DEFAULT 0,
      assigned_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscription_payments (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
      subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
      plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
      amount_npr REAL NOT NULL,
      billing_cycle TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      reference_number TEXT,
      proof_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
      verified_by TEXT REFERENCES users(id),
      verified_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL UNIQUE REFERENCES cooperatives(id) ON DELETE CASCADE,
      store_name_ne TEXT NOT NULL,
      store_name_en TEXT NOT NULL,
      tagline_ne TEXT,
      tagline_en TEXT,
      theme_key TEXT NOT NULL DEFAULT 'himalayan_stone',
      primary_color TEXT NOT NULL DEFAULT '#B91C1C',
      accent_color TEXT NOT NULL DEFAULT '#15803D',
      font_key TEXT NOT NULL DEFAULT 'noto_jakarta',
      logo_url TEXT,
      banner_url TEXT,
      intro_ne TEXT,
      intro_en TEXT,
      mission_ne TEXT,
      mission_en TEXT,
      vision_ne TEXT,
      vision_en TEXT,
      notice_ne TEXT,
      notice_en TEXT,
      footer_text_ne TEXT,
      footer_text_en TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      address_text TEXT,
      social_links_json TEXT NOT NULL DEFAULT '{}',
      sections_json TEXT NOT NULL DEFAULT '[]',
      draft_config_json TEXT,
      custom_domain TEXT UNIQUE,
      custom_domain_verified INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS global_categories (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name_ne TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ne TEXT,
      description_en TEXT,
      parent_id TEXT REFERENCES global_categories(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cooperative_categories (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      name_ne TEXT NOT NULL,
      name_en TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (cooperative_id, slug)
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
      global_category_id TEXT REFERENCES global_categories(id) ON DELETE SET NULL,
      coop_category_id TEXT REFERENCES cooperative_categories(id) ON DELETE SET NULL,
      slug TEXT NOT NULL UNIQUE,
      sku TEXT NOT NULL,
      name_ne TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ne TEXT,
      description_en TEXT,
      price_npr REAL NOT NULL,
      discount_price_npr REAL,
      unit_label_ne TEXT NOT NULL DEFAULT 'के.जी.',
      unit_label_en TEXT NOT NULL DEFAULT 'kg',
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      availability_status TEXT NOT NULL DEFAULT 'in_stock',
      origin_district TEXT,
      producer_name TEXT,
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_platform_featured INTEGER NOT NULL DEFAULT 0,
      is_prohibited INTEGER NOT NULL DEFAULT 0,
      prohibition_reason TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (cooperative_id, sku)
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      alt_text TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL,
      quantity_delta INTEGER NOT NULL,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      reference_id TEXT,
      note TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS buyer_addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'Home',
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      province TEXT NOT NULL,
      district TEXT NOT NULL,
      municipality TEXT NOT NULL,
      ward_number TEXT NOT NULL,
      street_address TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wishlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS delivery_configs (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL UNIQUE REFERENCES cooperatives(id) ON DELETE CASCADE,
      delivery_areas_json TEXT NOT NULL DEFAULT '[]',
      default_fee_npr REAL NOT NULL DEFAULT 100,
      free_delivery_threshold_npr REAL NOT NULL DEFAULT 2500,
      minimum_order_npr REAL NOT NULL DEFAULT 0,
      pickup_enabled INTEGER NOT NULL DEFAULT 1,
      pickup_address_ne TEXT,
      pickup_address_en TEXT,
      delivery_instructions_ne TEXT,
      delivery_instructions_en TEXT,
      bank_payment_instructions_ne TEXT,
      bank_payment_instructions_en TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      title_ne TEXT NOT NULL,
      title_en TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
      discount_value REAL NOT NULL,
      min_order_npr REAL NOT NULL DEFAULT 0,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (cooperative_id, code)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      checkout_group_id TEXT NOT NULL,
      order_number TEXT NOT NULL UNIQUE,
      invoice_number TEXT NOT NULL UNIQUE,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE RESTRICT,
      buyer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      is_guest INTEGER NOT NULL DEFAULT 1,
      guest_access_token TEXT NOT NULL UNIQUE,
      idempotency_key TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      delivery_mode TEXT NOT NULL DEFAULT 'delivery',
      delivery_province TEXT,
      delivery_district TEXT,
      delivery_municipality TEXT,
      delivery_ward TEXT,
      delivery_address TEXT,
      delivery_note TEXT,
      subtotal_npr REAL NOT NULL,
      discount_npr REAL NOT NULL DEFAULT 0,
      delivery_fee_npr REAL NOT NULL DEFAULT 0,
      total_npr REAL NOT NULL,
      promo_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (cooperative_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE RESTRICT,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name_ne TEXT NOT NULL,
      product_name_en TEXT NOT NULL,
      sku TEXT NOT NULL,
      unit_label TEXT NOT NULL,
      unit_price_npr REAL NOT NULL,
      quantity INTEGER NOT NULL,
      line_total_npr REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      note TEXT,
      changed_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      cooperative_id TEXT NOT NULL REFERENCES cooperatives(id) ON DELETE RESTRICT,
      method TEXT NOT NULL,
      amount_npr REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      transaction_reference TEXT,
      gateway_payload_json TEXT,
      verified_by TEXT REFERENCES users(id),
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS otp_verifications (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sms_logs (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT REFERENCES cooperatives(id) ON DELETE SET NULL,
      recipient_phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'akash_sms',
      status TEXT NOT NULL,
      provider_response TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      cooperative_id TEXT REFERENCES cooperatives(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title_ne TEXT NOT NULL,
      title_en TEXT NOT NULL,
      body_ne TEXT NOT NULL,
      body_en TEXT NOT NULL,
      action_url TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT,
      cooperative_id TEXT REFERENCES cooperatives(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata_json TEXT DEFAULT '{}',
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS login_activities (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      identifier TEXT NOT NULL,
      success INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      cooperative_id TEXT REFERENCES cooperatives(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_by TEXT REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_coop_status ON products(cooperative_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_coop_created ON orders(cooperative_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_coops_status ON cooperatives(status);
    CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone, purpose, created_at DESC);
  `);
}
