import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Loader2, ShieldCheck, Smartphone, RefreshCw } from 'lucide-react'

export interface EncryptionActions {
  prepare(): Promise<{ words: string[] }>
  commit(answers: Array<{ index: number; word: string }>): Promise<'enabled' | 'lost-race'>
  migrate(onProgress: (p: { step: string; done: number }) => void): Promise<void>
  /** 12 words from another device, or the 24 recovery words. */
  join(words: string): Promise<void>
}

type Step =
  | { kind: 'intro' }
  | { kind: 'words'; words: string[] }
  | { kind: 'confirm'; words: string[]; ask: number[] }
  | { kind: 'migrating'; step: string; done: number }
  | { kind: 'join' }

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
  const [step, setStep] = useState<Step>(status === 'plain' ? { kind: 'intro' } : { kind: 'join' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [joinWords, setJoinWords] = useState('')

  useEffect(() => setStep(status === 'plain' ? { kind: 'intro' } : { kind: 'join' }), [status])

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
      setError('Başka bir cihazın şifrelemeyi biraz önce açtı. O cihazdan "Yeni cihaz ekle" ile aldığın 12 kelimeyi gir.')
      setStep({ kind: 'join' })
      return
    }
    setStep({ kind: 'migrating', step: 'Hazırlanıyor', done: 0 })
    await actions.migrate((p) => setStep({ kind: 'migrating', ...p }))
    onDone()
  })

  const join = (): Promise<void> => run(async () => {
    await actions.join(joinWords)
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

        {step.kind === 'join' && (
          <>
            <Smartphone className="mb-4 h-12 w-12 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Bu cihazı bağla</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Verilerin şifreli. Diğer cihazında <b className="text-foreground">Ayarlar → Cihazlar → Yeni cihaz ekle</b> ile 12 kelime al
              ve buraya yaz. Hiçbir cihazın kalmadıysa 24 kelimelik kurtarma anahtarını gir.
            </p>
            <textarea
              value={joinWords}
              onChange={(e) => setJoinWords(e.target.value)}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
              rows={4}
              placeholder="kelime kelime kelime …"
              aria-label="Eşleştirme veya kurtarma kelimeleri"
              className="mt-5 w-full rounded-xl border border-border bg-card p-3 text-[16px] outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">{joinWords.trim() ? joinWords.trim().split(/\s+/).length : 0} kelime</p>
            <div className="flex-1" />
            <button type="button" className={button} disabled={busy || ![12, 24].includes(joinWords.trim().split(/\s+/).length)} onClick={() => void join()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Bağlan
            </button>
            {status === 'plain' && (
              <button type="button" className="mt-3 h-11 text-sm text-primary" onClick={() => setStep({ kind: 'intro' })}>Geri</button>
            )}
          </>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  )
}

/** "Yeni cihaz ekle": 12 one-time words, valid for 10 minutes. */
export function AddDevicePanel({ create }: { create: () => Promise<{ words: string[]; expiresAt: number }> }): JSX.Element {
  const [offer, setOffer] = useState<{ words: string[]; expiresAt: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const make = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setOffer(await create())
    } catch (err) {
      setError((err as Error).message || 'Kelimeler oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  const left = offer ? Math.max(0, Math.round((offer.expiresAt - now) / 1000)) : 0
  const expired = Boolean(offer) && left === 0
  const mmss = useMemo(() => `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, [left])

  return (
    <div className="space-y-3">
      {!offer || expired ? (
        <button type="button" onClick={() => void make()} disabled={busy} className="flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : expired ? <RefreshCw className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
          {expired ? 'Süre doldu, yeni kelimeler oluştur' : 'Yeni cihaz ekle'}
        </button>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Yeni cihazda <b className="text-foreground">"Bu cihazı bağla"</b> ekranına bu 12 kelimeyi yaz. Kelimeler tek kullanımlık, {mmss} içinde geçerli.
          </p>
          <ol className="grid select-none grid-cols-3 gap-2" style={{ WebkitUserSelect: 'none' }} onCopy={(e) => e.preventDefault()}>
            {offer.words.map((w, i) => (
              <li key={i} className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm">
                <span className="mr-1 text-xs text-muted-foreground">{i + 1}.</span>{w}
              </li>
            ))}
          </ol>
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
