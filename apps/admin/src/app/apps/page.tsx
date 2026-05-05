'use client'
import { useEffect, useState } from 'react'
import { Loader2, Boxes, Store, Smartphone, Github, Apple, ExternalLink } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { PanelCard } from '@/components/Card'
import { listApps } from '@/lib/api'
import type { AppRow } from '@/lib/types'

/**
 * Çoklu uygulama yönetimi. Şu an sadece okuma — yeni uygulama eklemek
 * Supabase'de manuel `insert into public.apps`'le yapılır (admin
 * paneli içinde form gelecek). Ama amaç ileride Snipotter #2, #3 vb.
 * şirket içi uygulamalar geldikçe aynı dashboard'a düşürmek.
 */
export default function AppsPage(): JSX.Element {
  const [apps, setApps] = useState<AppRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void listApps()
      .then((a) => {
        if (!cancelled) setApps(a)
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Layout>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Uygulamalar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bu panelin izlediği uygulamalar. Yeni uygulama eklemek için Supabase'de{' '}
          <code className="rounded bg-card px-1.5 py-0.5">apps</code> tablosuna ekle.
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

      {loaded && apps.length === 0 && (
        <PanelCard title="Hiç uygulama yok" description="0006_admin_dashboard.sql migration'ı seed satırlarını ekler.">
          <p className="text-sm text-muted-foreground">
            Migration uygulanmamış olabilir.{' '}
            <code className="rounded bg-card px-1.5 py-0.5">supabase db push</code> ile veya Supabase
            UI'sından çalıştır.
          </p>
        </PanelCard>
      )}

      {loaded && apps.length > 0 && (
        <div className="space-y-3">
          {apps.map((a) => (
            <article key={a.id} className="rounded-xl border border-border bg-card/40 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
                    <Boxes className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">{a.displayName}</h2>
                    <div className="font-mono text-[11px] text-muted-foreground">{a.slug}</div>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {a.isActive ? 'aktif' : 'devre dışı'}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <ChannelTag
                  active={!!a.msStoreId}
                  icon={<Store className="h-3.5 w-3.5" />}
                  label="Microsoft Store"
                  detail={a.msStoreId ?? '—'}
                  href={a.msStoreId ? `https://apps.microsoft.com/detail/${a.msStoreId}` : undefined}
                />
                <ChannelTag
                  active={!!a.playPackageName}
                  icon={<Smartphone className="h-3.5 w-3.5" />}
                  label="Google Play"
                  detail={a.playPackageName ?? '—'}
                  href={
                    a.playPackageName
                      ? `https://play.google.com/store/apps/details?id=${a.playPackageName}`
                      : undefined
                  }
                />
                <ChannelTag
                  active={!!a.appstoreId}
                  icon={<Apple className="h-3.5 w-3.5" />}
                  label="App Store"
                  detail={a.appstoreId ?? '—'}
                />
                <ChannelTag
                  active={!!a.githubRepo}
                  icon={<Github className="h-3.5 w-3.5" />}
                  label="GitHub"
                  detail={a.githubOwner && a.githubRepo ? `${a.githubOwner}/${a.githubRepo}` : '—'}
                  href={
                    a.githubOwner && a.githubRepo
                      ? `https://github.com/${a.githubOwner}/${a.githubRepo}`
                      : undefined
                  }
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </Layout>
  )
}

function ChannelTag({
  active,
  icon,
  label,
  detail,
  href,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  detail: string
  href?: string
}): JSX.Element {
  const inner = (
    <div
      className={
        'flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs ' +
        (active
          ? 'border-border bg-card/60 text-foreground'
          : 'border-border/40 bg-card/20 text-muted-foreground/60')
      }
    >
      <span className={active ? 'text-primary' : 'text-muted-foreground/40'}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate font-mono">{detail}</div>
      </div>
      {href && active && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
    </div>
  )
  if (href && active) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        {inner}
      </a>
    )
  }
  return inner
}
