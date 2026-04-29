'use client'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Onboarding } from '@/components/Onboarding'
import { AppShell } from '@/components/AppShell'
import { useStore } from '@/lib/store'
import { ensureAnonymousSession, getCurrentWorkspace } from '@/lib/api'

export default function Home(): JSX.Element {
  const user = useStore((s) => s.user)
  const workspace = useStore((s) => s.workspace)
  const loading = useStore((s) => s.loading)
  const setUser = useStore((s) => s.setUser)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const setLoading = useStore((s) => s.setLoading)

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

  if (!workspace) return <Onboarding />
  return <AppShell />
}
