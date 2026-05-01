import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.local.',
    )
  }
  _client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'snipotter.web.session',
      // localStorage is the default in browsers — explicit for clarity
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
    realtime: {
      // Bump event throughput so high-frequency ops (bulk delete, rapid
      // typing) aren't throttled at the socket layer. 100/s matches the
      // desktop client so both ends agree on the ceiling.
      params: { eventsPerSecond: 100 },
    },
  })
  return _client
}
