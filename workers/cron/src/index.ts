/**
 * Snipotter — Cron Worker
 *
 * Her gece 03:00 UTC'de tüm bağlı kaynaklardan veri çekip Supabase'in
 * metric_snapshots ve reviews tablolarına yazar. Admin paneli sadece
 * Supabase okuduğu için kaynak başına yazma mantığı tek yerde durur.
 *
 * Çalışma akışı:
 *   1. apps tablosundaki aktif uygulamaları çek.
 *   2. Her uygulama için bağlanmış (kimlik bilgileri var olan) her
 *      kaynağı dene. Bir kaynak başarısız olsa diğerlerini engellemesin.
 *   3. Snapshot'ı (app_id, source, today) ile upsert et.
 *
 * Bu PR'da çalışan kaynak: GitHub Releases (anonim API, sıfır
 * kimlik bilgisi). Microsoft Store + Google Play + Cloudflare Analytics
 * iskeletli — env var doluysa devreye girer, değilse sessizce atlanır.
 */

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  CRON_TRIGGER_SECRET?: string

  // Optional per-source secrets — pull skipped when missing
  GITHUB_TOKEN?: string
  MS_TENANT_ID?: string
  MS_CLIENT_ID?: string
  MS_CLIENT_SECRET?: string
  PLAY_SERVICE_ACCOUNT_JSON_B64?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
}

interface AppRow {
  id: string
  slug: string
  display_name: string
  ms_store_id: string | null
  play_package_name: string | null
  github_owner: string | null
  github_repo: string | null
}

export default {
  // Manual HTTP trigger — /run?source=github&secret=...
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return json({ ok: true })
    }
    if (url.pathname !== '/run') {
      return json({ error: 'Not found' }, 404)
    }

    if (!env.CRON_TRIGGER_SECRET || url.searchParams.get('secret') !== env.CRON_TRIGGER_SECRET) {
      return json({ error: 'unauthorized' }, 401)
    }

    const wantSource = url.searchParams.get('source') as Source | null
    const result = await runAll(env, wantSource)
    return json(result)
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runAll(env, null).then(() => undefined))
  },
}

type Source = 'github' | 'ms-store' | 'play' | 'cloudflare'

interface SourceResult {
  source: Source
  appSlug: string
  ok: boolean
  detail?: string
  installs?: number
}

/**
 * Per-source pullers. Each one is responsible for:
 *   • Skipping itself if the necessary env / app-row fields are missing.
 *   • Producing a single metric_snapshots row per app.
 *   • Returning a SourceResult so we can log + surface what ran.
 */
async function runAll(env: Env, only: Source | null): Promise<{ ran: SourceResult[] }> {
  const apps = await sb<AppRow[]>(env, 'apps?is_active=eq.true&select=id,slug,display_name,ms_store_id,play_package_name,github_owner,github_repo')
  if (!apps) return { ran: [] }

  const ran: SourceResult[] = []
  for (const app of apps) {
    if (!only || only === 'github') {
      ran.push(await pullGithub(env, app))
    }
    if (!only || only === 'ms-store') {
      ran.push(await pullMicrosoft(env, app))
    }
    if (!only || only === 'play') {
      ran.push(await pullPlay(env, app))
    }
    if (!only || only === 'cloudflare') {
      ran.push(await pullCloudflare(env, app))
    }
  }
  return { ran }
}

/* ---------- GitHub Releases ---------- */

interface GithubAsset {
  name: string
  download_count: number
  size: number
}

interface GithubRelease {
  tag_name: string
  published_at: string
  assets: GithubAsset[]
}

async function pullGithub(env: Env, app: AppRow): Promise<SourceResult> {
  if (!app.github_owner || !app.github_repo) {
    return { source: 'github', appSlug: app.slug, ok: false, detail: 'no github repo on app' }
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'snipotter-cron-worker',
  }
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`

  // Pull all releases — usually a handful, max we'd ever encounter is
  // ~50 even after years. Sum download_count across every asset of
  // every release. Per-asset breakdown stored in meta jsonb so the
  // admin desktop page can show "v0.4.4 — 320 downloads" per row.
  const r = await fetch(
    `https://api.github.com/repos/${app.github_owner}/${app.github_repo}/releases?per_page=100`,
    { headers },
  )
  if (!r.ok) {
    return { source: 'github', appSlug: app.slug, ok: false, detail: `github api ${r.status}` }
  }
  const releases = (await r.json()) as GithubRelease[]
  let total = 0
  const perAsset: Record<string, number> = {}
  const perPlatform: Record<string, number> = { mac: 0, win: 0, linux: 0, other: 0 }
  for (const rel of releases) {
    for (const a of rel.assets) {
      total += a.download_count
      perAsset[a.name] = (perAsset[a.name] ?? 0) + a.download_count
      perPlatform[platformFromAsset(a.name)] += a.download_count
    }
  }

  // Today's delta: pull yesterday's snapshot if any, subtract.
  const yesterday = isoDaysAgo(1)
  const prev = await sb<{ installs_total: number | null }[]>(
    env,
    `metric_snapshots?app_id=eq.${app.id}&source=eq.github&date=eq.${yesterday}&select=installs_total`,
  )
  const delta = prev && prev.length > 0 && prev[0].installs_total != null ? total - prev[0].installs_total : null

  await upsertSnapshot(env, {
    app_id: app.id,
    source: 'github',
    date: isoDaysAgo(0),
    installs_total: total,
    installs_delta: delta,
    active_users: null,
    rating_avg: null,
    rating_count: null,
    meta: { perAsset, perPlatform, releaseCount: releases.length },
  })

  return { source: 'github', appSlug: app.slug, ok: true, installs: total }
}

function platformFromAsset(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.dmg')) return 'mac'
  if (lower.endsWith('.exe')) return 'win'
  if (lower.endsWith('.appimage') || lower.endsWith('.deb') || lower.endsWith('.rpm')) return 'linux'
  return 'other'
}

/* ---------- Microsoft Store (skeleton) ---------- */

async function pullMicrosoft(env: Env, app: AppRow): Promise<SourceResult> {
  if (!env.MS_TENANT_ID || !env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) {
    return { source: 'ms-store', appSlug: app.slug, ok: false, detail: 'MS_* secrets not set' }
  }
  if (!app.ms_store_id) {
    return { source: 'ms-store', appSlug: app.slug, ok: false, detail: 'no ms_store_id on app' }
  }

  // 1. Acquire token from Azure AD
  // 2. Hit https://manage.devcenter.microsoft.com/v2.0/my/analytics/...
  //    Endpoints (see learn.microsoft.com/.../insights-programmatic-analytics-available-api):
  //      • acquisitions for installs
  //      • ratings for averages
  //      • reviews for review feed
  // 3. Upsert one snapshot + (optionally) page through reviews
  //
  // Implementation deferred to PR-2 — placeholder leaves a zero row so
  // the admin page knows we tried.
  await upsertSnapshot(env, {
    app_id: app.id,
    source: 'ms-store',
    date: isoDaysAgo(0),
    installs_total: null,
    installs_delta: null,
    active_users: null,
    rating_avg: null,
    rating_count: null,
    meta: { stub: 'PR-2 will wire MS Partner Center API here' },
  })
  return { source: 'ms-store', appSlug: app.slug, ok: false, detail: 'PR-2 stub' }
}

/* ---------- Google Play (skeleton) ---------- */

async function pullPlay(env: Env, app: AppRow): Promise<SourceResult> {
  if (!env.PLAY_SERVICE_ACCOUNT_JSON_B64) {
    return { source: 'play', appSlug: app.slug, ok: false, detail: 'PLAY_SERVICE_ACCOUNT_JSON_B64 not set' }
  }
  if (!app.play_package_name) {
    return { source: 'play', appSlug: app.slug, ok: false, detail: 'no play_package_name' }
  }

  // 1. Decode service account JSON, mint a JWT, exchange for OAuth token
  // 2. Hit playdeveloperreporting.googleapis.com/v1beta1/apps/{pkg}/...
  //    metrics: cumulative-active-devices, daily-installs, ratings
  // 3. Reviews via androidpublisher.googleapis.com/.../reviews
  // Deferred to PR-3 (Android publish lock-step).
  await upsertSnapshot(env, {
    app_id: app.id,
    source: 'play',
    date: isoDaysAgo(0),
    installs_total: null,
    installs_delta: null,
    active_users: null,
    rating_avg: null,
    rating_count: null,
    meta: { stub: 'PR-3 will wire Play Developer Reporting API here' },
  })
  return { source: 'play', appSlug: app.slug, ok: false, detail: 'PR-3 stub' }
}

/* ---------- Cloudflare Workers Analytics (skeleton) ---------- */

async function pullCloudflare(env: Env, app: AppRow): Promise<SourceResult> {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    return { source: 'cloudflare', appSlug: app.slug, ok: false, detail: 'CF analytics secrets not set' }
  }

  // GraphQL Analytics API — pulls page views / unique visitors for
  // snipotter-landing + snipotter-web. Stored on the synthetic
  // "snipotter-desktop" app row's 'cloudflare' source for now;
  // multi-domain split lands when we add Snipotter #2.
  await upsertSnapshot(env, {
    app_id: app.id,
    source: 'cloudflare',
    date: isoDaysAgo(0),
    installs_total: null,
    installs_delta: null,
    active_users: null,
    rating_avg: null,
    rating_count: null,
    meta: { stub: 'PR-2 will wire Cloudflare Analytics GraphQL here' },
  })
  return { source: 'cloudflare', appSlug: app.slug, ok: false, detail: 'PR-2 stub' }
}

/* ---------- Supabase helpers ---------- */

interface SnapshotInsert {
  app_id: string
  source: Source
  date: string
  installs_total: number | null
  installs_delta: number | null
  active_users: number | null
  rating_avg: number | null
  rating_count: number | null
  meta: Record<string, unknown>
}

async function upsertSnapshot(env: Env, row: SnapshotInsert): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/metric_snapshots?on_conflict=app_id,source,date`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([row]),
  })
}

async function sb<T>(env: Env, path: string): Promise<T | null> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  })
  if (!r.ok) return null
  return (await r.json()) as T
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
