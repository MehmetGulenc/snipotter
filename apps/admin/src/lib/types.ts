/**
 * Shared types between the admin dashboard and the cron / heartbeat
 * workers. The schema in supabase/migrations/0006_admin_dashboard.sql
 * is the source of truth; these are TypeScript projections of those
 * tables.
 */

export type Source =
  | 'ms-store'
  | 'play'
  | 'appstore'
  | 'github'
  | 'web'
  | 'cloudflare'
  | 'heartbeat'

export interface AppRow {
  id: string
  slug: string
  displayName: string
  msStoreId: string | null
  playPackageName: string | null
  appstoreId: string | null
  githubOwner: string | null
  githubRepo: string | null
  isActive: boolean
  createdAt: string
}

export interface MetricSnapshot {
  appId: string
  source: Source
  date: string                  // YYYY-MM-DD
  installsTotal: number | null
  installsDelta: number | null
  activeUsers: number | null
  ratingAvg: number | null
  ratingCount: number | null
  meta: Record<string, unknown>
  fetchedAt: string
}

export interface Review {
  appId: string
  source: Source
  externalId: string
  author: string | null
  rating: number | null
  body: string | null
  language: string | null
  createdAt: string
  replied: boolean
  replyBody: string | null
  replyAt: string | null
  raw: Record<string, unknown>
  fetchedAt: string
}

export interface Heartbeat {
  deviceId: string
  date: string                  // YYYY-MM-DD
  appId: string | null
  platform: string | null
  version: string | null
  language: string | null
  firstSeenAt: string
  lastSeenAt: string
}
