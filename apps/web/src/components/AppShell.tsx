'use client'
import { useEffect } from 'react'
import { Clipboard as ClipboardIcon, StickyNote, Settings as SettingsIcon, Search, ExternalLink } from 'lucide-react'
import { Logo } from './Logo'
import { Library } from './Library'
import { Notes } from './Notes'
import { Settings } from './Settings'
import { ActionBanner } from './ActionBanner'
import { useStore } from '@/lib/store'
import { subscribeWorkspace, listClipboard, listNotes } from '@/lib/api'
import { initMobileBridge, isNative } from '@/lib/mobile'
import { toast } from '@/lib/feedback'
import { startNativeBridge } from '@/lib/native-bridge'
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
  const native = isNative()
  const editingNote = useStore((s) => s.editingNote)

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

  // Native (Android) bridge — share target, explicit clipboard save, tile
  // relaunch. No-op on web. Runs once after the workspace is ready because
  // every capture path needs a workspace_id to insert into.
  useEffect(() => {
    if (!workspace || !user) return
    void initMobileBridge({
      workspaceId: workspace.id,
      userId: user.id,
      onAutoCapture: (item) => {
        upsertClip(item)
        toast('Panodaki yeni metin kaydedildi')
      },
    })
  }, [workspace?.id, user?.id])

  // iOS: share the session with the Share extension / Shortcuts action and
  // feed the widget. Stopping it (sign-out, leaving the workspace) clears it.
  useEffect(() => {
    if (!workspace || !user) return
    return startNativeBridge(workspace.id, user.id)
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
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        {native ? (
          <div className="flex items-center gap-2">
            <Logo size={26} />
            <Wordmark />
          </div>
        ) : (
          <>
            {/* On the web the wordmark leads back to the marketing site. */}
            <a href="https://snipotter.com/" className="group flex items-center gap-2 rounded transition-opacity hover:opacity-90" title="snipotter.com'a dön">
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
              className="hidden rounded px-2 py-0.5 text-[11px] font-medium text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary sm:block"
            >
              ✨ Yenilikler
            </a>
          </>
        )}
        {view !== 'settings' && !(view === 'notes' && editingNote) && (
          <div className="relative ml-auto max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ara"
              className="h-9 rounded-xl border-0 bg-white/[0.08] pl-9 text-[16px] sm:text-sm"
            />
          </div>
        )}
      </header>

      <ActionBanner />

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {view === 'library' && <Library />}
        {view === 'notes' && <Notes />}
        {view === 'settings' && <Settings />}
      </main>

      {/* Bottom nav (mobile-first) */}
      <nav className="flex shrink-0 items-start justify-around border-t border-white/[0.08] bg-[hsl(240_8%_7%)]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
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
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-[52px] flex-1 flex-col items-center justify-center gap-[3px] text-[10px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-[24px] w-[24px]" strokeWidth={active ? 2.25 : 1.75} />
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
