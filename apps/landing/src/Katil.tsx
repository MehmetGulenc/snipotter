import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Smartphone, Laptop, Users } from 'lucide-react'
import logoUrl from './logo.svg'

/**
 * Shared-space invite landing page. The secret sits after "#", which browsers
 * never send to a server; it is read here only to show the words and build the
 * app link. Nothing is stored or sent.
 */
export default function Katil(): JSX.Element {
  const [words, setWords] = useState<string[]>([])

  useEffect(() => {
    const read = (): void => {
      const raw = decodeURIComponent(window.location.hash.slice(1))
      const list = raw.split(/[-\s+_,]+/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]{3,8}$/.test(w))
      setWords(list.length === 12 ? list : [])
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const appLink = words.length ? `snipotter://katil#${words.join('-')}` : 'snipotter://'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Ortak alana davet — Snipotter</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-6 py-3 font-semibold">
          <img src={logoUrl} alt="" aria-hidden width={28} height={28} className="h-7 w-7" /> Snipotter
        </div>
      </header>
      <main className="mx-auto max-w-xl px-6 py-10">
        <Users className="h-10 w-10 text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold">Ortak bir alana davet edildin</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Snipotter ortak alanında notları birlikte yazarsınız. İçerik uçtan uca şifrelidir; bu sayfa da davet kodunu hiçbir sunucuya göndermez.
        </p>

        {words.length === 0 ? (
          <p className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Bu bağlantıda geçerli bir davet yok. Seni davet eden kişiden bağlantıyı yeniden göndermesini iste.
          </p>
        ) : (
          <>
            <a href={appLink} className="mt-6 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground">
              <Smartphone className="h-5 w-5" /> iPhone'da Snipotter ile aç
            </a>
            <div className="mt-6 rounded-xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-medium"><Laptop className="h-4 w-4" /> Bilgisayarda ya da elle katılmak için</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Snipotter'da <b className="text-foreground">Notlar → Notlarım ▾ → Ortak alanlar → Davete katıl</b> ekranına bu sayfanın bağlantısını
                ya da aşağıdaki 12 kelimeyi yaz.
              </p>
              <ol className="mt-3 grid grid-cols-3 gap-2">
                {words.map((w, i) => (
                  <li key={i} className="rounded-lg border border-border px-2 py-1.5 text-sm">
                    <span className="mr-1 text-xs text-muted-foreground">{i + 1}.</span>{w}
                  </li>
                ))}
              </ol>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Davet tek kullanımlıktır ve 7 gün geçerlidir. Snipotter yüklü değilse önce snipotter.com'dan indir.</p>
          </>
        )}
      </main>
    </div>
  )
}
