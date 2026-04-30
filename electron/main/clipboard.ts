/**
 * Snipotter — Clipboard monitor
 * Polls the system clipboard at a low interval and emits new entries.
 * Native NSPasteboard / Win32 hooks would be ideal but cross-platform polling
 * (every 700ms) is responsive enough and zero-dep. Skips empty / sensitive
 * payloads when the user enables redaction.
 */
import { clipboard, nativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { ClipboardItem, ClipboardContentType } from '@shared/types'

interface MonitorOptions {
  /** Polling interval in ms (default 700). */
  intervalMs?: number
  /** When true, skip entries that look like passwords / API keys. */
  redactSensitive?: boolean
}

// Developer-flavoured secrets — keys and tokens we never want to flash on
// screen unredacted.
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /sk-[a-zA-Z0-9]{20,}/, // OpenAI / Anthropic keys
  /AIza[0-9A-Za-z_\-]{20,}/, // Google API
  /AKIA[0-9A-Z]{16}/, // AWS access keys
  /eyJ[A-Za-z0-9_=\-]{20,}\.[A-Za-z0-9_=\-]+\.[A-Za-z0-9_=\-]+/, // JWT
]

// Personal data patterns — what most users intuitively call "hassas içerik".
// Each is anchored loosely so common surrounding text (e.g. "tel: +90...") still
// matches, but is constrained enough to avoid flagging arbitrary numbers.
const PERSONAL_PATTERNS = [
  // Email — must be the whole clipboard or sit on its own line.
  /(^|\s)[\w.+-]+@[\w-]+\.[\w.-]{2,}(\s|$)/,
  // Turkish phone (+90 5XX XXX XXXX or 05XX XXX XXXX or international).
  /(^|\s)(\+?\d{1,3}[\s-]?)?(\(?\d{3}\)?[\s-]?)\d{3}[\s-]?\d{2}[\s-]?\d{2}(\s|$)/,
  // Credit card — 13-19 digits with optional space / dash separators.
  /(^|\s)(?:\d[ -]?){13,19}(\s|$)/,
  // Turkish IBAN.
  /\bTR\d{2}[\s]?(?:\d{4}[\s]?){5}\d{2}\b/i,
]

function looksSensitive(text: string): boolean {
  if (text.length < 6) return false
  if (SECRET_PATTERNS.some((re) => re.test(text))) return true
  // Personal-data patterns only fire if the clipboard is a single short-ish
  // payload (e.g. a copied email) — pasting an entire email body that
  // happens to contain an address shouldn't redact the whole thing.
  if (text.length <= 200 && PERSONAL_PATTERNS.some((re) => re.test(text))) {
    return true
  }
  return false
}

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}

export class ClipboardMonitor extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private lastHash: string | null = null
  private opts: Required<MonitorOptions>

  constructor(opts: MonitorOptions = {}) {
    super()
    this.opts = {
      intervalMs: opts.intervalMs ?? 700,
      redactSensitive: opts.redactSensitive ?? true,
    }
  }

  start(): void {
    if (this.timer) return
    // Seed with current value so we don't emit historical content as new.
    this.lastHash = this.snapshotHash()
    this.timer = setInterval(() => this.tick(), this.opts.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  setRedactSensitive(value: boolean): void {
    this.opts.redactSensitive = value
  }

  private snapshotHash(): string | null {
    const text = clipboard.readText()
    const html = clipboard.readHTML()
    const image = clipboard.readImage()
    if (!text && !html && (image.isEmpty?.() ?? true)) return null
    return sha1(`${text}\u0001${html}\u0001${image.toDataURL?.() ?? ''}`)
  }

  private tick(): void {
    try {
      const text = clipboard.readText()
      const html = clipboard.readHTML()
      const image = clipboard.readImage()
      const hasImage = !image.isEmpty?.()
      if (!text && !html && !hasImage) return

      const hash = sha1(`${text}\u0001${html}\u0001${hasImage ? image.toDataURL() : ''}`)
      if (hash === this.lastHash) return
      this.lastHash = hash

      let contentType: ClipboardContentType = 'text'
      let payload = text
      if (hasImage && !text) {
        contentType = 'image'
        // Persist a downsized PNG data URL so the renderer can show a real
        // preview and we have something to copy back later. We cap at 1024px
        // on the longest edge to avoid bloating Postgres rows.
        const { width, height } = image.getSize()
        const longest = Math.max(width, height)
        const ratio = longest > 1024 ? 1024 / longest : 1
        const resized =
          ratio < 1
            ? image.resize({
                width: Math.round(width * ratio),
                height: Math.round(height * ratio),
                quality: 'good',
              })
            : image
        payload = resized.toDataURL()
      } else if (html && html.length > text.length + 32) {
        contentType = 'rich-text'
      }

      // Local redaction now preserves the original text and only tags the
      // entry as sensitive. The renderer hides it behind a reveal toggle by
      // checking ai.tags. Previously we replaced payload with a literal
      // "••• redacted •••" string, which meant 'reveal' had nothing to show
      // and the original clipboard content was lost forever.
      const sensitive =
        this.opts.redactSensitive &&
        contentType !== 'image' &&
        looksSensitive(payload)

      const draft: Omit<ClipboardItem, 'id' | 'userId' | 'synced'> = {
        contentType,
        text: payload,
        hash,
        html: contentType === 'rich-text' ? html : null,
        sourceApp: null,
        pinned: false,
        ai: sensitive ? { summary: '', tags: ['sensitive'], provider: 'none' as const } : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      this.emit('change', draft, { rawImage: hasImage ? image : null })
    } catch (err) {
      // Don't crash the loop; emit for telemetry/log.
      this.emit('error', err)
    }
  }

  /** Programmatic copy (used by "copy again" UI). */
  copy(item: Pick<ClipboardItem, 'contentType' | 'text' | 'html'>): void {
    if (item.contentType === 'image' && item.text.startsWith('data:image/')) {
      const img = nativeImage.createFromDataURL(item.text)
      if (!img.isEmpty()) {
        // Update the lastHash so the monitor doesn't echo our own write back.
        this.lastHash = sha1(`\u0001\u0001${item.text}`)
        clipboard.writeImage(img)
        return
      }
    }
    if (item.contentType === 'rich-text' && item.html) {
      clipboard.write({ text: item.text, html: item.html })
      return
    }
    clipboard.writeText(item.text)
  }

  /** Helper exposed for tests and one-off snapshots. */
  static currentNativeImage() {
    return nativeImage.createFromBuffer(Buffer.alloc(0))
  }
}
