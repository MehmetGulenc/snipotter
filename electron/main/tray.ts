/**
 * Snipotter — System tray
 * Minimal tray menu: Show window, Toggle quick note, Pause clipboard, Quit.
 */
import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'node:path'
import { focusOrCreateMainWindow, toggleQuickNoteWindow } from './windows'
import { settingsStore } from './store'
import type { ClipboardMonitor } from './clipboard'

let tray: Tray | null = null

function buildIcon(): Electron.NativeImage {
  // Tray icon path differs in dev vs packaged; fall back to a generic 16x16
  // png provided in /build at packaging time.
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray-icon.png')
    : join(__dirname, '../../build/tray-icon.png')
  const img = nativeImage.createFromPath(iconPath)
  if (img.isEmpty()) {
    // Fallback transparent icon to avoid crash if asset missing in dev.
    return nativeImage.createEmpty()
  }
  if (process.platform === 'darwin') img.setTemplateImage(true)
  return img.resize({ width: 18, height: 18 })
}

export function createTray(monitor: ClipboardMonitor): Tray {
  if (tray) return tray
  tray = new Tray(buildIcon())
  tray.setToolTip('Snipotter')
  refreshMenu(monitor)
  tray.on('click', () => focusOrCreateMainWindow())
  return tray
}

export function refreshMenu(monitor: ClipboardMonitor): void {
  if (!tray) return
  const settings = settingsStore.get()
  const menu = Menu.buildFromTemplate([
    { label: 'Snipotter', enabled: false },
    { type: 'separator' },
    { label: 'Open Library', click: () => focusOrCreateMainWindow() },
    {
      label: 'Quick Note',
      accelerator: settings.quickNoteHotkey,
      click: () => toggleQuickNoteWindow(),
    },
    { type: 'separator' },
    {
      label: settings.clipboardEnabled ? 'Pause Clipboard Watcher' : 'Resume Clipboard Watcher',
      click: () => {
        const next = !settings.clipboardEnabled
        settingsStore.set({ clipboardEnabled: next })
        if (next) monitor.start()
        else monitor.stop()
        refreshMenu(monitor)
      },
    },
    { type: 'separator' },
    { label: 'Quit Snipotter', role: 'quit' },
  ])
  tray.setContextMenu(menu)
}
