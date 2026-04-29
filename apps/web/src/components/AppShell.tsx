'use client'
import { useEffect } from 'react'
import { Clipboard as ClipboardIcon, StickyNote, Settings as SettingsIcon, Search } from 'lucide-react'
import { Logo } from './Logo'
import { Library } from './Library'
import { Notes } from './Notes'
import { Settings } from './Settings'
import { useStore } from '@/lib/store'
import { subscribeWorkspace } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Input } from './ui/Input'

export function AppShell(): JSX.Element {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const workspace = useStore((s) => s.workspace)
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const upsertClip = useStore((s) => s.upsertClip)
  const removeClip = useStore((s) => s.removeClip)
  const upsertNote = useStore((s) => s.upsertNote)
  const removeNote = useStore((s) => s.removeNote)

  // Realtime subscription
  useEffect(() => {
    if (!workspace) return
    const unsub = subscribeWorkspace(workspace.id, {
      onClip: upsertClip,
      onClipDelete: removeClip,
      onNote: upsertNote,
      onNoteDelete: removeNote,
    })
    return unsub
  }, [workspace?.id])

  return (
    <div className="flex h-[100svh] flex-col bg-background text-foreground">
      {/* Header.
          `pt-[calc(env(safe-area-inset-top)+0.625rem)]` extends the header's
          background up under the iOS status bar / Dynamic Island so the title
          and search field never collide with the system clock or camera
          cutout when the app runs as a homescreen-installed PWA. */}
      <header
        className="flex shrink-0 items-center gap-3 border-b border-border bg-card/40 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)]"
      >
        <Logo size={24} />
        <div className="font-semibold">Snipotter</div>
        {view !== 'settings' && (
          <div className="relative ml-auto max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ara…"
              className="pl-8 text-sm"
            />
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {view === 'library' && <Library />}
        {view === 'notes' && <Notes />}
        {view === 'settings' && <Settings />}
      </main>

      {/* Bottom nav (mobile-first) */}
      <nav className="flex shrink-0 items-center justify-around border-t border-border bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/40 pb-[env(safe-area-inset-bottom)]">
        <NavBtn icon={ClipboardIcon} label="Pano" active={view === 'library'} onClick={() => setView('library')} />
        <NavBtn icon={StickyNote} label="Notlar" active={view === 'notes'} onClick={() => setView('notes')} />
        <NavBtn icon={SettingsIcon} label="Ayarlar" active={view === 'settings'} onClick={() => setView('settings')} />
      </nav>
    </div>
  )
}

function NavBtn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof ClipboardIcon
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col items-center gap-0.5 px-3 py-2.5 text-[10px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  )
}
