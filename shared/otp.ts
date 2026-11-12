const OTP_WORDS = /(kod|code|şifre|sifre|doğrulama|dogrulama|verification|onay|otp|pin|giriş|login|tek kullanımlık)/i

export function detectOtp(text: string): string | null {
  const trimmed = text.trim()
  if (/^\d{4,8}$/.test(trimmed)) return trimmed
  if (text.length > 300 || !OTP_WORDS.test(text)) return null
  const m = text.match(/(?<![\d+])(\d{3}[ -]?\d{3}|\d{4,8})(?!\d)/)
  if (!m) return null
  const code = m[1].replace(/[ -]/g, '')
  // Years and amounts read as codes too often.
  if (/^(19|20)\d{2}$/.test(code)) return null
  return code
}

