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

/* ---------- Microsoft Store ---------- */

interface MsAcquisitionRow {
  applicationId: string
  date: string
  acquisitionType?: string
  market?: string
  acquisitionQuantity?: number
}

interface MsRatingsRow {
  applicationId: string
  date: string
  averageRating?: number
  ratingCount?: number
}

interface MsReviewRow {
  applicationId: string
  reviewerName?: string | null
  rating?: number
  title?: string | null
  reviewText?: string | null
  reviewerId?: string
  market?: string
  submittedDateTime?: string
}

interface MsApiResponse<T> {
  Value?: T[]
  TotalCount?: number
}

/**
 * Resmi Microsoft Store analytics flow'u:
 *   1. Azure AD client-credentials grant → Microsoft Entra access token
 *   2. devcenter API'sine GET istekleri:
 *        • applicationacquisitions  → daily install counts
 *        • applicationratings       → cumulative average rating + count
 *        • applicationreviews       → en son yorumlar (paginate edilebilir)
 *   3. Snapshot ve review tablolarına upsert
 *
 * Auth scope: https://manage.devcenter.microsoft.com/.default
 * Doc: learn.microsoft.com/en-us/partner-center/insights/insights-programmatic-analytics-available-api
 */
async function pullMicrosoft(env: Env, app: AppRow): Promise<SourceResult> {
  if (!env.MS_TENANT_ID || !env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) {
    return { source: 'ms-store', appSlug: app.slug, ok: false, detail: 'MS_* secrets not set' }
  }
  if (!app.ms_store_id) {
    return { source: 'ms-store', appSlug: app.slug, ok: false, detail: 'no ms_store_id on app' }
  }

  const token = await msAccessToken(env)
  if (!token) {
    return { source: 'ms-store', appSlug: app.slug, ok: false, detail: 'token acquisition failed' }
  }

  const today = isoDaysAgo(0)
  const startDate = isoDaysAgo(2)            // 2 günlük lookback — Partner Center bazen 1-2 gün gecikmeli yansır
  const endDate = today
  const baseUrl = 'https://manage.devcenter.microsoft.com/v2.0/my/analytics'
  const headers = { Authorization: `Bearer ${token}` }

  // — Installs
  const acqUrl =
    `${baseUrl}/applicationacquisitions?applicationId=${app.ms_store_id}` +
    `&startDate=${startDate}&endDate=${endDate}&aggregationLevel=day`
  const acqRes = await fetch(acqUrl, { headers })
  let installsToday = 0
  let acqOk = acqRes.ok
  if (acqRes.ok) {
    const data = (await acqRes.json()) as MsApiResponse<MsAcquisitionRow>
    for (const row of data.Value ?? []) {
      // Some payloads dot-prefix the date; normalise to YYYY-MM-DD.
      const d = (row.date ?? '').slice(0, 10)
      if (d === today && row.acquisitionQuantity) installsToday += row.acquisitionQuantity
    }
  }

  // — Ratings (cumulative averages)
  const ratingsUrl =
    `${baseUrl}/applicationratings?applicationId=${app.ms_store_id}` +
    `&startDate=${startDate}&endDate=${endDate}&aggregationLevel=day`
  const ratingsRes = await fetch(ratingsUrl, { headers })
  let ratingAvg: number | null = null
  let ratingCount: number | null = null
  if (ratingsRes.ok) {
    const data = (await ratingsRes.json()) as MsApiResponse<MsRatingsRow>
    // Take the latest day with data — averages are cumulative so the
    // most recent row reflects the running total.
    const sorted = (data.Value ?? []).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    const latest = sorted[sorted.length - 1]
    if (latest) {
      ratingAvg = latest.averageRating ?? null
      ratingCount = latest.ratingCount ?? null
    }
  }

  // — Reviews (we pull the most recent 100 — duplicates are suppressed
  //    by the (app_id, source, external_id) primary key)
  const reviewsUrl =
    `${baseUrl}/applicationreviews?applicationId=${app.ms_store_id}` +
    `&startDate=${startDate}&endDate=${endDate}&top=100&orderby=submittedDateTime%20desc`
  const reviewsRes = await fetch(reviewsUrl, { headers })
  let newReviews = 0
  if (reviewsRes.ok) {
    const data = (await reviewsRes.json()) as MsApiResponse<MsReviewRow>
    for (const r of data.Value ?? []) {
      if (!r.reviewerId) continue
      await upsertReview(env, {
        app_id: app.id,
        source: 'ms-store',
        external_id: r.reviewerId,
        author: r.reviewerName ?? null,
        rating: r.rating ?? null,
        body: [r.title, r.reviewText].filter(Boolean).join('\n\n') || null,
        language: r.market ?? null,
        created_at: r.submittedDateTime ?? new Date().toISOString(),
        raw: r as unknown as Record<string, unknown>,
      })
      newReviews++
    }
  }

  // Pull yesterday's snapshot to compute cumulative installs_total —
  // Partner Center's day rows are already deltas, so we sum them onto
  // whatever we had stored previously.
  const yesterday = isoDaysAgo(1)
  const prev = await sb<{ installs_total: number | null }[]>(
    env,
    `metric_snapshots?app_id=eq.${app.id}&source=eq.ms-store&date=eq.${yesterday}&select=installs_total`,
  )
  const prevTotal = prev && prev.length > 0 ? (prev[0].installs_total ?? 0) : 0

  await upsertSnapshot(env, {
    app_id: app.id,
    source: 'ms-store',
    date: today,
    installs_total: prevTotal + installsToday,
    installs_delta: installsToday,
    active_users: null,                       // /applicationusage endpoint'ine PR-3'te bağlanır
    rating_avg: ratingAvg,
    rating_count: ratingCount,
    meta: { acqOk, newReviewsToday: newReviews },
  })

  return {
    source: 'ms-store',
    appSlug: app.slug,
    ok: acqOk,
    installs: prevTotal + installsToday,
    detail: acqOk ? `+${installsToday} today, ${newReviews} reviews scanned` : 'partial',
  }
}

/** Microsoft Entra ID client-credentials grant. Tokens last ~1h, but we
 *  re-mint on every cron run because cron is once a day — caching saves
 *  nothing meaningful and adds storage complexity. */
async function msAccessToken(env: Env): Promise<string | null> {
  const r = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.MS_CLIENT_ID!,
      client_secret: env.MS_CLIENT_SECRET!,
      scope: 'https://manage.devcenter.microsoft.com/.default',
    }),
  })
  if (!r.ok) return null
  const data = (await r.json()) as { access_token?: string }
  return data.access_token ?? null
}

/* ---------- Google Play ---------- */

interface PlayServiceAccount {
  client_email: string
  private_key: string
  token_uri: string
}

interface PlayReviewsResponse {
  reviews?: Array<{
    reviewId: string
    authorName?: string
    comments?: Array<{
      userComment?: {
        text?: string
        starRating?: number
        reviewerLanguage?: string
        lastModified?: { seconds: string }
      }
    }>
  }>
}

interface PlayMetricResponse {
  rows?: Array<{
    aggregationPeriod: { startTime: string; endTime: string }
    metrics: Record<string, { decimalValue?: { value?: string }; integerValue?: string }>
  }>
}

/**
 * Google Play Developer Reporting API + Reviews API.
 *
 * Auth: service account JSON → self-signed JWT → OAuth 2.0 access token.
 * No external library needed; we build the JWT manually with the Web
 * Crypto API (Cloudflare Workers expose `crypto.subtle`).
 *
 * Endpoints used:
 *   • playdeveloperreporting.googleapis.com/v1beta1/apps/{pkg}/...
 *       cumulativeUserMetricSet:query        → active devices, ratings
 *       installsMetricSet:query              → daily install delta
 *   • androidpublisher.googleapis.com/androidpublisher/v3/applications/{pkg}/reviews
 *       Last 7 days of reviews (Play API window).
 *
 * Skips silently when the secret or play_package_name is missing.
 */
async function pullPlay(env: Env, app: AppRow): Promise<SourceResult> {
  if (!env.PLAY_SERVICE_ACCOUNT_JSON_B64) {
    return { source: 'play', appSlug: app.slug, ok: false, detail: 'PLAY_SERVICE_ACCOUNT_JSON_B64 not set' }
  }
  if (!app.play_package_name) {
    return { source: 'play', appSlug: app.slug, ok: false, detail: 'no play_package_name' }
  }

  let sa: PlayServiceAccount
  try {
    const json = atob(env.PLAY_SERVICE_ACCOUNT_JSON_B64)
    sa = JSON.parse(json) as PlayServiceAccount
  } catch {
    return { source: 'play', appSlug: app.slug, ok: false, detail: 'service account JSON parse failed' }
  }

  const token = await mintGoogleAccessToken(sa, [
    'https://www.googleapis.com/auth/playdeveloperreporting',
    'https://www.googleapis.com/auth/androidpublisher',
  ])
  if (!token) {
    return { source: 'play', appSlug: app.slug, ok: false, detail: 'token mint failed' }
  }

  const today = isoDaysAgo(0)
  const yesterdayDate = isoDaysAgo(1)
  const pkg = encodeURIComponent(app.play_package_name)
  const headers = { Authorization: `Bearer ${token}` }

  // — Reviews (last 7 days; Play API doesn't expose older)
  let reviewCount = 0
  try {
    const rRes = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/reviews?maxResults=100`,
      { headers },
    )
    if (rRes.ok) {
      const data = (await rRes.json()) as PlayReviewsResponse
      for (const review of data.reviews ?? []) {
        const last = review.comments?.[review.comments.length - 1]?.userComment
        if (!last) continue
        const ts = last.lastModified?.seconds
          ? new Date(Number(last.lastModified.seconds) * 1000).toISOString()
          : new Date().toISOString()
        await upsertReview(env, {
          app_id: app.id,
          source: 'play',
          external_id: review.reviewId,
          author: review.authorName ?? null,
          rating: last.starRating ?? null,
          body: last.text ?? null,
          language: last.reviewerLanguage ?? null,
          created_at: ts,
          raw: review as unknown as Record<string, unknown>,
        })
        reviewCount++
      }
    }
  } catch {
    /* swallow — reviews failure shouldn't block install metrics */
  }

  // — Cumulative active devices + rating averages
  let activeDevices: number | null = null
  let ratingAvg: number | null = null
  let ratingCount: number | null = null
  try {
    const mRes = await fetch(
      `https://playdeveloperreporting.googleapis.com/v1beta1/apps/${pkg}/cumulativeUserMetricSet:query`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimensions: [],
          metrics: ['activeDevices', 'rating', 'ratingsCount'],
          timelineSpec: {
            aggregationPeriod: 'DAILY',
            startTime: { year: Number(yesterdayDate.slice(0, 4)), month: Number(yesterdayDate.slice(5, 7)), day: Number(yesterdayDate.slice(8, 10)) },
            endTime: { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), day: Number(today.slice(8, 10)) },
          },
        }),
      },
    )
    if (mRes.ok) {
      const data = (await mRes.json()) as PlayMetricResponse
      const latest = data.rows?.[data.rows.length - 1]
      if (latest) {
        activeDevices = parseMetric(latest.metrics?.activeDevices)
        ratingAvg = parseMetric(latest.metrics?.rating)
        ratingCount = parseMetric(latest.metrics?.ratingsCount)
      }
    }
  } catch {
    /* metric pull failed — leave nulls, don't blow up */
  }

  // — Today's install delta
  let installsToday: number | null = null
  try {
    const iRes = await fetch(
      `https://playdeveloperreporting.googleapis.com/v1beta1/apps/${pkg}/installsMetricSet:query`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimensions: [],
          metrics: ['installsCount'],
          timelineSpec: {
            aggregationPeriod: 'DAILY',
            startTime: { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), day: Number(today.slice(8, 10)) },
            endTime: { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), day: Number(today.slice(8, 10)) },
          },
        }),
      },
    )
    if (iRes.ok) {
      const data = (await iRes.json()) as PlayMetricResponse
      installsToday = parseMetric(data.rows?.[0]?.metrics?.installsCount)
    }
  } catch {
    /* installs pull failed */
  }

  // installs_total: yesterday's snapshot + today's delta. If neither
  // exists yet (first run), just store today's delta as the total.
  const prev = await sb<{ installs_total: number | null }[]>(
    env,
    `metric_snapshots?app_id=eq.${app.id}&source=eq.play&date=eq.${yesterdayDate}&select=installs_total`,
  )
  const prevTotal = prev && prev.length > 0 ? (prev[0].installs_total ?? 0) : 0
  const installsTotal = installsToday != null ? prevTotal + installsToday : prevTotal

  await upsertSnapshot(env, {
    app_id: app.id,
    source: 'play',
    date: today,
    installs_total: installsTotal,
    installs_delta: installsToday,
    active_users: activeDevices,
    rating_avg: ratingAvg,
    rating_count: ratingCount,
    meta: { newReviewsToday: reviewCount },
  })

  return {
    source: 'play',
    appSlug: app.slug,
    ok: true,
    installs: installsTotal,
    detail: `+${installsToday ?? 0} today, ${reviewCount} reviews scanned`,
  }
}

function parseMetric(metric: { decimalValue?: { value?: string }; integerValue?: string } | undefined): number | null {
  if (!metric) return null
  if (metric.integerValue) return Number(metric.integerValue)
  if (metric.decimalValue?.value) return Number(metric.decimalValue.value)
  return null
}

/** Build a Google OAuth 2.0 access token from a service-account JSON.
 *  Flow:
 *    1. Build JWT header + claim set (1h expiry).
 *    2. Sign with the SA's RSA private key via Web Crypto API.
 *    3. POST to token_uri with assertion → access token.
 *  Notes:
 *    • Cloudflare Workers don't have node:crypto; we use crypto.subtle.
 *    • PKCS#8 PEM in the SA JSON requires base64 → ArrayBuffer transform. */
async function mintGoogleAccessToken(sa: PlayServiceAccount, scopes: string[]): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  const header = btoaUrl(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = btoaUrl(
    JSON.stringify({
      iss: sa.client_email,
      scope: scopes.join(' '),
      aud: sa.token_uri,
      exp: now + 3600,
      iat: now,
    }),
  )
  const toSign = `${header}.${claim}`

  const keyBuffer = pemToArrayBuffer(sa.private_key)
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign))
  const assertion = `${toSign}.${arrayBufferToB64Url(sig)}`

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { access_token?: string }
  return data.access_token ?? null
}

function btoaUrl(s: string): string {
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function arrayBufferToB64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoaUrl(bin)
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/[\r\n\s]/g, '')
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i)
  return buf
}

/* ---------- Cloudflare Workers Analytics ---------- */

interface WorkersAnalyticsResponse {
  data?: {
    viewer?: {
      accounts?: Array<{
        workersInvocationsAdaptive?: Array<{
          sum?: { requests?: number; subrequests?: number }
          uniq?: { uniques?: number }
          dimensions?: { date: string; scriptName: string }
        }>
      }>
    }
  }
  errors?: Array<{ message: string }>
}

/**
 * Pulls per-day request counts for every Cloudflare Worker on the
 * account. We only run this on the seed Snipotter Desktop app row
 * (it acts as the umbrella for the marketing + web app metrics)
 * because GraphQL Analytics is account-scoped, not app-scoped.
 *
 * The meta payload breaks the totals down by worker name so the admin
 * can see "snipotter-landing: 12k, snipotter-web: 4k, snipotter-admin:
 * 130" individually. Future Snipotter #2 worker simply shows up as
 * another row in the breakdown.
 *
 * For per-zone HTTP analytics (real "page views" / "unique visitors"),
 * Cloudflare splits zones from Workers in the GraphQL schema. We pull
 * `httpRequests1dGroups` for the snipotter.com zone here too if a zone
 * tag is supplied.
 */
async function pullCloudflare(env: Env, app: AppRow): Promise<SourceResult> {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    return { source: 'cloudflare', appSlug: app.slug, ok: false, detail: 'CF analytics secrets not set' }
  }
  // Only run for the umbrella app — repeating this query for every app
  // would double the API spend with no extra information.
  if (app.slug !== 'snipotter-desktop') {
    return { source: 'cloudflare', appSlug: app.slug, ok: false, detail: 'umbrella-only' }
  }

  const today = isoDaysAgo(0)
  const yesterday = isoDaysAgo(1)
  const sevenDaysAgo = isoDaysAgo(7)

  const query = `
    query Snipotter($accountTag: String!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 1000
            filter: { date_geq: $start, date_leq: $end }
            orderBy: [date_DESC]
          ) {
            sum { requests subrequests }
            uniq { uniques }
            dimensions { date scriptName }
          }
        }
      }
    }
  `

  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        accountTag: env.CLOUDFLARE_ACCOUNT_ID,
        start: sevenDaysAgo,
        end: today,
      },
    }),
  })

  if (!r.ok) {
    return { source: 'cloudflare', appSlug: app.slug, ok: false, detail: `cf graphql ${r.status}` }
  }
  const data = (await r.json()) as WorkersAnalyticsResponse
  if (data.errors && data.errors.length > 0) {
    return { source: 'cloudflare', appSlug: app.slug, ok: false, detail: data.errors[0].message }
  }

  const rows = data.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? []
  // Sum today's requests + per-script breakdown
  let totalToday = 0
  let totalYesterday = 0
  const byScriptToday: Record<string, number> = {}
  for (const row of rows) {
    const d = row.dimensions?.date
    const reqs = row.sum?.requests ?? 0
    const script = row.dimensions?.scriptName ?? 'unknown'
    if (d === today) {
      totalToday += reqs
      byScriptToday[script] = (byScriptToday[script] ?? 0) + reqs
    } else if (d === yesterday) {
      totalYesterday += reqs
    }
  }

  await upsertSnapshot(env, {
    app_id: app.id,
    source: 'cloudflare',
    date: today,
    installs_total: null,
    installs_delta: null,
    active_users: totalToday,                // request count proxy for "activity"
    rating_avg: null,
    rating_count: null,
    meta: {
      todayRequests: totalToday,
      yesterdayRequests: totalYesterday,
      byScriptToday,
      windowDays: 7,
    },
  })

  return {
    source: 'cloudflare',
    appSlug: app.slug,
    ok: true,
    detail: `${totalToday.toLocaleString()} requests today across ${Object.keys(byScriptToday).length} workers`,
  }
}

interface ReviewInsert {
  app_id: string
  source: Source
  external_id: string
  author: string | null
  rating: number | null
  body: string | null
  language: string | null
  created_at: string
  raw: Record<string, unknown>
}

/** Idempotent review upsert. Conflict key matches the table PK so a
 *  re-pull of the same review just refreshes the raw + fetched_at. */
async function upsertReview(env: Env, row: ReviewInsert): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/reviews?on_conflict=app_id,source,external_id`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([{ ...row, fetched_at: new Date().toISOString() }]),
  })
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
