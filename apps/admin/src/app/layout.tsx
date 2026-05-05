import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Snipotter — Admin',
  description: 'Cross-platform metrics, reviews, and active install tracking for Snipotter and its sibling apps.',
  // Hard no on indexing — this surface is for the operator only.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
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
