/** Remove invisible formatting controls without removing ordinary spaces. */
export function removeInvisible(text: string): string {
  return text.replace(/[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
}

const IBAN_LENGTHS: Record<string, number> = { TR: 26, DE: 22, GB: 22, FR: 27, NL: 18, BE: 16, CH: 21, AT: 20, ES: 24, IT: 27, IE: 22, PT: 25 }
function validIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  if (IBAN_LENGTHS[iban.slice(0, 2)] && IBAN_LENGTHS[iban.slice(0, 2)] !== iban.length) return false
  let remainder = 0
  for (const ch of iban.slice(4) + iban.slice(0, 4)) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

function recipientName(value: string): string | undefined {
  const name = value.trim().replace(/^[\s:;,=–—-]+|[\s:;,=–—-]+$/g, '').replace(/\s+/g, ' ')
  const words = name.split(' ')
  if (words.length < 2 || words.length > 5 || /\d/u.test(name) || !/^[\p{L}\p{M}\s.'’\-]+$/u.test(name)) return undefined
  if ((name.match(/\p{L}/gu)?.length ?? 0) < name.length * 0.7) return undefined
  const excluded = new Set(['merhaba', 'selam', 'iban', 'banka', 'bankası', 'bankasi', 'bank', 'tl', 'try', 'eur', 'usd', 'garanti', 'bbva', 'ziraat', 'akbank', 'halkbank', 'vakıfbank', 'vakifbank', 'yapı', 'kredi', 'qnb', 'finansbank', 'denizbank', 'teb', 'ing', 'tutar', 'hesap', 'hesabına', 'adına', 'lütfen', 'gönder', 'gönderin', 'ödeme'])
  if (words.some(word => excluded.has(word.toLocaleLowerCase('tr-TR').replace(/\.$/, '')))) return undefined
  return name
}

export function extractPayment(text: string): { iban?: string; ibanFormatted?: string; recipient?: string; amount?: string; currency?: string } | null {
  const clean = removeInvisible(text)
  const result: NonNullable<ReturnType<typeof extractPayment>> = {}
  let ibanSpan: { start: number; end: number } | undefined
  // Try each legal length so a following recipient cannot become part of the IBAN.
  for (const match of clean.matchAll(/\b[A-Z]{2}\d{2}(?:[ \t\u00a0]?[A-Z0-9]){11,30}/gi)) {
    const compact = match[0].replace(/\s/g, '').toUpperCase()
    const expected = IBAN_LENGTHS[compact.slice(0, 2)]
    const candidates = expected ? [compact.slice(0, expected)] : [compact]
    const iban = candidates.find(candidate => {
      if (!validIban(candidate)) return false
      if (candidate.startsWith('TR') && !/^TR\d{24}$/.test(candidate)) return false
      // A valid prefix of an overlong account number is not a valid IBAN.
      let consumed = 0
      let offset = 0
      while (offset < match[0].length && consumed < candidate.length) {
        if (!/\s/.test(match[0][offset])) consumed++
        offset++
      }
      const tail = match[0].slice(offset)
      return !/^[A-Z0-9]/i.test(tail) && !/^\s+\d/.test(tail)
    })
    if (iban) {
      result.iban = iban
      result.ibanFormatted = iban.match(/.{1,4}/g)!.join(' ')
      let offset = 0
      let consumed = 0
      while (offset < match[0].length && consumed < iban.length) {
        if (!/\s/.test(match[0][offset])) consumed++
        offset++
      }
      ibanSpan = { start: match.index!, end: match.index! + offset }
      break
    }
  }
  const recipient = clean.match(/(?:alıcı(?:\s+adı)?|alici(?:\s+adi)?|hesap\s+(?:sahibi|adı|adi)|ad[\s-]*soyad|isim|unvan|name|recipient)\s*[:=-]\s*([^\r\n;,]+)/i)?.[1]
  if (recipient) {
    const name = recipientName(recipient.split(/\s+(?:IBAN|tutar|amount)\b/i)[0])
    if (name) result.recipient = name
  }
  if (!result.recipient && ibanSpan) {
    const before = clean.slice(0, ibanSpan.start)
    const after = clean.slice(ibanSpan.end)
    const beforeLines = before.split(/\r?\n/)
    const afterLines = after.split(/\r?\n/)
    const sameBefore = beforeLines[beforeLines.length - 1]
    const sameAfter = afterLines[0]
    const behalf = sameBefore.match(/(?:^|[:;,])\s*([^:;,]+?)\s+adına\s*$/iu)?.[1]
    const candidates = [behalf, sameAfter, sameBefore, beforeLines[beforeLines.length - 2], afterLines[1]]
    for (const candidate of candidates) {
      if (!candidate) continue
      const name = recipientName(candidate)
      if (name) { result.recipient = name; break }
    }
  }
  const amount = clean.match(/(?:tutar|amount)\s*[:=-]\s*(₺|€|\$|TL|TRY|EUR|USD)?\s*(\d+(?:[.,\u00a0 ]\d{3})*(?:[.,]\d{1,2})?)\s*(TL|TRY|EUR|USD|₺|€|\$)?/i)
    ?? clean.match(/(₺|€|\$)\s*(\d+(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(TL|TRY|EUR|USD)?/i)
    ?? clean.match(/()\b(\d+(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(TL|TRY|EUR|USD|₺|€|\$)(?!\w)/i)
  if (amount) {
    result.amount = amount[2].trim()
    const currency = (amount[3] || amount[1] || '').toUpperCase()
    if (currency) result.currency = ({ '₺': 'TRY', TL: 'TRY', '€': 'EUR', '$': 'USD' } as Record<string, string>)[currency] ?? currency
  }
  return Object.keys(result).length ? result : null
}
