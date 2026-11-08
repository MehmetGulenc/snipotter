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
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { statSync, writeFileSync, mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import type { ClipboardItem, ClipboardContentType } from '@shared/types'
import { createMacFileReader, resolveMacFileUrl } from '@shared/macFileClipboard'
import { IS_MAS } from './platform'

const execFileAsync = promisify(execFile)

// Dosya içeriği saklamak için üst limit (2 MB → DB'de ~2.67 MB base64)
const MAX_FILE_CONTENT_BYTES = 2 * 1024 * 1024

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
  csv: 'text/csv', json: 'application/json', xml: 'application/xml',
  html: 'text/html', htm: 'text/html', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  js: 'text/javascript', ts: 'text/typescript', py: 'text/x-python',
  rb: 'text/x-ruby', sh: 'text/x-sh', yaml: 'text/yaml', yml: 'text/yaml',
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return MIME_MAP[ext] ?? 'application/octet-stream'
}

// On macOS 10.14+ / Sequoia, Finder may use "promised file" APIs so
// clipboard.read('public.file-url') returns an empty string. Fall back to
// NSFilenamesPboardType (XML plist containing an array of paths) which Finder
// still writes for compatibility.
const readMacOsFileUrl = createMacFileReader(clipboard, (data) =>
  JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], {
    input: data, encoding: 'utf8', timeout: 1000, maxBuffer: 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })),
)

function buildFileDataUrl(filePath: string, content: Buffer): string {
  const mime = getMimeType(filePath)
  const name = encodeURIComponent(basename(filePath))
  return `data:${mime};name=${name};base64,${content.toString('base64')}`
}

// Windows: CF_HDROP buffer'ından dosya yollarını okur (sync, hızlı)
function readWindowsFilePaths(): string[] {
  if (process.platform !== 'win32') return []
  try {
    const buf = clipboard.readBuffer('CF_HDROP')
    if (!buf || buf.length < 20) return []
    const pFiles = buf.readUInt32LE(0)
    const fWide = buf.readUInt32LE(16) !== 0
    const data = buf.slice(pFiles)
    const paths: string[] = []
    let pos = 0
    while (pos < data.length) {
      if (fWide) {
        let end = pos
        while (end + 1 < data.length && (data[end] !== 0 || data[end + 1] !== 0)) end += 2
        if (end === pos) break
        paths.push(data.slice(pos, end).toString('utf16le'))
        pos = end + 2
      } else {
        let end = pos
        while (end < data.length && data[end] !== 0) end++
        if (end === pos) break
        paths.push(data.slice(pos, end).toString('latin1'))
        pos = end + 1
      }
    }
    return paths.filter(Boolean)
  } catch {
    return []
  }
}

interface MonitorOptions {
  /** Polling interval in ms (default 700). */
  intervalMs?: number
  /** When true, skip entries that look like passwords / API keys. */
  redactSensitive?: boolean
  /** When true, capture file copies from Finder (macOS) / Explorer (Windows) if < 5 MB. */
  fileCopyEnabled?: boolean
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
  private tickInFlight = false
  // After we write to the OS clipboard ourselves (mirror from another device, or
  // a user-triggered "copy again"), the next polling tick may see content that
  // differs from `lastHash` because macOS NSPasteboard observes writes asynchronously
  // and our post-write snapshotHash() can capture the *previous* clipboard value.
  // Without suppression this creates an infinite loop: receive broadcast → mirror →
  // poller emits 'change' → re-broadcast → other device mirrors → re-emits → … .
  // We therefore silence emits for a short window after every copy() call, but
  // STILL update lastHash inside the window so the next real user copy is detected.
  private suppressEmitUntil = 0
  private opts: Required<MonitorOptions>

  constructor(opts: MonitorOptions = {}) {
    super()
    this.opts = {
      // 100ms — at this rate average detection latency is ~50ms and CPU cost
      // is negligible (clipboard reads on macOS/Windows are O(1) cached).
      intervalMs: opts.intervalMs ?? 100,
      redactSensitive: opts.redactSensitive ?? true,
      // MAS sandbox: Finder file references point outside the container and
      // cannot be read without a user-selected grant, so file capture is off.
      fileCopyEnabled: !IS_MAS && (opts.fileCopyEnabled ?? false),
    }
  }

  start(): void {
    if (this.timer) return
    // Seed with current value so we don't emit historical content as new.
    this.lastHash = this.snapshotHash()
    // A file reference is unchanged when Finder copies the same file again.
    // Do not seed it as processed: this may be the file the user is retrying.
    if (this.opts.fileCopyEnabled && (
      (process.platform === 'darwin' && readMacOsFileUrl()) || readWindowsFilePaths().length
    )) this.lastHash = null
    console.info('[clip] monitor started', { fileCopyEnabled: this.opts.fileCopyEnabled })
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

  setFileCopyEnabled(value: boolean): void {
    if (IS_MAS) value = false
    if (value && !this.opts.fileCopyEnabled) this.lastHash = null
    this.opts.fileCopyEnabled = value
  }

  private snapshotHash(): string | null {
    const text = clipboard.readText()
    const html = clipboard.readHTML()
    const image = clipboard.readImage()
    const fileUrl = process.platform === 'darwin' ? readMacOsFileUrl() : ''
    const winFiles = readWindowsFilePaths().join('|')
    if (!text && !html && (image.isEmpty?.() ?? true) && !fileUrl && !winFiles) return null
    return sha1(`${text}${html}${image.toDataURL?.() ?? ''}${fileUrl}${winFiles}`)
  }

  private async tick(): Promise<void> {
    if (this.tickInFlight) return
    this.tickInFlight = true
    try {
      const text = clipboard.readText()
      const html = clipboard.readHTML()
      const image = clipboard.readImage()
      const hasImage = !image.isEmpty?.()
      // MAS: file capture is unavailable, so skip the plist decode (spawns /usr/bin/plutil).
      const fileUrl = process.platform === 'darwin' && !IS_MAS ? readMacOsFileUrl() : ''
      const winFiles = readWindowsFilePaths()
      if (!text && !html && !hasImage && !fileUrl && winFiles.length === 0) return

      const hash = sha1(`${text}${html}${hasImage ? image.toDataURL() : ''}${fileUrl}${winFiles.join('|')}`)
      if (hash === this.lastHash) return
      this.lastHash = hash

      if (Date.now() < this.suppressEmitUntil) return

      // ── macOS: Finder dosya kopyası ───────────────────────────────────────
      if (fileUrl && fileUrl.startsWith('file://') && this.opts.fileCopyEnabled) {
        console.info('[clip-file] detected', { reference: new URL(fileUrl).pathname.startsWith('/.file/id=') })
        try {
          const resolved = await resolveMacFileUrl(fileUrl)
          const emitted = await this.emitFileDraft(resolved.path, resolved.url, hash)
          if (emitted) return
        } catch (err) {
          console.warn('[clip-file] resolve failed', err)
        }
      }

      // ── Windows: Explorer dosya kopyası ───────────────────────────────────
      if (winFiles.length > 0 && this.opts.fileCopyEnabled) {
        const winPath = winFiles[0]
        const winFileUrl = `file:///${winPath.replace(/\\/g, '/')}`
        const emitted = await this.emitFileDraft(winPath, winFileUrl, hash)
        if (emitted) return
      }

      let contentType: ClipboardContentType = 'text'
      let payload = text
      if (hasImage && !text) {
        contentType = 'image'
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
      this.emit('error', err)
    } finally {
      this.tickInFlight = false
    }
  }

  // Dosyayı okuyup emit eder. İçerik küçükse data URL, büyükse file:// URL saklar.
  // Başarılı olursa true döner.
  private async emitFileDraft(filePath: string, fallbackUrl: string, hash: string): Promise<boolean> {
    try {
      const stat = statSync(filePath, { throwIfNoEntry: false })
      if (!stat) {
        console.warn('[clip-file] stat returned null for path:', filePath)
        return false
      }

      let fileText: string
      if (stat.size <= MAX_FILE_CONTENT_BYTES) {
        // İçeriği oku → data URL olarak sakla (cross-device erişim sağlar)
        const content = await readFile(filePath)
        fileText = buildFileDataUrl(filePath, content)
      } else {
        // Dosya çok büyük → sadece referans sakla (aynı cihazda çalışır)
        fileText = fallbackUrl
      }

      const fileDraft: Omit<ClipboardItem, 'id' | 'userId' | 'synced'> = {
        contentType: 'file',
        text: fileText,
        hash,
        html: null,
        sourceApp: null,
        pinned: false,
        ai: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      this.emit('change', fileDraft, { rawImage: null })
      console.info('[clip-file] captured', { bytes: stat.size, storedContent: stat.size <= MAX_FILE_CONTENT_BYTES })
      return true
    } catch (err) {
      console.warn('[clip-file] emitFileDraft error:', err)
      return false
    }
  }

  /** Programmatic copy (used by "copy again" UI and remote auto-mirror). */
  async copy(item: Pick<ClipboardItem, 'contentType' | 'text' | 'html'>): Promise<void> {
    this.suppressEmitUntil = Date.now() + 750

    if (item.contentType === 'file') {
      try {
        let filePath: string | null = null

        if (item.text.startsWith('data:')) {
          // Saklanan içerik → geçici dosyaya yaz, oradan kopyala
          const match = item.text.match(/^data:[^;]+;name=([^;,]+)/)
          const decoded = match ? decodeURIComponent(match[1]) : 'dosya'
          const safeName = basename(decoded.replace(/\\/g, '/'))
          const fileName = !safeName || safeName === '.' || safeName === '..' ? 'dosya' : safeName
          const base64Data = item.text.slice(item.text.indexOf(',') + 1)
          const tmpPath = join(mkdtempSync(join(tmpdir(), 'snipotter-')), fileName)
          writeFileSync(tmpPath, Buffer.from(base64Data, 'base64'))
          filePath = tmpPath
        } else if (item.text.startsWith('file://')) {
          // Yerel referans
          const pathname = decodeURIComponent(new URL(item.text).pathname)
          filePath = process.platform === 'win32' ? pathname.replace(/^\//, '') : pathname
        }

        if (filePath) {
          if (IS_MAS) {
            // Sandboxed: no osascript. Write the file URL straight onto the
            // general pasteboard; Finder and other apps paste it as a file.
            clipboard.writeBuffer('public.file-url', Buffer.from(pathToFileURL(filePath).href, 'utf8'))
            if (!readMacOsFileUrl()) throw new Error('Dosya pano biçimi doğrulanamadı.')
          } else if (process.platform === 'darwin') {
            await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e',
              'ObjC.import("AppKit"); function run(args) { const pb = $.NSPasteboard.generalPasteboard; pb.clearContents; if (!pb.writeObjects($.NSArray.arrayWithObject($.NSURL.fileURLWithPath(args[0])))) throw new Error("Dosya panoya yazılamadı"); }',
              filePath,
            ], { timeout: 5000 })
            if (!readMacOsFileUrl()) throw new Error('Dosya pano biçimi doğrulanamadı.')
          } else if (process.platform === 'win32') {
            const escaped = filePath.replace(/'/g, "''")
            await execFileAsync('powershell', ['-command', `Set-Clipboard -Path '${escaped}'`])
          }
          this.suppressEmitUntil = Date.now() + 750
          this.lastHash = this.snapshotHash()
          return
        }
      } catch (err) {
        throw new Error(`Dosya panoya kopyalanamadı: ${(err as Error).message}`)
      }
      throw new Error('Dosya panoya kopyalanamadı: desteklenmeyen dosya adresi.')
    }
    if (item.contentType === 'image' && item.text.startsWith('data:image/')) {
      const img = nativeImage.createFromDataURL(item.text)
      if (!img.isEmpty()) {
        clipboard.writeImage(img)
        this.lastHash = this.snapshotHash()
        return
      }
    }
    if (item.contentType === 'rich-text' && item.html) {
      clipboard.write({ text: item.text, html: item.html })
      this.lastHash = this.snapshotHash()
      return
    }
    clipboard.writeText(item.text)
    this.lastHash = this.snapshotHash()
  }

  /**
   * Mirror a remote clipboard payload onto the local OS clipboard.
   * Identical to copy() but signals intent: this came from another device,
   * not from a user action in our own UI. We still write through copy() so
   * the same loop-prevention mechanism applies (lastHash refresh).
   */
  mirrorRemote(item: Pick<ClipboardItem, 'contentType' | 'text' | 'html'>): void {
    this.copy(item)
  }

  /** Helper exposed for tests and one-off snapshots. */
  static currentNativeImage() {
    return nativeImage.createFromBuffer(Buffer.alloc(0))
  }
}
