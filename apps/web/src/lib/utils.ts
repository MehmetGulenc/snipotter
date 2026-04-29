import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale/tr'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: tr })
  } catch {
    return iso
  }
}

export function firstLine(s: string, max = 60): string {
  const line = s.split('\n').find((l) => l.trim().length > 0) ?? ''
  return line.length > max ? line.slice(0, max) + '…' : line
}

export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Web'
  const ua = navigator.userAgent
  if (/iPhone|iPod/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android Phone' : 'Android Tablet'
  if (/Mac OS X/.test(ua)) return 'Mac (Web)'
  if (/Windows/.test(ua)) return 'Windows (Web)'
  if (/Linux/.test(ua)) return 'Linux (Web)'
  return 'Web'
}
