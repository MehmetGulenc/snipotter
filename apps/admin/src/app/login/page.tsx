'use client'
import { useEffect, useState } from 'react'
import { Loader2, Mail, Check, AlertCircle } from 'lucide-react'
import { sendMagicLink, getSession } from '@/lib/auth'

/**
 * Magic-link login. The flow:
 *   1. Operator types email → click "Bağlantı gönder"
 *   2. Supabase emails a one-tap link (expires in 1h)
 *   3. Clicking the link returns to /login?#access_token=...
 *      Supabase JS picks the hash up, stores the session, our useEffect
 *      detects it and redirects to /
 *
 * No password, no signup. The email allowlist in lib/auth.ts is what
 * actually keeps non-admins out — magic-link to a non-allowlisted
 * address still produces a valid Supabase user, but the dashboard
 * guard signs them out the moment they try to read anything.
 */
export default function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // If the user clicked a magic link in their email, the session lands
  // here as a URL hash; Supabase JS persists it, then we bounce to /.
  useEffect(() => {
    void getSession().then((u) => {
      if (u) window.location.href = '/'
    })
  }, [])

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await sendMagicLink(email.trim(), `${window.location.origin}/login/`)
      setSent(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card/60 p-6 shadow-2xl">
        <div className="mb-6">
          <div className="text-base font-semibold">Snipotter — admin</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Tek seferlik giriş bağlantısı e-postana gelir.
          </div>
        </div>

        {sent ? (
          <div className="space-y-3 rounded-md border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <div className="flex items-center gap-2 font-medium">
              <Check className="h-4 w-4" />
              Bağlantı gönderildi
            </div>
            <p className="text-xs text-emerald-200/80">
              {email} adresine giriş bağlantısı atıldı. Maili açıp linke tıkla,
              tarayıcı seni buraya geri getirir.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                E-posta
              </span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  autoFocus
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@gmail.com"
                  className="w-full rounded-md border border-border bg-background px-9 py-2 text-sm outline-none focus:border-primary/60"
                />
              </div>
            </label>

            {err && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{err}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !email}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Bağlantı gönder
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Sadece izin verilmiş e-posta adresleri giriş yapabilir.
        </p>
      </div>
    </div>
  )
}
