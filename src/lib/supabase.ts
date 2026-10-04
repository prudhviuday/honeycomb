import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL');
}

if (!supabasePublishableKey) {
  throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY');
}

console.log('[Supabase] URL:', supabaseUrl);
console.log('[Supabase] Publishable key exists:', !!supabasePublishableKey);
console.log(
  '[Supabase] Key type:',
  supabasePublishableKey.startsWith('sb_publishable_')
    ? 'publishable'
    : 'legacy/unknown'
);

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },

    global: {
      headers: {
        apikey: supabasePublishableKey,
      },
    },
  }
);
