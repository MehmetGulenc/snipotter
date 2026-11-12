/**
 * Renderer-side recognition for the action row under a clip:
 *  - which value "Telefona gönder" should push (phone / address / IBAN / link)
 *  - payment fields for the IBAN / Alıcı / Tutar buttons
 * Pure functions, no network.
 */
import type { DeviceActionKind } from '@shared/types'
import { extractPayment, removeInvisible } from '@shared/payment'

export interface PhoneTarget {
  kind: Exclude<DeviceActionKind, 'text'>
  payload: string
  /** Short label for the phone notification. */
  label: string
}

const MAX_SCAN = 2000
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/i
const ADDRESS_HINTS =
  /(mah\.|mahallesi|mh\.|cad\.|caddesi|cd\.|sok\.|sokak|sokağı|sk\.|bulvar|bulvarı|blv\.|no\s*:\s*\d|apt\.?|apartmanı|kat\s*:\s*\d|daire\s*:\s*\d)/gi

function normalizePhone(candidate: string): string | null {
  const d = candidate.replace(/[^\d+]/g, '').replace(/^00/, '+')
  if (/^\+90[2-5]\d{9}$/.test(d)) return d
  if (/^90[2-5]\d{9}$/.test(d)) return `+${d}`
  if (/^0[2-5]\d{9}$/.test(d)) return `+9${d}`
  if (/^5\d{9}$/.test(d)) return `+90${d}`
  if (/^\+[1-9]\d{9,13}$/.test(d)) return d
  return null
}

function detectPhone(text: string): string | null {
  for (const m of text.matchAll(/(?:\+|00)?\d[\d ().-]{8,17}\d/g)) {
    const phone = normalizePhone(m[0])
    if (phone) return phone
  }
  return null
}

function detectAddress(text: string): string | null {
  if (text.length > 400) return null
  const hits = text.match(ADDRESS_HINTS)?.length ?? 0
  return hits >= 2 ? text.replace(/\s+/g, ' ').trim() : null
}

/**
 * Picks the single most useful value to push to the phone. Order: IBAN (the
 * phone's banking app needs it), address, phone number, link. Returns null for
 * anything else so the button is not shown.
 */
export function phoneTarget(raw: string): PhoneTarget | null {
  const text = removeInvisible(raw).slice(0, MAX_SCAN)
  if (!text.trim()) return null
  const payment = extractPayment(text)
  if (payment?.iban) {
    return { kind: 'iban', payload: payment.iban, label: payment.recipient ? `IBAN · ${payment.recipient}` : 'IBAN' }
  }
  const address = detectAddress(text)
  if (address) return { kind: 'address', payload: address, label: 'Adres' }
  const phone = detectPhone(text)
  if (phone) return { kind: 'phone', payload: phone, label: 'Telefon numarası' }
  const url = text.match(URL_RE)?.[0].replace(/[.,;!?)\]}]+$/, '')
  if (url) {
    let host = 'Bağlantı'
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep generic */ }
    return { kind: 'url', payload: url, label: host }
  }
  return null
}

export interface PaymentButton {
  id: 'iban' | 'recipient' | 'amount'
  label: string
  value: string
}

/** IBAN (compact, no spaces), recipient and amount buttons; empty when nothing found. */
export function paymentButtons(text: string): PaymentButton[] {
  const p = extractPayment(text.slice(0, MAX_SCAN))
  if (!p) return []
  const out: PaymentButton[] = []
  if (p.iban) out.push({ id: 'iban', label: 'IBAN', value: p.iban })
  if (p.recipient) out.push({ id: 'recipient', label: 'Alıcı', value: p.recipient })
  if (p.amount) out.push({ id: 'amount', label: 'Tutar', value: p.amount })
  // A lone amount (e.g. "250 TL") is not a payment — only show with an IBAN or recipient.
  return p.iban || p.recipient ? out : []
}
