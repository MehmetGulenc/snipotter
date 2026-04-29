import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Truncate text to N chars with ellipsis. */
export function truncate(s: string, n = 80): string {
  if (s.length <= n) return s
  return s.slice(0, n).trimEnd() + '…'
}

/** Friendly relative time (e.g., "2 dk önce"). */
export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 5) return 'şimdi'
  if (sec < 60) return `${sec} sn önce`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} dk önce`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} sa önce`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} g önce`
  const week = Math.floor(day / 7)
  if (week < 4) return `${week} hf önce`
  return new Date(iso).toLocaleDateString()
}

/** First non-empty line, capped. Used as note title fallback. */
export function firstLine(s: string, max = 60): string {
  const line = s.split('\n').find((l) => l.trim().length > 0) ?? ''
  return truncate(line, max)
}
