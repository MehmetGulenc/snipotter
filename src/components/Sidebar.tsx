import { Clipboard, StickyNote, Settings as SettingsIcon, LogOut, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { Button } from './ui/Button'

interface SidebarProps {
  route: 'library' | 'notes' | 'settings'
  onNavigate: (r: 'library' | 'notes' | 'settings') => void
}

export function Sidebar({ route, onNavigate }: SidebarProps): JSX.Element {
  const setUser = useStore((s) => s.setUser)
  const clipboardCount = useStore((s) => s.clipboard.length)
  const noteCount = useStore((s) => s.notes.length)

  const items = [
    { id: 'library' as const, label: 'Pano', icon: Clipboard, count: clipboardCount },
    { id: 'notes' as const, label: 'Notlar', icon: StickyNote, count: noteCount },
    { id: 'settings' as const, label: 'Ayarlar', icon: SettingsIcon },
  ]

  const onLogout = async () => {
    await window.snipotter.auth.signOut()
    setUser(null)
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card/30 p-3">
      <Button
        size="sm"
        variant="default"
        onClick={() => window.snipotter.window.toggleQuickNote()}
        className="mb-3 justify-start gap-2"
      >
        <Plus className="h-4 w-4" /> Hızlı Not
      </Button>

      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon
          const active = route === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'flex items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <span className="inline-flex items-center gap-2">
                <Icon className="h-4 w-4" /> {item.label}
              </span>
              {item.count !== undefined && (
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto">
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
