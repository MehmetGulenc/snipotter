'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Layout } from './Layout'
import { MetricCard, PanelCard } from './Card'
import { listApps, listSnapshots } from '@/lib/api'
import type { AppRow, MetricSnapshot, Source } from '@/lib/types'
import { formatCount, formatDelta, formatRating, timeAgo } from '@/lib/utils'

/**
 * Reusable per-source page. Pulls the last 30 days of snapshots for
 * each tracked app and renders three things:
 *   1. A "today's headline" tile per app (latest values).
 *   2. A 30-day grid showing daily installs / DAU / rating count.
 *   3. A "setup needed" banner whenever the cron hasn't pulled yet
 *      so the operator knows it's not a bug, just a missing wiring.
 *
 * The actual source-specific copy (title, description, what unlocks
 * it) is passed as props so the per-source page files stay tiny.
 */
interface SourcePageProps {
  source: Source
  title: string
  description: string
  /** Markdown-style steps to wire up this source if no data exists yet. */
  setupSteps: string[]
}

export function SourcePage({ source, title, description, setupSteps }: SourcePageProps): JSX.Element {
  const [apps, setApps] = useState<AppRow[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, MetricSnapshot[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listApps()
        const map: Record<string, MetricSnapshot[]> = {}
        await Promise.all(
          list.map(async (a) => {
            map[a.id] = await listSnapshots(a.id, source, 30)
          }),
        )
        if (!cancelled) {
          setApps(list)
          setSnapshots(map)
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source])

  const anyData = Object.values(snapshots).some((arr) => arr.length > 0)

  return (
    <Layout>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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

      {loaded && !anyData && (
        <PanelCard
          title="Veri yok — kurulum gerekiyor"
          description="Bu kaynak için bir defaya mahsus yapılandırma yapılmadı."
        >
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            {setupSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </PanelCard>
      )}

      {loaded &&
        anyData &&
        apps.map((app) => {
          const snaps = snapshots[app.id] ?? []
          if (snaps.length === 0) return null
          const latest = snaps[snaps.length - 1]
          return (
            <section key={app.id} className="mb-10">
              <h2 className="mb-3 text-base font-semibold">{app.displayName}</h2>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard
                  label="Toplam indirme"
                  value={formatCount(latest.installsTotal)}
                  hint={`Son güncelleme: ${timeAgo(latest.fetchedAt)}`}
                  emphasis="strong"
                />
                <MetricCard
                  label="Bugün"
                  value={formatDelta(latest.installsDelta)}
                  hint="yeni indirme"
                />
                <MetricCard
                  label="Aktif"
                  value={formatCount(latest.activeUsers)}
                  hint="cihaz / oturum"
                />
                <MetricCard
                  label="Ortalama"
                  value={formatRating(latest.ratingAvg, latest.ratingCount)}
                  hint="yıldız & yorum"
                />
              </div>

              {/* 30-day mini history table — readable on mobile by virtue
                  of being a list, no horizontal scroll. */}
              <PanelCard
                title="Son 30 gün"
                description="Her gün için cron'un çektiği özet."
                action={
                  <span className="text-[11px] text-muted-foreground">
                    {snaps.length} kayıt
                  </span>
                }
              >
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2">Tarih</th>
                        <th className="px-2 py-2 text-right">Toplam</th>
                        <th className="px-2 py-2 text-right">Δ</th>
                        <th className="px-2 py-2 text-right">Aktif</th>
                        <th className="px-5 py-2 text-right">Yıldız</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...snaps].reverse().map((s) => (
                        <tr
                          key={s.date}
                          className="border-t border-border/40 text-muted-foreground hover:bg-card/40 hover:text-foreground"
                        >
                          <td className="px-5 py-2 font-mono text-[12px]">{s.date}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatCount(s.installsTotal)}
                          </td>
                          <td
                            className={
                              'px-2 py-2 text-right tabular-nums ' +
                              ((s.installsDelta ?? 0) > 0 ? 'text-emerald-400' : '')
                            }
                          >
                            {formatDelta(s.installsDelta)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatCount(s.activeUsers)}
                          </td>
                          <td className="px-5 py-2 text-right tabular-nums">
                            {formatRating(s.ratingAvg, s.ratingCount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PanelCard>
            </section>
          )
        })}
    </Layout>
  )
}
