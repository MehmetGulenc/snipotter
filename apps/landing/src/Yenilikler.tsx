import { Sparkles } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import logoUrl from './logo.svg'

interface Feature {
  emoji: string
  title: string
  desc: string
}

interface Release {
  version: string
  date: string
  badge?: string
  headline: string
  features: Feature[]
}

const releases: Release[] = [
  {
    version: '0.6.0',
    date: 'Mayıs 2026',
    badge: 'Güncel',
    headline: 'Notlar Artık Gerçek Bir Editör',
    features: [
      {
        emoji: '✍️',
        title: 'Zengin Metin Editörü (Tiptap)',
        desc: 'Notlar artık düz metin kutusundan çok daha fazlası. Başlık (H1/H2/H3), madde listesi, numaralı liste, görev listesi (checkbox), kod bloğu, alıntı ve yatay çizgi — hepsi tek tıkla. Metin seçince bold, italic, üstü çizili ve satır içi kod için kayan menü çıkıyor.',
      },
      {
        emoji: '📤',
        title: 'Markdown ve PDF Export',
        desc: 'Notunu tek tıkla dışa aktar. Markdown (.md) olarak kaydet — tam biçimlendirme korumalı, heading\'ler, listeler, kod blokları hepsi geliyor. PDF için aynı buton: temiz, baskıya hazır görünüm, Finder\'da otomatik açılıyor.',
      },
    ],
  },
  {
    version: '0.5.9',
    date: 'Mayıs 2026',
    headline: 'QuickPaste İyileştirmeleri',

    features: [
      {
        emoji: '🖱️',
        title: 'Pencere Sürükleme',
        desc: 'QuickPaste penceresi artık istenilen yere sürüklenebiliyor. Pencere genişliği 380px olarak optimize edildi ve dosya taşıma sistemi iyileştirildi.',
      },
    ],
  },
  {
    version: '0.5.8',
    date: 'Mayıs 2026',
    headline: 'Gelişmiş Dosya Yapıştırma',
    features: [
      {
        emoji: '📁',
        title: 'AppleScript ile Doğrudan Dosya Yapıştırma',
        desc: 'Dosya kopyalama varsayılan olarak açıldı. macOS üzerinde dosyalar AppleScript yardımıyla çok daha güvenilir ve hızlı bir şekilde istenilen yere yapıştırılıyor.',
      },
    ],
  },
  {
    version: '0.5.7',
    date: 'Mayıs 2026',
    headline: 'Not Senkronizasyonu & Overlay Paneli',
    features: [
      {
        emoji: '⚡',
        title: 'Daha Hızlı Not Senkronu',
        desc: 'Not içerik senkronizasyonu artık çok daha anlık tetikleniyor. Ayrıca QuickPaste detay paneli daha yumuşak bir deneyim için 1.5s gecikmeli overlay olarak gösteriliyor.',
      },
    ],
  },
  {
    version: '0.5.6',
    date: 'Mayıs 2026',
    headline: 'QuickPaste Detay Paneli & Tepsi Bildirimleri',
    features: [
      {
        emoji: '🔎',
        title: 'Detaylı İnceleme Paneli',
        desc: 'QuickPaste üzerinden kopyalanan içeriklerin detaylarına anında göz atabileceğiniz yeni bir panel eklendi.',
      },
      {
        emoji: '🛎️',
        title: 'Tepsi (Tray) Bildirimleri',
        desc: 'Güncellemeler hakkında sistem tepsisinde daha net bildirimler (feedback) sağlanıyor.',
      },
    ],
  },
  {
    version: '0.5.5',
    date: 'Mayıs 2026',
    headline: 'Pano Sıralaması & Toplu Temizleme',
    features: [
      {
        emoji: '🧹',
        title: 'Tümünü Temizle (Clear-all)',
        desc: 'Panodaki tüm içerikleri tek bir butonla temizleme seçeneği eklendi.',
      },
      {
        emoji: '🔝',
        title: 'Akıllı Pano Sıralaması',
        desc: 'Pano artık (top-sort) her zaman en güncel olanı önde tutacak şekilde düzenleniyor.',
      },
      {
        emoji: '📍',
        title: 'Yerinde Yapıştırma (Paste-in-place)',
        desc: 'QuickPaste üzerinden içerikler artık bulunduğunuz imleç konumuna tam olarak yapıştırılıyor.',
      },
    ],
  },
  {
    version: '0.5.4',
    date: 'Mayıs 2026',
    headline: 'Hareketli Logo ve Marka Güncellemesi',
    features: [
      {
        emoji: '✨',
        title: 'Hareketli SnipOtter Logosu',
        desc: 'Açılış sayfasına ve uygulamaya hareketli marka kelimesi (wordmark) ve logoya parlayan (glow) animasyon eklendi.',
      },
    ],
  },
  {
    version: '0.5.2',
    date: 'Mayıs 2026',
    headline: 'Silme İşlemi Güvenliği',
    features: [
      {
        emoji: '🛡️',
        title: 'Güvenli Veri Silme',
        desc: 'Silinmesi beklenen (pending-delete) içeriklerin sunucu senkronizasyonu sırasında yanlışlıkla geri gelmesini önleyen güvenlik önlemleri alındı.',
      },
    ],
  },
  {
    version: '0.5.1',
    date: 'Mayıs 2026',
    headline: 'Gelişmiş Toplu Silme',
    features: [
      {
        emoji: '🗑️',
        title: 'Toplu Silme Revizyonu',
        desc: 'Artık içerikleri sürükleyerek (drag-to-select) çoklu seçebilir ve tek tıkla silebilirsiniz. Yanlışlıkla silmelere karşı anında "Geri Al (Undo)" butonu eklendi.',
      },
    ],
  },
  {
    version: '0.5.0',
    date: 'Mayıs 2026',
    badge: 'Yeni UI',
    headline: 'Tam Kapsamlı Modernizasyon (UI Refactoring)',
    features: [
      {
        emoji: '✨',
        title: 'Modern SaaS Tasarımı',
        desc: 'Açılış sayfası (landing page) tamamen 2026 SaaS standartlarına (Linear/Raycast stili) uygun olarak yeniden tasarlandı. Özellik gruplandırmaları iyileştirildi ve görsel hiyerarşi baştan yaratıldı.',
      },
      {
        emoji: '🛡️',
        title: 'Bağımsız & Güvenilir Vurgusu',
        desc: 'Veri gizliliği, hesap gerektirmeyen altyapı ve şeffaf açık kaynak felsefesi daha net bir şekilde sayfalara işlendi.',
      },
    ],
  },
  {
    version: '0.4.4',
    date: 'Mayıs 2026',
    badge: 'Önceki Sürüm',
    headline: 'Güncellemeyi sen başlatıyorsun',
    features: [
      {
        emoji: '👇',
        title: 'İndir butonu geldi',
        desc: 'Yeni sürüm hazır olduğunda ekranın üstünde "İndir" butonu çıkıyor. Sen tıklayana kadar indirme başlamıyor — internetin yavaşken arkada veri yemiyor.',
      },
    ],
  },
  {
    version: '0.4.3',
    date: 'Mayıs 2026',
    headline: 'Küçük hatalar giderildi',
    features: [],
  },
  {
    version: '0.4.2',
    date: 'Mayıs 2026',
    headline: 'Yeni sürümleri daha çabuk görüyorsun',
    features: [
      {
        emoji: '🔔',
        title: 'Güncelleme bildirimi daha hızlı',
        desc: 'Yeni sürüm çıktığında Snipotter\'ı bir sonraki açışında haberin oluyor. Saatler boyunca beklemiyorsun.',
      },
    ],
  },
  {
    version: '0.4.1',
    date: 'Mayıs 2026',
    headline: 'Notlar canlı senkron',
    features: [
      {
        emoji: '✏️',
        title: 'Not editörü anlık güncelleniyor',
        desc: 'Aynı notu iki cihazda açtıysan, birinde yazdığın anında diğerinin editöründe de beliriyor.',
      },
    ],
  },
  {
    version: '0.4.0',
    date: 'Mayıs 2026',
    headline: 'Cihazlar arası pano çok daha sağlam',
    features: [
      {
        emoji: '🔄',
        title: 'Cihazlar arası otomatik pano',
        desc: "Mac'te kopyaladığın anında Windows'a, Windows'ta kopyaladığın anında Mac'e düşüyor. Snipotter'ı açmana gerek yok — doğrudan Cmd/Ctrl+V ile yapıştır.",
      },
      {
        emoji: '⚡',
        title: 'Anlık senkron daha hızlı ve kararlı',
        desc: 'Bir cihazda kopyaladığın şey diğer cihazlara saniyenin altında ulaşıyor. İnternetin bir an kesilse bile, geri geldiğinde kaçırdıklarını otomatik tamamlıyor.',
      },
      {
        emoji: '🍎',
        title: 'Mac\'te tek tıkla güncelleme',
        desc: "Eskiden Mac'te yeni sürüm çıktığında DMG'yi indirip elinle kurman gerekiyordu. Artık \"Yeniden Başlat\" tuşuna basıyorsun, Snipotter kendini güncelliyor — tıpkı Windows'taki gibi.",
      },
      {
        emoji: '🔵',
        title: 'Güncelleme bildirimi',
        desc: 'Yeni bir sürüm hazır olduğunda Ayarlar simgesinin üstünde küçük mavi bir nokta çıkıyor. Seni rahatsız etmiyor ama hazır olduğunda fark ediyorsun.',
      },
    ],
  },
  {
    version: '0.3.3',
    date: 'Mayıs 2025',
    headline: 'Güncelleme bildirimi & not başlıkları',
    features: [
      {
        emoji: '🔔',
        title: 'Güncelleme bildirimi',
        desc: 'Yeni sürüm hazır olduğunda ekranın üstünde küçük bir bildirim çıkıyor. "Yeniden Başlat" tuşuna basınca uygulama güncelleniyor.',
      },
      {
        emoji: '📝',
        title: 'Not başlıkları (web)',
        desc: "Artık web'de de notlarına başlık ekleyebilirsin. Yazdıkça otomatik kaydediliyor, masaüstü uygulamasıyla anında senkronlanıyor.",
      },
    ],
  },
  {
    version: '0.3.2',
    date: 'Mayıs 2025',
    headline: 'Cihazlar arası otomatik pano',
    features: [
      {
        emoji: '⚡',
        title: 'Cihazlar arası otomatik pano (opsiyonel)',
        desc: "Mac'te kopyaladığın şey anında Windows'un panosuna düşüyor — Snipotter'ı hiç açmana gerek kalmadan Ctrl+V yapabilirsin. Ayarlar'dan tek tıkla açılıyor. Şifre veya API anahtarı gibi hassas içerikler asla paylaşılmaz.",
      },
      {
        emoji: '🔍',
        title: 'Pano değişikliklerini daha hızlı yakala',
        desc: 'Kopyaladığın şeyin uygulamaya yansıması için gereken süre yarı yarıya azaldı.',
      },
      {
        emoji: '📡',
        title: 'Bağlantı kopsa da veri kaybolmaz',
        desc: 'İnternet geçici olarak kesilse bile yeniden bağlandığında kopyaladığın her şey otomatik senkronlanır.',
      },
    ],
  },
  {
    version: '0.3.1',
    date: 'Nisan 2025',
    headline: 'Gerçek zamanlı senkron',
    features: [
      {
        emoji: '🚀',
        title: 'Anlık senkron',
        desc: 'Bir cihazda kopyaladığın şey diğer cihazlara saniyenin altında ulaşıyor. Artık kopyala-yapıştır arasında bekleme yok.',
      },
    ],
  },
  {
    version: '0.3.0',
    date: 'Nisan 2025',
    headline: 'Mac menubar, Windows sistem tepsisi & toplu silme',
    features: [
      {
        emoji: '🖥️',
        title: 'Mac menü çubuğu',
        desc: "Dock'tan taşındık — Snipotter artık her zaman ekranın tepesinde küçük bir ikon olarak duruyor. Tıklarsın, açılır.",
      },
      {
        emoji: '🪟',
        title: 'Windows sistem tepsisi',
        desc: "Windows'ta saat yanındaki simge tepsisine yerleştik. Sağ tık ile ana pencereyi açabilir, hızlı not alabilirsin.",
      },
      {
        emoji: '🗑️',
        title: 'Toplu silme',
        desc: 'Birden fazla klibi veya notu seçip tek seferde silebilirsin. Biriktirilen eski içeriklerden kurtulmak artık daha hızlı.',
      },
    ],
  },
  {
    version: '0.2.x',
    date: 'Mart 2025',
    headline: 'Temel özellikler',
    features: [
      {
        emoji: '📋',
        title: 'Pano geçmişi',
        desc: 'Kopyaladığın her şey saklanır. Arama yaparsın, bulursun, tekrar kopyalarsın.',
      },
      {
        emoji: '✍️',
        title: 'Notlar',
        desc: 'Hızlıca not al, cihazların arasında senkronlu tut. Başlık, içerik, etiket.',
      },
      {
        emoji: '✨',
        title: 'AI etiketleme',
        desc: 'Kopyaladığın içerik otomatik etiketleniyor ve özetleniyor. Ne aradığını bilmesen bile arama yapabilirsin.',
      },
      {
        emoji: '🔒',
        title: 'Hassas içerik maskeleme',
        desc: 'Şifre, API anahtarı, kredi kartı numarası gibi hassas bilgiler ekranda görünmez şekilde saklanır.',
      },
    ],
  },
]

const APP_URL = 'https://app.snipotter.com'

export default function Yenilikler(): JSX.Element {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Yenilikler — Snipotter sürüm notları</title>
        <meta
          name="description"
          content="Snipotter'a eklenen yeni özellikler ve giderilen hatalar. Cihazlar arası pano, AI destekli notlar ve daha fazlası — tüm sürüm geçmişi."
        />
        <link rel="canonical" href="https://snipotter.com/yenilikler" />
        <meta property="og:title" content="Yenilikler — Snipotter sürüm notları" />
        <meta
          property="og:description"
          content="Snipotter'a eklenen yeni özellikler ve giderilen hatalar."
        />
        <meta property="og:url" content="https://snipotter.com/yenilikler" />
        <meta property="og:type" content="article" />
      </Helmet>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight hover:opacity-80 transition-opacity">
            <img src={logoUrl} alt="" aria-hidden width={28} height={28} className="h-7 w-7" />
            Snipotter
          </a>
          <a
            href={APP_URL}
            className="rounded-lg bg-primary/90 px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary transition-colors"
          >
            Uygulamayı Aç
          </a>
        </div>
      </header>

      {/* Hero */}
      <div className="mx-auto max-w-2xl px-6 pb-4 pt-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          <Sparkles className="mr-1 inline h-3 w-3" />
          Yenilikler
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Ne değişti?</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Her güncellemeyle hayatını biraz daha kolaylaştırmaya çalışıyoruz. İşte son eklenenler.
        </p>
      </div>

      {/* Timeline */}
      <div className="mx-auto max-w-2xl px-6 pb-20 pt-8">
        <div className="relative space-y-12">
          <div className="absolute left-[11px] top-2 h-full w-px bg-border/60" aria-hidden />

          {releases.map((release) => (
            <div key={release.version} className="relative pl-8">
              <div className="absolute left-0 top-1.5 h-[22px] w-[22px] rounded-full border-2 border-border bg-background flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-primary/70" />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold tracking-widest text-muted-foreground">
                  v{release.version}
                </span>
                {release.badge && (
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {release.badge}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground/60">{release.date}</span>
              </div>

              <h2 className="mt-1 text-lg font-semibold">{release.headline}</h2>

              <ul className="mt-4 space-y-4">
                {release.features.map((f) => (
                  <li key={f.title} className="flex gap-3">
                    <span className="mt-0.5 text-lg leading-none">{f.emoji}</span>
                    <div>
                      <p className="text-sm font-medium">{f.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground/60">
        Snipotter · Geliştirici: Mehmet Gülenç ·{' '}
        <a href="/" className="underline underline-offset-2 hover:text-foreground">
          Ana sayfaya dön
        </a>
      </footer>
    </div>
  )
}
