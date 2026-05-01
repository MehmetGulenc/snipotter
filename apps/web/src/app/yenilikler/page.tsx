import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/Logo'

export const metadata: Metadata = {
  title: 'Yenilikler — Snipotter',
  description: 'Snipotter\'a eklenen yeni özellikler ve iyileştirmeler.',
}

interface Feature {
  emoji: string
  title: string
  desc: string
}

interface Release {
  version: string
  date: string
  badge?: string
  badgeColor?: string
  headline: string
  features: Feature[]
}

const releases: Release[] = [
  {
    version: '0.3.3',
    date: 'Mayıs 2025',
    badge: 'Güncel',
    badgeColor: 'bg-primary/20 text-primary',
    headline: 'Güncelleme bildirimi & not başlıkları',
    features: [
      {
        emoji: '🔔',
        title: 'Güncelleme bildirimi',
        desc: 'Yeni sürüm hazır olduğunda ekranın üstünde küçük bir bildirim çıkıyor. "Yeniden Başlat" tuşuna bassın, uygulama güncelleniyor — başka bir şey yapmana gerek yok.',
      },
      {
        emoji: '📝',
        title: 'Not başlıkları (web)',
        desc: 'Artık web\'de de notlarına başlık ekleyebilirsin. Yazdıkça otomatik kaydediliyor, masaüstü uygulamasıyla anında senkronlanıyor.',
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
        title: 'Cihazlar arası otomatik pano (opt-in)',
        desc: 'Mac\'te kopyaladığın şey anında Windows\'un panosuna düşüyor — Snipotter\'ı hiç açmana gerek kalmadan Ctrl+V yapabilirsin. Ayarlar\'dan tek tıkla açılıyor. Şifre veya API anahtarı gibi hassas içerikler asla paylaşılmaz.',
      },
      {
        emoji: '🛡️',
        title: 'Silinen notlar geri gelmiyor',
        desc: 'Bazı kullanıcıların notlarının silinmesine rağmen geri geldiği bildirilen bir sorun vardı. Kökten çözüldü — şimdi sildiğin bir şey gitti demektir.',
      },
      {
        emoji: '🔍',
        title: 'Pano değişikliklerini 2x hızlı yakala',
        desc: 'Kopyaladığın şeyin uygulamaya yansıması için gereken süre yarı yarıya azaldı. Hissedilir fark var.',
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
    headline: 'Telegram hızında senkron',
    features: [
      {
        emoji: '🚀',
        title: 'Anlık senkron — 50ms\'nin altında',
        desc: 'Bir cihazda kopyaladığın şey diğer cihazlara fısıltı hızında ulaşıyor. Artık kopyala-yapıştır arasında bekleme yok.',
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
        desc: 'Dock\'tan taşındık — Snipotter artık her zaman ekranın tepesinde küçük bir ikon olarak duruyor. Tıklarsın, açılır.',
      },
      {
        emoji: '🪟',
        title: 'Windows sistem tepsisi',
        desc: 'Windows\'ta saat yanındaki simge tepsisine yerleştik. Sağ tık ile ana pencereyi açabilir, hızlı not alabilirsin.',
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

export default function YeniliklerPage(): JSX.Element {
  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <Logo size={28} />
            <span className="text-sm font-semibold tracking-tight">Snipotter</span>
          </Link>
          <Link
            href="/"
            className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Uygulamayı Aç
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="mx-auto max-w-2xl px-6 pb-4 pt-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Yenilikler</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Ne değişti?
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Her güncellemeyle hayatını biraz daha kolaylaştırmaya çalışıyoruz.
          İşte son eklenenler.
        </p>
      </div>

      {/* Timeline */}
      <div className="mx-auto max-w-2xl px-6 pb-20 pt-8">
        <div className="relative space-y-12">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-2 h-full w-px bg-border/60" aria-hidden />

          {releases.map((release) => (
            <div key={release.version} className="relative pl-8">
              {/* Dot */}
              <div className="absolute left-0 top-1.5 h-[22px] w-[22px] rounded-full border-2 border-border bg-background flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-primary/70" />
              </div>

              {/* Version + date */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold tracking-widest text-muted-foreground">
                  v{release.version}
                </span>
                {release.badge && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${release.badgeColor}`}>
                    {release.badge}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground/60">{release.date}</span>
              </div>

              {/* Headline */}
              <h2 className="mt-1 text-lg font-semibold">{release.headline}</h2>

              {/* Features */}
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
        <Link href="/" className="underline underline-offset-2 hover:text-foreground">
          Uygulamaya dön
        </Link>
      </footer>
    </div>
  )
}
