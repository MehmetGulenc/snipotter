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
import { app, BrowserWindow } from 'electron'
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

export class UpdaterService extends EventEmitter {
  private status: UpdaterStatus
  private periodicTimer: NodeJS.Timeout | null = null

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
      // Auto-start the download — we only block the install on user confirm.
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
