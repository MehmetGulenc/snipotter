/**
 * Snipotter — Main process settings store.
 * Persists user preferences and the Supabase session locally so the same
 * anonymous user comes back across app restarts.
 */
import Store from 'electron-store'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

interface StoreSchema {
  settings: AppSettings
}

const store = new Store<StoreSchema>({
  name: 'snipotter',
  defaults: {
    settings: DEFAULT_SETTINGS,
  },
})

/** ASCII-only check; matches Electron's globalShortcut accelerator constraint. */
const isAsciiAccelerator = (s: unknown): boolean =>
  typeof s === 'string' && s.length > 0 && s.length < 64 && /^[\x20-\x7E]+$/.test(s)

/**
 * Strip out anything that would crash globalShortcut.register at startup.
 * Recovers gracefully from older builds where a paste-event bug could leak
 * non-ASCII clipboard text into a hotkey field. Also runs a one-time migration
 * for users upgrading from <0.2 (no `quickPasteHotkey` field) and resolves the
 * Cmd+Shift+V collision that would happen if their existing Library hotkey
 * shadows the new QuickPaste default.
 */
function sanitize(s: AppSettings): AppSettings {
  const out: AppSettings = { ...s }
  if (!isAsciiAccelerator(out.globalHotkey)) {
    out.globalHotkey = DEFAULT_SETTINGS.globalHotkey
  }
  if (!isAsciiAccelerator(out.quickNoteHotkey)) {
    out.quickNoteHotkey = DEFAULT_SETTINGS.quickNoteHotkey
  }
  // Migration: pre-0.2 users have no quickPasteHotkey at all. Fall back to the
  // default so the new feature works out-of-the-box. If the user's existing
  // Library shortcut already uses the same combo we'd register twice and the
  // first registration wins, so move the Library hotkey to Cmd+Shift+L instead.
  if (!isAsciiAccelerator(out.quickPasteHotkey)) {
    out.quickPasteHotkey = DEFAULT_SETTINGS.quickPasteHotkey
  }
  if (
    out.globalHotkey &&
    out.quickPasteHotkey &&
    out.globalHotkey === out.quickPasteHotkey
  ) {
    out.globalHotkey = DEFAULT_SETTINGS.globalHotkey
  }
  // Migration for v0.3.2: auto-mirror across devices. Defaults to OFF so we
  // never start writing remote clipboards onto an upgrading user's machine
  // without explicit consent.
  if (typeof out.autoMirrorClipboard !== 'boolean') {
    out.autoMirrorClipboard = DEFAULT_SETTINGS.autoMirrorClipboard
  }
  // macOS'ta dosya kopyalama her zaman açık — eski kurulumlar false sakladığı için
  // typeof kontrolü geçiyordu, bu yüzden platform bazlı zorunlu migration eklendi.
  if (process.platform === 'darwin') {
    out.fileCopyEnabled = true
  } else if (typeof out.fileCopyEnabled !== 'boolean') {
    out.fileCopyEnabled = DEFAULT_SETTINGS.fileCopyEnabled
  }
  // Migration for v0.7: anonymous heartbeat telemetry. Defaults to ON
  // because the payload is genuinely anonymous (random device UUID,
  // OS+arch, app version — no PII, no IP storage). Users who want to
  // opt out flip this in Settings; the launch ping is skipped on next
  // start.
  if (typeof out.telemetryEnabled !== 'boolean') {
    out.telemetryEnabled = DEFAULT_SETTINGS.telemetryEnabled
  }
  return out
}

export const settingsStore = {
  get: (): AppSettings => sanitize(store.get('settings')),
  set: (partial: Partial<AppSettings>): AppSettings => {
    const next = sanitize({ ...store.get('settings'), ...partial })
    store.set('settings', next)
    return next
  },
  reset: (): AppSettings => {
    store.set('settings', DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  },
  raw: store,
}

/**
 * File-backed key/value bag the Supabase auth client uses to persist its
 * session across app restarts. Without this the anonymous user is regenerated
 * on every boot and prior workspace data becomes inaccessible.
 */
const authBag = new Store<{ kv: Record<string, string> }>({
  name: 'snipotter-auth',
  defaults: { kv: {} },
  // Don't bother with schema-level encryption; on disk this is in the user's
  // local app-data dir and contains an opaque refresh token.
})

export const authStorage = {
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve(authBag.get('kv')[key] ?? null),
  setItem: (key: string, value: string): Promise<void> => {
    const cur = authBag.get('kv')
    authBag.set('kv', { ...cur, [key]: value })
    return Promise.resolve()
  },
  removeItem: (key: string): Promise<void> => {
    const cur = authBag.get('kv')
    const next = { ...cur }
    delete next[key]
    authBag.set('kv', next)
    return Promise.resolve()
  },
}
