import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { KeyRound, Plus, Loader2, Check, AlertCircle } from 'lucide-react'
import { Logo } from './Logo'

type Mode = 'choose' | 'create' | 'join'

/**
 * First-run flow when user has an anonymous session but no workspace yet.
 * Two paths:
 *   1. Create a fresh workspace (this becomes device #1).
 *   2. Enter an existing pair code from another device.
 */
export function Onboarding(): JSX.Element {
  const setWorkspace = useStore((s) => s.setWorkspace)
  const [mode, setMode] = useState<Mode>('choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    setError(null)
  }, [mode])

  const onCreate = async () => {
    setBusy(true)
    setError(null)
    const r = await window.snipotter.workspace.create()
    setBusy(false)
    if (r.ok && r.data) {
      setWorkspace(r.data)
    } else if (!r.ok) {
      setError(r.error)
    }
  }

  const onJoin = async () => {
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    const r = await window.snipotter.workspace.redeemPairCode(code)
    setBusy(false)
    if (r.ok && r.data) {
      setWorkspace(r.data)
    } else if (!r.ok) {
      setError(r.error || 'Kod geçersiz veya süresi dolmuş.')
    }
  }

  const formatted = formatCode(code)

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-background p-6">
      {/* Invisible draggable strip across the top so the user can move the window. */}
      <div className="drag-region pointer-events-auto absolute inset-x-0 top-0 z-0 h-10" />
      <div className="no-drag relative z-10 w-full max-w-md space-y-6 rounded-2xl border border-border bg-card/40 p-8 shadow-xl">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <h1 className="text-lg font-semibold">Snipotter</h1>
            <p className="text-xs text-muted-foreground">Pano + AI not — cihazlar arası senkron</p>
          </div>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="group flex w-full items-start gap-3 rounded-lg border border-border bg-background/40 p-4 text-left transition-colors hover:border-primary/50 hover:bg-card"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Plus className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Bu cihazda başla</div>
                <div className="text-xs text-muted-foreground">
                  Yeni bir alan oluştur. Diğer cihazları sonra bağla.
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode('join')}
              className="group flex w-full items-start gap-3 rounded-lg border border-border bg-background/40 p-4 text-left transition-colors hover:border-primary/50 hover:bg-card"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Başka cihazla eşleştir</div>
                <div className="text-xs text-muted-foreground">
                  Diğer cihazda Ayarlar → Cihazlar'dan kod oluştur.
                </div>
              </div>
            </button>

            <p className="pt-2 text-center text-[11px] text-muted-foreground">
              E-posta ya da şifre yok. Cihazlar 6 haneli kodla eşleşir.
            </p>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Yeni bir Snipotter alanı oluşturuyoruz. Bu cihaz sahibi olacak.
            </p>
            {error && <ErrorBox text={error} />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMode('choose')} disabled={busy}>
                Geri
              </Button>
              <Button onClick={onCreate} disabled={busy} className="flex-1">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                {busy ? 'Hazırlanıyor…' : 'Oluştur ve devam et'}
              </Button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Diğer cihazda <strong>Ayarlar → Cihazlar → Yeni cihaz ekle</strong>'den 6 haneli kodu al.
            </p>
            <Input
              autoFocus
              value={formatted}
              onChange={(e) => setCode(stripCode(e.target.value))}
              placeholder="XXX-XXX"
              maxLength={7}
              className="text-center text-2xl font-mono tracking-[0.4em]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onJoin()
              }}
            />
            {error && <ErrorBox text={error} />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMode('choose')} disabled={busy}>
                Geri
              </Button>
              <Button
                onClick={onJoin}
                disabled={busy || stripCode(code).length !== 6}
                className="flex-1"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                {busy ? 'Bağlanıyor…' : 'Eşleştir'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ErrorBox({ text }: { text: string }): JSX.Element {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function stripCode(v: string): string {
  return v.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6)
}

function formatCode(v: string): string {
  const s = stripCode(v)
  if (s.length <= 3) return s
  return `${s.slice(0, 3)}-${s.slice(3, 6)}`
}
