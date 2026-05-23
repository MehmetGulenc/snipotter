/**
 * Snipotter — System tray
 * Minimal tray menu: Show window, Toggle quick note, Pause clipboard, Check for Updates, Quit.
 */
import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'node:path'
import { focusOrCreateMainWindow, toggleQuickNoteWindow } from './windows'
import { settingsStore } from './store'
import type { ClipboardMonitor } from './clipboard'
import type { UpdaterService } from './updater'

let tray: Tray | null = null
let storedUpdater: UpdaterService | null = null

function buildIcon(): Electron.NativeImage {
  // Windows uses ICO for native-quality tray rendering. macOS/Linux use PNG.
  const isWin = process.platform === 'win32'
  const isDarwin = process.platform === 'darwin'

  let iconPath: string
  if (isWin) {
    // ICO gives proper multi-resolution rendering in Windows system tray.
    iconPath = app.isPackaged
      ? join(process.resourcesPath, 'tray-icon.ico')
      : join(__dirname, '../../build/icon.ico')
  } else {
    iconPath = app.isPackaged
      ? join(process.resourcesPath, 'tray-icon.png')
      : join(__dirname, '../../build/tray-icon.png')
  }

  let img = nativeImage.createFromPath(iconPath)

  // Fallback: if ICO not found in resources, try PNG
  if (img.isEmpty() && isWin) {
    const pngPath = app.isPackaged
      ? join(process.resourcesPath, 'tray-icon.png')
      : join(__dirname, '../../build/tray-icon.png')
    img = nativeImage.createFromPath(pngPath)
  }

  if (img.isEmpty()) {
    console.warn('[tray] icon not found at', iconPath, '— using empty fallback')
    return nativeImage.createEmpty()
  }

  if (isDarwin) {
    img.setTemplateImage(true)
    return img.resize({ width: 18, height: 18 })
  }
  // Windows/Linux: 16x16 for standard tray slot
  return img.resize({ width: 16, height: 16 })
}

export function createTray(monitor: ClipboardMonitor, updater: UpdaterService): Tray {
  if (tray) return tray
  storedUpdater = updater
  tray = new Tray(buildIcon())
  tray.setToolTip('Snipotter')
  refreshMenu(monitor)
  tray.on('click', () => focusOrCreateMainWindow())
  return tray
}

export function refreshMenu(monitor: ClipboardMonitor, updater?: UpdaterService): void {
  if (!tray) return
  if (updater) storedUpdater = updater
  const settings = settingsStore.get()
  const status = storedUpdater?.getStatus()
  const isDownloaded = status?.kind === 'downloaded'
  const isAvailable = status?.kind === 'available'
  const isChecking = status?.kind === 'checking'
  const isUpToDate = status?.kind === 'not-available'

  const updateItems: Electron.MenuItemConstructorOptions[] = isDownloaded
    ? [{ label: 'Yeniden Başlat ve Güncelle', click: () => storedUpdater?.installAndRestart() }]
    : isAvailable
      ? [{ label: `Güncelleme Mevcut (${status.nextVersion}) — İndir`, click: () => { void storedUpdater?.downloadNow() } }]
      : isUpToDate
        ? [
            { label: '✓ Güncel', enabled: false },
            { label: 'Tekrar Kontrol Et', click: () => { void storedUpdater?.checkNow() } },
          ]
        : [{ label: isChecking ? 'Kontrol Ediliyor…' : 'Güncelleme Denetle', enabled: !isChecking, click: () => { void storedUpdater?.checkNow() } }]

  const menu = Menu.buildFromTemplate([
    { label: 'Snipotter', enabled: false },
    { type: 'separator' },
    { label: 'Kütüphaneyi Aç', click: () => focusOrCreateMainWindow() },
    {
      label: 'Hızlı Not',
      accelerator: settings.quickNoteHotkey,
      click: () => toggleQuickNoteWindow(),
    },
    { type: 'separator' },
    {
      label: settings.clipboardEnabled ? 'Pano İzlemeyi Durdur' : 'Pano İzlemeyi Başlat',
      click: () => {
        const next = !settings.clipboardEnabled
        settingsStore.set({ clipboardEnabled: next })
        if (next) monitor.start()
        else monitor.stop()
        refreshMenu(monitor)
      },
    },
    { type: 'separator' },
    ...updateItems,
    { type: 'separator' as const },
    { label: 'Snipotter\'ı Kapat', role: 'quit' as const },
  ])
  tray.setContextMenu(menu)
}
