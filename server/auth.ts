import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export type UserRole = 'super_admin' | 'cooperative_admin' | 'cooperative_staff' | 'buyer';

export interface AuthUser {
  id: string;
  full_name: string;
  full_name_ne: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  preferred_language: 'ne' | 'en';
  is_active: number;
  cooperative_id?: string | null;
  cooperative_status?: string | null;
  permissions?: Record<string, boolean>;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser | null;
      cooperativeId?: string;
    }
  }
}

const SESSION_COOKIE_NAME = 'sahakari_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function hashSessionToken(token: string): string {
  const secret = process.env.SESSION_SECRET || 'sahakari-dev-session-secret';
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function createSession(userId: string, req: Request, res: Response): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    userId,
    tokenHash,
    req.ip || null,
    req.get('user-agent')?.slice(0, 250) || null,
    expiresAt
  );

  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(userId);

  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });

  return rawToken;
}

export function destroySession(req: Request, res: Response) {
  const token = extractToken(req);
  if (token) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashSessionToken(token));
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : null;
}

export function resolveAuthUser(req: Request): AuthUser | null {
  const token = extractToken(req);
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare(
      `SELECT u.id, u.full_name, u.full_name_ne, u.email, u.phone, u.role, u.preferred_language, u.is_active, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as (AuthUser & { expires_at: string }) | undefined;

  if (!row || !row.is_active) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    return null;
  }

  // Independent Super-Admin table check
  if (row.role === 'super_admin') {
    const adminRow = db
      .prepare(`SELECT is_active FROM platform_administrators WHERE user_id = ?`)
      .get(row.id) as { is_active: number } | undefined;
    if (!adminRow || !adminRow.is_active) return null;
  }

  // Resolve cooperative membership & permissions
  if (row.role === 'cooperative_admin' || row.role === 'cooperative_staff') {
    const ownedCoop = db
      .prepare(`SELECT id, status FROM cooperatives WHERE owner_user_id = ? LIMIT 1`)
      .get(row.id) as { id: string; status: string } | undefined;

    if (ownedCoop) {
      row.cooperative_id = ownedCoop.id;
      row.cooperative_status = ownedCoop.status;
      row.permissions = {
        manage_products: true,
        manage_orders: true,
        manage_inventory: true,
        manage_store: true,
        manage_staff: true,
        view_reports: true,
        manage_settings: true,
      };
    } else {
      const staffRow = db
        .prepare(
          `SELECT cs.cooperative_id, cs.permissions_json, c.status
           FROM cooperative_staff cs
           JOIN cooperatives c ON c.id = cs.cooperative_id
           WHERE cs.user_id = ? AND cs.is_active = 1
           LIMIT 1`
        )
        .get(row.id) as { cooperative_id: string; permissions_json: string; status: string } | undefined;

      if (staffRow) {
        row.cooperative_id = staffRow.cooperative_id;
        row.cooperative_status = staffRow.status;
        try {
          row.permissions = JSON.parse(staffRow.permissions_json);
        } catch {
          row.permissions = {};
        }
      }
    }
  }

  return row;
}

export function attachAuth(req: Request, _res: Response, next: NextFunction) {
  req.authUser = resolveAuthUser(req);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'प्रमाणीकरण आवश्यक छ (Authentication required).' });
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser || req.authUser.role !== 'super_admin') {
    return res.status(403).json({ error: 'सुपर एडमिन अधिकार आवश्यक छ (Super admin access required).' });
  }
  const adminRow = db
    .prepare(`SELECT is_active FROM platform_administrators WHERE user_id = ?`)
    .get(req.authUser.id) as { is_active: number } | undefined;
  if (!adminRow || !adminRow.is_active) {
    return res.status(403).json({ error: 'निष्क्रिय प्रशासक खाता।' });
  }
  next();
}

export function requireCooperativeAccess(permission?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'प्रमाणीकरण आवश्यक छ।' });
    }
    if (req.authUser.role !== 'cooperative_admin' && req.authUser.role !== 'cooperative_staff') {
      return res.status(403).json({ error: 'सहकारी खाता मात्र अनुमति प्राप्त छ।' });
    }
    if (!req.authUser.cooperative_id) {
      return res.status(403).json({ error: 'तपाईंको खाता कुनै सहकारीसँग आबद्ध छैन।' });
    }
    if (permission && !req.authUser.permissions?.[permission]) {
      return res.status(403).json({ error: `यो कार्य गर्न अनुमति छैन (${permission})।` });
    }
    req.cooperativeId = req.authUser.cooperative_id;
    next();
  };
}

export function writeAuditLog(params: {
  actorUserId?: string | null;
  actorRole?: string | null;
  cooperativeId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  db.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, actor_role, cooperative_id, action, entity_type, entity_id, metadata_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    params.actorUserId ?? null,
    params.actorRole ?? null,
    params.cooperativeId ?? null,
    params.action,
    params.entityType,
    params.entityId ?? null,
    JSON.stringify(params.metadata ?? {}),
    params.ipAddress ?? null
  );
}

// Simple in-memory sliding window rate limiter for sensitive routes
const rateBuckets = new Map<string, number[]>();

export function rateLimit(keyPrefix: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${req.ip || 'unknown'}`;
    const now = Date.now();
    const history = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxRequests) {
      return res.status(429).json({
        error: 'अत्यधिक अनुरोध। कृपया केही समयपछि पुनः प्रयास गर्नुहोस्।',
      });
    }
    history.push(now);
    rateBuckets.set(key, history);
    next();
  };
}
