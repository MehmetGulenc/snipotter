/**
 * Snipotter — Action bridge decisions (main process, pure logic).
 *
 * Two clipboard automations live here so they can be unit-tested without
 * Electron:
 *  1. OTP auto-copy: a record that arrived from ANOTHER paired device in the
 *     last 2 minutes and contains a one-time code → write just the code to the
 *     OS clipboard and notify. Self-inserted / self-touched records, stale
 *     records (reconnect replays) and repeats of the same code are skipped.
 *  2. Link cleanup: links the user copies on THIS device get tracking
 *     parameters removed. Idempotent: an already-clean text yields `null`, so
 *     writing the cleaned text back can never trigger a second rewrite.
 *
 * "Another device" = the record's `userId` (clipboard_items.created_by) differs
 * from this device's anonymous Supabase user id, AND the record id is not in the
 * set of ids this device inserted/touched recently (`localInsertIds`). Every
 * paired device signs in as its own anonymous user, so created_by identifies
 * the originating device.
 */
import type { ClipboardItem } from '@shared/types'
import { detectOtp } from '@shared/otp'
import { cleanUrlsInText } from '@shared/laundry'

/** Only codes from records at most this old are auto-copied. */
export const OTP_MAX_AGE_MS = 2 * 60 * 1000
/** Tolerated clock skew for records whose created_at is slightly in the future. */
export const OTP_FUTURE_SKEW_MS = 30 * 1000

export type OtpSkipReason =
  | 'disabled'
  | 'self'
  | 'local-insert'
  | 'not-text'
  | 'stale'
  | 'no-code'
  | 'duplicate'

export type OtpDecision = { copy: true; code: string } | { copy: false; reason: OtpSkipReason }

/**
 * Remembers which codes were already written so the same OTP arriving twice
 * (instant broadcast + postgres_changes, or two devices forwarding the same
 * SMS) is copied and announced only once.
 */
export class OtpLedger {
  private seen = new Map<string, number>()

  constructor(private ttlMs: number = OTP_MAX_AGE_MS + OTP_FUTURE_SKEW_MS) {}

  has(itemId: string, code: string, now: number): boolean {
    this.prune(now)
    return this.seen.has(`id:${itemId}:${code}`) || this.seen.has(`code:${code}`)
  }

  remember(itemId: string, code: string, now: number): void {
    this.prune(now)
    const until = now + this.ttlMs
    this.seen.set(`id:${itemId}:${code}`, until)
    this.seen.set(`code:${code}`, until)
  }

  get size(): number {
    return this.seen.size
  }

  private prune(now: number): void {
    for (const [key, until] of this.seen) if (until <= now) this.seen.delete(key)
  }
}

export interface OtpContext {
  enabled: boolean
  /** Anonymous Supabase user id of THIS device (null before sign-in). */
  selfUserId: string | null
  /** Ids this device inserted or re-copied in the last 30 s. */
  localInsertIds: ReadonlySet<string>
  ledger: OtpLedger
  now: number
}

type OtpCandidate = Pick<ClipboardItem, 'id' | 'userId' | 'contentType' | 'text' | 'createdAt'>

export function decideOtpAutoCopy(item: OtpCandidate, ctx: OtpContext): OtpDecision {
  if (!ctx.enabled) return { copy: false, reason: 'disabled' }
  if (ctx.selfUserId && item.userId === ctx.selfUserId) return { copy: false, reason: 'self' }
  if (ctx.localInsertIds.has(item.id)) return { copy: false, reason: 'local-insert' }
  if (item.contentType !== 'text' && item.contentType !== 'rich-text') {
    return { copy: false, reason: 'not-text' }
  }
  const created = Date.parse(item.createdAt)
  if (!Number.isFinite(created)) return { copy: false, reason: 'stale' }
  const age = ctx.now - created
  if (age > OTP_MAX_AGE_MS || age < -OTP_FUTURE_SKEW_MS) return { copy: false, reason: 'stale' }
  const code = detectOtp(item.text)
  if (!code) return { copy: false, reason: 'no-code' }
  if (ctx.ledger.has(item.id, code, ctx.now)) return { copy: false, reason: 'duplicate' }
  return { copy: true, code }
}

export function otpNotificationBody(code: string): string {
  return `Kod panoda: ${code}`
}

// ── Link cleanup ──────────────────────────────────────────────────────────────

const SINGLE_URL = /^https?:\/\/\S+$/i

export interface LinkCleanupInput {
  contentType: ClipboardItem['contentType']
  text: string
}

/**
 * Returns the cleaned text when the user's own copy contains links with
 * tracking parameters, otherwise null. Plain text is cleaned in place.
 * Rich text is only rewritten when it is just a link (e.g. a browser address
 * bar copy) so formatted documents never lose their HTML.
 */
export function planLinkCleanup(input: LinkCleanupInput, enabled: boolean): { text: string; changed: number } | null {
  if (!enabled) return null
  if (input.contentType === 'rich-text') {
    if (!SINGLE_URL.test(input.text.trim())) return null
  } else if (input.contentType !== 'text') {
    return null
  }
  if (!/https?:\/\//i.test(input.text)) return null
  const result = cleanUrlsInText(input.text)
  if (result.changed <= 0 || result.text === input.text) return null
  return result
}
