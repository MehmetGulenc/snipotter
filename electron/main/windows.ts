/**
 * Snipotter — Window manager
 * Three windows:
 *   1. Main "library" window for browsing clipboard / notes
 *   2. Frameless "quick note" overlay (centered, single-text-area)
 *   3. Frameless "quick paste" popup (Maccy-style, recent clips with search)
 * All overlays auto-hide on blur in production.
 */
import { BrowserWindow, screen, shell, app } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
let quickWindow: BrowserWindow | null = null
let quickPasteWindow: BrowserWindow | null = null
let previousFocusedApp: string | null = null

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
    skipTaskbar: process.platform === 'win32', // Windows: hide from taskbar, stay in tray only
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

  mainWindow.on('close', (e) => {
    // On Windows/Linux: hide window instead of closing to keep app in tray
    if (process.platform !== 'darwin' && mainWindow) {
      e.preventDefault()
      mainWindow.hide()
    }
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

// =====================================================================
// Quick paste — Maccy-style recent clips popup
// =====================================================================

export function createQuickPasteWindow(): BrowserWindow {
  if (quickPasteWindow && !quickPasteWindow.isDestroyed()) {
    if (quickPasteWindow.isVisible()) {
      quickPasteWindow.hide()
    } else {
      positionQuickPasteWindow(quickPasteWindow)
      quickPasteWindow.show()
      quickPasteWindow.focus()
      // Tell the renderer to re-focus the search input + reset selection.
      quickPasteWindow.webContents.send('quickpaste:opened')
    }
    return quickPasteWindow
  }

  quickPasteWindow = new BrowserWindow({
    width: 460,
    height: 480,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    // macOS vibrancy gives the popup a native blurred backdrop similar to Maccy /
    // Spotlight. On Windows / Linux the transparent background + dark fill via
    // CSS approximates the same look.
    vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
    visualEffectState: 'active',
    webPreferences: {
      preload: PRELOAD,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  quickPasteWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  quickPasteWindow.on('blur', () => {
    if (!is.dev) quickPasteWindow?.hide()
  })

  quickPasteWindow.on('closed', () => {
    quickPasteWindow = null
  })

  positionQuickPasteWindow(quickPasteWindow)
  void quickPasteWindow.loadURL(rendererURL('#/quick-paste'))
  quickPasteWindow.once('ready-to-show', () => {
    quickPasteWindow?.show()
    quickPasteWindow?.focus()
  })
  return quickPasteWindow
}

/** Returns the name of the currently frontmost application (macOS only). */
async function getFrontmostApp(): Promise<string | null> {
  if (process.platform !== 'darwin') return null
  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to name of first application process whose frontmost is true'],
      { timeout: 1000 },
      (err, stdout) => resolve(err ? null : stdout.trim() || null),
    )
  })
}

export async function toggleQuickPasteWindow(): Promise<void> {
  const w = quickPasteWindow
  if (w && !w.isDestroyed() && w.isVisible()) {
    w.hide()
    return
  }
  // Capture the frontmost app before our window steals focus.
  previousFocusedApp = await getFrontmostApp()
  createQuickPasteWindow()
}

export function hideQuickPasteWindow(): void {
  if (quickPasteWindow && !quickPasteWindow.isDestroyed()) {
    quickPasteWindow.hide()
  }
}

/**
 * Hides the QuickPaste window, restores focus to the previously active app,
 * then simulates a paste keystroke (Cmd+V on macOS, Ctrl+V on Windows).
 * Called after the user selects a clipboard item from the QuickPaste popup.
 * Requires Accessibility permission on macOS (com.apple.security.automation.apple-events).
 */
export async function pasteAtCursor(): Promise<void> {
  if (quickPasteWindow && !quickPasteWindow.isDestroyed()) {
    quickPasteWindow.hide()
  }

  if (process.platform === 'darwin') {
    const appName = previousFocusedApp
    previousFocusedApp = null
    if (appName) {
      await new Promise<void>((resolve) => {
        const escapedName = appName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        const script = [
          `tell application "${escapedName}" to activate`,
          'delay 0.08',
          'tell application "System Events"',
          '  keystroke "v" using command down',
          'end tell',
        ].join('\n')
        execFile('osascript', ['-e', script], { timeout: 3000 }, () => resolve())
      })
    }
  } else if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`
        execFile('powershell.exe', ['-Command', script], { timeout: 3000 }, () => resolve())
      }, 80)
    })
  }
}

export function getQuickPasteWindow(): BrowserWindow | null {
  return quickPasteWindow
}

/**
 * Anchor the popup near the cursor (Maccy default). Falls back to centered top
 * if the cursor isn't on a known display. Clamps inside the work area so the
 * window never spawns half-off-screen.
 */
function positionQuickPasteWindow(w: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor) ?? screen.getPrimaryDisplay()
  const { x: ax, y: ay, width, height } = display.workArea
  const [winW, winH] = w.getSize()

  // Open slightly below + right of the cursor, but bounded to the screen.
  let x = cursor.x + 12
  let y = cursor.y + 12
  if (x + winW > ax + width) x = ax + width - winW - 12
  if (y + winH > ay + height) y = ay + height - winH - 12
  if (x < ax) x = ax + 12
  if (y < ay) y = ay + 12

  w.setPosition(Math.round(x), Math.round(y))
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
