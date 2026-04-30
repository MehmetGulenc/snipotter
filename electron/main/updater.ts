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
// electron-updater is published as CommonJS, so under ESM (`"type":"module"`)
// we must default-import the whole module and destructure `autoUpdater` from it.
// Named runtime imports (`import { autoUpdater } from 'electron-updater'`) throw
// `SyntaxError: Named export 'autoUpdater' not found` in packaged builds.
// Type-only imports stay as named imports (compile-time only).
import electronUpdater from 'electron-updater'
import type { UpdateCheckResult, UpdateInfo, ProgressInfo } from 'electron-updater'
import { EventEmitter } from 'node:events'

const { autoUpdater } = electronUpdater

export type UpdaterStatus =
  | { kind: 'idle'; currentVersion: string }
  | { kind: 'checking'; currentVersion: string }
  | { kind: 'not-available'; currentVersion: string; checkedAt: number }
  | { kind: 'available'; currentVersion: string; nextVersion: string; releaseNotes?: string }
  | { kind: 'downloading'; currentVersion: string; nextVersion: string; percent: number; bytesPerSecond: number }
  | { kind: 'downloaded'; currentVersion: string; nextVersion: string }
  | { kind: 'error'; currentVersion: string; message: string }

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const STARTUP_DELAY_MS = 30 * 1000
const RELEASES_PAGE = 'https://github.com/MehmetGulenc/snipotter/releases/latest'

/**
 * macOS Squirrel rejects updates with `Code signature did not pass validation`
 * unless the .app is signed with a real Developer ID certificate (ad-hoc /
 * `identity:null` builds always fail this check). When we know we're in that
 * regime, we skip the download attempt entirely and surface a "download
 * manually" button instead of looping the user through the same install
 * failure on every launch.
 */
const IS_AD_HOC_MAC = process.platform === 'darwin'

/**
 * Pick the DMG download URL that matches the currently running CPU arch.
 * electron-builder names files with an `-arm64` suffix for Apple Silicon and
 * leaves the Intel build unsuffixed. info.files[].url is the bare filename
 * (e.g. `Snipotter-0.2.6-arm64.dmg`), so we resolve it against the canonical
 * GitHub release URL for the announced version.
 */
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
  /**
   * Direct DMG download URL picked from the latest update manifest, matched
   * to the running architecture (arm64 vs x64). When set, the manual-install
   * flow on macOS opens this URL directly in the browser — Safari/Chrome
   * download and auto-mount the DMG so the user only has to drag the app to
   * /Applications. When null we fall back to the GitHub releases page.
   */
  private latestMacDmgUrl: string | null = null

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
    // Respect signed releases on Mac; on Windows we accept unsigned for now.
    autoUpdater.autoInstallOnAppQuit = true

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
      // On ad-hoc-signed macOS builds the in-app installer always fails with
      // "Code signature did not pass validation", so don't even attempt the
      // download — instead remember the arch-matched DMG URL so the manual
      // "Update" button can hand it straight to the browser.
      if (IS_AD_HOC_MAC) {
        this.latestMacDmgUrl = pickMacDmgUrl(info)
        console.info('[updater] mac ad-hoc build — dmg url:', this.latestMacDmgUrl)
        return
      }
      // Windows / Linux can install in-place, so go ahead and pull the bits.
      void autoUpdater.downloadUpdate().catch((err) => this.emitError(err))
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
    autoUpdater.on('error', (err) => this.emitError(err))
  }

  /** Schedule the first check after launch + a recurring 6-hour timer. */
  start(): void {
    if (!app.isPackaged) {
      console.info('[updater] dev mode — auto-update disabled')
      return
    }
    setTimeout(() => void this.checkSilent(), STARTUP_DELAY_MS)
    this.periodicTimer = setInterval(() => void this.checkSilent(), SIX_HOURS_MS)
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
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      console.warn('[updater] silent check failed:', (err as Error).message)
    }
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
    // Force-quit all windows first so unsaved state has a chance to flush.
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.close()
    })
    autoUpdater.quitAndInstall(false, true)
  }

  /**
   * Manual fallback used on ad-hoc-signed macOS builds. When we know the
   * exact DMG URL for this arch we hand it to the browser directly so the
   * download starts (and auto-mounts) with one click; otherwise we fall back
   * to the GitHub releases page.
   */
  openReleasePage(): void {
    void shell.openExternal(this.latestMacDmgUrl ?? RELEASES_PAGE)
  }

  /** True when the current process can't auto-install updates (mac ad-hoc). */
  isManualInstallOnly(): boolean {
    return IS_AD_HOC_MAC
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
