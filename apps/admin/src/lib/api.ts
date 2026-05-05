import { getSupabase } from './supabase'
import type { AppRow, MetricSnapshot, Review, Source } from './types'

interface AppDbRow {
  id: string
  slug: string
  display_name: string
  ms_store_id: string | null
  play_package_name: string | null
  appstore_id: string | null
  github_owner: string | null
  github_repo: string | null
  is_active: boolean
  created_at: string
}
interface SnapshotDbRow {
  app_id: string
  source: Source
  date: string
  installs_total: number | null
  installs_delta: number | null
  active_users: number | null
  rating_avg: number | null
  rating_count: number | null
  meta: Record<string, unknown>
  fetched_at: string
}
interface ReviewDbRow {
  app_id: string
  source: Source
  external_id: string
  author: string | null
  rating: number | null
  body: string | null
  language: string | null
  created_at: string
  replied: boolean
  reply_body: string | null
  reply_at: string | null
  raw: Record<string, unknown>
  fetched_at: string
}

function appFromRow(r: AppDbRow): AppRow {
  return {
    id: r.id,
    slug: r.slug,
    displayName: r.display_name,
    msStoreId: r.ms_store_id,
    playPackageName: r.play_package_name,
    appstoreId: r.appstore_id,
    githubOwner: r.github_owner,
    githubRepo: r.github_repo,
    isActive: r.is_active,
    createdAt: r.created_at,
  }
}
function snapshotFromRow(r: SnapshotDbRow): MetricSnapshot {
  return {
    appId: r.app_id,
    source: r.source,
    date: r.date,
    installsTotal: r.installs_total,
    installsDelta: r.installs_delta,
    activeUsers: r.active_users,
    ratingAvg: r.rating_avg,
    ratingCount: r.rating_count,
    meta: r.meta,
    fetchedAt: r.fetched_at,
  }
}
function reviewFromRow(r: ReviewDbRow): Review {
  return {
    appId: r.app_id,
    source: r.source,
    externalId: r.external_id,
    author: r.author,
    rating: r.rating,
    body: r.body,
    language: r.language,
    createdAt: r.created_at,
    replied: r.replied,
    replyBody: r.reply_body,
    replyAt: r.reply_at,
    raw: r.raw,
    fetchedAt: r.fetched_at,
  }
}

export async function listApps(): Promise<AppRow[]> {
  const { data, error } = await getSupabase()
    .from('apps')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as AppDbRow[]).map(appFromRow)
}

export async function listSnapshots(
  appId: string,
  source?: Source,
  days = 30,
): Promise<MetricSnapshot[]> {
  let q = getSupabase()
    .from('metric_snapshots')
    .select('*')
    .eq('app_id', appId)
    .gte('date', isoDaysAgo(days))
    .order('date', { ascending: true })
  if (source) q = q.eq('source', source)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as SnapshotDbRow[]).map(snapshotFromRow)
}

/** Latest snapshot per source. Useful for the overview page where you
 *  want one number per platform without scanning history. */
export async function latestPerSource(appId: string): Promise<Record<Source, MetricSnapshot | null>> {
  const { data, error } = await getSupabase()
    .from('metric_snapshots')
    .select('*')
    .eq('app_id', appId)
    .order('date', { ascending: false })
    .limit(200)
  if (error) throw error
  const out: Record<string, MetricSnapshot | null> = {}
  for (const row of (data ?? []) as SnapshotDbRow[]) {
    if (!out[row.source]) out[row.source] = snapshotFromRow(row)
  }
  return out as Record<Source, MetricSnapshot | null>
}

export async function listReviews(
  appId: string,
  opts: { unreplied?: boolean; limit?: number } = {},
): Promise<Review[]> {
  let q = getSupabase()
    .from('reviews')
    .select('*')
    .eq('app_id', appId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)
  if (opts.unreplied) q = q.eq('replied', false)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as ReviewDbRow[]).map(reviewFromRow)
}

/** Active install count derived from heartbeats. A device counts as
 *  "active" if we've seen a heartbeat from it in the last `windowDays`
 *  days (default 14 — captures weekend-only users without keeping
 *  ghosts forever). */
export async function activeInstallCount(appId: string, windowDays = 14): Promise<number> {
  const { count, error } = await getSupabase()
    .from('heartbeats')
    .select('device_id', { head: true, count: 'exact' })
    .eq('app_id', appId)
    .gte('last_seen_at', new Date(Date.now() - windowDays * 86400_000).toISOString())
  if (error) throw error
  return count ?? 0
}

/** DAU / WAU / MAU rolled into one round-trip. */
export async function dauWauMau(appId: string): Promise<{ dau: number; wau: number; mau: number }> {
  const today = isoDaysAgo(0)
  const sevenAgo = isoDaysAgo(6)
  const thirtyAgo = isoDaysAgo(29)
  const sb = getSupabase()
  const [dauRes, wauRes, mauRes] = await Promise.all([
    sb
      .from('heartbeats')
      .select('device_id', { head: true, count: 'exact' })
      .eq('app_id', appId)
      .eq('date', today),
    sb
      .from('heartbeats')
      .select('device_id', { head: true, count: 'exact' })
      .eq('app_id', appId)
      .gte('date', sevenAgo),
    sb
      .from('heartbeats')
      .select('device_id', { head: true, count: 'exact' })
      .eq('app_id', appId)
      .gte('date', thirtyAgo),
  ])
  return {
    dau: dauRes.count ?? 0,
    wau: wauRes.count ?? 0,
    mau: mauRes.count ?? 0,
  }
}

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
