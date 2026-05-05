import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Singleton Supabase client. The admin app uses the public anon key —
 * row-level security on the admin schema is intentionally locked down
 * to the service role, so the anon client can SELECT readable tables
 * but cannot write. Writes happen exclusively from the cron + heartbeat
 * Cloudflare Workers, which use the service role key from a secret
 * binding.
 */
export function getSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy apps/admin/.env.local.example to apps/admin/.env.local and fill values.',
    )
  }
  _client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Separate storage key from the public web app so signing in to
      // the admin doesn't accidentally elevate the public app's session
      // (and vice versa).
      storageKey: 'snipotter.admin.session',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  })
  return _client
}
