'use client'
import { useEffect, useState } from 'react'
import { Loader2, HardDrive, Activity, Users, CalendarDays } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { MetricCard, PanelCard } from '@/components/Card'
import { listApps, dauWauMau, activeInstallCount } from '@/lib/api'
import { getSupabase } from '@/lib/supabase'
import type { AppRow } from '@/lib/types'
import { formatCount, timeAgo } from '@/lib/utils'

interface PlatformBreakdown {
  platform: string
  devices: number
}
interface VersionBreakdown {
  version: string
  devices: number
}
interface AppDesktopStats {
  app: AppRow
  active: number
  dau: number
  wau: number
  mau: number
  byPlatform: PlatformBreakdown[]
  byVersion: VersionBreakdown[]
  lastSeenAt: string | null
}

/**
 * Aktif kurulum sayısını, DAU/WAU/MAU'yu ve platform/sürüm dağılımını
 * Supabase heartbeats tablosundan canlı çıkarıyor. Her açılan Electron
 * (veya Capacitor Android) uygulaması /heartbeat'e POST attığı için bu
 * sayfa bir mağaza onayı bekleyen veriden farklı olarak hep günceldir.
 */
export default function DesktopPage(): JSX.Element {
  const [rows, setRows] = useState<AppDesktopStats[]>([])
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const apps = await listApps()
        const sb = getSupabase()
        const fourteenAgo = new Date(Date.now() - 14 * 86400_000).toISOString()

        const stats = await Promise.all(
          apps.map(async (app): Promise<AppDesktopStats> => {
            const [active, dwm, recentDevices] = await Promise.all([
              activeInstallCount(app.id, 14),
              dauWauMau(app.id),
              // Pull recent device rows so we can group by platform and
              // version locally (cheaper than running an aggregate).
              sb
                .from('heartbeats')
                .select('device_id, platform, version, last_seen_at')
                .eq('app_id', app.id)
                .gte('last_seen_at', fourteenAgo)
                .order('last_seen_at', { ascending: false })
                .limit(2000),
            ])

            const seen = new Set<string>()
            const byPlatform = new Map<string, number>()
            const byVersion = new Map<string, number>()
            let lastSeenAt: string | null = null
            for (const row of (recentDevices.data ?? []) as {
              device_id: string
              platform: string | null
              version: string | null
              last_seen_at: string
            }[]) {
              if (!lastSeenAt) lastSeenAt = row.last_seen_at
              if (seen.has(row.device_id)) continue
              seen.add(row.device_id)
              const p = row.platform ?? 'unknown'
              const v = row.version ?? 'unknown'
              byPlatform.set(p, (byPlatform.get(p) ?? 0) + 1)
              byVersion.set(v, (byVersion.get(v) ?? 0) + 1)
            }

            return {
              app,
              active,
              dau: dwm.dau,
              wau: dwm.wau,
              mau: dwm.mau,
              byPlatform: Array.from(byPlatform, ([platform, devices]) => ({ platform, devices })).sort(
                (a, b) => b.devices - a.devices,
              ),
              byVersion: Array.from(byVersion, ([version, devices]) => ({ version, devices })).sort(
                (a, b) => b.devices - a.devices,
              ),
              lastSeenAt,
            }
          }),
        )

        if (!cancelled) setRows(stats)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Layout>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Aktif kurulumlar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Electron / Capacitor uygulamasının her açılışında /heartbeat'e attığı anonim sinyaller.
        </p>
      </header>

      {!loaded && (
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Yükleme hatası: {err}
        </div>
      )}

      {loaded && rows.every((r) => r.active === 0) && (
        <PanelCard
          title="Heartbeat henüz yok"
          description="Cloudflare worker dağıtılmamış veya Electron uygulaması güncellenmemiş olabilir."
        >
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <code className="rounded bg-card px-1.5 py-0.5">workers/heartbeat</code> klasöründeki Cloudflare Worker'ı dağıt.
            </li>
            <li>
              Electron <code className="rounded bg-card px-1.5 py-0.5">electron/main/telemetry.ts</code> modülü ekleyip ilk çalıştırmada{' '}
              <code className="rounded bg-card px-1.5 py-0.5">https://api.snipotter.com/heartbeat</code>'e POST atmasını sağla.
            </li>
            <li>
              Yeni Snipotter Desktop sürümü yayınla; auto-updater alan kullanıcılar 24 saatte heartbeat atmaya başlar.
            </li>
          </ol>
        </PanelCard>
      )}

      {loaded &&
        rows.map((r) => {
          if (r.active === 0) return null
          return (
            <section key={r.app.id} className="mb-10">
              <h2 className="mb-3 text-base font-semibold">{r.app.displayName}</h2>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard
                  label="Aktif kurulum"
                  value={formatCount(r.active)}
                  hint="Son 14 gün"
                  icon={<HardDrive className="h-4 w-4" />}
                  emphasis="strong"
                />
                <MetricCard
                  label="Bugün"
                  value={formatCount(r.dau)}
                  hint="DAU"
                  icon={<Activity className="h-4 w-4" />}
                />
                <MetricCard
                  label="7 gün"
                  value={formatCount(r.wau)}
                  hint="WAU"
                  icon={<Users className="h-4 w-4" />}
                />
                <MetricCard
                  label="30 gün"
                  value={formatCount(r.mau)}
                  hint="MAU"
                  icon={<CalendarDays className="h-4 w-4" />}
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <PanelCard
                  title="Platform dağılımı"
                  description="Son 14 günde sinyal atan cihazlar."
                >
                  {r.byPlatform.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Veri yok</div>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {r.byPlatform.map((p) => (
                        <BarRow key={p.platform} label={p.platform} value={p.devices} max={r.active} />
                      ))}
                    </ul>
                  )}
                </PanelCard>

                <PanelCard
                  title="Sürüm dağılımı"
                  description="Hangi versiyon hâlâ kullanılıyor?"
                >
                  {r.byVersion.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Veri yok</div>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {r.byVersion.slice(0, 8).map((v) => (
                        <BarRow key={v.version} label={`v${v.version}`} value={v.devices} max={r.active} />
                      ))}
                    </ul>
                  )}
                </PanelCard>
              </div>

              {r.lastSeenAt && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Son sinyal: {timeAgo(r.lastSeenAt)}
                </p>
              )}
            </section>
          )
        })}
    </Layout>
  )
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }): JSX.Element {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <li className="flex items-center gap-3">
      <span className="w-32 truncate font-mono text-[12px] text-muted-foreground">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-card/60">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-fuchsia-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-right tabular-nums text-foreground">{formatCount(value)}</span>
    </li>
  )
}
