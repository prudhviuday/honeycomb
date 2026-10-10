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
const SUPABASE_REQUEST_TIMEOUT_MS = 15_000;

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

  /*
   * A screen can aggregate many Supabase requests before it clears its
   * loading state. If a request never receives response headers, that
   * screen can remain on its spinner forever. Apply a finite request
   * deadline while preserving caller cancellation.
   */
  const controller = new AbortController();
  const requestSignal =
    init?.signal ??
    (typeof Request !== 'undefined' && input instanceof Request
      ? input.signal
      : undefined);

  const abortFromCaller = () => controller.abort();
  if (requestSignal?.aborted) {
    controller.abort();
  } else {
    requestSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeoutId = setTimeout(
    () => controller.abort(),
    SUPABASE_REQUEST_TIMEOUT_MS,
  );

  try {
    return await globalThis.fetch(input, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    requestSignal?.removeEventListener('abort', abortFromCaller);
  }
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
