import { createClient } from '@supabase/supabase-js';

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!USE_MOCK && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error('Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or set VITE_USE_MOCK=true).');
}

// Create client without strict typing for flexibility
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Avoid reusing stale auth state from prior runs with default storage key
    // (helps prevent endless refresh attempts when offline/DNS blocked).
    storageKey: 'pixigrejas-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Auth helpers
export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const onAuthStateChange = (callback: (user: any) => void) => {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null);
  });
};
