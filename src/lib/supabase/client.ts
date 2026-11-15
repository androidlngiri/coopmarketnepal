import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  '';

export const isSupabaseBrowserConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) && !supabaseUrl.includes('your-project.supabase.co');

export const supabaseBrowser = isSupabaseBrowserConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
