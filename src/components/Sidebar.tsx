import { useEffect, useState } from 'react'
import { Clipboard, StickyNote, Settings as SettingsIcon, LogOut, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { Button } from './ui/Button'
import type { UpdaterStatus } from '@shared/types'

interface SidebarProps {
  route: 'library' | 'notes' | 'settings'
  onNavigate: (r: 'library' | 'notes' | 'settings') => void
}

export function Sidebar({ route, onNavigate }: SidebarProps): JSX.Element {
  const setUser = useStore((s) => s.setUser)
  const clipboardCount = useStore((s) => s.clipboard.length)
  const noteCount = useStore((s) => s.notes.length)
  const workspace = useStore((s) => s.workspace)
  const user = useStore((s) => s.user)
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus | null>(null)

  useEffect(() => {
    void window.snipotter.updater.getStatus().then((r) => {
      if (r.ok) setUpdaterStatus(r.data)
    })
    const off = window.snipotter.updater.onChanged((s) => setUpdaterStatus(s))
    return () => { off() }
  }, [])

  const updateAvailable =
    updaterStatus?.kind === 'available' ||
    updaterStatus?.kind === 'downloading' ||
    updaterStatus?.kind === 'downloaded'

  const items = [
    { id: 'library' as const, label: 'Pano', icon: Clipboard, count: clipboardCount, dot: false },
    { id: 'notes' as const, label: 'Notlar', icon: StickyNote, count: noteCount, dot: false },
    { id: 'settings' as const, label: 'Ayarlar', icon: SettingsIcon, dot: updateAvailable },
  ]

  const onLogout = async () => {
    // Main süreç çıkıştan sonra yeni anonim oturum açıp kullanıcıyı döner;
    // null'a zorlamak bu oturumu renderer'da ezip eşleştirmeyi bozuyordu.
    const r = await window.snipotter.auth.signOut()
    setUser(r.ok ? r.data : null)
  }

  return (
    <aside className="flex w-[246px] shrink-0 flex-col border-r border-border bg-card px-4 py-6">
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-border p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">{workspace?.name?.slice(0, 1).toLocaleUpperCase('tr') || 'S'}</span>
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{workspace?.name || 'Çalışma alanım'}</p><p className="mt-0.5 text-xs text-muted-foreground">Çalışma alanı</p></div>
      </div>
      <Button
        size="sm"
        variant="default"
        onClick={() => window.snipotter.window.toggleQuickNote()}
        className="mb-7 h-11 justify-center gap-2 rounded-xl shadow-sm"
      >
        <Plus className="h-4 w-4" /> Yeni hızlı not
      </Button>

      <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Kütüphanem</p>
      <nav aria-label="Ana gezinme" className="flex flex-col gap-2">
        {items.map((item) => {
          const Icon = item.icon
          const active = route === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <span className="inline-flex items-center gap-2">
                <span className="relative">
                  <Icon className="h-4 w-4" />
                  {item.dot && (
                    <span
                      className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card"
                      title="Yeni güncelleme mevcut"
                    />
                  )}
                </span>
                {item.label}
              </span>
              {item.count !== undefined && (
                <span className="rounded-md bg-background px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto">
        <div className="mb-5 rounded-xl bg-secondary/60 p-4"><p className="text-sm font-medium">Bir kez kopyala.</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Geçmişinden bul, yeniden kullan. Saklamak istediklerini sabitle.</p></div>
        <p className="mb-2 truncate px-3 text-xs text-muted-foreground">{user?.email || 'Misafir oturumu'}</p>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Çıkış Yap
        </button>
      </div>
    </aside>
  )
}
