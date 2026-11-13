'use client'
import { useEffect, useState } from 'react'
import { Plus, KeyRound, Loader2, Check, AlertCircle } from 'lucide-react'
import { Logo } from './Logo'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { useStore } from '@/lib/store'
import { ensureWorkspace, redeemPairCode, getCurrentWorkspace } from '@/lib/api'
import { joinWithWords } from '@/lib/e2e'
import { deviceLabel } from '@/lib/utils'

type Mode = 'choose' | 'create' | 'join'

export function Onboarding(): JSX.Element {
  const setWorkspace = useStore((s) => s.setWorkspace)
  const [mode, setMode] = useState<Mode>('choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [words, setWords] = useState('')
  const user = useStore((s) => s.user)

  useEffect(() => setError(null), [mode])

  const onCreate = async () => {
    setBusy(true)
    setError(null)
    try {
      const ws = await ensureWorkspace(deviceLabel())
      if (ws) setWorkspace(ws)
      else setError('Alan oluşturulamadı.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const wordCount = words.trim() ? words.trim().split(/\s+/).length : 0
  const onJoinWords = async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await joinWithWords(words, deviceLabel())
      setWorkspace(await getCurrentWorkspace(user.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onJoin = async () => {
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    try {
      const ws = await redeemPairCode(stripCode(code), deviceLabel())
      if (ws) setWorkspace(ws)
      else setError('Kod geçersiz veya süresi dolmuş.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-background px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="w-full max-w-md space-y-6 sm:rounded-2xl sm:border sm:border-border sm:bg-card/40 sm:p-8 sm:shadow-xl">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Snipotter</h1>
            <p className="text-sm text-muted-foreground">
              Pano geçmişin ve notların, tüm cihazlarında
            </p>
          </div>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('join')}
              className="flex w-full items-start gap-3 rounded-2xl bg-card p-4 text-left ring-1 ring-white/[0.05] transition-colors active:bg-white/[0.06] hover:ring-primary/40"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[16px] font-semibold">Masaüstü cihazımla eşleştir</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  Mac/Windows uygulamanda Ayarlar → Cihazlar'dan 6 haneli kod oluştur.
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode('create')}
              className="flex w-full items-start gap-3 rounded-2xl bg-card p-4 text-left ring-1 ring-white/[0.05] transition-colors active:bg-white/[0.06] hover:ring-primary/40"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Plus className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[16px] font-semibold">Yeni alan oluştur</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  Bu cihazı sahip yap, masaüstünü sonra bağla.
                </div>
              </div>
            </button>

            <p className="pt-2 text-center text-[11px] text-muted-foreground">
              E-posta / şifre yok. Cihazlar 6 haneli kodla eşleşir.
            </p>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Yeni bir Snipotter alanı oluşturuluyor. Bu cihaz sahibi olacak.
            </p>
            {error && <ErrorBox text={error} />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMode('choose')} disabled={busy}>
                Geri
              </Button>
              <Button onClick={onCreate} disabled={busy} className="flex-1">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {busy ? 'Hazırlanıyor…' : 'Oluştur ve devam et'}
              </Button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Masaüstünde <strong>Ayarlar → Cihazlar → Yeni cihaz ekle</strong>'den kodu al.
            </p>
            <Input
              autoFocus
              value={formatCode(code)}
              onChange={(e) => setCode(stripCode(e.target.value))}
              placeholder="XXX-XXX"
              maxLength={7}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              className="text-center text-2xl font-mono tracking-[0.4em]"
              onKeyDown={(e) => e.key === 'Enter' && void onJoin()}
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
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {busy ? 'Bağlanıyor…' : 'Eşleştir'}
              </Button>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Verilerin şifreliyse diğer cihazında <strong>Ayarlar → Cihazlar → Yeni cihaz ekle</strong>'den aldığın
                12 kelimeyi ya da 24 kelimelik kurtarma anahtarını yaz.
              </p>
              <textarea
                value={words}
                onChange={(e) => setWords(e.target.value)}
                rows={3}
                autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
                placeholder="kelime kelime kelime …"
                aria-label="Eşleştirme veya kurtarma kelimeleri"
                className="mt-3 w-full rounded-xl border border-border bg-card p-3 text-[16px] outline-none focus:border-primary"
              />
              <Button onClick={onJoinWords} disabled={busy || (wordCount !== 12 && wordCount !== 24)} className="mt-2 w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Kelimelerle bağlan ({wordCount})
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
  return s.length <= 3 ? s : `${s.slice(0, 3)}-${s.slice(3, 6)}`
}
