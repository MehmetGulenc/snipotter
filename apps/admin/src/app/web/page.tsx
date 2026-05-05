'use client'
import { useEffect, useState } from 'react'
import { Loader2, Globe, KeyRound, Users, FileText, Clipboard } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { MetricCard, PanelCard } from '@/components/Card'
import { getSupabase } from '@/lib/supabase'
import { formatCount } from '@/lib/utils'

interface WebStats {
  workspaces: number
  workspaceMembers: number
  clipboardItems: number
  notes: number
  pairCodesActive: number
  // Workspaces touched in the last 7 / 30 days — proxy for "real users"
  // since updated_at on a workspace ticks whenever a member adds a clip
  // or edits a note via realtime.
  workspacesActive7d: number
  workspacesActive30d: number
}

/**
 * app.snipotter.com'a doğrudan Supabase üzerinden bakar. Workspace =
 * eşleşmiş cihaz grubu; member = cihaz; clipboard_items / notes =
 * paylaşılan içerik. Mağaza analytics'inden bağımsız, bu sayfa her
 * zaman canlı veri verir çünkü Supabase'i admin'in zaten okuma izni var.
 */
export default function WebPage(): JSX.Element {
  const [stats, setStats] = useState<WebStats | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const sb = getSupabase()
        const sevenAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
        const thirtyAgo = new Date(Date.now() - 30 * 86400_000).toISOString()

        const [
          workspaces,
          members,
          clips,
          notes,
          pairs,
          ws7,
          ws30,
        ] = await Promise.all([
          sb.from('workspaces').select('id', { head: true, count: 'exact' }),
          sb.from('workspace_members').select('user_id', { head: true, count: 'exact' }),
          sb.from('clipboard_items').select('id', { head: true, count: 'exact' }),
          sb.from('notes').select('id', { head: true, count: 'exact' }),
          // pair_codes: redeemed=false AND expires_at > now() → still
          // valid. The exact column names depend on your schema; the
          // catch below silently zeros this out if the table differs.
          sb
            .from('pair_codes')
            .select('code', { head: true, count: 'exact' })
            .gt('expires_at', new Date().toISOString())
            .eq('redeemed', false)
            .then(
              (r) => r,
              () => ({ count: 0 }),
            ),
          sb
            .from('clipboard_items')
            .select('workspace_id', { head: true, count: 'exact' })
            .gte('created_at', sevenAgo),
          sb
            .from('clipboard_items')
            .select('workspace_id', { head: true, count: 'exact' })
            .gte('created_at', thirtyAgo),
        ])

        if (cancelled) return
        setStats({
          workspaces: workspaces.count ?? 0,
          workspaceMembers: members.count ?? 0,
          clipboardItems: clips.count ?? 0,
          notes: notes.count ?? 0,
          pairCodesActive: pairs.count ?? 0,
          // These counts are item rows, not distinct workspaces — proxy
          // for "how much activity in window N", not strictly DAU. Good
          // enough as a "is anyone using this?" pulse.
          workspacesActive7d: ws7.count ?? 0,
          workspacesActive30d: ws30.count ?? 0,
        })
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
        <h1 className="text-2xl font-bold tracking-tight">Web uygulaması</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          app.snipotter.com — Supabase üzerinden anlık.
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

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Workspace"
              value={formatCount(stats.workspaces)}
              hint="eşleşmiş cihaz grubu"
              icon={<Globe className="h-4 w-4" />}
              emphasis="strong"
            />
            <MetricCard
              label="Cihaz"
              value={formatCount(stats.workspaceMembers)}
              hint="workspace üyeliği"
              icon={<Users className="h-4 w-4" />}
            />
            <MetricCard
              label="Pano öğesi"
              value={formatCount(stats.clipboardItems)}
              hint="toplam kopya"
              icon={<Clipboard className="h-4 w-4" />}
            />
            <MetricCard
              label="Not"
              value={formatCount(stats.notes)}
              hint="kullanıcı notu"
              icon={<FileText className="h-4 w-4" />}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <MetricCard
              label="Aktif eşleştirme kodu"
              value={formatCount(stats.pairCodesActive)}
              hint="şu an geçerli"
              icon={<KeyRound className="h-4 w-4" />}
            />
            <MetricCard
              label="Son 7 gün ürün aktivitesi"
              value={formatCount(stats.workspacesActive7d)}
              hint="yeni clip oluşturuldu"
            />
            <MetricCard
              label="Son 30 gün ürün aktivitesi"
              value={formatCount(stats.workspacesActive30d)}
              hint="yeni clip oluşturuldu"
            />
          </div>

          <div className="mt-8">
            <PanelCard
              title="Notlar"
              description="Bu sayfa Supabase'i doğrudan sorguladığı için anlık. Mağaza verileri (Microsoft Store / Play) cron'a bağlı, sayfaları üzerinden bak."
            >
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  Workspace = bir veya daha fazla cihazın paylaştığı grup. Bir
                  kullanıcı bir workspace'e aittir, ama bir cihaz bağımsızdır.
                </li>
                <li>
                  Aktivite metrikleri "yeni clipboard öğesi yazıldı mı?" sayar.
                  Sadece okuma yapan workspace'ler buraya yansımaz.
                </li>
                <li>
                  Cloudflare Workers Analytics ile snipotter.com / app.snipotter.com
                  ziyaretçi sayıları PR-2'de eklenecek.
                </li>
              </ul>
            </PanelCard>
          </div>
        </>
      )}
    </Layout>
  )
}
