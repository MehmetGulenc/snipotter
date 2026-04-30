import {
  Sparkles,
  Smartphone,
  Lock,
  Zap,
  RefreshCcw,
  Apple,
  Globe,
  Github,
  KeyRound,
  Search,
  Pin,
  Download,
  Check,
} from 'lucide-react'
import logoUrl from './logo.svg'

// URLs are centralised so we can swap them later without hunting the JSX.
const APP_URL = 'https://app.snipotter.com'
const RELEASES_URL = 'https://github.com/MehmetGulenc/snipotter/releases/latest'
const REPO_URL = 'https://github.com/MehmetGulenc/snipotter'

export default function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <BackgroundGlow />
      <Nav />
      <Hero />
      <LogoStrip />
      <Features />
      <HowItWorks />
      <Privacy />
      <PricingCTA />
      <Footer />
    </div>
  )
}

/* ===========================================================================
   Decorative background — radial gradient blobs that subtly animate. Pure CSS,
   no images, so the page stays under ~50KB total payload.
   ========================================================================= */
function BackgroundGlow(): JSX.Element {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(252 83% 65%) 0%, transparent 70%)' }}
      />
      <div
        className="absolute right-[-10%] top-[40%] h-[30rem] w-[30rem] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(280 80% 60%) 0%, transparent 70%)' }}
      />
    </div>
  )
}

function Nav(): JSX.Element {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <a href="#" className="flex items-center gap-2 font-semibold tracking-tight">
          <LogoMark />
          Snipotter
        </a>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Özellikler</a>
          <a href="#how" className="hover:text-foreground">Nasıl çalışır</a>
          <a href="#privacy" className="hover:text-foreground">Gizlilik</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
            GitHub
          </a>
        </nav>
        <a
          href={APP_URL}
          className="rounded-lg bg-primary/90 px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary"
        >
          Web'de aç →
        </a>
      </div>
    </header>
  )
}

function LogoMark(): JSX.Element {
  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden
      width={32}
      height={32}
      draggable={false}
      className="h-8 w-8 shrink-0 select-none"
    />
  )
}

/* ===========================================================================
   Hero — main pitch + dual CTAs. The mocked-up clipboard window beside the
   copy gives visitors an instant idea of the product without screenshots.
   ========================================================================= */
function Hero(): JSX.Element {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <div className="animate-fade-in">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
          <Sparkles className="h-3 w-3" /> Kolayca erişebileceğin notlar
        </div>
        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
          Kopyaladığın her şey,
          <br />
          <span className="bg-gradient-to-r from-primary to-fuchsia-400 bg-clip-text text-transparent">
            tüm cihazlarında.
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          Bilgisayarında kopyaladığın bir adresi telefonunda, telefonunda kopyaladığın bir
          metni bilgisayarında anında bul. Hesap açmaya, parola hatırlamaya gerek yok —
          tek bir kod ile cihazlarını eşleştir, gerisi kendiliğinden çalışır.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href={RELEASES_URL}
            className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Masaüstü için indir
          </a>
          <a
            href={APP_URL}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/40 px-5 py-3 font-medium text-foreground transition hover:bg-card"
          >
            <Globe className="h-4 w-4" />
            Web uygulamasını aç
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Apple className="h-3.5 w-3.5" /> macOS Apple Silicon &amp; Intel
          </span>
          <span className="inline-flex items-center gap-1.5">
            <WindowsIcon className="h-3.5 w-3.5" /> Windows 10/11
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LinuxIcon className="h-3.5 w-3.5" /> Linux (deb / AppImage)
          </span>
        </div>
      </div>

      <HeroMock />
    </section>
  )
}

function HeroMock(): JSX.Element {
  return (
    <div className="relative">
      {/* Floating glow behind the mock to give it depth without an image. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 rounded-3xl opacity-50 blur-2xl"
        style={{
          background:
            'linear-gradient(135deg, hsl(252 83% 65% / 0.6), hsl(280 80% 60% / 0.4))',
        }}
      />
      <div className="animate-float overflow-hidden rounded-2xl border border-border bg-card/80 shadow-2xl shadow-primary/10">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 border-b border-border/60 bg-card/90 px-3 py-2.5">
          <span className="h-3 w-3 rounded-full bg-red-500/70" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
          <span className="h-3 w-3 rounded-full bg-green-500/70" />
          <div className="ml-3 flex-1">
            <div className="flex items-center gap-2 rounded-md bg-background/60 px-2 py-1 text-xs text-muted-foreground">
              <Search className="h-3 w-3" /> Pano ara…
            </div>
          </div>
        </div>

        {/* Mock clipboard rows */}
        <div className="space-y-2 p-3">
          <MockClip
            pinned
            text="https://github.com/MehmetGulenc/snipotter"
            tag="link"
            time="şimdi"
          />
          <MockClip
            text="ssh -i ~/.ssh/prod.pem ubuntu@10.0.4.21"
            tag="komut"
            time="2dk önce"
          />
          <MockClip
            text="snipotter@example.com"
            tag="email"
            time="5dk önce"
            sensitive
          />
          <MockClip
            text="Toplantı notları: backlog'u 3 sprint'e böldük, ilk sprint UI refactor."
            tag="özet"
            time="bugün"
          />
        </div>
      </div>
    </div>
  )
}

function MockClip({
  text,
  tag,
  time,
  pinned,
  sensitive,
}: {
  text: string
  tag: string
  time: string
  pinned?: boolean
  sensitive?: boolean
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-2.5 transition hover:border-primary/40">
      <div className="flex items-start gap-2">
        <div className="flex-1 truncate text-xs text-foreground">
          {sensitive ? '••• gizli içerik •••' : text}
        </div>
        {pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{tag}</span>
        <span>{time}</span>
      </div>
    </div>
  )
}

/* ===========================================================================
   Tiny "trusted by your stack" rail — replaces the usual logo wall with the
   tools Snipotter integrates around (clipboard, AI providers, Supabase, etc).
   ========================================================================= */
function LogoStrip(): JSX.Element {
  const items = [
    'macOS · Windows · Linux',
    'iPhone · Android',
    'Akıllı özet & etiketleme',
    'Anlık senkron',
    'Hesap & e-posta gerekmez',
  ]
  return (
    <section className="border-y border-border/40 bg-card/20">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 text-xs text-muted-foreground sm:px-6">
        {items.map((it) => (
          <span key={it} className="font-medium tracking-wide">
            {it}
          </span>
        ))}
      </div>
    </section>
  )
}

/* ===========================================================================
   Features — six tiles, each with an icon + headline + supporting copy.
   Numbers come from the actual product (200 item history, 6-digit code, etc).
   ========================================================================= */
function Features(): JSX.Element {
  const features = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: 'Hızlı yapıştırma',
      copy: 'Tek bir kısayol ile son kopyaladıklarını aç, ara ve seç. Yazarken akışın bozulmaz.',
    },
    {
      icon: <RefreshCcw className="h-5 w-5" />,
      title: 'Anında senkron',
      copy: 'Bilgisayarda kopyaladığını telefonunda, telefondan kopyaladığını bilgisayarında saniyeler içinde bul.',
    },
    {
      icon: <Sparkles className="h-5 w-5" />,
      title: 'Akıllı özet & etiket',
      copy: 'Uzun metinleri otomatik özetler, içeriği etiketler, hassas bilgileri tanır ve listede gizler.',
    },
    {
      icon: <Smartphone className="h-5 w-5" />,
      title: 'Telefonda da çalışır',
      copy: 'iPhone ve Android için ana ekrana ekle, uygulama gibi açılır. Görsel kopyalama dahil.',
    },
    {
      icon: <KeyRound className="h-5 w-5" />,
      title: 'Tek bir kod, hepsi bu',
      copy: 'Hesap yok, parola yok, e-posta yok. Bir cihazda 6 haneli kod al, diğerinde gir, hepsi senkron.',
    },
    {
      icon: <Lock className="h-5 w-5" />,
      title: 'Hassas içerik koruması',
      copy: 'E-posta, telefon, kart numarası gibi bilgileri otomatik gizler. Tek tıkla açılır, başkası gördüğünde rahatsız olmazsın.',
    },
  ]

  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Gündelik akışın için tasarlandı
        </h2>
        <p className="mt-3 text-muted-foreground">
          Karmaşık ayar yok, gereksiz özellik yok. Sadece günlük hayatına gerçekten yarayan şeyler.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="group rounded-xl border border-border bg-card/40 p-5 transition hover:border-primary/40 hover:bg-card/60"
          >
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary transition group-hover:bg-primary/25">
              {f.icon}
            </div>
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.copy}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ===========================================================================
   How it works — three sequential steps with numbers. Helps newcomers grasp
   the pairing flow without reading a tutorial.
   ========================================================================= */
function HowItWorks(): JSX.Element {
  const steps = [
    {
      n: 1,
      title: 'İndir & kur',
      copy: 'macOS, Windows veya Linux için tek tıkla yükle. Web sürümü kurulum gerektirmez.',
    },
    {
      n: 2,
      title: 'Kod ile eşleştir',
      copy: 'Bir cihazda 6 haneli kod oluştur, ikinci cihazda gir. 10 dakika içinde her ikisi de aynı workspace\'te.',
    },
    {
      n: 3,
      title: 'Kopyala & unut',
      copy: 'Her kopyaladığın anında diğer cihazlara akar. Pinleyebilir, arayabilir, nota dönüştürebilirsin.',
    },
  ]
  return (
    <section id="how" className="border-y border-border/40 bg-card/10">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">3 adımda kuruluyor</h2>
          <p className="mt-3 text-muted-foreground">Hesap yok. E-posta yok. 60 saniye.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-xl border border-border bg-card/50 p-6">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 font-bold text-white">
                {s.n}
              </div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ===========================================================================
   Privacy section — defensive copy because clipboard data is sensitive and
   visitors will (rightly) want to know where it lives.
   ========================================================================= */
function Privacy(): JSX.Element {
  const points = [
    'Verilerin yalnızca senin eşleştirdiğin cihazlarla paylaşılır',
    'Kart, telefon ve e-posta gibi hassas bilgiler otomatik gizlenir',
    'Eşleştirme kodları 10 dakika sonra kendiliğinden silinir',
    'Kodun tamamı açık kaynak — istediğin zaman inceleyebilirsin',
  ]
  return (
    <section id="privacy" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
            <Lock className="h-3 w-3" /> Gizlilik öncelikli tasarım
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Pano hassas bir yer. Biz de öyle davranıyoruz.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Snipotter seni takip etmez. Reklam ağı, analitik, üçüncü parti izleme yok.
            Kopyaladığın her şey yalnızca senin eşleştirdiğin cihazlar arasında dolaşır.
          </p>
        </div>
        <ul className="space-y-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 rounded-lg border border-border bg-card/40 p-4">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <span className="text-sm">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ===========================================================================
   Pricing / final CTA — a single card. There is currently no paid plan, so
   we just nudge to download instead of inventing tiers.
   ========================================================================= */
function PricingCTA(): JSX.Element {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/40 to-fuchsia-500/10 p-8 text-center sm:p-14">
        <div
          aria-hidden
          className="absolute -right-20 -top-20 h-80 w-80 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, hsl(252 83% 65%), transparent 70%)' }}
        />
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Şimdilik tamamen ücretsiz.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Snipotter yeni gelişiyor. Şimdilik tüm özellikler herkese açık —
          ücretli plan veya gizli kısıtlama yok.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={RELEASES_URL}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90"
          >
            <Download className="h-4 w-4" /> Masaüstü için indir
          </a>
          <a
            href={APP_URL}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-5 py-3 font-medium text-foreground transition hover:bg-card"
          >
            <Globe className="h-4 w-4" /> Web uygulamasına git
          </a>
        </div>
      </div>
    </section>
  )
}

function Footer(): JSX.Element {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span>© {new Date().getFullYear()} Snipotter</span>
        </div>
        <div className="flex items-center gap-5">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <Github className="h-3.5 w-3.5" /> GitHub
          </a>
          <a href={APP_URL} className="hover:text-foreground">app.snipotter.com</a>
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer" className="hover:text-foreground">
            Sorun bildir
          </a>
        </div>
      </div>
    </footer>
  )
}

/* ===========================================================================
   Tiny inline SVGs for OS badges. lucide doesn't ship Windows/Linux marks, so
   we hand-roll minimal monochrome glyphs.
   ========================================================================= */
function WindowsIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M3 5.5L11 4.3v7.6H3V5.5zM3 12.1h8v7.6L3 18.5v-6.4zM12 4.1L21 3v8.9h-9V4.1zM12 12.1h9V21l-9-1.2v-7.7z" />
    </svg>
  )
}

function LinuxIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2c-2.2 0-4 1.8-4 4 0 1.4.7 2.7 1.8 3.4-.5.7-1.6 2-2.4 3.5-1 1.7-1.6 3.6-1.6 5.1 0 2.2 1.4 4 3.4 4 .7 0 1.4-.3 1.9-.7.3.5.9.7 1.7.7s1.4-.2 1.7-.7c.5.5 1.2.7 1.9.7 2 0 3.4-1.8 3.4-4 0-1.5-.6-3.4-1.6-5.1-.8-1.5-1.9-2.8-2.4-3.5C15.3 8.7 16 7.4 16 6c0-2.2-1.8-4-4-4zm-1.5 4.5c.4 0 .8.4.8.9s-.4.8-.8.8-.8-.4-.8-.8.4-.9.8-.9zm3 0c.4 0 .8.4.8.9s-.4.8-.8.8-.8-.4-.8-.8.4-.9.8-.9z" />
    </svg>
  )
}
