'use client'
import { refreshSpaces } from '@/lib/spaces'
import { useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Onboarding } from '@/components/Onboarding'
import { AppShell } from '@/components/AppShell'
import { FeedbackHost } from '@/components/ui/FeedbackHost'
import { useStore } from '@/lib/store'
import { ensureAnonymousSession, getCurrentWorkspace } from '@/lib/api'
import { activateE2E, encryptionActions, resumeMigrationIfNeeded } from '@/lib/e2e'
import { EncryptionGate } from '@shared/crypto/EncryptionScreens'
import { isNative } from '@/lib/mobile'
import { deviceLabel } from '@/lib/utils'

export default function Home(): JSX.Element {
  const user = useStore((s) => s.user)
  const workspace = useStore((s) => s.workspace)
  const loading = useStore((s) => s.loading)
  const setUser = useStore((s) => s.setUser)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const setLoading = useStore((s) => s.setLoading)
  const e2eStatus = useStore((s) => s.e2eStatus)
  const setE2EStatus = useStore((s) => s.setE2EStatus)

  // Keys before data: the workspace opens only once this device can read it.
  useEffect(() => {
    if (!workspace) return
    let alive = true
    setE2EStatus('unknown')
    void activateE2E(workspace.id)
      .then((status) => {
        if (!alive) return
        setE2EStatus(status)
        if (status === 'ready') {
          void resumeMigrationIfNeeded(workspace.id).catch((e) => console.warn('[e2e] resume', e))
          void refreshSpaces(workspace.id)
        }
      })
      .catch((e) => {
        console.warn('[e2e] activation failed', e)
        if (alive) setE2EStatus('unsupported')
      })
    return () => { alive = false }
  }, [workspace?.id])

  const actions = useMemo(() => (workspace && user
    ? encryptionActions(workspace.id, deviceLabel(), async () => {
        setWorkspace(await getCurrentWorkspace(user.id))
      })
    : null), [workspace?.id, user?.id])

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const u = await ensureAnonymousSession()
        if (!mounted) return
        setUser(u)
        if (u) {
          const ws = await getCurrentWorkspace(u.id)
          if (!mounted) return
          setWorkspace(ws)
        }
      } catch (e) {
        console.error('bootstrap failed', e)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center gap-4 bg-background">
        <Logo size={64} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Hazırlanıyor…
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Logo size={64} />
        <h1 className="text-lg font-semibold">Bağlantı kurulamadı</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Supabase yapılandırması eksik veya anonim oturum açılamadı. Sayfayı yenilemeyi
          dene; sorun devam ederse yöneticisine bildir.
        </p>
      </div>
    )
  }

  if (workspace && (e2eStatus === 'plain' || e2eStatus === 'needs-key') && actions) {
    return (
      <>
        <EncryptionGate
          status={e2eStatus}
          actions={actions}
          mobile={isNative()}
          onDone={() => void activateE2E(workspace.id).then(setE2EStatus)}
        />
        <FeedbackHost />
      </>
    )
  }

  if (workspace && e2eStatus === 'unknown') {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-label="Açılıyor" />
      </div>
    )
  }

  return (
    <>
      {workspace ? <AppShell /> : <Onboarding />}
      <FeedbackHost />
    </>
  )
}
