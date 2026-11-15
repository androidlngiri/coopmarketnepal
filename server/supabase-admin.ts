import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedAdminClient: SupabaseClient | null = null;
let cachedSignature = '';

export function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();
}

export function getSupabaseAnonKey(): string {
  return (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();
}

export function getSupabaseServerKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServerKey();

  if (!url || !serviceKey || url.includes('your-project.supabase.co') || serviceKey.includes('your-supabase')) {
    return null;
  }

  const sig = `${url}:${serviceKey.slice(0, 16)}`;
  if (cachedAdminClient && cachedSignature === sig) {
    return cachedAdminClient;
  }

  cachedAdminClient = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  cachedSignature = sig;
  return cachedAdminClient;
}

export function requireSupabaseAdmin(): SupabaseClient {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error('Supabase URL or Service Role key is not configured on the server.');
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseAdminClient() !== null;
}

export function parseJsonField<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return val as T;
}

export async function createSupabaseAuthUser(params: {
  email?: string | null;
  phone?: string | null;
  password: string;
  fullName: string;
  fullNameNe?: string | null;
  role: 'super_admin' | 'cooperative_admin' | 'cooperative_staff' | 'buyer';
  phoneVerifiedAt?: string | null;
}): Promise<{ id: string }> {
  const sb = requireSupabaseAdmin();
  const cleanEmail = params.email ? params.email.trim().toLowerCase() : null;
  const cleanPhone = params.phone ? params.phone.trim() : null;
  const authEmail = cleanEmail || `phone-${cleanPhone}@users.sahakaribazar.local`;

  const created = await sb.auth.admin.createUser({
    email: authEmail,
    phone: cleanPhone ? `+977${cleanPhone}` : undefined,
    password: params.password,
    email_confirm: true,
    phone_confirm: Boolean(params.phoneVerifiedAt),
    user_metadata: {
      full_name: params.fullName,
      role: params.role,
    },
  });

  if (created.error || !created.data?.user) {
    const msg = created.error?.message || 'Unable to create auth user';
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('exists')) {
      throw new Error('DUPLICATE_USER');
    }
    throw new Error(msg);
  }

  const userId = created.data.user.id;
  const { error: profErr } = await sb.from('profiles').insert({
    id: userId,
    full_name: params.fullName,
    full_name_ne: params.fullNameNe ?? params.fullName,
    email: cleanEmail,
    phone: cleanPhone,
    role: params.role,
    preferred_language: 'ne',
    is_active: true,
    phone_verified_at: params.phoneVerifiedAt ?? null,
  });

  if (profErr) {
    await sb.auth.admin.deleteUser(userId);
    if (profErr.code === '23505' || profErr.message.toLowerCase().includes('duplicate')) {
      throw new Error('DUPLICATE_USER');
    }
    throw new Error(profErr.message);
  }

  return { id: userId };
}

export async function verifySupabaseUserPassword(userId: string, password: string): Promise<boolean> {
  const sb = requireSupabaseAdmin();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey() || getSupabaseServerKey();
  if (!url || !anonKey) return false;

  const { data: authData, error: authLookupErr } = await sb.auth.admin.getUserById(userId);
  if (authLookupErr || !authData?.user?.email) {
    return false;
  }

  const authClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await authClient.auth.signInWithPassword({
    email: authData.user.email,
    password,
  });

  return !error;
}

export async function verifySupabaseConnection(): Promise<{
  configured: boolean;
  connected: boolean;
  migrationsApplied: boolean;
  message: string;
}> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      configured: false,
      connected: false,
      migrationsApplied: false,
      message: 'Supabase URL or Service Role / Secret key not configured in environment.',
    };
  }

  try {
    const { error } = await client.from('subscription_plans').select('id').limit(1);
    if (!error) {
      return {
        configured: true,
        connected: true,
        migrationsApplied: true,
        message: 'Connected to Supabase PostgreSQL; schema migrations verified.',
      };
    }

    const msg = error.message || '';
    if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('schema cache')) {
      return {
        configured: true,
        connected: true,
        migrationsApplied: false,
        message: 'Connected to Supabase, but schema tables are missing. Run supabase/ALL_IN_ONE_SETUP.sql in SQL Editor.',
      };
    }

    return {
      configured: true,
      connected: false,
      migrationsApplied: false,
      message: `Supabase error: ${msg}`,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      migrationsApplied: false,
      message: err instanceof Error ? err.message : 'Supabase connection error',
    };
  }
}
