'use client'
import { useEffect } from 'react'
import { Clipboard as ClipboardIcon, StickyNote, Settings as SettingsIcon, Search, ExternalLink } from 'lucide-react'
import { Logo } from './Logo'
import { Library } from './Library'
import { Notes } from './Notes'
import { Settings } from './Settings'
import { useStore } from '@/lib/store'
import { subscribeWorkspace, listClipboard, listNotes } from '@/lib/api'
import { initMobileBridge } from '@/lib/mobile'
import { cn } from '@/lib/utils'
import { Input } from './ui/Input'

export function AppShell(): JSX.Element {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const user = useStore((s) => s.user)
  const workspace = useStore((s) => s.workspace)
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const setClipboard = useStore((s) => s.setClipboard)
  const setNotes = useStore((s) => s.setNotes)
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

  // Native (Android) bridge — share target, resume clipboard read, tile
  // relaunch. No-op on web. Runs once after the workspace is ready because
  // every capture path needs a workspace_id to insert into.
  useEffect(() => {
    if (!workspace || !user) return
    void initMobileBridge({ workspaceId: workspace.id, userId: user.id })
  }, [workspace?.id, user?.id])

  // Reconciliation backstop for realtime. Realtime (broadcast + postgres_changes)
  // handles the fast path; this interval catches anything the socket missed
  // (e.g. after a suspend/resume). We no longer gate on visibilityState — if
  // the tab is open the user may switch back to it at any moment and should
  // never see a stale list.
  useEffect(() => {
    if (!workspace) return

    let cancelled = false
    let inFlight = false
    const fetchData = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      try {
        const [clips, notes] = await Promise.all([
          listClipboard(workspace.id),
          listNotes(workspace.id),
        ])
        if (cancelled) return
        setClipboard(clips)
        setNotes(notes)
      } catch (err) {
        console.warn('[sync] reconcile failed', err)
      } finally {
        inFlight = false
      }
    }

    void fetchData()
    // 15s is a gentle backstop — broadcasts handle the sub-second path.
    const interval = setInterval(fetchData, 15_000)
    document.addEventListener('visibilitychange', fetchData)
    window.addEventListener('focus', fetchData)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', fetchData)
      window.removeEventListener('focus', fetchData)
    }
  }, [workspace?.id, setClipboard, setNotes])

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
        {/* Wordmark doubles as a "back to landing" affordance — visitors
            who land here from snipotter.com can't otherwise navigate back.
            The "SnipOtter" rendering matches the marketing site: a
            primary-tinted "O" that breathes plus a per-letter wave on
            hover. Same animations defined in tailwind.config.ts. */}
        <a
          href="https://snipotter.com/"
          className="group flex items-center gap-2 rounded transition-opacity hover:opacity-90"
          title="snipotter.com'a dön"
        >
          {/* Logo with soft glow */}
          <div className="relative flex items-center justify-center">
            <div className="absolute h-8 w-8 animate-logo-glow rounded-full bg-fuchsia-500/40 blur-md" />
            <Logo size={24} className="relative" />
          </div>
          <Wordmark />
          <ExternalLink className="hidden h-3 w-3 text-muted-foreground sm:block" />
        </a>
        <a
          href="https://snipotter.com/yenilikler"
          target="_blank"
          rel="noreferrer"
          className="hidden rounded px-2 py-0.5 text-[11px] font-medium text-primary/70 hover:bg-primary/10 hover:text-primary transition-colors sm:block"
        >
          ✨ Yenilikler
        </a>
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

/**
 * Animated SnipOtter wordmark — same shape as apps/landing's marketing
 * version. Renders the brand name letter-by-letter so the "Otter" half
 * of the name is legible (capital O, primary tint, slow breathing
 * animation) and a per-letter wave plays on hover. Deliberately inlined
 * here rather than shared via a library because the app and landing
 * don't share a build pipeline.
 */
function Wordmark(): JSX.Element {
  const snip = 'Snip'.split('')
  const otter = 'Otter'.split('')
  return (
    <span className="group inline-flex select-none items-baseline text-base font-bold tracking-tight">
      {snip.map((l, i) => (
        <span
          key={i}
          className="inline-block animate-brand-reveal text-fuchsia-400 group-hover:animate-wave-letter"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          {l}
        </span>
      ))}
      {otter.map((l, i) => (
        <span
          key={i}
          className={cn(
            'inline-block animate-brand-reveal text-violet-300 group-hover:animate-wave-letter',
            i === 0 && 'animate-otter-breathe',
          )}
          style={{ animationDelay: `${(i + 4) * 40}ms` }}
        >
          {l}
        </span>
      ))}
    </span>
  )
}
