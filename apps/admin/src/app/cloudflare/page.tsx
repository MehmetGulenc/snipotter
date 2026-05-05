'use client'
import { useEffect, useState } from 'react'
import { Loader2, Cloud, Activity } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { MetricCard, PanelCard } from '@/components/Card'
import { listApps, listSnapshots } from '@/lib/api'
import type { AppRow, MetricSnapshot } from '@/lib/types'
import { formatCount, timeAgo } from '@/lib/utils'

interface ScriptBreakdown {
  name: string
  requests: number
}

export default function CloudflarePage(): JSX.Element {
  const [apps, setApps] = useState<AppRow[]>([])
  const [snaps, setSnaps] = useState<Record<string, MetricSnapshot[]>>({})
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
            map[a.id] = await listSnapshots(a.id, 'cloudflare', 30)
          }),
        )
        if (!cancelled) {
          setApps(list)
          setSnaps(map)
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
  }, [])

  const umbrella = apps.find((a) => a.slug === 'snipotter-desktop')
  const umbrellaSnaps = umbrella ? snaps[umbrella.id] ?? [] : []
  const latest = umbrellaSnaps[umbrellaSnaps.length - 1]
  const byScript = (latest?.meta?.byScriptToday as Record<string, number> | undefined) ?? {}
  const breakdown: ScriptBreakdown[] = Object.entries(byScript)
    .map(([name, requests]) => ({ name, requests }))
    .sort((a, b) => b.requests - a.requests)
  const total = breakdown.reduce((sum, b) => sum + b.requests, 0) || (latest?.activeUsers ?? 0)

  return (
    <Layout>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Cloudflare</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Worker request count'ları — snipotter-landing, snipotter-web, snipotter-admin, snipotter-heartbeat,
          snipotter-cron. GraphQL Analytics API üzerinden günlük çekiliyor.
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

      {loaded && (!latest || total === 0) && !err && (
        <PanelCard
          title="Henüz veri yok"
          description="Cloudflare API token + account ID secret'ları henüz eklenmedi."
        >
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Cloudflare dashboard → My Profile → API Tokens → Create Token →{' '}
              <em>"Read Analytics"</em> şablonu (account-level Analytics:Read iznini ver).
            </li>
            <li>
              Token'ı oluşturduktan sonra cron worker'a ekle:{' '}
              <code className="rounded bg-card px-1.5 py-0.5">npx wrangler secret put CLOUDFLARE_API_TOKEN</code>.
            </li>
            <li>
              Account ID için: dashboard → sağ alt köşedeki "Account ID" satırı →{' '}
              <code className="rounded bg-card px-1.5 py-0.5">npx wrangler secret put CLOUDFLARE_ACCOUNT_ID</code>.
            </li>
            <li>
              Cron worker'ı yeniden dağıt veya manuel tetikle:{' '}
              <code className="rounded bg-card px-1.5 py-0.5">/run?source=cloudflare&secret=...</code>
            </li>
          </ol>
        </PanelCard>
      )}

      {loaded && latest && total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Bugün toplam istek"
              value={formatCount(total)}
              hint={`Son güncelleme: ${timeAgo(latest.fetchedAt)}`}
              icon={<Activity className="h-4 w-4" />}
              emphasis="strong"
            />
            <MetricCard
              label="Worker sayısı"
              value={breakdown.length}
              hint="aktif script"
              icon={<Cloud className="h-4 w-4" />}
            />
            <MetricCard
              label="Dünkü toplam"
              value={formatCount((latest.meta?.yesterdayRequests as number | undefined) ?? null)}
              hint="dün istek"
            />
            <MetricCard
              label="7 günlük pencere"
              value={(latest.meta?.windowDays as number | undefined) ?? 7}
              hint="gün"
            />
          </div>

          <PanelCard
            title="Worker dağılımı"
            description="Bugünkü request'lerin script bazında kırılımı"
          >
            <ul className="space-y-2">
              {breakdown.map((b) => {
                const pct = total > 0 ? (b.requests / total) * 100 : 0
                return (
                  <li key={b.name} className="flex items-center gap-3 text-sm">
                    <span className="w-44 truncate font-mono text-[12px]">{b.name}</span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-card/60">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-fuchsia-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-16 text-right tabular-nums">{formatCount(b.requests)}</span>
                  </li>
                )
              })}
            </ul>
          </PanelCard>
        </>
      )}
    </Layout>
  )
}
