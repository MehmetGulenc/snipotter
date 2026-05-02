/**
 * Snipotter — Auto-update service
 *
 * Wraps electron-updater with a small state machine so the renderer can
 * subscribe to progress, errors, and the "ready to install" event without
 * directly importing main-process code.
 *
 * Lifecycle:
 *   idle → checking → available → downloading (% progress) → downloaded → restart
 *                ↘ not-available           ↘ error
 *
 * Auto-checks fire on app launch (after a short delay) and every 6 hours
 * while the app is open. Manual checks bypass throttling.
 *
 * Updates only run from packaged builds — in dev mode this module is a no-op
 * stub so `npm run dev` doesn't try to fetch a non-existent release.
 */
import { app, BrowserWindow, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateCheckResult, UpdateInfo, ProgressInfo } from 'electron-updater'
import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import path from 'node:path'

const { autoUpdater } = electronUpdater

export type UpdaterStatus =
  | { kind: 'idle'; currentVersion: string }
  | { kind: 'checking'; currentVersion: string }
  | { kind: 'not-available'; currentVersion: string; checkedAt: number }
  | { kind: 'available'; currentVersion: string; nextVersion: string; releaseNotes?: string }
  | { kind: 'downloading'; currentVersion: string; nextVersion: string; percent: number; bytesPerSecond: number }
  | { kind: 'downloaded'; currentVersion: string; nextVersion: string }
  | { kind: 'error'; currentVersion: string; message: string }

const PERIODIC_CHECK_MS = 60 * 60 * 1000 // 1 hour
const STARTUP_DELAY_MS = 30 * 1000
const FOCUS_CHECK_THROTTLE_MS = 15 * 60 * 1000 // re-check on window focus, max once per 15 min
const RELEASES_PAGE = 'https://github.com/MehmetGulenc/snipotter/releases/latest'

function pickMacDmgUrl(info: UpdateInfo): string | null {
  if (process.platform !== 'darwin' || !info.version) return null
  const files = info.files ?? []
  const dmgs = files.filter((f) => f.url.toLowerCase().endsWith('.dmg'))
  if (dmgs.length === 0) return null
  const wantArm = process.arch === 'arm64'
  const match =
    dmgs.find((f) => (wantArm ? /arm64/i.test(f.url) : !/arm64/i.test(f.url))) ?? dmgs[0]
  return `https://github.com/MehmetGulenc/snipotter/releases/download/v${info.version}/${match.url}`
}

export class UpdaterService extends EventEmitter {
  private status: UpdaterStatus
  private periodicTimer: NodeJS.Timeout | null = null
  // Fallback DMG URL for mac — used only if the custom shell installer fails.
  private latestMacDmgUrl: string | null = null
  // Paths returned by downloadUpdate() — the ZIP on mac, NSIS on Windows.
  private downloadedFiles: string[] = []

  constructor() {
    super()
    this.status = { kind: 'idle', currentVersion: app.getVersion() }

    // Surface updater logs in dev too so we can debug release flow locally.
    autoUpdater.logger = {
      info: (...args: unknown[]) => console.info('[updater]', ...args),
      warn: (...args: unknown[]) => console.warn('[updater]', ...args),
      error: (...args: unknown[]) => console.error('[updater]', ...args),
      debug: (...args: unknown[]) => console.debug('[updater]', ...args),
    }
    // We trigger downloads explicitly so the user sees progress UI.
    autoUpdater.autoDownload = false
    // On macOS, MacUpdater calls nativeUpdater.checkForUpdates() (Squirrel.Mac)
    // inside updateDownloaded() when autoInstallOnAppQuit is true. Squirrel
    // then validates the code signature and fails on unsigned builds (ShipIt error).
    // Setting false skips that Squirrel invocation; our custom shell installer handles
    // the actual replacement without requiring an Apple Developer certificate.
    autoUpdater.autoInstallOnAppQuit = process.platform !== 'darwin'

    autoUpdater.on('checking-for-update', () => {
      this.setStatus({ kind: 'checking', currentVersion: app.getVersion() })
    })
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.setStatus({
        kind: 'available',
        currentVersion: app.getVersion(),
        nextVersion: info.version,
        releaseNotes:
          typeof info.releaseNotes === 'string'
            ? info.releaseNotes
            : Array.isArray(info.releaseNotes)
              ? info.releaseNotes.map((n) => n.note ?? '').join('\n').trim() || undefined
              : undefined,
      })
      if (process.platform === 'darwin') {
        this.latestMacDmgUrl = pickMacDmgUrl(info)
      }
      // Wait for explicit user confirmation before downloading. The renderer
      // surfaces the 'available' state as a banner with an "İndir" button
      // that calls downloadNow(); previously we auto-started which used
      // bandwidth without consent.
    })
    autoUpdater.on('update-not-available', () => {
      this.setStatus({
        kind: 'not-available',
        currentVersion: app.getVersion(),
        checkedAt: Date.now(),
      })
    })
    autoUpdater.on('download-progress', (p: ProgressInfo) => {
      const cur = this.status
      this.setStatus({
        kind: 'downloading',
        currentVersion: app.getVersion(),
        nextVersion: cur.kind === 'available' || cur.kind === 'downloading' ? cur.nextVersion : '?',
        percent: Math.max(0, Math.min(100, Math.round(p.percent))),
        bytesPerSecond: p.bytesPerSecond,
      })
    })
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.setStatus({
        kind: 'downloaded',
        currentVersion: app.getVersion(),
        nextVersion: info.version,
      })
    })
    autoUpdater.on('error', (err) => {
      // A 404 on latest-mac.yml / latest.yml means a release tag was pushed
      // but the CI artifacts haven't finished uploading yet. Treat this as
      // "no update available" instead of a scary error popup — the next check
      // (silent or manual) will succeed once the build completes.
      const msg = err?.message ?? ''
      if (
        (msg.includes('latest-mac.yml') || msg.includes('latest.yml') || msg.includes('latest-linux.yml')) &&
        msg.includes('404')
      ) {
        this.setStatus({
          kind: 'not-available',
          currentVersion: app.getVersion(),
          checkedAt: Date.now(),
        })
        return
      }
      this.emitError(err)
    })
  }

  /** Schedule the first check after launch + a recurring 1-hour timer. */
  start(): void {
    if (!app.isPackaged) {
      console.info('[updater] dev mode — auto-update disabled')
      return
    }
    setTimeout(() => void this.checkSilent(), STARTUP_DELAY_MS)
    this.periodicTimer = setInterval(() => void this.checkSilent(), PERIODIC_CHECK_MS)
  }

  /** Throttled check fired by the main process on window focus. Catches new
   *  releases between the hourly periodic checks without hammering GitHub. */
  private lastCheckedAt = 0
  checkOnFocus(): void {
    if (!app.isPackaged) return
    if (this.status.kind === 'downloading' || this.status.kind === 'downloaded') return
    if (Date.now() - this.lastCheckedAt < FOCUS_CHECK_THROTTLE_MS) return
    this.lastCheckedAt = Date.now()
    void this.checkSilent()
  }

  stop(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer)
      this.periodicTimer = null
    }
  }

  /** Silent background check — won't surface errors as user-visible state. */
  private async checkSilent(): Promise<void> {
    if (!app.isPackaged) return
    this.lastCheckedAt = Date.now()
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      console.warn('[updater] silent check failed:', (err as Error).message)
    }
  }

  /** User-initiated download — kicks off the actual fetch only after the user
   *  has acknowledged the available banner with "İndir". */
  async downloadNow(): Promise<UpdaterStatus> {
    if (!app.isPackaged) return this.status
    if (this.status.kind !== 'available') return this.status
    try {
      const files = await autoUpdater.downloadUpdate()
      this.downloadedFiles = files
    } catch (err) {
      this.emitError(err as Error)
    }
    return this.status
  }

  /** Manual check triggered from Settings UI; surfaces errors. */
  async checkNow(): Promise<UpdaterStatus> {
    if (!app.isPackaged) {
      const status: UpdaterStatus = {
        kind: 'error',
        currentVersion: app.getVersion(),
        message: 'Auto-update sadece paketli build\'lerde çalışır (dev modda devre dışı).',
      }
      this.setStatus(status)
      return status
    }
    try {
      this.setStatus({ kind: 'checking', currentVersion: app.getVersion() })
      const result: UpdateCheckResult | null = await autoUpdater.checkForUpdates()
      if (!result || !result.updateInfo) {
        this.setStatus({
          kind: 'not-available',
          currentVersion: app.getVersion(),
          checkedAt: Date.now(),
        })
      }
    } catch (err) {
      this.emitError(err as Error)
    }
    return this.status
  }

  /** Quit & relaunch into the freshly downloaded version. */
  installAndRestart(): void {
    if (this.status.kind !== 'downloaded') {
      throw new Error('No downloaded update ready to install')
    }
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.close()
    })
    if (process.platform === 'darwin') {
      void this.installMacUpdate()
      return
    }
    autoUpdater.quitAndInstall(false, true)
  }

  /**
   * Custom mac installer: extracts the downloaded ZIP, strips quarantine
   * (xattr), replaces the running .app bundle, then relaunches. This bypasses
   * Squirrel.Mac which would reject ad-hoc/unsigned builds.
   */
  private async installMacUpdate(): Promise<void> {
    const zipPath = this.downloadedFiles.find((f) => f.toLowerCase().endsWith('.zip'))
    if (!zipPath) {
      console.warn('[updater] mac: no ZIP in downloaded files, falling back to browser')
      this.openReleasePage()
      return
    }

    // Resolve the running .app bundle: execPath = .../Snipotter.app/Contents/MacOS/Snipotter
    const appBundle = path.dirname(path.dirname(path.dirname(app.getPath('exe'))))
    const tmpDir = path.join(app.getPath('temp'), `snipotter-update-${Date.now()}`)

    const script = [
      'set -e',
      `rm -rf "${tmpDir}"`,
      `mkdir -p "${tmpDir}"`,
      `unzip -o "${zipPath}" -d "${tmpDir}"`,
      // find the extracted .app (name may vary between releases)
      `EXTRACTED=$(find "${tmpDir}" -maxdepth 1 -name "*.app" | head -1)`,
      `if [ -z "$EXTRACTED" ]; then echo "No .app in ZIP" >&2; exit 1; fi`,
      // strip quarantine so macOS doesn't block the relaunched app
      `xattr -dr com.apple.quarantine "$EXTRACTED" 2>/dev/null || true`,
      `rm -rf "${appBundle}"`,
      `cp -R "$EXTRACTED" "${appBundle}"`,
      `xattr -dr com.apple.quarantine "${appBundle}" 2>/dev/null || true`,
    ].join('\n')

    console.info('[updater] mac: installing from', zipPath, '→', appBundle)

    await new Promise<void>((resolve, reject) => {
      execFile('/bin/bash', ['-c', script], (err, _stdout, stderr) => {
        if (err) {
          console.error('[updater] mac install error:', stderr || err.message)
          reject(err)
        } else {
          resolve()
        }
      })
    }).catch(async () => {
      console.warn('[updater] mac: shell install failed — opening DMG download')
      await shell.openExternal(this.latestMacDmgUrl ?? RELEASES_PAGE)
    })

    app.relaunch()
    app.quit()
  }

  openReleasePage(): void {
    void shell.openExternal(this.latestMacDmgUrl ?? RELEASES_PAGE)
  }

  isManualInstallOnly(): boolean {
    return false
  }

  getStatus(): UpdaterStatus {
    return this.status
  }

  private setStatus(s: UpdaterStatus): void {
    this.status = s
    this.emit('changed', s)
  }

  private emitError(err: Error): void {
    console.warn('[updater] error:', err.message)
    this.setStatus({
      kind: 'error',
      currentVersion: app.getVersion(),
      message: err.message || 'Bilinmeyen hata',
    })
  }
}
