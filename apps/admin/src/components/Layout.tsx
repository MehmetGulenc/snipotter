'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Store,
  Smartphone,
  Github,
  Globe,
  HardDrive,
  MessageSquare,
  Boxes,
  LogOut,
  Loader2,
  Cloud,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSession, signOut, type SessionUser } from '@/lib/auth'

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  hint?: string
}

const NAV: NavItem[] = [
  { href: '/', label: 'Genel', icon: LayoutDashboard, hint: 'Tek sayfada özet' },
  { href: '/microsoft/', label: 'Microsoft Store', icon: Store },
  { href: '/google-play/', label: 'Google Play', icon: Smartphone, hint: 'Android yayınlanınca' },
  { href: '/github/', label: 'GitHub Releases', icon: Github },
  { href: '/web/', label: 'Web uygulaması', icon: Globe, hint: 'app.snipotter.com' },
  { href: '/cloudflare/', label: 'Cloudflare', icon: Cloud, hint: 'Worker request\'leri' },
  { href: '/desktop/', label: 'Aktif kurulumlar', icon: HardDrive, hint: 'In-app heartbeat' },
  { href: '/reviews/', label: 'Yorumlar', icon: MessageSquare, hint: 'Tüm mağazalar' },
  { href: '/apps/', label: 'Uygulamalar', icon: Boxes },
]

/**
 * Admin shell — sticky sidebar + header + content. Routes the user to
 * /login if there is no session or the session belongs to a non-admin
 * email. Children render only after the auth check passes so a flash
 * of dashboard content can never leak before the guard fires.
 */
export function Layout({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loaded, setLoaded] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    let cancelled = false
    void getSession().then((u) => {
      if (cancelled) return
      setUser(u)
      setLoaded(true)
      if (!u && pathname !== '/login/' && pathname !== '/login') {
        // Static export: use full navigation rather than next/router.
        window.location.href = '/login/'
      }
    })
    return () => {
      cancelled = true
    }
  }, [pathname])

  const onSignOut = async (): Promise<void> => {
    await signOut()
    window.location.href = '/login/'
  }

  if (!loaded) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (!user) {
    // Already redirecting; render nothing to avoid the layout flashing.
    return <></>
  }

  return (
    <div className="grid min-h-screen md:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside className="border-b border-border bg-card/50 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="flex flex-col gap-1 p-3">
          <div className="px-2 py-3 text-sm font-semibold">
            Snipotter <span className="text-muted-foreground">· admin</span>
          </div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-card hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <span className="hidden text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground lg:block">
                      {item.hint}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
          <div className="mt-auto border-t border-border/60 p-2 pt-3">
            <div className="mb-2 truncate px-2 text-[11px] text-muted-foreground">
              {user.email}
            </div>
            <button
              onClick={() => void onSignOut()}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-card hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" /> Çıkış
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 px-4 pb-20 pt-6 sm:px-8">{children}</main>
    </div>
  )
}
