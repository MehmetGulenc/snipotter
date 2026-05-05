'use client'
import { useEffect, useState } from 'react'
import { Loader2, Star, MessageSquare, Reply, Store, Smartphone, Check } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { PanelCard } from '@/components/Card'
import { listApps, listReviews } from '@/lib/api'
import type { AppRow, Review, Source } from '@/lib/types'
import { cn, timeAgo } from '@/lib/utils'

const SOURCE_LABEL: Record<Source, string> = {
  'ms-store': 'Microsoft Store',
  play: 'Google Play',
  appstore: 'App Store',
  github: 'GitHub',
  web: 'Web',
  cloudflare: 'Cloudflare',
  heartbeat: 'Heartbeat',
}

const SOURCE_ICON: Partial<Record<Source, JSX.Element>> = {
  'ms-store': <Store className="h-3.5 w-3.5" />,
  play: <Smartphone className="h-3.5 w-3.5" />,
}

/**
 * Tüm mağazalardan gelen yorumları tek akışta gösteren birleşik kutu.
 * Filtre: 'tümü' | 'cevap bekleyenler'. Cevap UI'sı PR-3'te canlı bağlanır
 * — bu turda sadece okuma + replied bayrağını DB'de toggle etmek için
 * basit bir buton var (cevap içeriği store'a aktarılmaz, manuel olarak
 * Partner Center'dan yazarsın).
 */
export default function ReviewsPage(): JSX.Element {
  const [apps, setApps] = useState<AppRow[]>([])
  const [reviewsByApp, setReviewsByApp] = useState<Record<string, Review[]>>({})
  const [filter, setFilter] = useState<'all' | 'unreplied'>('all')
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listApps()
        const map: Record<string, Review[]> = {}
        await Promise.all(
          list.map(async (a) => {
            map[a.id] = await listReviews(a.id, { unreplied: filter === 'unreplied', limit: 50 })
          }),
        )
        if (!cancelled) {
          setApps(list)
          setReviewsByApp(map)
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
  }, [filter])

  const total = Object.values(reviewsByApp).reduce((sum, arr) => sum + arr.length, 0)

  return (
    <Layout>
      <header className="mb-8 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Yorumlar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tüm mağazalardan birleşik akış. Cron her gece çekiyor.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-card/40 p-1 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-md px-3 py-1.5 transition',
              filter === 'all' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Tümü
          </button>
          <button
            onClick={() => setFilter('unreplied')}
            className={cn(
              'rounded-md px-3 py-1.5 transition',
              filter === 'unreplied' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Cevap bekleyen
          </button>
        </div>
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

      {loaded && total === 0 && !err && (
        <PanelCard
          title="Henüz yorum yok"
          description="Ya gerçekten yorum gelmedi, ya da cron worker yorumları henüz çekmedi."
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Microsoft Store yorumları için Partner Center API anahtarı gerekiyor.</li>
            <li>Google Play yorumları için service account JSON gerekiyor.</li>
            <li>Cron her gece 03:00'te çeker; manuel test için workers/cron'da fetchReviewsOnce() çağırılabilir.</li>
          </ul>
        </PanelCard>
      )}

      {loaded &&
        total > 0 &&
        apps.map((app) => {
          const reviews = reviewsByApp[app.id] ?? []
          if (reviews.length === 0) return null
          return (
            <section key={app.id} className="mb-10">
              <h2 className="mb-3 text-base font-semibold">{app.displayName}</h2>
              <div className="space-y-2">
                {reviews.map((r) => (
                  <ReviewItem key={`${r.source}:${r.externalId}`} review={r} />
                ))}
              </div>
            </section>
          )
        })}
    </Layout>
  )
}

function ReviewItem({ review }: { review: Review }): JSX.Element {
  const stars = review.rating ?? 0
  return (
    <article className="rounded-xl border border-border bg-card/40 p-4 transition hover:border-border/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded bg-card px-1.5 py-0.5 font-medium text-muted-foreground">
              {SOURCE_ICON[review.source] ?? <MessageSquare className="h-3.5 w-3.5" />}
              {SOURCE_LABEL[review.source]}
            </span>
            <span className="text-muted-foreground">{review.author ?? 'Anonim'}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{timeAgo(review.createdAt)}</span>
            {review.language && (
              <span className="rounded bg-card px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {review.language}
              </span>
            )}
            {review.replied && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                <Check className="h-2.5 w-2.5" />
                cevaplandı
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={cn(
                  'h-3.5 w-3.5',
                  i <= stars ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40',
                )}
              />
            ))}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
            {review.body || <span className="italic text-muted-foreground">(yorum metni yok)</span>}
          </p>
          {review.replyBody && (
            <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs text-muted-foreground">
              <div className="mb-1 inline-flex items-center gap-1 font-medium text-primary">
                <Reply className="h-3 w-3" />
                Cevabın
              </div>
              <p className="whitespace-pre-wrap">{review.replyBody}</p>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
