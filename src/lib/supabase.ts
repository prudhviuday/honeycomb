import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL');
}

if (!supabasePublishableKey) {
  throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY');
}

console.log('[Supabase] URL:', supabaseUrl);
console.log(
  '[Supabase] Publishable key exists:',
  !!supabasePublishableKey
);
console.log(
  '[Supabase] Key type:',
  supabasePublishableKey.startsWith('sb_publishable_')
    ? 'publishable'
    : 'legacy/unknown'
);

/*
 * Force the Supabase API key onto every HTTP request.
 *
 * We are doing this explicitly because the REST requests were reaching
 * Supabase with:
 *
 *   No `apikey` request header
 *
 * even though the Supabase client was initialized with the key.
 */
const supabaseFetch: typeof fetch = async (
  input,
  init
) => {
  const headers = new Headers(init?.headers);

  /*
   * Always provide the Supabase API key.
   */
  headers.set('apikey', supabasePublishableKey);

  /*
   * Do NOT overwrite Authorization if supabase-js/auth has already
   * supplied the user's session JWT.
   *
   * For requests where there is no session, using the publishable key
   * as the bearer token allows the request to remain compatible with
   * Supabase's client behavior.
   */
  if (!headers.has('Authorization')) {
    headers.set(
      'Authorization',
      `Bearer ${supabasePublishableKey}`
    );
  }

  return globalThis.fetch(input, {
    ...init,
    headers,
  });
};

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
      fetch: supabaseFetch,
    },
  }
);
