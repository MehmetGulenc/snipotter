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
  Check,
  Command,
  PencilLine,
  ImagePlus,
  Wand2,
  Share2,
  LayoutGrid,
  ArrowRight,
  Heart,
  Waves,
  Hourglass,
  Mail,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import logoUrl from './logo.svg'
import { SmartDownloadButton } from './SmartDownloadButton'

// URLs are centralised so we can swap them later without hunting the JSX.
const APP_URL = 'https://app.snipotter.com'
const REPO_URL = 'https://github.com/MehmetGulenc/snipotter'

export default function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <BackgroundGlow />
      <Nav />
      <Hero />
      <LogoStrip />
      <UseCases />
      <Features />
      <HiddenFeatures />
      <HowItWorks />
      <Shortcuts />
      <ComingSoon />
      <Story />
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
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <LogoMark />
          Snipotter
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
          <a href="#discover" className="hover:text-foreground">Keşfet</a>
          <a href="#shortcuts" className="hover:text-foreground">Kısayollar</a>
          <a href="#how" className="hover:text-foreground">Nasıl çalışır</a>
          <a href="#hakkinda" className="hover:text-foreground">Hakkında</a>
          <Link to="/yenilikler" className="hover:text-foreground">Yenilikler</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
            GitHub
          </a>
        </nav>
        <a
          href={APP_URL}
          // Hidden on phones — the hero already has a prominent 'Web uygulamasını
          // aç' CTA, and squeezing this into a 360-px header pushed the wordmark
          // into the button on Galaxy / iPhone SE viewports.
          className="hidden rounded-lg bg-primary/90 px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary sm:inline-flex"
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
          <Sparkles className="h-3 w-3" /> Ücretsiz · macOS, Windows, Linux & Web
        </div>
        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
          Kopyaladığın hiçbir şey,
          <br />
          <span className="bg-gradient-to-r from-primary to-fuchsia-400 bg-clip-text text-transparent">
            artık kaybolmayacak.
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          Bir adres, bir Wi-Fi şifresi, akşam unutmaman gereken iki kelime — Mac
          veya Windows bilgisayarında kopyala, tarayıcıdan eriş, diğer makinende
          anında belirsin. Hesap, e-posta, şifre yok. Tek bir 6 haneli kodla
          cihazların el ele tutuşur.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <SmartDownloadButton />
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
            <LinuxIcon className="h-3.5 w-3.5" /> Linux
          </span>
        </div>
      </div>

      <HeroMock />
    </section>
  )
}

/* ===========================================================================
   HeroMock — animated cross-device sync demo. Two device frames (Mac + phone)
   with a pulsing sync indicator between them. A `currentClip` cycles every
   ~3.6s through realistic content types: it first appears at the top of the
   Mac window, then 600ms later replicates into the phone with a brief green
   flash + "senkron" pill. Loops forever, no GIFs, no autoplaying video.

   This is the centrepiece of the "what does this thing do?" answer that
   user testing surfaced — visitors should see the value without reading
   a single feature bullet. The clip examples deliberately mix everyday
   moments (wifi password, addresses, recipe links) with one developer
   nod, so non-technical readers immediately recognise themselves.

   The phone carries a subtle "Yakında · Android" pill because the native
   Android app is still in Play Console review at the time of writing —
   we don't want to promise a download that doesn't yet exist.
   ========================================================================= */
const DEMO_CLIPS: { text: string; tag: string; sensitive?: boolean; image?: boolean }[] = [
  { text: 'Wi-Fi şifresi: cafeNiyazi2024', tag: 'şifre' },
  { text: 'Bağdat Cd. 142/5 Kadıköy', tag: 'adres' },
  { text: 'Ekran görüntüsü', tag: 'görsel', image: true },
  { text: '+90 533 ••• •• ••', tag: 'telefon', sensitive: true },
  { text: 'BAHAR2026 — %30 indirim kodu', tag: 'kupon' },
  { text: 'Anneme: kek için yumurta + kabartma tozu', tag: 'not' },
  { text: 'https://yemek.com/cheesecake-tarifi', tag: 'tarif' },
]

function HeroMock(): JSX.Element {
  // index of the clip currently sitting at the top of the Mac. We cycle
  // through DEMO_CLIPS, and the phone trails the Mac by 600ms via the
  // `phoneIndex` state so visitors see the "Mac copied → phone received"
  // sequence rather than two devices flashing simultaneously.
  const [macIndex, setMacIndex] = useState(0)
  const [phoneIndex, setPhoneIndex] = useState(0)
  const [phoneFlash, setPhoneFlash] = useState(false)

  useEffect(() => {
    const tick = setInterval(() => {
      setMacIndex((i) => (i + 1) % DEMO_CLIPS.length)
    }, 3600)
    return () => clearInterval(tick)
  }, [])

  // Trail the phone behind the Mac. The flash flag is a one-shot pulse used
  // to tint the phone's top row green for ~800ms after each sync — same
  // affordance the desktop app uses when realtime delivers a row.
  useEffect(() => {
    const t = setTimeout(() => {
      setPhoneIndex(macIndex)
      setPhoneFlash(true)
      const off = setTimeout(() => setPhoneFlash(false), 800)
      return () => clearTimeout(off)
    }, 600)
    return () => clearTimeout(t)
  }, [macIndex])

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

      {/* Two-column device grid. On phones we stack vertically and the
          sync indicator sits between, drawn as a horizontal pulse instead.
          Sizing is intentionally tuned so neither device dominates: the
          Mac is wider but the phone is taller, giving the eye balance
          across the gap. */}
      <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[1.4fr_auto_1fr] sm:gap-4">
        {/* — Mac window — */}
        <div className="animate-float overflow-hidden rounded-2xl border border-border bg-card/80 shadow-2xl shadow-primary/10">
          <div className="flex items-center gap-1.5 border-b border-border/60 bg-card/90 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
            <div className="ml-3 flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-background/60 px-2 py-1 text-[11px] text-muted-foreground">
              <Search className="h-3 w-3 shrink-0" />
              <span className="truncate">Ara…</span>
            </div>
          </div>
          <div className="space-y-2 p-3">
            {/* Top row is the active clip — re-keyed on every tick so the
                clip-in animation replays. The remaining rows give context. */}
            <MockClip key={`mac-${macIndex}`} clip={DEMO_CLIPS[macIndex]} time="şimdi" highlight />
            <MockClip clip={DEMO_CLIPS[(macIndex + 4) % DEMO_CLIPS.length]} time="2 dk önce" pinned />
            <MockClip clip={DEMO_CLIPS[(macIndex + 3) % DEMO_CLIPS.length]} time="5 dk önce" />
            <MockClip clip={DEMO_CLIPS[(macIndex + 2) % DEMO_CLIPS.length]} time="bugün" />
          </div>
        </div>

        {/* — Sync indicator — Animated arrow with concentric pulses.
             Rotates 90° on small screens so the geometry still reads
             "Mac → phone" when the layout stacks. */}
        <SyncIndicator />

        {/* — Phone — slightly larger and centred so the device reads at
             a glance. The "Yakında · Android" pill on top makes it
             unmistakably clear that the native phone app is the next
             chapter, not today's reality. */}
        <div className="relative mx-auto w-full max-w-[230px] animate-float [animation-delay:1.5s]">
          {/* Coming-soon ribbon */}
          <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 backdrop-blur">
              <Sparkles className="h-2.5 w-2.5" /> Yakında · Android
            </span>
          </div>
          <div className="overflow-hidden rounded-[2rem] border border-border bg-card/80 p-1.5 shadow-2xl shadow-primary/10">
            <div className="overflow-hidden rounded-[1.6rem] bg-background">
              {/* Status bar sliver */}
              <div className="flex items-center justify-between px-4 py-1.5 text-[9px] text-muted-foreground">
                <span>9:41</span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Snipotter
                </span>
              </div>
              <div className="space-y-1.5 px-2 pb-3">
                <MockClip
                  key={`phone-${phoneIndex}`}
                  clip={DEMO_CLIPS[phoneIndex]}
                  time="şimdi"
                  highlight
                  flash={phoneFlash}
                  compact
                  syncedBadge={phoneFlash}
                />
                <MockClip
                  clip={DEMO_CLIPS[(phoneIndex + 4) % DEMO_CLIPS.length]}
                  time="2 dk"
                  compact
                />
                <MockClip
                  clip={DEMO_CLIPS[(phoneIndex + 3) % DEMO_CLIPS.length]}
                  time="5 dk"
                  compact
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Pulsing arrow drawn between the Mac and phone mocks. Two concentric
 * `pulse-ring` divs offset in time give the impression of data radiating
 * outward; the inner glyph rotates 90° on stacked layouts so it still
 * points the right direction.
 */
function SyncIndicator(): JSX.Element {
  return (
    <div className="relative flex items-center justify-center sm:px-1">
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10 sm:h-10 sm:w-10">
        <span
          aria-hidden
          className="absolute inset-0 animate-pulse-ring rounded-full bg-primary/30"
        />
        <span
          aria-hidden
          className="absolute inset-0 animate-pulse-ring rounded-full bg-primary/30 [animation-delay:0.8s]"
        />
        <RefreshCcw className="relative h-4 w-4 rotate-90 text-primary sm:rotate-0" />
      </div>
    </div>
  )
}

interface MockClipProps {
  clip: { text: string; tag: string; sensitive?: boolean; image?: boolean }
  time: string
  pinned?: boolean
  /** First row in a list — animates in on mount and keeps a subtle accent. */
  highlight?: boolean
  /** Brief green tint applied right after a sync. */
  flash?: boolean
  /** Tighter padding for the phone column. */
  compact?: boolean
  /** Show a "senkron" pill while the row is freshly synced. */
  syncedBadge?: boolean
}

function MockClip({
  clip,
  time,
  pinned,
  highlight,
  flash,
  compact,
  syncedBadge,
}: MockClipProps): JSX.Element {
  return (
    <div
      className={
        'relative overflow-hidden rounded-lg border bg-card/30 transition-all ' +
        (compact ? 'p-2 ' : 'p-2.5 ') +
        // Active row gets a faint left accent instead of a glaring border
        // around the whole pill; quieter visually so the eye still parses
        // the row as a list rather than a button stack.
        (highlight ? 'border-border bg-card/60 ' : 'border-border/40 ') +
        (highlight ? 'animate-clip-in ' : '') +
        (flash ? 'animate-sync-flash ' : '')
      }
    >
      {highlight && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-gradient-to-b from-primary to-fuchsia-400"
        />
      )}
      <div className="flex items-start gap-2">
        <div
          className={
            'min-w-0 flex-1 truncate text-foreground ' +
            (compact ? 'text-[11px]' : 'text-xs')
          }
        >
          {clip.image ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block h-3 w-4 rounded-sm bg-gradient-to-br from-primary/40 to-fuchsia-500/40" />
              Tatil fotoğrafı
            </span>
          ) : clip.sensitive ? (
            <span className="text-muted-foreground">••• gizli içerik •••</span>
          ) : (
            clip.text
          )}
        </div>
        {pinned && <Pin className="h-3 w-3 shrink-0 text-primary/70" />}
      </div>
      <div
        className={
          'mt-1.5 flex items-center justify-between gap-2 text-muted-foreground ' +
          (compact ? 'text-[9px]' : 'text-[10px]')
        }
      >
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-primary">
            {clip.tag}
          </span>
          {syncedBadge && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-0.5 text-[8px] font-medium text-emerald-400">
              <Zap className="h-2 w-2" />
              senkron
            </span>
          )}
        </span>
        <span className="shrink-0">{time}</span>
      </div>
    </div>
  )
}

/* ===========================================================================
   Tiny "trusted by your stack" rail — replaces the usual logo wall with the
   tools Snipotter integrates around (clipboard, AI providers, Supabase, etc).
   ========================================================================= */
function LogoStrip(): JSX.Element {
  // Strip lists what's actually shipping today (so first-time visitors don't
  // try to install a non-existent native phone app). Coming-soon platforms
  // are surfaced explicitly in the dedicated <ComingSoon /> section below.
  const items = [
    'macOS · Windows · Linux',
    'Tarayıcıdan da çalışır',
    'Anlık senkron',
    'Akıllı özet & etiketleme',
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
      copy: 'Bilgisayarda kopyaladığın şey diğer cihazlarında anında belirir — göz açıp kapayıncaya kadar.',
    },
    {
      icon: <Sparkles className="h-5 w-5" />,
      title: 'Akıllı özet & etiket',
      copy: 'Uzun metinleri otomatik özetler, içeriği etiketler, hassas bilgileri tanır ve listede gizler.',
    },
    {
      icon: <Smartphone className="h-5 w-5" />,
      title: 'Tarayıcıdan da çalışır',
      copy: 'app.snipotter.com — telefonda Safari/Chrome\'dan aç, "Ana Ekrana Ekle" de, uygulama gibi davransın. Native Android uygulaması da çok yakında.',
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
   UseCases — three persona snapshots. Originally the landing answered
   *what* Snipotter is but never *who it's for*; visitors who don't relate
   to "clipboard manager" as a category bounced. Each persona names a
   concrete daily moment ("Stack Overflow'dan komut kopyalıyorum") so the
   reader recognises themselves in one of them within ~5 seconds.
   ========================================================================= */
const PERSONAS: { tag: string; title: string; copy: string; bullets: string[] }[] = [
  {
    tag: 'Geliştirici',
    title: "Terminal'in ile telefon arasında",
    copy: "SSH komutları, API key parçaları, hata logları — gün içinde defalarca cihaz değiştiriyorsun. Snipotter aynı pano havuzunu her ikisine de açar.",
    bullets: [
      'Stack Overflow\'dan kopyaladığın komut, telefondaki kılavuza otomatik yansır',
      'Hassas tokenlar listede gizli, ama sen tek tıkla görebilirsin',
      'AI etiket "komut", "json", "config" gibi otomatik kategorize eder',
    ],
  },
  {
    tag: 'İçerik üreticisi',
    title: 'Telefondaki ilham, masaüstündeki düzen',
    copy: 'Yolda gördüğün ilginç linki telefondan kopyala. Bilgisayara döndüğünde Snipotter\'da seni bekler. Notlara çevir, AI özet bağlasın.',
    bullets: [
      'Mobilden paylaş hedefi ile herhangi bir uygulamadan içerik düşür',
      'Görsel kopyala — ekran görüntüsü diğer cihazda önizlemeli',
      'Pinli öğeler her zaman üstte, kampanya fikirlerin kaybolmaz',
    ],
  },
  {
    tag: 'Öğrenci & araştırmacı',
    title: 'Ders notu, kaynak, fikir — hepsi tek yerde',
    copy: 'Tarayıcıda PDF, dersanede defter, akşam evde özet. Snipotter klipleri zamanla biriktirir, AI özetle uzun pasajlardan tek satır çıkarır.',
    bullets: [
      'Cmd+Shift+N ile aklına geleni 2 saniyede yazıya geçir',
      'Aramaya başla, içerikten + etiketten + özetten birlikte arar',
      'Hesap, e-posta, ödeme yok — sadece bir 6 haneli kod',
    ],
  },
]

function UseCases(): JSX.Element {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Snipotter senin için ne yapar?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Üç farklı günlük rutin — büyük ihtimalle bir tanesinde kendini bulacaksın.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PERSONAS.map((p) => (
          <div
            key={p.title}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-6 transition hover:border-primary/40 hover:bg-card/60"
          >
            <span className="self-start rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              {p.tag}
            </span>
            <h3 className="text-lg font-semibold">{p.title}</h3>
            <p className="text-sm text-muted-foreground">{p.copy}</p>
            <ul className="mt-1 space-y-2 border-t border-border/60 pt-3">
              {p.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ===========================================================================
   HiddenFeatures — six "you probably haven't noticed this yet" cards. This
   section exists because user-testing surfaced the recurring complaint that
   visitors thought Snipotter was "just a clipboard sync" — they had no idea
   Quick Paste, Quick Note, the AI tagger, or the Android share/tile flows
   existed. Each card embeds a small inline visual (no images/GIFs, just
   styled DOM) that shows the surface in action.
   ========================================================================= */
function HiddenFeatures(): JSX.Element {
  return (
    <section id="discover" className="border-y border-border/40 bg-card/10">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-1 text-xs text-fuchsia-300">
            <Sparkles className="h-3 w-3" /> Çoğu kişinin ilk başta fark etmediği
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Snipotter sadece bir pano değil.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Görünenin ardında 6 küçük süper güç var. Kısayollar bilince akış
            inanılmaz hızlanır — birkaç gün sonra her makineye otomatik kuruyor olacaksın.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <DiscoverCard
            icon={<Command className="h-5 w-5" />}
            badge={
              <span className="inline-flex items-center gap-1.5 text-xs">
                <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>V</Kbd>
              </span>
            }
            title="Hızlı yapıştır"
            copy="Tek bir kısayol; son kopyaladıklarının üstüne mini bir pencere düşer. Aklındaki kelimeyi yaz, liste anında filtrelenir. ↑↓ ile gez, Enter ile yapıştır — akışın bozulmaz."
            visual={<QuickPasteVisual />}
          />
          <DiscoverCard
            icon={<PencilLine className="h-5 w-5" />}
            badge={
              <span className="inline-flex items-center gap-1.5 text-xs">
                <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>N</Kbd>
              </span>
            }
            title="Hızlı not"
            copy="Hangi uygulamada olursan ol — markete giderken aklına gelen şey, biriyle konuşurken not almak istediğin tarih — kısayola bas, küçük pencere açılır, yazıp ⌘+Enter ile kaydet."
            visual={<QuickNoteVisual />}
          />
          <DiscoverCard
            icon={<ImagePlus className="h-5 w-5" />}
            badge={<span className="text-xs text-muted-foreground">PNG · JPG · Ekran görüntüsü</span>}
            title="Görsel öğeler de senkron"
            copy="Sadece metin değil. Bir tatil fotoğrafı, bir tarif ekran görüntüsü, ürün görseli — kopyala, diğer cihazında önizlemeli olarak görün, oradan da kopyalayıp istediğin yere yapıştır."
            visual={<ImageVisual />}
          />
          <DiscoverCard
            icon={<Wand2 className="h-5 w-5" />}
            badge={<span className="text-xs text-muted-foreground">Otomatik · saniyeler içinde</span>}
            title="AI özet & etiket"
            copy="Uzun bir mesaj, blog yazısı ya da maddeler halindeki bir alışveriş listesini kopyala. Snipotter kısa bir özet çıkarır, içeriği etiketler. Telefon, kart numarası gibi hassas şeyleri tanır ve listede gizler."
            visual={<AIVisual />}
          />
          <DiscoverCard
            icon={<Share2 className="h-5 w-5" />}
            badge={<ComingSoonBadge label="Yakında · Android" />}
            title="Paylaş hedefi"
            copy="WhatsApp'taki bir mesaj, Instagram'daki bir paylaşım, Chrome'da gördüğün bir tarif — uzun bas, paylaş, Snipotter'ı seç. O içerik panonun en üstünde belirir, bilgisayarına da anında düşer."
            visual={<ShareTargetVisual />}
          />
          <DiscoverCard
            icon={<LayoutGrid className="h-5 w-5" />}
            badge={<ComingSoonBadge label="Yakında · Android" />}
            title="Hızlı ayarlar düğmesi"
            copy="Bildirim panelini aşağı çek, 'Panoyu Kaydet' düğmesine bas. O an telefonun panosunda ne varsa Snipotter'a yedeklenir — uygulamayı açmana gerek bile yok."
            visual={<TileVisual />}
          />
        </div>
      </div>
    </section>
  )
}

interface DiscoverCardProps {
  icon: React.ReactNode
  badge?: React.ReactNode
  title: string
  copy: string
  visual: React.ReactNode
}

function DiscoverCard({ icon, badge, title, copy, visual }: DiscoverCardProps): JSX.Element {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card/40 transition hover:border-primary/40 hover:bg-card/60">
      {/* Visual demo zone — fixed-ish height keeps the grid tidy regardless
          of how big each individual mock is. */}
      <div className="relative flex h-48 items-center justify-center overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/5 via-card/30 to-fuchsia-500/5 p-4">
        {visual}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              {icon}
            </div>
            <h3 className="font-semibold">{title}</h3>
          </div>
          {badge}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy}</p>
      </div>
    </article>
  )
}

/** Stylised keyboard key. Used both inline ("⌘") and inside visuals. */
function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <kbd className="inline-flex min-w-[1.4rem] items-center justify-center rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium text-foreground shadow-sm shadow-black/20">
      {children}
    </kbd>
  )
}

/** Coming-soon pill used on Android-only feature cards while the native
 *  app is in Play Console review. Visually distinct from "YENİ · Android"
 *  so visitors don't try to install something that isn't downloadable yet. */
function ComingSoonBadge({ label }: { label: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
      <Sparkles className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}

/* — Visual: Quick Paste — keyboard + popup hovering above. The example
   query is "wifi" because that's the most universally relatable thing
   people copy-paste — café passwords, guest network credentials, etc. */
function QuickPasteVisual(): JSX.Element {
  return (
    <div className="relative w-full max-w-xs">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xl shadow-primary/20">
        <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
          <Search className="h-3 w-3" />
          wifi
        </div>
        <div className="space-y-0.5 p-1.5">
          <div className="flex items-center gap-2 rounded bg-primary/10 px-2 py-1.5 text-[11px] text-foreground ring-1 ring-primary/30">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            cafeNiyazi2024
          </div>
          <div className="truncate px-2 py-1.5 text-[11px] text-muted-foreground">
            ev-wifi: aslihan_42
          </div>
          <div className="truncate px-2 py-1.5 text-[11px] text-muted-foreground">
            misafir wifi: 1234567
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-1">
        <Kbd>⌘</Kbd>
        <Kbd>⇧</Kbd>
        <Kbd>V</Kbd>
      </div>
    </div>
  )
}

/* — Visual: Quick Note — small floating editor with everyday content
   (a market list rather than a "meeting notes" cliché). */
function QuickNoteVisual(): JSX.Element {
  return (
    <div className="w-full max-w-xs">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xl shadow-primary/20">
        <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
          <PencilLine className="h-3 w-3 text-primary" />
          Snipotter — Hızlı Not
        </div>
        <div className="space-y-1 p-2.5 text-[11px] leading-relaxed text-foreground">
          <div>Markete:</div>
          <div className="text-muted-foreground">— yumurta, süt, kabartma tozu</div>
          <div className="text-muted-foreground">— annemden tarif sor</div>
          <div className="-mt-0.5 inline-block h-3 w-px bg-primary/80" />
        </div>
        <div className="flex items-center justify-between border-t border-border/60 px-2.5 py-1 text-[9px] text-muted-foreground">
          <span>⌘+Enter ile kaydet</span>
          <span>54 karakter</span>
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-1">
        <Kbd>⌘</Kbd>
        <Kbd>⇧</Kbd>
        <Kbd>N</Kbd>
      </div>
    </div>
  )
}

/* — Visual: Image clipboard — a tiny "photo" travels from Mac to phone
   over a glowing arc, more communicative than two static gradient blocks
   side-by-side. The "photo" is a stylised landscape (gradient + horizon
   line + sun) so it reads as an actual image at a glance. */
function ImageVisual(): JSX.Element {
  return (
    <div className="relative flex w-full items-center justify-between gap-2 px-1">
      {/* Mac thumbnail */}
      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="relative aspect-video w-full overflow-hidden rounded border border-border">
          <PhotoMock />
        </div>
        <div className="text-[9px] text-muted-foreground">Mac · ⌘C</div>
      </div>
      {/* Animated arc */}
      <div className="flex flex-col items-center gap-1">
        <div className="relative">
          <ArrowRight className="h-4 w-4 text-primary" />
          <span
            aria-hidden
            className="absolute inset-0 -m-1 animate-pulse-ring rounded-full bg-primary/30"
          />
        </div>
        <span className="text-[8px] uppercase tracking-wide text-primary/70">senkron</span>
      </div>
      {/* Phone thumbnail */}
      <div className="flex w-14 flex-col items-center gap-1.5">
        <div className="rounded-[6px] border border-border bg-card p-0.5">
          <div className="relative aspect-[9/16] w-11 overflow-hidden rounded-[3px]">
            <PhotoMock />
          </div>
        </div>
        <div className="text-[9px] text-muted-foreground">Telefon</div>
      </div>
    </div>
  )
}

/** Stylised holiday photo — sky gradient, hill silhouette, sun. Reads
 *  as a real image without having to ship a real one. */
function PhotoMock(): JSX.Element {
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, hsl(220 80% 60%) 0%, hsl(35 90% 65%) 70%, hsl(20 80% 50%) 100%)',
        }}
      />
      <span
        aria-hidden
        className="absolute right-1 top-1 h-2 w-2 rounded-full bg-yellow-100/90"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background: 'linear-gradient(180deg, hsl(150 40% 22%) 0%, hsl(150 50% 14%) 100%)',
          clipPath: 'polygon(0 35%, 25% 25%, 45% 50%, 70% 20%, 100% 40%, 100% 100%, 0 100%)',
        }}
      />
    </>
  )
}

/* — Visual: AI tagging — long everyday text → summary + tags. Example
   is a recipe extract because (a) people actually copy these, (b) the
   tags map to recognisable categories, (c) it shows the AI's value to
   a non-developer reader. */
function AIVisual(): JSX.Element {
  return (
    <div className="w-full max-w-xs space-y-1.5">
      <div className="rounded border border-border/60 bg-background/60 p-2 text-[10px] leading-snug text-muted-foreground">
        "200 g un, 3 yumurta, yarım çay bardağı süt, 1 paket kabartma tozu;
        karıştır, 180°'de 25 dk pişir…"
      </div>
      <div className="flex justify-center">
        <Wand2 className="h-3.5 w-3.5 animate-pulse text-primary" />
      </div>
      <div className="rounded border border-primary/30 bg-primary/5 p-2 text-[10px] leading-snug text-foreground">
        Kek tarifi · 200 g un + 3 yumurta · 25 dk
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        {['tarif', 'mutfak', 'fırın'].map((t) => (
          <span
            key={t}
            className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] text-primary"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

/* — Visual: Share Target — phone with system share sheet. Example
   message is now an everyday WhatsApp-style fragment instead of a
   meeting note, matching the wider "real life" framing.

   The Snipotter app icon is rendered larger and with a glow ring so
   it's unmistakably the choice the visitor would tap. */
function ShareTargetVisual(): JSX.Element {
  const apps = [
    { label: 'Mesajlar', tone: 'bg-emerald-500/30', ring: '' },
    { label: 'Snipotter', tone: 'bg-primary/50', ring: 'ring-2 ring-primary shadow-md shadow-primary/40' },
    { label: 'Drive', tone: 'bg-yellow-500/30', ring: '' },
    { label: 'Notlar', tone: 'bg-fuchsia-500/30', ring: '' },
  ]
  return (
    <div className="relative mx-auto w-full max-w-[180px]">
      <div className="overflow-hidden rounded-[1.5rem] border border-border bg-card/80 p-1 shadow-xl">
        <div className="overflow-hidden rounded-[1.2rem] bg-background">
          <div className="space-y-0.5 px-3 pb-1 pt-2">
            <div className="text-[9px] font-medium text-foreground">Aslı</div>
            <div className="text-[10px] leading-snug text-muted-foreground">
              "Buluşma yeri: Caddebostan sahil, saat 17:00 🍦"
            </div>
          </div>
          <div className="border-t border-border/60 bg-card/50 px-2 py-2">
            <div className="mb-1.5 text-center text-[9px] text-muted-foreground">
              Paylaş…
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {apps.map((a) => (
                <div key={a.label} className="flex flex-col items-center gap-0.5">
                  <div className={`h-7 w-7 rounded-lg ${a.tone} ${a.ring}`} />
                  <div className="truncate text-[7px] text-muted-foreground">
                    {a.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* — Visual: Quick Settings tile — a clearer rendition than the v1, which
   crammed six fake tiles into a postage stamp. Now: a single phone with
   a recognisable pull-down panel showing the Snipotter tile already
   pressed (purple fill), and a confirmation toast underneath. The
   surrounding tiles stay grey to keep the eye on Snipotter. */
function TileVisual(): JSX.Element {
  return (
    <div className="relative mx-auto w-full max-w-[200px]">
      <div className="overflow-hidden rounded-[1.5rem] border border-border bg-card/80 p-1 shadow-xl">
        <div className="overflow-hidden rounded-[1.2rem] bg-background">
          {/* Status sliver suggesting the panel is pulled down */}
          <div className="flex items-center justify-between px-3 pt-1.5 pb-1 text-[8px] text-muted-foreground">
            <span>9:41</span>
            <span>•••</span>
          </div>
          <div className="space-y-1.5 px-2 pb-2">
            {/* 4-tile row mimicking Android Quick Settings layout */}
            <div className="grid grid-cols-4 gap-1.5">
              <TileBtn label="Wi-Fi" icon="wifi" />
              <TileBtn label="Bluetooth" icon="bt" />
              <TileBtn label="Snipotter" icon="snip" highlight />
              <TileBtn label="Konum" icon="loc" />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <TileBtn label="Pil" icon="batt" />
              <TileBtn label="Uçak" icon="air" />
              <TileBtn label="Sessiz" icon="mute" />
              <TileBtn label="Fener" icon="torch" />
            </div>
            {/* Confirmation toast */}
            <div className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[9px] text-primary">
              <Check className="h-2.5 w-2.5" />
              Snipotter'a kaydedildi
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TileBtn({
  label,
  icon,
  highlight,
}: {
  label: string
  icon: 'wifi' | 'bt' | 'snip' | 'loc' | 'batt' | 'air' | 'mute' | 'torch'
  highlight?: boolean
}): JSX.Element {
  return (
    <div
      className={
        'flex flex-col items-center gap-0.5 rounded-lg border p-1.5 transition ' +
        (highlight
          ? 'border-primary/60 bg-primary/20 text-primary shadow-sm shadow-primary/20'
          : 'border-border/60 bg-card/50 text-muted-foreground')
      }
    >
      <TileIcon name={icon} highlight={highlight} />
      <span className="text-[7px] leading-tight">{label}</span>
    </div>
  )
}

function TileIcon({
  name,
  highlight,
}: {
  name: 'wifi' | 'bt' | 'snip' | 'loc' | 'batt' | 'air' | 'mute' | 'torch'
  highlight?: boolean
}): JSX.Element {
  // Tiny inline glyphs — visually distinct enough to read as different
  // toggles without pulling in 8 lucide icons.
  const stroke = highlight ? 'currentColor' : 'currentColor'
  if (name === 'snip') {
    return (
      <span className={'inline-block h-3 w-3 rounded-full ' + (highlight ? 'bg-primary' : 'bg-muted-foreground/40')} />
    )
  }
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke={stroke} strokeWidth="1.2" aria-hidden>
      {name === 'wifi' && (
        <>
          <path d="M2 5c2-2 6-2 8 0" />
          <path d="M3.5 7c1.5-1.5 3.5-1.5 5 0" />
          <circle cx="6" cy="9" r="0.6" fill={stroke} />
        </>
      )}
      {name === 'bt' && <path d="M5 2v8l3-3-6-3 6-3-3-3z" />}
      {name === 'loc' && <path d="M6 2c-2 0-3.5 1.5-3.5 3.5C2.5 8 6 11 6 11s3.5-3 3.5-5.5C9.5 3.5 8 2 6 2zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />}
      {name === 'batt' && (
        <>
          <rect x="2" y="4" width="7" height="5" rx="0.5" />
          <line x1="9.5" y1="5.5" x2="9.5" y2="7.5" />
        </>
      )}
      {name === 'air' && <path d="M6 2v3l-4 2v1l4-1v3l-1 1v0.5L6 11l1 0.5V11l-1-1V7l4 1V7l-4-2V2z" />}
      {name === 'mute' && (
        <>
          <path d="M3 4v4h2l3 2V2L5 4z" />
          <line x1="9" y1="4" x2="11" y2="8" />
          <line x1="11" y1="4" x2="9" y2="8" />
        </>
      )}
      {name === 'torch' && (
        <>
          <path d="M5 2h2v2l1 1v5H4V5l1-1z" />
          <line x1="6" y1="6" x2="6" y2="8" />
        </>
      )}
    </svg>
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
   Shortcuts — single-page cheatsheet. Keyboard shortcuts are the biggest
   power-user lever in Snipotter, but they were buried in the help docs;
   listing them on the landing converts visitors who scan for "is this
   keyboard-driven?" before downloading.
   ========================================================================= */
function Shortcuts(): JSX.Element {
  // Global shortcuts run while the desktop app is in the background; in-app
  // shortcuts only fire when one of Snipotter's own windows is focused. We
  // separate them visually so users don't think every shortcut requires the
  // app foreground.
  const global = [
    { keys: ['⌘', '⇧', 'V'], desc: 'Hızlı yapıştır — son 50 kopyayı aç' },
    { keys: ['⌘', '⇧', 'N'], desc: 'Hızlı not — küçük editör panelini aç' },
  ]
  const inApp = [
    { keys: ['↑', '↓'], desc: 'Listede gez' },
    { keys: ['Enter'], desc: 'Seçili öğeyi panoya yapıştır' },
    { keys: ['⌘', '1'], to: ['9'], desc: 'Listede 1-9. öğeye doğrudan atla' },
    { keys: ['⌘', 'F'], desc: 'Pano içinde ara' },
    { keys: ['⌘', 'P'], desc: 'Seçili öğeyi sabitle / kaldır' },
    { keys: ['⌫'], desc: 'Seçili öğeyi sil' },
    { keys: ['Esc'], desc: 'Pencereyi kapat' },
  ]

  return (
    <section id="shortcuts" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mb-10 max-w-2xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
          <Command className="h-3 w-3" /> Klavyeden çıkmadan
        </div>
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Tüm kısayollar
        </h2>
        <p className="mt-3 text-muted-foreground">
          Fareye hiç dokunmadan kullanılır. Birkaç gün sonra parmakların kendi
          gidiyor.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-primary/20 bg-card/40 p-6">
          <div className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <Zap className="h-4 w-4" /> Genel — uygulama arka planda olsa bile
          </div>
          <ul className="space-y-3">
            {global.map((s) => (
              <ShortcutRow key={s.desc} keys={s.keys} desc={s.desc} />
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-card/40 p-6">
          <div className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Search className="h-4 w-4" /> Uygulama içinde
          </div>
          <ul className="space-y-3">
            {inApp.map((s) => (
              <ShortcutRow key={s.desc} keys={s.keys} to={s.to} desc={s.desc} />
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Windows / Linux'ta <Kbd>Ctrl</Kbd> kullanılır. Kısayollar Ayarlar → Kısayollar'dan değiştirilebilir.
      </p>
    </section>
  )
}

function ShortcutRow({
  keys,
  to,
  desc,
}: {
  keys: string[]
  to?: string[]
  desc: string
}): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-border/40 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{desc}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
        {to && (
          <>
            <span className="text-xs text-muted-foreground">…</span>
            {to.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </>
        )}
      </span>
    </li>
  )
}

/* ===========================================================================
   ComingSoon — tells visitors what's around the corner without overpromising.
   Right now Snipotter for Android is in Play Console review and the
   Microsoft Store submission is queued; before this section visitors had to
   read the desktop README to find out, which was nonsense. Two side-by-side
   "coming soon" cards with the relevant store glyphs make it explicit.
   ========================================================================= */
function ComingSoon(): JSX.Element {
  const slots = [
    {
      title: 'Snipotter — Android',
      sub: 'Google Play onayı bekleniyor',
      copy: 'Telefondan herhangi bir uygulamadaki metni paylaş, hızlı ayarlar düğmesiyle anında pano kaydet, masaüstündeki kütüphanenle aynı sırada gör.',
      icon: <Smartphone className="h-5 w-5" />,
      tone: 'from-emerald-500/20 to-emerald-700/10',
    },
    {
      title: 'Snipotter — Microsoft Store',
      sub: 'Yayın için hazırlanıyor',
      copy: 'Şu an .exe yükleyici ile geliyoruz; önümüzdeki sürümle Microsoft Store üzerinden tek tıkla kuracaksın. Otomatik güncelleme dahil.',
      icon: <WindowsIcon className="h-5 w-5" />,
      tone: 'from-sky-500/20 to-sky-700/10',
    },
  ]
  return (
    <section className="border-y border-border/40 bg-card/10">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <Hourglass className="h-3 w-3" /> Çok yakında
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Önümüzdeki haftalar
          </h2>
          <p className="mt-3 text-muted-foreground">
            Snipotter şu an macOS, Windows ve Linux'ta — tarayıcıdan da çalışır.
            Sıradaki iki adres çok yakında:
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {slots.map((s) => (
            <div
              key={s.title}
              className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${s.tone} p-6 transition hover:border-emerald-400/40`}
            >
              <div className="flex items-start gap-4">
                <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card/80 text-emerald-300 ring-1 ring-emerald-400/30">
                  {s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <div className="text-xs text-emerald-300/80">{s.sub}</div>
                  <p className="mt-3 text-sm text-muted-foreground">{s.copy}</p>
                </div>
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl"
              />
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Çıkar çıkmaz haberin olsun mu?{' '}
          <Link to="/yenilikler" className="text-primary hover:underline">
            Yenilikler sayfasını
          </Link>{' '}
          takip et.
        </p>
      </div>
    </section>
  )
}

/* ===========================================================================
   Story — the otter. Snipotter's logo is a sea-otter holding a clipboard,
   and the brand has, until now, never explained why. Sea otters do
   something humans find genuinely moving: they hold each others' paws
   while they sleep so the current doesn't drift them apart from their
   family. That image — staying connected even when you let go of
   attention for a moment — is exactly what the product does for your
   clipboards. So this section finally tells that story, and credits the
   small, indie effort behind it.
   ========================================================================= */
function Story(): JSX.Element {
  return (
    <section id="hakkinda" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        {/* Left: stylised otters holding paws */}
        <div className="relative mx-auto w-full max-w-md">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 rounded-3xl opacity-40 blur-3xl"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, hsl(220 70% 50% / 0.5), transparent 70%)',
            }}
          />
          <OttersHoldingPaws />
        </div>

        {/* Right: copy */}
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            <Heart className="h-3 w-3" /> Snipotter'ın hikayesi
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Su samurları gibi —{' '}
            <span className="bg-gradient-to-r from-sky-300 to-primary bg-clip-text text-transparent">
              cihazların el ele.
            </span>
          </h2>
          <div className="mt-5 space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>
              Su samurları okyanusta uyurken birbirlerinin elini tutar. Akıntı,
              uyandıklarında onları ayrı yerlerde bulmasın diye. Aile bir arada
              kalsın diye.
            </p>
            <p>
              Snipotter'ın da derdi tam olarak bu. Her gün düzinelerce şey
              kopyaladığını biliyoruz — bir adres, bir Wi-Fi şifresi, akşam unutmaman
              gereken iki kelime. Cihaz değiştirdiğin an çoğu kayboluyor.
              Snipotter, panoyu cihazlar arasında "el ele" tutar; sen başka bir
              ekrana geçtiğinde önemli olan şey orada seni bekliyor.
            </p>
            <p>
              Bağımsız, küçük bir takım — açık kaynak, reklamsız, hesap istemeyen.
              Bir cihazda 6 haneli kod yarat, ötekinde gir, hepsi bu. Geri kalanını
              biz hallediyoruz.
            </p>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StoryStat
              icon={<Lock className="h-3.5 w-3.5" />}
              top="0"
              bottom="reklam · izleyici"
            />
            <StoryStat
              icon={<Mail className="h-3.5 w-3.5" />}
              top="0"
              bottom="e-posta · şifre"
            />
            <StoryStat
              icon={<Github className="h-3.5 w-3.5" />}
              top="100%"
              bottom="açık kaynak"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

/** Tiny stat tile used in the Story section. */
function StoryStat({
  icon,
  top,
  bottom,
}: {
  icon: React.ReactNode
  top: string
  bottom: string
}): JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3 text-center">
      <div className="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="text-lg font-bold leading-none">{top}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {bottom}
      </div>
    </div>
  )
}

/**
 * Two stylised sea otters floating on their backs, holding paws across the
 * gap. Pure SVG, no images. The body shapes are simplified ellipses and the
 * "paws-clasped" connection is the visual hook of the piece — same metaphor
 * as the product itself. Slow waves animate beneath them via a separate
 * stylesheet block to suggest the ocean without distracting from the otters.
 */
function OttersHoldingPaws(): JSX.Element {
  return (
    <div className="relative aspect-[5/4] overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-sky-950/40 via-slate-950/60 to-card/80 p-4">
      {/* Stars */}
      {[...Array(12)].map((_, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute rounded-full bg-white/40"
          style={{
            top: `${(i * 13 + 5) % 60}%`,
            left: `${(i * 17 + 3) % 100}%`,
            width: i % 3 === 0 ? 2 : 1,
            height: i % 3 === 0 ? 2 : 1,
            opacity: 0.3 + (i % 4) * 0.15,
          }}
        />
      ))}

      <svg viewBox="0 0 400 320" className="relative h-full w-full" aria-hidden>
        {/* Soft moonlight glow */}
        <defs>
          <radialGradient id="moonGlow" cx="0.85" cy="0.15" r="0.4">
            <stop offset="0%" stopColor="hsl(40 100% 90%)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(40 100% 90%)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ottBody" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(20 35% 40%)" />
            <stop offset="100%" stopColor="hsl(20 30% 28%)" />
          </linearGradient>
          <linearGradient id="ottBelly" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(30 35% 75%)" />
            <stop offset="100%" stopColor="hsl(30 30% 60%)" />
          </linearGradient>
        </defs>
        <rect width="400" height="320" fill="url(#moonGlow)" />
        <circle cx="340" cy="50" r="22" fill="hsl(40 100% 92%)" opacity="0.85" />

        {/* Water surface line */}
        <path
          d="M0 200 Q 50 195 100 200 T 200 200 T 300 200 T 400 200 V 320 H 0 Z"
          fill="hsl(220 60% 18%)"
          opacity="0.75"
        />
        <path
          d="M0 220 Q 60 213 120 220 T 240 220 T 360 220 T 400 220"
          fill="none"
          stroke="hsl(200 80% 70% / 0.35)"
          strokeWidth="1.5"
        />
        <path
          d="M0 245 Q 80 238 160 245 T 320 245 T 400 245"
          fill="none"
          stroke="hsl(200 80% 70% / 0.2)"
          strokeWidth="1.5"
        />

        {/* Left otter — floating on back, head left, paw extended right */}
        <g transform="translate(60 130)">
          {/* Body */}
          <ellipse cx="80" cy="55" rx="80" ry="32" fill="url(#ottBody)" />
          {/* Belly */}
          <ellipse cx="75" cy="48" rx="56" ry="20" fill="url(#ottBelly)" />
          {/* Head */}
          <circle cx="22" cy="30" r="26" fill="url(#ottBody)" />
          {/* Snout */}
          <ellipse cx="6" cy="34" rx="9" ry="7" fill="hsl(30 35% 80%)" />
          <circle cx="2" cy="32" r="2" fill="hsl(20 30% 18%)" />
          {/* Eye */}
          <circle cx="20" cy="24" r="2.2" fill="hsl(20 30% 12%)" />
          <circle cx="20.6" cy="23.4" r="0.7" fill="white" />
          {/* Ear */}
          <circle cx="40" cy="14" r="4" fill="url(#ottBody)" />
          {/* Whiskers */}
          <line x1="0" y1="36" x2="-10" y2="38" stroke="hsl(30 30% 80%)" strokeWidth="0.6" />
          <line x1="0" y1="33" x2="-10" y2="32" stroke="hsl(30 30% 80%)" strokeWidth="0.6" />
          {/* Right paw — extends to clasp */}
          <ellipse cx="158" cy="46" rx="14" ry="9" fill="url(#ottBody)" />
          {/* Left paw resting on belly */}
          <ellipse cx="60" cy="40" rx="9" ry="6" fill="url(#ottBody)" />
          {/* Tail tucked */}
          <ellipse cx="155" cy="70" rx="20" ry="6" fill="url(#ottBody)" opacity="0.85" />
        </g>

        {/* Right otter — mirrored. Translate so the paw lands at the same
            spot as the left otter's outstretched paw. */}
        <g transform="translate(340 130) scale(-1 1)">
          <ellipse cx="80" cy="55" rx="80" ry="32" fill="url(#ottBody)" />
          <ellipse cx="75" cy="48" rx="56" ry="20" fill="url(#ottBelly)" />
          <circle cx="22" cy="30" r="26" fill="url(#ottBody)" />
          <ellipse cx="6" cy="34" rx="9" ry="7" fill="hsl(30 35% 80%)" />
          <circle cx="2" cy="32" r="2" fill="hsl(20 30% 18%)" />
          <circle cx="20" cy="24" r="2.2" fill="hsl(20 30% 12%)" />
          <circle cx="20.6" cy="23.4" r="0.7" fill="white" />
          <circle cx="40" cy="14" r="4" fill="url(#ottBody)" />
          <line x1="0" y1="36" x2="-10" y2="38" stroke="hsl(30 30% 80%)" strokeWidth="0.6" />
          <line x1="0" y1="33" x2="-10" y2="32" stroke="hsl(30 30% 80%)" strokeWidth="0.6" />
          <ellipse cx="158" cy="46" rx="14" ry="9" fill="url(#ottBody)" />
          <ellipse cx="60" cy="40" rx="9" ry="6" fill="url(#ottBody)" />
          <ellipse cx="155" cy="70" rx="20" ry="6" fill="url(#ottBody)" opacity="0.85" />
        </g>

        {/* Linking heart between their clasped paws — keeps the metaphor
            unmistakable even at low resolution. */}
        <g transform="translate(196 174)">
          <path
            d="M0 0 C -3 -6 -10 -6 -10 0 C -10 6 0 10 0 10 C 0 10 10 6 10 0 C 10 -6 3 -6 0 0 Z"
            fill="hsl(252 83% 70%)"
            opacity="0.9"
          >
            <animate
              attributeName="opacity"
              values="0.6;1;0.6"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* Subtle ripples around the joined paws */}
        <ellipse
          cx="200"
          cy="200"
          rx="40"
          ry="8"
          fill="none"
          stroke="hsl(200 80% 70% / 0.4)"
          strokeWidth="1"
        >
          <animate attributeName="rx" values="30;55;30" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="4s" repeatCount="indefinite" />
        </ellipse>
      </svg>

      {/* Caption */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-[10px] text-muted-foreground backdrop-blur">
        <Waves className="h-3 w-3 text-sky-300" />
        Birbirinin elini bırakmayan iki su samuru
      </div>
    </div>
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
          <SmartDownloadButton />
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
