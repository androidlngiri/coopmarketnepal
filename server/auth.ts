import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { parseJsonField, requireSupabaseAdmin } from './supabase-admin.ts';

export type UserRole = 'super_admin' | 'cooperative_admin' | 'cooperative_staff' | 'buyer';

export interface AuthUser {
  id: string;
  full_name: string;
  full_name_ne: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  preferred_language: 'ne' | 'en';
  is_active: boolean;
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

export function hashSessionToken(token: string): string {
  const secret = process.env.SESSION_SECRET || 'sahakari-dev-session-secret';
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export async function createSession(userId: string, req: Request, res: Response): Promise<string> {
  const sb = requireSupabaseAdmin();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { error } = await sb.from('sessions').insert({
    user_id: userId,
    token_hash: tokenHash,
    ip_address: req.ip || null,
    user_agent: req.get('user-agent')?.slice(0, 250) || null,
    expires_at: expiresAt,
  });
  if (error) {
    throw new Error(`Session create error: ${error.message}`);
  }

  await sb.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', userId);

  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
    maxAge: SESSION_TTL_MS,
    path: '/',
  });

  return rawToken;
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = extractToken(req);
  if (token) {
    const sb = requireSupabaseAdmin();
    await sb.from('sessions').delete().eq('token_hash', hashSessionToken(token));
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

export async function resolveAuthUser(req: Request): Promise<AuthUser | null> {
  const token = extractToken(req);
  if (!token) return null;

  const sb = requireSupabaseAdmin();
  const tokenHash = hashSessionToken(token);

  const { data: sess, error: sessErr } = await sb
    .from('sessions')
    .select('expires_at, profiles:user_id (id, full_name, full_name_ne, email, phone, role, preferred_language, is_active)')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (sessErr || !sess || !sess.profiles) {
    return null;
  }

  const profile = (Array.isArray(sess.profiles) ? sess.profiles[0] : sess.profiles) as AuthUser | undefined;
  if (!profile || !profile.is_active) return null;

  if (new Date(String(sess.expires_at)).getTime() < Date.now()) {
    await sb.from('sessions').delete().eq('token_hash', tokenHash);
    return null;
  }

  if (profile.role === 'super_admin') {
    const { data: adminRow } = await sb
      .from('platform_administrators')
      .select('is_active')
      .eq('user_id', profile.id)
      .maybeSingle();
    if (!adminRow || !adminRow.is_active) return null;
  }

  if (profile.role === 'cooperative_admin' || profile.role === 'cooperative_staff') {
    const { data: ownedCoop } = await sb
      .from('cooperatives')
      .select('id, status')
      .eq('owner_user_id', profile.id)
      .limit(1)
      .maybeSingle();

    if (ownedCoop) {
      profile.cooperative_id = ownedCoop.id;
      profile.cooperative_status = ownedCoop.status;
      profile.permissions = {
        manage_products: true,
        manage_orders: true,
        manage_inventory: true,
        manage_store: true,
        manage_staff: true,
        view_reports: true,
        manage_settings: true,
      };
    } else {
      const { data: staffRow } = await sb
        .from('cooperative_staff')
        .select('cooperative_id, permissions_json, cooperatives:cooperative_id (status)')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (staffRow) {
        const coopRel = Array.isArray(staffRow.cooperatives)
          ? staffRow.cooperatives[0]
          : staffRow.cooperatives;
        profile.cooperative_id = staffRow.cooperative_id;
        profile.cooperative_status = (coopRel as { status?: string } | null)?.status ?? null;
        profile.permissions = parseJsonField<Record<string, boolean>>(staffRow.permissions_json, {});
      }
    }
  }

  return profile;
}

export async function attachAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.authUser = await resolveAuthUser(req);
  } catch {
    req.authUser = null;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'प्रमाणीकरण आवश्यक छ (Authentication required).' });
  }
  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser || req.authUser.role !== 'super_admin') {
    return res.status(403).json({ error: 'सुपर एडमिन अधिकार आवश्यक छ (Super admin access required).' });
  }
  try {
    const sb = requireSupabaseAdmin();
    const { data: adminRow } = await sb
      .from('platform_administrators')
      .select('is_active')
      .eq('user_id', req.authUser.id)
      .maybeSingle();

    if (!adminRow || !adminRow.is_active) {
      return res.status(403).json({ error: 'निष्क्रिय प्रशासक खाता।' });
    }
    next();
  } catch {
    return res.status(500).json({ error: 'प्रशासक प्रमाणीकरण जाँच गर्न असफल।' });
  }
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

export async function writeAuditLog(params: {
  actorUserId?: string | null;
  actorRole?: string | null;
  cooperativeId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    const sb = requireSupabaseAdmin();
    await sb.from('audit_logs').insert({
      actor_user_id: params.actorUserId ?? null,
      actor_role: params.actorRole ?? null,
      cooperative_id: params.cooperativeId ?? null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      metadata_json: params.metadata ?? {},
      ip_address: params.ipAddress ?? null,
    });
  } catch {
    // Non-blocking audit log safeguard
  }
}

// Per-isolate sliding window rate limiter for sensitive routes
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
