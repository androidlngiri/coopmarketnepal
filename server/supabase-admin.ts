import { createClient } from '@supabase/supabase-js';

export function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
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

export function getSupabaseAdminClient() {
  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServerKey();

  if (!url || !serviceKey || url.includes('your-project.supabase.co') || serviceKey.includes('your-supabase')) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseAdminClient() !== null;
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
