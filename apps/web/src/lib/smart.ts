import { detectOtp } from '@shared/otp'

/**
 * On-device recognition of what a clip is, so the app can offer the matching
 * action (call, open map, add to calendar…). Pure functions, no network, no AI.
 */

export type SmartKind = 'otp' | 'iban' | 'phone' | 'email' | 'url' | 'tracking' | 'wifi' | 'address' | 'event'

export interface SmartAction {
  kind: SmartKind
  /** Short label shown on the chip, e.g. "Ara", "Haritada aç". */
  label: string
  /** Value the action works on (number, IBAN without spaces, URL…). */
  value: string
  /** External URL to open, when the action is a link. */
  href?: string
  /** Extra detail shown next to the chip (bank name, carrier…). */
  detail?: string
  /** For 'event': start time in ms and a title. */
  start?: number
  title?: string
}

export interface SmartInfo {
  actions: SmartAction[]
  /** One-time code: shown large and removed after OTP_TTL_MS. */
  otp?: string
  /** Wi-Fi or similar: keep hidden until tapped. */
  sensitive: boolean
}

export const OTP_TTL_MS = 10 * 60 * 1000
const MAX_SCAN = 2000

export function analyze(raw: string, now: Date = new Date()): SmartInfo {
  const text = raw.slice(0, MAX_SCAN)
  const actions: SmartAction[] = []
  const otp = detectOtp(text)
  if (otp) actions.push({ kind: 'otp', label: 'Kodu kopyala', value: otp })

  const wifi = detectWifi(text)
  if (wifi) actions.push(wifi)

  for (const iban of detectIbans(text)) actions.push(iban)
  if (!otp) for (const phone of detectPhones(text)) actions.push(...phone)
  for (const email of matchAll(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    actions.push({ kind: 'email', label: 'E-posta yaz', value: email, href: `mailto:${email}` })
  }
  for (const url of detectUrls(text)) actions.push(url)
  for (const t of detectTracking(text)) actions.push(t)
  const address = detectAddress(text)
  if (address) actions.push(address)
  const event = detectEvent(text, now)
  if (event) actions.push(event)

  return { actions: dedupe(actions).slice(0, 4), otp: otp ?? undefined, sensitive: Boolean(wifi) }
}

/** True when a one-time code is older than its lifetime. */
export function otpExpired(createdAt: string, now: number = Date.now()): boolean {
  return now - new Date(createdAt).getTime() > OTP_TTL_MS
}

// ── One-time codes ─────────────────────────────────────────────────────────────

// ── IBAN ───────────────────────────────────────────────────────────────────────

const TR_BANKS: Record<string, string> = {
  '00010': 'Ziraat Bankası',
  '00012': 'Halkbank',
  '00015': 'VakıfBank',
  '00032': 'TEB',
  '00046': 'Akbank',
  '00062': 'Garanti BBVA',
  '00064': 'İş Bankası',
  '00067': 'Yapı Kredi',
  '00099': 'ING',
  '00111': 'QNB',
  '00134': 'DenizBank',
  '00205': 'Kuveyt Türk',
}

function detectIbans(text: string): SmartAction[] {
  const out: SmartAction[] = []
  for (const candidate of matchAll(text, /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g)) {
    const iban = candidate.replace(/ /g, '')
    if (!validIban(iban)) continue
    const bank = iban.startsWith('TR') ? TR_BANKS[iban.slice(4, 9)] : undefined
    out.push({ kind: 'iban', label: 'IBAN kopyala', value: iban, detail: bank })
  }
  return out
}

export function validIban(iban: string): boolean {
  if (iban.length < 15 || iban.length > 34) return false
  if (iban.startsWith('TR') && iban.length !== 26) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let rem = 0
  for (const ch of rearranged) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of v) rem = (rem * 10 + Number(d)) % 97
  }
  return rem === 1
}

// ── Phone numbers ──────────────────────────────────────────────────────────────

function detectPhones(text: string): SmartAction[][] {
  const out: SmartAction[][] = []
  for (const candidate of matchAll(text, /(?:\+|00)?[\d][\d ().-]{8,17}\d/g)) {
    const digits = candidate.replace(/[^\d+]/g, '').replace(/^00/, '+')
    const e164 = normalizeTrPhone(digits)
    if (!e164) continue
    const plain = e164.replace('+', '')
    const row: SmartAction[] = [{ kind: 'phone', label: 'Ara', value: e164, href: `tel:${e164}` }]
    if (e164.startsWith('+905')) row.push({ kind: 'phone', label: 'WhatsApp', value: e164, href: `https://wa.me/${plain}` })
    out.push(row)
  }
  return out
}

function normalizeTrPhone(d: string): string | null {
  if (/^\+90[2-5]\d{9}$/.test(d)) return d
  if (/^90[2-5]\d{9}$/.test(d)) return `+${d}`
  if (/^0[2-5]\d{9}$/.test(d)) return `+9${d}`
  if (/^5\d{9}$/.test(d)) return `+90${d}`
  if (/^\+[1-9]\d{9,13}$/.test(d)) return d
  return null
}

// ── Links ──────────────────────────────────────────────────────────────────────

function detectUrls(text: string): SmartAction[] {
  return matchAll(text, /\bhttps?:\/\/[^\s<>"')]+/gi).map((url) => {
    let host = url
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep raw */ }
    return { kind: 'url' as const, label: 'Aç', value: url, href: url, detail: host }
  })
}

// ── Parcel tracking ────────────────────────────────────────────────────────────

const TRACKING_WORDS = /(kargo|takip|gönderi|gonderi|shipment|tracking|paket)/i

function detectTracking(text: string): SmartAction[] {
  const out: SmartAction[] = []
  for (const ups of matchAll(text, /\b1Z[0-9A-Z]{16}\b/g)) {
    out.push({ kind: 'tracking', label: 'Kargoyu takip et', value: ups, detail: 'UPS', href: `https://www.ups.com/track?tracknum=${ups}` })
  }
  // UPU S10 format (e.g. RR123456789TR) used by PTT and other postal services.
  for (const s10 of matchAll(text, /\b[A-Z]{2}\d{9}[A-Z]{2}\b/g)) {
    const carrier = s10.endsWith('TR') ? 'PTT' : 'Posta'
    out.push({ kind: 'tracking', label: 'Kargoyu takip et', value: s10, detail: carrier, href: searchHref(`${s10} kargo takip`) })
  }
  if (out.length === 0 && TRACKING_WORDS.test(text)) {
    const m = text.replace(/(?<=\d) (?=\d)/g, '').match(/\b\d{10,20}\b/)
    if (m) out.push({ kind: 'tracking', label: 'Kargoyu takip et', value: m[0], href: searchHref(`${m[0]} kargo takip`) })
  }
  return out
}

function searchHref(q: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

// ── Wi-Fi ──────────────────────────────────────────────────────────────────────

function detectWifi(text: string): SmartAction | null {
  const qr = text.match(/WIFI:(?:[^;]*;)*?S:([^;]+);(?:[^;]*;)*?P:([^;]*);/i)
  if (qr) return { kind: 'wifi', label: 'Şifreyi kopyala', value: qr[2], detail: qr[1] }
  if (!/(wi-?fi|wifi|kablosuz|ağ şifresi|ag sifresi)/i.test(text)) return null
  const pw = text.match(/(?:şifre|sifre|password|parola|pass)\s*[:=-]?\s*(\S+)/i)
  return { kind: 'wifi', label: 'Şifreyi kopyala', value: pw ? pw[1] : text.trim() }
}

// ── Addresses ──────────────────────────────────────────────────────────────────

const ADDRESS_HINTS = /(mah\.|mahallesi|mh\.|cad\.|caddesi|cd\.|sok\.|sokak|sk\.|bulvar|blv\.|no\s*:\s*\d|apt\.?|kat\s*:\s*\d|daire\s*:\s*\d)/gi

function detectAddress(text: string): SmartAction | null {
  if (text.length > 400) return null
  const hits = text.match(ADDRESS_HINTS)?.length ?? 0
  if (hits < 2) return null
  const query = text.replace(/\s+/g, ' ').trim()
  return { kind: 'address', label: 'Haritada aç', value: query, href: `https://maps.apple.com/?q=${encodeURIComponent(query)}` }
}

// ── Dates (Turkish) → calendar ─────────────────────────────────────────────────

const MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık']
const WEEKDAYS = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi']

export function detectEvent(text: string, now: Date = new Date()): SmartAction | null {
  if (text.length > 300) return null
  const lower = text.toLocaleLowerCase('tr-TR')
  const time = lower.match(/(?<![\d./])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d./])/)
  let date: Date | null = null
  let matched = ''

  const numeric = lower.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/)
  const named = lower.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.join('|')})(?:\\s+(\\d{4}))?`))
  const weekday = lower.match(new RegExp(`\\b(${[...WEEKDAYS].sort((a, b) => b.length - a.length).join('|')})\\b`))
  const relative = lower.match(/\b(bugün|yarın)\b/)

  if (numeric) {
    date = new Date(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]))
    matched = numeric[0]
  } else if (named) {
    const year = named[3] ? Number(named[3]) : now.getFullYear()
    date = new Date(year, MONTHS.indexOf(named[2]), Number(named[1]))
    if (!named[3] && date.getTime() < startOfDay(now).getTime()) date.setFullYear(year + 1)
    matched = named[0]
  } else if (relative && time) {
    date = startOfDay(now)
    if (relative[1] === 'yarın') date.setDate(date.getDate() + 1)
    matched = relative[0]
  } else if (weekday && time) {
    const target = WEEKDAYS.indexOf(weekday[1])
    date = startOfDay(now)
    let delta = (target - date.getDay() + 7) % 7
    if (delta === 0 && time && (Number(time[1]) * 60 + Number(time[2])) <= now.getHours() * 60 + now.getMinutes()) delta = 7
    date.setDate(date.getDate() + delta)
    matched = weekday[0]
  }
  if (!date || Number.isNaN(date.getTime())) return null
  if (time) date.setHours(Number(time[1]), Number(time[2]), 0, 0)
  else date.setHours(9, 0, 0, 0)

  const title = text
    .replace(new RegExp(escapeRe(matched), 'i'), '')
    .replace(time ? new RegExp(escapeRe(time[0])) : /$^/, '')
    .replace(/^[\s·,:\-–—]+|[\s·,:\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'Snipotter etkinliği'
  return {
    kind: 'event',
    label: 'Takvime ekle',
    value: text,
    start: date.getTime(),
    title,
    detail: date.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: time ? '2-digit' : undefined, minute: time ? '2-digit' : undefined }),
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchAll(text: string, re: RegExp): string[] {
  return Array.from(text.matchAll(re), (m) => m[0])
}

function dedupe(actions: SmartAction[]): SmartAction[] {
  const seen = new Set<string>()
  return actions.filter((a) => {
    const key = `${a.kind}:${a.label}:${a.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
