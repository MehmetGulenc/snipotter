/**
 * Snipotter — Global hotkeys
 * Registers configurable accelerators for opening the library and the
 * quick-note overlay. Re-registers when the user changes them.
 */
import { globalShortcut } from 'electron'
import {
  focusOrCreateMainWindow,
  toggleQuickNoteWindow,
  toggleQuickPasteWindow,
} from './windows'
import { settingsStore } from './store'

let registered: string[] = []
/** While true, registerHotkeys() is a no-op so the renderer recorder can capture key events. */
let recordingPaused = false

/**
 * Electron's globalShortcut accepts ASCII-only accelerator strings. Anything
 * else throws synchronously. We defensively filter at the boundary so a
 * corrupted setting (e.g. one that picked up clipboard text from an old bug)
 * can never crash subsequent hotkey ops.
 */
function isValidAccelerator(accel: string): boolean {
  return typeof accel === 'string' && accel.length > 0 && /^[\x20-\x7E]+$/.test(accel)
}

function tryRegister(accel: string, handler: () => void, label: string): boolean {
  if (!isValidAccelerator(accel)) {
    console.warn(`[hotkeys] skipping ${label} — invalid accelerator string`)
    return false
  }
  try {
    return globalShortcut.register(accel, handler)
  } catch (err) {
    console.warn(`[hotkeys] register threw for ${label} (${accel}):`, (err as Error).message)
    return false
  }
}

export function registerHotkeys(): void {
  unregisterAll()
  if (recordingPaused) return

  const settings = settingsStore.get()

  if (settings.globalHotkey) {
    if (tryRegister(settings.globalHotkey, focusOrCreateMainWindow, 'library')) {
      registered.push(settings.globalHotkey)
    }
  }

  if (settings.quickNoteHotkey) {
    if (tryRegister(settings.quickNoteHotkey, toggleQuickNoteWindow, 'quick-note')) {
      registered.push(settings.quickNoteHotkey)
    }
  }

  if (settings.quickPasteHotkey && settings.quickPasteHotkey !== settings.globalHotkey) {
    if (tryRegister(settings.quickPasteHotkey, toggleQuickPasteWindow, 'quick-paste')) {
      registered.push(settings.quickPasteHotkey)
    }
  }
}

export function unregisterAll(): void {
  for (const hk of registered) globalShortcut.unregister(hk)
  registered = []
}

/**
 * Pause/resume registration so the in-app HotkeyInput recorder can receive
 * key events that would otherwise be swallowed by globalShortcut.
 */
export function setRecordingPaused(paused: boolean): void {
  recordingPaused = paused
  if (paused) {
    unregisterAll()
  } else {
    registerHotkeys()
  }
}

/**
 * Probes whether `accel` can be registered globally. Returns true if it bound
 * cleanly (we immediately unregister our probe). False usually means an OS-level
 * conflict — another app already grabbed the same combo.
 */
export function validateAccelerator(accel: string): boolean {
  if (!isValidAccelerator(accel)) return false
  const wasOurs = registered.includes(accel)
  if (wasOurs) {
    try {
      globalShortcut.unregister(accel)
    } catch {
      /* noop */
    }
    registered = registered.filter((r) => r !== accel)
  }
  let ok = false
  try {
    ok = globalShortcut.register(accel, () => {})
  } catch {
    ok = false
  }
  if (ok) {
    try {
      globalShortcut.unregister(accel)
    } catch {
      /* noop */
    }
  }
  if (wasOurs) registerHotkeys()
  return ok
}
