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

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /sk-[a-zA-Z0-9]{20,}/, // OpenAI / Anthropic keys
  /AIza[0-9A-Za-z_\-]{20,}/, // Google API
  /AKIA[0-9A-Z]{16}/, // AWS access keys
  /eyJ[A-Za-z0-9_=\-]{20,}\.[A-Za-z0-9_=\-]+\.[A-Za-z0-9_=\-]+/, // JWT
]

function looksSensitive(text: string): boolean {
  if (text.length < 8) return false
  return SECRET_PATTERNS.some((re) => re.test(text))
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

      if (
        this.opts.redactSensitive &&
        contentType !== 'image' &&
        looksSensitive(payload)
      ) {
        // Still record but mark; the renderer can hide content behind a reveal.
        payload = '••• redacted •••'
      }

      const draft: Omit<ClipboardItem, 'id' | 'userId' | 'synced'> = {
        contentType,
        text: payload,
        hash,
        html: contentType === 'rich-text' ? html : null,
        sourceApp: null,
        pinned: false,
        ai: null,
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
