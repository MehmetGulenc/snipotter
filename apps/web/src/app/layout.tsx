import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://app.snipotter.com'),
  title: {
    default: 'Snipotter — Akıllı Pano & Hızlı Notlar',
    template: '%s · Snipotter',
  },
  description:
    'Snipotter web uygulaması — Mac ve Windows panonu tarayıcıda gör, notlarını düzenle, cihazlar arasında gerçek zamanlı senkron çalış.',
  keywords: [
    'snipotter',
    'pano yöneticisi',
    'clipboard manager',
    'ai not',
    'web pano',
    'cihazlar arası senkron',
  ],
  authors: [{ name: 'Snipotter' }],
  creator: 'Snipotter',
  publisher: 'Snipotter',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
  alternates: {
    canonical: 'https://app.snipotter.com/',
    languages: { tr: 'https://app.snipotter.com/' },
  },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    url: 'https://app.snipotter.com/',
    siteName: 'Snipotter',
    title: 'Snipotter — Web Uygulaması',
    description: 'Pano + AI not — cihazlar arası gerçek zamanlı senkron, tarayıcıdan eriş.',
    images: [
      {
        url: 'https://snipotter.com/og.png',
        width: 1200,
        height: 630,
        alt: 'Snipotter web uygulaması',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Snipotter — Web Uygulaması',
    description: 'Pano + AI not — cihazlar arası gerçek zamanlı senkron.',
    images: ['https://snipotter.com/og.png'],
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Snipotter',
  },
  icons: {
    icon: '/icon-512.png',
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): JSX.Element {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  )
}
