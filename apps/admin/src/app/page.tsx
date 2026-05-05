'use client'
import { useEffect, useState } from 'react'
import {
  Store,
  Smartphone,
  Github,
  Globe,
  HardDrive,
  Star,
  Activity,
  Users,
  Loader2,
  Download,
  CalendarDays,
} from 'lucide-react'
import Link from 'next/link'
import { Layout } from '@/components/Layout'
import { MetricCard, PanelCard } from '@/components/Card'
import { listApps, latestPerSource, dauWauMau, activeInstallCount } from '@/lib/api'
import type { AppRow, MetricSnapshot, Source } from '@/lib/types'
import { formatCount, formatDelta, formatRating } from '@/lib/utils'

interface AppSummary {
  app: AppRow
  perSource: Partial<Record<Source, MetricSnapshot | null>>
  active: number
  dauWauMau: { dau: number; wau: number; mau: number }
}

/**
 * Overview — single pane of glass. For each tracked app we surface:
 *   • total active install estimate (heartbeats)
 *   • DAU / WAU / MAU
 *   • latest snapshot per source
 * Sources without data yet (Microsoft Store key missing, Android not
 * published) render in a faded "—" state with a hint about what's
 * needed to unlock them, rather than disappearing — that way the
 * operator always sees the full ecosystem at a glance.
 */
export default function OverviewPage(): JSX.Element {
  const [summaries, setSummaries] = useState<AppSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const apps = await listApps()
        const result: AppSummary[] = await Promise.all(
          apps.map(async (app) => {
            const [perSource, active, dwm] = await Promise.all([
              latestPerSource(app.id),
              activeInstallCount(app.id, 14),
              dauWauMau(app.id),
            ])
            return { app, perSource, active, dauWauMau: dwm }
          }),
        )
        if (!cancelled) setSummaries(result)
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
        <h1 className="text-2xl font-bold tracking-tight">Genel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tüm uygulamaların, tüm platformların — tek sayfada.
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

      {loaded && summaries.length === 0 && !err && (
        <PanelCard
          title="Henüz veri yok"
          description="Cron worker daha çalışmadı veya API kimlik bilgileri eklenmedi."
        >
          <p className="text-sm text-muted-foreground">
            Geliştirme süreci için:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Supabase migration <code className="rounded bg-card px-1.5 py-0.5">0006_admin_dashboard.sql</code> uygulandığını doğrula.
            </li>
            <li>
              Cloudflare cron worker'ı dağıt: <code className="rounded bg-card px-1.5 py-0.5">workers/cron</code>.
            </li>
            <li>
              Heartbeat endpoint'i Electron uygulamasıyla bağla.
            </li>
          </ol>
        </PanelCard>
      )}

      {loaded &&
        summaries.map(({ app, perSource, active, dauWauMau }) => (
          <section key={app.id} className="mb-12">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-lg font-semibold">{app.displayName}</h2>
                <p className="text-xs text-muted-foreground">
                  {[
                    app.msStoreId && 'Microsoft Store',
                    app.playPackageName && 'Google Play',
                    app.githubOwner && `${app.githubOwner}/${app.githubRepo}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Link
                href="/apps/"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Düzenle →
              </Link>
            </div>

            {/* Top row — heartbeat-derived (always available) */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="Aktif kurulum"
                value={formatCount(active)}
                hint="Son 14 gün"
                icon={<HardDrive className="h-4 w-4" />}
                emphasis="strong"
                pending={active === 0}
              />
              <MetricCard
                label="Bugün aktif"
                value={formatCount(dauWauMau.dau)}
                hint="DAU"
                icon={<Activity className="h-4 w-4" />}
                pending={dauWauMau.dau === 0}
              />
              <MetricCard
                label="Hafta içinde"
                value={formatCount(dauWauMau.wau)}
                hint="WAU"
                icon={<Users className="h-4 w-4" />}
                pending={dauWauMau.wau === 0}
              />
              <MetricCard
                label="Ay içinde"
                value={formatCount(dauWauMau.mau)}
                hint="MAU"
                icon={<CalendarDays className="h-4 w-4" />}
                pending={dauWauMau.mau === 0}
              />
            </div>

            {/* Per-source row — every platform shows up even when empty,
                so the operator never wonders "where's the Microsoft
                Store data?". */}
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SourceCard
                label="Microsoft Store"
                href="/microsoft/"
                icon={<Store className="h-4 w-4" />}
                snap={perSource['ms-store']}
                missingHint={app.msStoreId ? 'Cron API anahtarı bekleniyor' : 'Mağaza bağlantısı yok'}
              />
              <SourceCard
                label="Google Play"
                href="/google-play/"
                icon={<Smartphone className="h-4 w-4" />}
                snap={perSource['play']}
                missingHint={app.playPackageName ? 'Yayınlanmayı bekliyor' : 'Mağaza bağlantısı yok'}
              />
              <SourceCard
                label="GitHub Releases"
                href="/github/"
                icon={<Github className="h-4 w-4" />}
                snap={perSource['github']}
                missingHint="Cron worker bekleniyor"
              />
              <SourceCard
                label="app.snipotter.com"
                href="/web/"
                icon={<Globe className="h-4 w-4" />}
                snap={perSource['web']}
                missingHint="Cron worker bekleniyor"
              />
            </div>
          </section>
        ))}
    </Layout>
  )
}

function SourceCard({
  label,
  href,
  icon,
  snap,
  missingHint,
}: {
  label: string
  href: string
  icon: React.ReactNode
  snap: MetricSnapshot | null | undefined
  missingHint: string
}): JSX.Element {
  const hasData = !!snap && (snap.installsTotal != null || snap.ratingCount != null)
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-border bg-card/40 p-5 transition hover:border-primary/40 hover:bg-card/60"
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium">
          {icon}
          {label}
        </span>
        <span className="opacity-0 transition group-hover:opacity-100">→</span>
      </div>
      {hasData && snap ? (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {formatCount(snap.installsTotal)}
            </span>
            <span className="text-[11px] text-muted-foreground">indirme</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            {snap.installsDelta != null && (
              <span className="inline-flex items-center gap-1">
                <Download className="h-3 w-3" />
                {formatDelta(snap.installsDelta)} bugün
              </span>
            )}
            {snap.ratingAvg != null && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 text-yellow-400" />
                {formatRating(snap.ratingAvg, snap.ratingCount)}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="mt-3">
          <div className="text-2xl font-bold text-muted-foreground/40">—</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{missingHint}</div>
        </div>
      )}
    </Link>
  )
}
