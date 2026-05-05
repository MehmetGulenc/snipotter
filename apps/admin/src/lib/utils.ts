import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Compact human numbers: 1234 → "1.2k", 1_500_000 → "1.5M". */
export function formatCount(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1000) return String(n)
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n < 1_000_000) return Math.round(n / 1000) + 'k'
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
}

export function formatDelta(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n === 0) return '±0'
  return (n > 0 ? '+' : '') + formatCount(n)
}

export function formatRating(avg: number | null | undefined, count: number | null | undefined): string {
  if (avg == null || count == null || count === 0) return '—'
  return `${avg.toFixed(1)} (${formatCount(count)})`
}

const tf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' })

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.round(ms / 1000)
  if (sec < 60) return tf.format(-sec, 'second')
  const min = Math.round(sec / 60)
  if (min < 60) return tf.format(-min, 'minute')
  const hr = Math.round(min / 60)
  if (hr < 24) return tf.format(-hr, 'hour')
  const day = Math.round(hr / 24)
  if (day < 30) return tf.format(-day, 'day')
  const mo = Math.round(day / 30)
  if (mo < 12) return tf.format(-mo, 'month')
  return tf.format(-Math.round(day / 365), 'year')
}
