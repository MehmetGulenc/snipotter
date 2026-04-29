/**
 * Snipotter — Window manager
 * Two windows: a main "library" window for browsing clipboard / notes,
 * and a small frameless "quick note" overlay that appears via global hotkey.
 */
import { BrowserWindow, screen, shell, app } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
let quickWindow: BrowserWindow | null = null

const PRELOAD = join(__dirname, '../preload/index.mjs')

function rendererURL(hash = ''): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return process.env['ELECTRON_RENDERER_URL'] + hash
  }
  return `file://${join(__dirname, '../renderer/index.html')}${hash}`
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 820,
    minHeight: 540,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0b0b0f',
    title: 'Snipotter',
    webPreferences: {
      preload: PRELOAD,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  void mainWindow.loadURL(rendererURL())
  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createQuickNoteWindow(): BrowserWindow {
  if (quickWindow && !quickWindow.isDestroyed()) {
    if (quickWindow.isVisible()) {
      quickWindow.hide()
    } else {
      positionQuickWindow(quickWindow)
      quickWindow.show()
      quickWindow.focus()
    }
    return quickWindow
  }

  quickWindow = new BrowserWindow({
    width: 520,
    height: 220,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PRELOAD,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  quickWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  quickWindow.on('blur', () => {
    if (!is.dev) quickWindow?.hide()
  })

  quickWindow.on('closed', () => {
    quickWindow = null
  })

  positionQuickWindow(quickWindow)
  void quickWindow.loadURL(rendererURL('#/quick-note'))
  quickWindow.once('ready-to-show', () => quickWindow?.show())
  return quickWindow
}

export function toggleQuickNoteWindow(): void {
  const w = quickWindow
  if (w && !w.isDestroyed() && w.isVisible()) {
    w.hide()
    return
  }
  createQuickNoteWindow()
}

function positionQuickWindow(w: BrowserWindow): void {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  const [winW, winH] = w.getSize()
  w.setPosition(Math.round(width / 2 - winW / 2), Math.round(height * 0.22 - winH / 2))
}

export function focusOrCreateMainWindow(): void {
  const w = createMainWindow()
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

export function quitApp(): void {
  app.quit()
}

// Helper kept here so __dirname is consistent across ESM main bundles.
export const __mainDirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : fileURLToPath(new URL('.', import.meta.url))
