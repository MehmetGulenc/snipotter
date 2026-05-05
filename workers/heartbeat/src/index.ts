/**
 * Snipotter — Heartbeat Worker
 *
 * Tek görevi var: Snipotter masaüstü (Electron) ve mobil (Capacitor)
 * uygulamaları her açıldığında bu endpoint'e POST atar; biz Supabase'e
 * yazıp admin panelin DAU/WAU/MAU + aktif kurulum sayılarını çıkarmasını
 * sağlarız.
 *
 * Tasarım kararları:
 *   • Sıfır PII. device_id istemci tarafında üretilen rastgele bir UUID.
 *     Aynı kullanıcı iki cihaz bağladığında iki farklı UUID görürsün.
 *   • Tek satır = (device_id, date) — bir cihaz günde 50 kez açılsa bile
 *     DAU sayımı 1 olur. last_seen_at update edilir.
 *   • Service role anahtarı sadece Cloudflare Worker secret'ında. İstemci
 *     hiçbir şekilde Supabase'e doğrudan yazmaz.
 *   • CORS açık (sadece POST /heartbeat) çünkü Capacitor bazen
 *     `https://localhost` origin'inden çağırır. Yine de body schema'sı
 *     dar, app_slug allowlist'te olmazsa reddedilir.
 *
 * Body şeması:
 *   {
 *     "appSlug": "snipotter-desktop",
 *     "deviceId": "uuid-v4",                // istemci üretir, kalıcı
 *     "platform": "darwin-arm64",            // node `process.platform-arch`
 *     "version": "0.4.4",
 *     "language": "tr"                       // optional
 *   }
 */

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  ALLOWED_APP_SLUGS: string                  // "snipotter-desktop,snipotter-android"
}

interface HeartbeatBody {
  appSlug?: string
  deviceId?: string
  platform?: string
  version?: string
  language?: string
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)

    // GET /health — quick "is the worker alive?" check, used by uptime
    // monitors and post-deploy smoke tests.
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, time: new Date().toISOString() })
    }

    if (request.method !== 'POST' || url.pathname !== '/heartbeat') {
      return json({ error: 'Not found' }, 404)
    }

    let body: HeartbeatBody
    try {
      body = (await request.json()) as HeartbeatBody
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }

    const { appSlug, deviceId, platform, version, language } = body
    if (!appSlug || !deviceId) {
      return json({ error: 'appSlug and deviceId required' }, 400)
    }

    // Allowlist guard — keeps random callers from polluting the heartbeats
    // table with synthetic apps.
    const allowed = env.ALLOWED_APP_SLUGS.split(',').map((s) => s.trim())
    if (!allowed.includes(appSlug)) {
      return json({ error: 'app not allowed' }, 403)
    }

    // Light validation. We don't want a malicious client filling the
    // table with 5KB version strings.
    if (deviceId.length > 64 || (platform && platform.length > 32) || (version && version.length > 32)) {
      return json({ error: 'field too long' }, 400)
    }

    // Resolve appSlug → app_id via a single tiny query. We could cache
    // this in KV later if traffic warrants, but at heartbeat scale
    // (~once-per-launch per user) the round-trip is cheap.
    const appLookup = await sb<Array<{ id: string }>>(
      env,
      `apps?slug=eq.${encodeURIComponent(appSlug)}&select=id&limit=1`,
      { method: 'GET' },
    )
    if (!appLookup || appLookup.length === 0) {
      return json({ error: 'unknown app' }, 404)
    }
    const appId = appLookup[0].id

    const today = new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()

    // Upsert by (device_id, date). PostgREST handles the conflict via
    // the on_conflict query param + Prefer: resolution=merge-duplicates
    // header. We deliberately set first_seen_at only if it's not already
    // there, so re-pings in the same day don't overwrite the original
    // timestamp.
    const upsertBody = [
      {
        device_id: deviceId,
        date: today,
        app_id: appId,
        platform: platform ?? null,
        version: version ?? null,
        language: language ?? null,
        last_seen_at: now,
        // first_seen_at is only included on first insert; PostgREST
        // merge-duplicates will use existing column values otherwise.
        first_seen_at: now,
      },
    ]

    const insertRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/heartbeats?on_conflict=device_id,date`,
      {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          // Update last_seen_at + version + platform on conflict; keep
          // first_seen_at as-is.
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(upsertBody),
      },
    )

    if (!insertRes.ok) {
      const text = await insertRes.text()
      return json({ error: 'supabase write failed', detail: text }, 500)
    }

    return json({ ok: true })
  },
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

/**
 * Tiny PostgREST helper. Uses the service role key — bypasses RLS, so
 * keep it strictly server-side.
 */
async function sb<T>(
  env: Env,
  path: string,
  init: { method: string; body?: unknown; prefer?: string },
): Promise<T | null> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  if (!r.ok) return null
  if (r.status === 204) return null as T
  return (await r.json()) as T
}
