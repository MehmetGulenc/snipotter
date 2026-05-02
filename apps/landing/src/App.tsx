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
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Özellikler</a>
          <a href="#discover" className="hover:text-foreground">Keşfet</a>
          <a href="#shortcuts" className="hover:text-foreground">Kısayollar</a>
          <a href="#how" className="hover:text-foreground">Nasıl çalışır</a>
          <a href="#privacy" className="hover:text-foreground">Gizlilik</a>
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
   ~3.6s through realistic content types (link, command, image, summary): it
   first appears at the top of the Mac window, then 600ms later replicates
   into the phone with a brief green flash + "synced" pill. Loops forever, no
   GIFs, no autoplaying video, ~1KB of CSS over the static version.

   This is the centrepiece of the "what does this thing do?" answer that
   the friend's-test surfaced — visitors should see the value without
   reading a single feature bullet.
   ========================================================================= */
const DEMO_CLIPS: { text: string; tag: string; sensitive?: boolean; image?: boolean }[] = [
  { text: 'https://github.com/MehmetGulenc/snipotter', tag: 'link' },
  { text: 'ssh -i ~/.ssh/prod.pem ubuntu@10.0.4.21', tag: 'komut' },
  { text: 'snipotter@example.com', tag: 'email', sensitive: true },
  { text: 'Toplantı notları: önce mobil, sonra masaüstü.', tag: 'özet' },
  { text: 'Ekran görüntüsü', tag: 'görsel', image: true },
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
          sync indicator sits between, drawn as a horizontal pulse instead. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.6fr_auto_1fr] sm:items-center sm:gap-3">
        {/* — Mac window — */}
        <div className="animate-float overflow-hidden rounded-2xl border border-border bg-card/80 shadow-2xl shadow-primary/10">
          <div className="flex items-center gap-1.5 border-b border-border/60 bg-card/90 px-3 py-2.5">
            <span className="h-3 w-3 rounded-full bg-red-500/70" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
            <span className="h-3 w-3 rounded-full bg-green-500/70" />
            <div className="ml-3 flex-1">
              <div className="flex items-center gap-2 rounded-md bg-background/60 px-2 py-1 text-xs text-muted-foreground">
                <Search className="h-3 w-3" /> Pano ara…
              </div>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">macOS</span>
          </div>
          <div className="space-y-2 p-3">
            {/* Top row is the active clip — re-keyed on every tick so the
                clip-in animation replays. The remaining rows give context. */}
            <MockClip key={`mac-${macIndex}`} clip={DEMO_CLIPS[macIndex]} time="şimdi" highlight />
            <MockClip clip={DEMO_CLIPS[(macIndex + 4) % DEMO_CLIPS.length]} time="2dk önce" pinned />
            <MockClip clip={DEMO_CLIPS[(macIndex + 3) % DEMO_CLIPS.length]} time="5dk önce" />
            <MockClip clip={DEMO_CLIPS[(macIndex + 2) % DEMO_CLIPS.length]} time="bugün" />
          </div>
        </div>

        {/* — Sync indicator — Animated arrow with concentric pulses.
             Rotates 90° on small screens so the geometry still reads
             "Mac → phone" when the layout stacks. */}
        <SyncIndicator />

        {/* — Phone — */}
        <div className="relative mx-auto w-full max-w-[210px] animate-float [animation-delay:1.5s]">
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
                  time="2dk"
                  compact
                />
                <MockClip
                  clip={DEMO_CLIPS[(phoneIndex + 3) % DEMO_CLIPS.length]}
                  time="5dk"
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
        'relative overflow-hidden rounded-lg border bg-card/40 transition ' +
        (compact ? 'p-2' : 'p-2.5 ') +
        (highlight ? 'border-primary/30 ' : 'border-border/60 ') +
        (highlight ? 'animate-clip-in ' : '') +
        (flash ? 'animate-sync-flash ' : '')
      }
    >
      <div className="flex items-start gap-2">
        <div
          className={
            'flex-1 truncate text-foreground ' + (compact ? 'text-[11px]' : 'text-xs')
          }
        >
          {clip.image ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block h-3 w-4 rounded-sm bg-gradient-to-br from-primary/40 to-fuchsia-500/40" />
              Ekran görüntüsü
            </span>
          ) : clip.sensitive ? (
            '••• gizli içerik •••'
          ) : (
            clip.text
          )}
        </div>
        {pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
      </div>
      <div
        className={
          'mt-1.5 flex items-center justify-between text-muted-foreground ' +
          (compact ? 'text-[9px]' : 'text-[10px]')
        }
      >
        <span className="inline-flex items-center gap-1">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{clip.tag}</span>
          {syncedBadge && (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-0.5 text-[8px] font-medium text-emerald-400">
              <Zap className="h-2 w-2" />
              senkron
            </span>
          )}
        </span>
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
      copy: 'Bilgisayarda kopyaladığın şey diğer cihazlarında anında belirir — göz açıp kapayıncaya kadar.',
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
            copy="Tek bir kısayol; son kopyaladığın 50 öğe ekranın üstüne düşer. Yazmaya başla, listeyi anlık filtrele. ↑↓ ile gez, Enter ile yapıştır. Akışın bozulmaz."
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
            copy="Aklına bir şey geldi. Hangi uygulamada olursan ol, kısayola bas, küçük bir pencere açılır, yazıp ⌘+Enter ile kaydet. AI etiketleyip tüm cihazlarına gönderir."
            visual={<QuickNoteVisual />}
          />
          <DiscoverCard
            icon={<ImagePlus className="h-5 w-5" />}
            badge={<span className="text-xs text-muted-foreground">PNG · JPG · Screenshot</span>}
            title="Görsel pano öğeleri"
            copy="Sadece metin değil — bir ekran görüntüsü kopyala, telefonundaki Snipotter'da önizlemeli olarak çıksın. Geri kopyalayıp herhangi bir uygulamaya yapıştır."
            visual={<ImageVisual />}
          />
          <DiscoverCard
            icon={<Wand2 className="h-5 w-5" />}
            badge={<span className="text-xs text-muted-foreground">Otomatik · saniyeler içinde</span>}
            title="AI özet & etiket"
            copy="Uzun bir mail ya da dokümanın bir bölümünü kopyala. Snipotter arka planda kısa bir özet çıkarır, içeriği etiketler. Hassas görünen şeyleri ('email', 'kart no') tanır ve listede gizler."
            visual={<AIVisual />}
          />
          <DiscoverCard
            icon={<Share2 className="h-5 w-5" />}
            badge={
              <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                YENİ · Android
              </span>
            }
            title="Paylaş hedefi"
            copy="WhatsApp, Chrome, Twitter, herhangi bir uygulamada metni seç → Paylaş → Snipotter. O öğe pano kütüphanene düşer, masaüstündeki Mac'inde anında görünür."
            visual={<ShareTargetVisual />}
          />
          <DiscoverCard
            icon={<LayoutGrid className="h-5 w-5" />}
            badge={
              <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                YENİ · Android
              </span>
            }
            title="Hızlı ayarlar tile"
            copy="Telefonu kilitsiz tut, ekranı yukarıdan aşağı çek, 'Panoyu kaydet' tile'ına bas. O an panonda ne varsa Snipotter'a düşer — uygulamayı açmana gerek bile yok."
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

/* — Visual: Quick Paste — keyboard + popup hovering above */
function QuickPasteVisual(): JSX.Element {
  return (
    <div className="relative w-full max-w-xs">
      {/* Floating popup */}
      <div className="overflow-hidden rounded-lg border border-primary/40 bg-card shadow-xl shadow-primary/20">
        <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
          <Search className="h-3 w-3" />
          ssh
        </div>
        <div className="space-y-0.5 p-1.5">
          <div className="flex items-center gap-2 rounded bg-primary/15 px-2 py-1.5 text-[11px] text-foreground ring-1 ring-primary/40">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            ssh prod-01
          </div>
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
            ssh staging
          </div>
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
            ssh -i ~/.ssh/key…
          </div>
        </div>
      </div>
      {/* Keys below */}
      <div className="mt-3 flex justify-center gap-1">
        <Kbd>⌘</Kbd>
        <Kbd>⇧</Kbd>
        <Kbd>V</Kbd>
      </div>
    </div>
  )
}

/* — Visual: Quick Note — small floating editor */
function QuickNoteVisual(): JSX.Element {
  return (
    <div className="w-full max-w-xs">
      <div className="overflow-hidden rounded-lg border border-primary/40 bg-card shadow-xl shadow-primary/20">
        <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
          <PencilLine className="h-3 w-3 text-primary" />
          Snipotter — Hızlı Not
        </div>
        <div className="space-y-1 p-2.5 text-[11px] leading-relaxed text-foreground">
          <div>Toplantı kararları:</div>
          <div>— iOS önce</div>
          <div>— Android'i Şubat'a</div>
          <div className="text-muted-foreground">|</div>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 px-2.5 py-1 text-[9px] text-muted-foreground">
          <span>⌘+Enter ile kaydet</span>
          <span>42 karakter</span>
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

/* — Visual: Image clipboard — screenshot tile flying between two devices */
function ImageVisual(): JSX.Element {
  return (
    <div className="flex w-full items-center justify-between gap-3 px-2">
      {/* Mac */}
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="aspect-video rounded border border-border bg-gradient-to-br from-primary/30 via-fuchsia-500/20 to-primary/10" />
        <div className="text-center text-[9px] text-muted-foreground">Mac · ⌘C</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
      {/* Phone */}
      <div className="flex w-12 flex-col items-center gap-1.5">
        <div className="rounded-[6px] border border-border bg-card p-0.5">
          <div className="aspect-[9/16] w-9 rounded-[3px] bg-gradient-to-br from-primary/30 via-fuchsia-500/20 to-primary/10" />
        </div>
        <div className="text-[9px] text-muted-foreground">Telefon</div>
      </div>
    </div>
  )
}

/* — Visual: AI tagging — long text → summary + tags */
function AIVisual(): JSX.Element {
  return (
    <div className="w-full max-w-xs space-y-2">
      <div className="rounded border border-border/60 bg-background/60 p-2 text-[10px] leading-snug text-muted-foreground">
        "Sayın katılımcılar, bu hafta yapılan toplantıda öne çıkan kararlar şunlardır:
        ürün yol haritası 6 ay…"
      </div>
      <div className="flex justify-center">
        <Wand2 className="h-3.5 w-3.5 animate-pulse text-primary" />
      </div>
      <div className="rounded border border-primary/30 bg-primary/5 p-2 text-[10px] leading-snug text-foreground">
        Toplantı özeti — 6 aylık yol haritası ve ürün kararları.
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        {['toplantı', 'karar', 'yol-haritası'].map((t) => (
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

/* — Visual: Share Target — phone with system share sheet */
function ShareTargetVisual(): JSX.Element {
  const apps = [
    { label: 'Mesajlar', tone: 'bg-emerald-500/30' },
    { label: 'Snipotter', tone: 'bg-primary/40 ring-1 ring-primary' },
    { label: 'Drive', tone: 'bg-yellow-500/30' },
    { label: 'Notlar', tone: 'bg-fuchsia-500/30' },
  ]
  return (
    <div className="relative mx-auto w-full max-w-[180px]">
      <div className="overflow-hidden rounded-[1.5rem] border border-border bg-card/80 p-1 shadow-xl">
        <div className="overflow-hidden rounded-[1.2rem] bg-background">
          <div className="px-3 pt-2 text-[9px] text-muted-foreground">
            "Cuma toplantı 14:00"
          </div>
          <div className="border-t border-border/60 bg-card/50 px-2 py-2">
            <div className="mb-1.5 text-center text-[9px] text-muted-foreground">
              Paylaş…
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {apps.map((a) => (
                <div key={a.label} className="flex flex-col items-center gap-0.5">
                  <div className={`h-7 w-7 rounded-lg ${a.tone}`} />
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

/* — Visual: Quick Settings tile — phone pull-down with custom tile */
function TileVisual(): JSX.Element {
  return (
    <div className="relative mx-auto w-full max-w-[180px]">
      <div className="overflow-hidden rounded-[1.5rem] border border-border bg-card/80 p-1 shadow-xl">
        <div className="overflow-hidden rounded-[1.2rem] bg-background">
          <div className="space-y-1.5 p-2">
            <div className="grid grid-cols-3 gap-1.5">
              <TileBtn label="Wi-Fi" />
              <TileBtn label="BT" />
              <TileBtn label="Uçak" />
              <TileBtn label="Pil" />
              <TileBtn label="Snipotter" highlight />
              <TileBtn label="Konum" />
            </div>
            <div className="rounded-md border border-primary/40 bg-primary/10 p-1.5 text-center text-[8px] text-primary">
              ✓ Panoya kaydedildi
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TileBtn({ label, highlight }: { label: string; highlight?: boolean }): JSX.Element {
  return (
    <div
      className={
        'flex flex-col items-center gap-0.5 rounded-md border p-1.5 ' +
        (highlight
          ? 'border-primary/50 bg-primary/15 text-primary'
          : 'border-border/60 bg-card/50 text-muted-foreground')
      }
    >
      <div
        className={
          'h-3 w-3 rounded-full ' + (highlight ? 'bg-primary' : 'bg-muted-foreground/40')
        }
      />
      <span className="text-[7px]">{label}</span>
    </div>
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
          Maus'a hiç dokunmadan kullanılır. Birkaç gün sonra parmakların kendi
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
