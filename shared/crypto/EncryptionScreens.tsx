import { useEffect, useRef, useState } from 'react'
import { KeyRound, Loader2, ShieldCheck, Smartphone, RefreshCw } from 'lucide-react'

export interface EncryptionActions {
  prepare(): Promise<{ words: string[] }>
  commit(answers: Array<{ index: number; word: string }>): Promise<'enabled' | 'lost-race'>
  migrate(onProgress: (p: { step: string; done: number }) => void): Promise<void>
  /** Asks this workspace's other devices for the key; resolves once one taps "Onayla". */
  pair(): Promise<{ code: string; wait(signal: AbortSignal): Promise<void> }>
  /** All devices lost: the 24 recovery words. */
  recover(words: string): Promise<void>
}

type Step =
  | { kind: 'intro' }
  | { kind: 'words'; words: string[] }
  | { kind: 'confirm'; words: string[]; ask: number[] }
  | { kind: 'migrating'; step: string; done: number }
  | { kind: 'pair' }
  | { kind: 'recover' }

const pick3 = (): number[] => {
  const s = new Set<number>()
  const r = new Uint8Array(16)
  globalThis.crypto.getRandomValues(r)
  for (const b of r) {
    s.add(b % 24)
    if (s.size === 3) break
  }
  return [...s].sort((a, b) => a - b)
}

/**
 * Full-screen gate shown until this device can read the workspace: turning
 * encryption on (status "plain") or joining with words (status "needs-key").
 */
export function EncryptionGate({ status, actions, onDone, mobile }: {
  status: 'plain' | 'needs-key'
  actions: EncryptionActions
  onDone: () => void
  mobile: boolean
}): JSX.Element {
  const [step, setStep] = useState<Step>(status === 'plain' ? { kind: 'intro' } : { kind: 'pair' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [joinWords, setJoinWords] = useState('')

  useEffect(() => setStep(status === 'plain' ? { kind: 'intro' } : { kind: 'pair' }), [status])

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message || 'İşlem yapılamadı')
    } finally {
      setBusy(false)
    }
  }

  const start = (): Promise<void> => run(async () => setStep({ kind: 'words', words: (await actions.prepare()).words }))

  const confirm = (ask: number[]): Promise<void> => run(async () => {
    const result = await actions.commit(ask.map((index) => ({ index, word: answers[index] ?? '' })))
    if (result === 'lost-race') {
      setStep({ kind: 'pair' })
      return
    }
    setStep({ kind: 'migrating', step: 'Hazırlanıyor', done: 0 })
    await actions.migrate((p) => setStep({ kind: 'migrating', ...p }))
    onDone()
  })

  const recover = (): Promise<void> => run(async () => {
    await actions.recover(joinWords)
    onDone()
  })

  const pad = mobile ? 'px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-[max(env(safe-area-inset-top),24px)]' : 'p-8'
  const button = 'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50'

  return (
    <div className={`fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-background ${pad}`}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {step.kind === 'intro' && (
          <>
            <ShieldCheck className="mb-4 h-12 w-12 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Verilerini şifreleyelim</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Bu sürümle pano kayıtların ve notların cihazlarında şifrelenir. Anahtar yalnızca senin cihazlarında durur;
              sunucu, yedekler ve Snipotter ekibi içeriği okuyamaz.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li>• Sana 24 kelimelik bir <b className="text-foreground">kurtarma anahtarı</b> vereceğiz.</li>
              <li>• Tüm cihazlarını kaybedersen verine yalnızca bu kelimelerle ulaşabilirsin.</li>
              <li>• Kelimeleri de kaybedersen verin geri getirilemez.</li>
            </ul>
            <div className="flex-1" />
            <button type="button" className={button} disabled={busy} onClick={() => void start()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Kurtarma kelimelerini oluştur
            </button>
            <button type="button" className="mt-3 h-11 text-sm text-muted-foreground" onClick={() => setStep({ kind: 'recover' })}>
              Daha önce kullandım, kurtarma kelimelerim var
            </button>
          </>
        )}

        {step.kind === 'words' && (
          <>
            <h1 className="text-xl font-bold">Kurtarma kelimelerin</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sırasıyla kâğıda yaz ya da parola yöneticine elle kaydet. <b className="text-foreground">Kopyalama ve ekran görüntüsü alma</b>: pano geçmişine ve fotoğraflara düşer.
            </p>
            <ol className="mt-5 grid select-none grid-cols-3 gap-2" style={{ WebkitUserSelect: 'none' }} onCopy={(e) => e.preventDefault()}>
              {step.words.map((w, i) => (
                <li key={i} className="rounded-lg border border-border bg-card px-2 py-2 text-sm">
                  <span className="mr-1 text-xs text-muted-foreground">{i + 1}.</span>{w}
                </li>
              ))}
            </ol>
            <div className="flex-1" />
            <button type="button" className={`${button} mt-6`} onClick={() => { setAnswers({}); setStep({ kind: 'confirm', words: step.words, ask: pick3() }) }}>
              Yazdım, devam et
            </button>
          </>
        )}

        {step.kind === 'confirm' && (
          <>
            <h1 className="text-xl font-bold">Kelimeleri doğrula</h1>
            <p className="mt-2 text-sm text-muted-foreground">Yazdığın listeden şu kelimeleri gir.</p>
            <div className="mt-5 space-y-3">
              {step.ask.map((index) => (
                <label key={index} className="block">
                  <span className="text-sm text-muted-foreground">{index + 1}. kelime</span>
                  <input
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
                    value={answers[index] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [index]: e.target.value }))}
                    className="mt-1 h-12 w-full rounded-xl border border-border bg-card px-3 text-[16px] outline-none focus:border-primary"
                  />
                </label>
              ))}
            </div>
            <button type="button" className="mt-3 h-11 text-sm text-primary" onClick={() => setStep({ kind: 'words', words: step.words })}>
              Kelimeleri tekrar göster
            </button>
            <div className="flex-1" />
            <button type="button" className={button} disabled={busy || step.ask.some((i) => !answers[i]?.trim())} onClick={() => void confirm(step.ask)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Şifrelemeyi aç
            </button>
          </>
        )}

        {step.kind === 'migrating' && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-semibold">Mevcut verilerin şifreleniyor</h1>
            <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">{step.step}{step.done ? ` · ${step.done}` : ''}</p>
            <p className="mt-4 max-w-xs text-xs text-muted-foreground">Uygulamayı kapatma. Yarıda kalırsa bir sonraki açılışta kaldığı yerden devam eder.</p>
          </div>
        )}

        {step.kind === 'pair' && (
          <PairWait actions={actions} onDone={onDone} onRecover={() => setStep({ kind: 'recover' })} />
        )}

        {step.kind === 'recover' && (
          <>
            <KeyRound className="mb-4 h-12 w-12 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Kurtarma kelimeleri</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Şifrelemeyi açarken yazdığın 24 kelimeyi sırasıyla gir.
            </p>
            <textarea
              value={joinWords}
              onChange={(e) => setJoinWords(e.target.value)}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
              rows={5}
              placeholder="kelime kelime kelime …"
              aria-label="Kurtarma kelimeleri"
              className="mt-5 w-full rounded-xl border border-border bg-card p-3 text-[16px] outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">{joinWords.trim() ? joinWords.trim().split(/\s+/).length : 0} / 24 kelime</p>
            <div className="flex-1" />
            <button type="button" className={button} disabled={busy || joinWords.trim().split(/\s+/).length !== 24} onClick={() => void recover()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Verilerimi aç
            </button>
            <button type="button" className="mt-3 h-11 text-sm text-primary" onClick={() => { setError(null); setStep(status === 'plain' ? { kind: 'intro' } : { kind: 'pair' }) }}>Geri</button>
          </>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  )
}

/** New device: shows the code and waits until another device taps "Onayla". */
function PairWait({ actions, onDone, onRecover }: { actions: EncryptionActions; onDone: () => void; onRecover: () => void }): JSX.Element {
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const ctrl = new AbortController()
    setCode(null)
    setError(null)
    void (async () => {
      try {
        const pending = await actions.pair()
        if (ctrl.signal.aborted) return
        setCode(pending.code)
        await pending.wait(ctrl.signal)
        if (!ctrl.signal.aborted) done.current()
      } catch (err) {
        if (!ctrl.signal.aborted) setError((err as Error).message || 'Eşleştirme yapılamadı')
      }
    })()
    return () => ctrl.abort()
  }, [actions, attempt])

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <Smartphone className="mb-4 mt-6 h-12 w-12 text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Diğer cihazında onayla</h1>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
        Snipotter'ın açık olduğu diğer cihazında bir onay isteği çıktı. Oradaki kod bununla aynıysa <b className="text-foreground">Onayla</b>'ya dokun.
      </p>
      {code ? (
        <div className="mt-8 font-mono text-5xl font-bold tracking-[0.3em] text-primary" aria-label={`Doğrulama kodu ${code.split('').join(' ')}`}>{code}</div>
      ) : !error ? (
        <Loader2 className="mt-10 h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      ) : null}
      {code && !error && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Onay bekleniyor…
        </p>
      )}
      {error && (
        <>
          <p role="alert" className="mt-6 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}
            className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium">
            <RefreshCw className="h-4 w-4" /> Tekrar dene
          </button>
        </>
      )}
      <div className="flex-1" />
      <button type="button" className="h-11 text-sm text-muted-foreground" onClick={onRecover}>
        Diğer cihazlarıma erişimim yok
      </button>
    </div>
  )
}

export interface PairRequestView {
  id: string
  deviceName: string
  code: string
}

/** Existing device: "iPhone bağlanmak istiyor · 4821 — Onayla / Reddet". */
export function PairApprovalPrompt({ request, onApprove, onDecline }: {
  request: PairRequestView
  onApprove: () => Promise<void>
  onDecline: () => Promise<void>
}): JSX.Element {
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (kind: 'approve' | 'decline'): Promise<void> => {
    setBusy(kind)
    setError(null)
    try {
      await (kind === 'approve' ? onApprove() : onDecline())
    } catch (err) {
      setError((err as Error).message || 'İşlem yapılamadı')
      setBusy(null)
    }
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Yeni cihaz onayı">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-center shadow-2xl">
        <Smartphone className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold">{request.deviceName} bağlanmak istiyor</h2>
        <p className="mt-2 text-sm text-muted-foreground">O cihazın ekranındaki kod bununla aynıysa onayla.</p>
        <div className="mt-4 font-mono text-4xl font-bold tracking-[0.3em] text-primary">{request.code}</div>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void act('decline')}
            className="flex h-11 items-center justify-center rounded-xl border border-border text-sm font-medium disabled:opacity-50">
            {busy === 'decline' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reddet'}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void act('approve')}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Onayla
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Tanımadığın bir cihazsa reddet; o cihaz eşleşmeden çıkarılır.</p>
      </div>
    </div>
  )
}
