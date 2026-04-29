import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import { Onboarding } from './components/Onboarding'
import { Library } from './pages/Library'
import { Notes } from './pages/Notes'
import { Settings } from './pages/Settings'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { QuickNote } from './components/QuickNote'

type Route = 'library' | 'notes' | 'settings' | 'quick-note'

function getRoute(): Route {
  const hash = window.location.hash.replace('#/', '').replace('#', '')
  if (hash === 'quick-note') return 'quick-note'
  if (hash === 'notes') return 'notes'
  if (hash === 'settings') return 'settings'
  return 'library'
}

export default function App(): JSX.Element {
  const {
    user,
    authLoading,
    workspace,
    setUser,
    setAuthLoading,
    setWorkspace,
    setSettings,
    setClipboard,
    upsertClipboard,
    setNotes,
    upsertNote,
    setAiStatus,
  } = useStore()
  const [route, setRoute] = useState<Route>(getRoute)

  useEffect(() => {
    const onHash = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const [authRes, wsRes, settingsRes, aiRes] = await Promise.all([
          window.snipotter.auth.getState(),
          window.snipotter.workspace.get(),
          window.snipotter.settings.get(),
          window.snipotter.ai.status(),
        ])
        if (!mounted) return
        if (settingsRes.ok) setSettings(settingsRes.data)
        if (aiRes.ok) setAiStatus(aiRes.data)
        if (authRes.ok) setUser(authRes.data)
        else setAuthLoading(false)
        if (wsRes.ok) setWorkspace(wsRes.data)
      } catch (err) {
        console.error('init failed', err)
        if (mounted) setAuthLoading(false)
      }
    })()

    const offAuth = window.snipotter.auth.onChanged((u) => setUser(u))
    const offWs = window.snipotter.workspace.onChanged((w) => setWorkspace(w))
    const offSettings = window.snipotter.settings.onChanged((s) => setSettings(s))
    const offClipNew = window.snipotter.clipboard.onNew((item) => upsertClipboard(item))
    const offClipUpd = window.snipotter.clipboard.onUpdated((item) => upsertClipboard(item))
    const offNoteUpd = window.snipotter.notes.onUpdated((note) => upsertNote(note))

    return () => {
      mounted = false
      offAuth()
      offWs()
      offSettings()
      offClipNew()
      offClipUpd()
      offNoteUpd()
    }
  }, [setUser, setAuthLoading, setWorkspace, setSettings, setClipboard, upsertClipboard, upsertNote, setAiStatus])

  // Re-load lists when workspace changes (workspace = data scope, not user)
  useEffect(() => {
    if (!workspace) return
    void (async () => {
      const [clip, notes] = await Promise.all([
        window.snipotter.clipboard.list(),
        window.snipotter.notes.list(),
      ])
      if (clip.ok) setClipboard(clip.data)
      if (notes.ok) setNotes(notes.data)
    })()
  }, [workspace?.id, setClipboard, setNotes])

  // ==== Quick note overlay window has its own minimal route ====
  if (route === 'quick-note') return <QuickNote />

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="animate-pulse text-sm">Snipotter yükleniyor…</div>
      </div>
    )
  }

  // Anonymous user is auto-created on app boot. Onboarding shows when there's
  // no workspace yet (either user creates one or pairs with another device).
  if (!user || !workspace) return <Onboarding />

  return (
    <div className="flex h-full flex-col">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar route={route} onNavigate={(r) => (window.location.hash = `#/${r}`)} />
        <main className="flex-1 overflow-hidden">
          {route === 'library' && <Library />}
          {route === 'notes' && <Notes />}
          {route === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  )
}
