import { pathToFileURL, fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

/** Resolve Finder's file:///.file/id=... reference through macOS Foundation. */
export async function resolveMacFileUrl(value: string): Promise<{ path: string; url: string }> {
  let url = new URL(value)
  if (url.protocol !== 'file:') throw new Error('Dosya URL adresi bekleniyor.')
  if (url.pathname.startsWith('/.file/id=')) {
    const { stdout } = await runFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e',
      'ObjC.import("Foundation"); function run(args) { const ref = $.NSURL.URLWithString(args[0]); const resolved = ref.filePathURL; if (!resolved || resolved.isNil()) throw new Error("Dosya referansı çözümlenemedi"); return ObjC.unwrap(resolved.absoluteString); }',
      value,
    ], { timeout: 5000, maxBuffer: 64 * 1024 })
    url = new URL(stdout.trim())
    if (url.pathname.startsWith('/.file/id=')) throw new Error('Dosya referansı çözümlenemedi.')
  }
  const path = fileURLToPath(url)
  return { path, url: pathToFileURL(path).href }
}

interface FileClipboard {
  read(format: string): string
  readBuffer(format: string): Buffer
}

/** Finder's legacy file list can be a binary plist, not just XML text. */
export function createMacFileReader(source: FileClipboard, decodePlist: (data: Buffer) => unknown) {
  let previous: Buffer | null = null
  let previousUrl = ''
  return (): string => {
    for (const format of ['public.file-url', 'text/uri-list']) {
      try {
        const text = source.read(format) || source.readBuffer(format).toString('utf8')
        const url = text.replace(/\0/g, '').split(/\r?\n/).find((line) => line.trim().startsWith('file://'))?.trim()
        if (url) {
          new URL(url)
          return url
        }
      } catch { /* Try the remaining native representations. */ }
    }
    try {
      let data = source.readBuffer('NSFilenamesPboardType')
      if (!data.length) data = Buffer.from(source.read('NSFilenamesPboardType'), 'utf8')
      if (!data.length) {
        previous = null
        previousUrl = ''
        return ''
      }
      if (previous?.equals(data)) return previousUrl
      const paths = decodePlist(data)
      const first = Array.isArray(paths) ? paths.find((p) => typeof p === 'string' && p.startsWith('/')) : undefined
      previousUrl = first ? pathToFileURL(first).href : ''
      previous = Buffer.from(data)
      return previousUrl
    } catch {
      return ''
    }
  }
}
