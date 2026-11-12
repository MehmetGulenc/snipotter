/**
 * Snipotter mobile bridge.
 *
 * Capacitor wraps the static export of this app into an Android binary. On
 * native platforms we register two extra clipboard-capture surfaces that the
 * web app doesn't have:
 *
 *   1. Share Target — user selects text in any app, taps "Share → Snipotter".
 *   2. Explicit paste — Settings offers a user-initiated clipboard save.
 *   3. Quick Settings Tile — the native Kotlin TileService relaunches us
 *                      with `?clip=…` and the same handler picks it up.
 *
 * Everything below is a no-op on web: `Capacitor.isNativePlatform()` returns
 * false in the browser, the modules tree-shake their native shims, and the
 * AppShell init effect short-circuits.
 */
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Clipboard } from '@capacitor/clipboard'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { Preferences } from '@capacitor/preferences'
import { Device } from '@capacitor/device'
import { SendIntent } from 'send-intent'
import { createClipFromText } from './api'
import type { ClipboardItem } from './types'

export const isNative = (): boolean => Capacitor.isNativePlatform()

interface InitArgs {
  workspaceId: string
  userId: string
  /** Called when automatic saving stores a new clipboard item. */
  onAutoCapture?: (item: ClipboardItem) => void
}

let initialized = false

/**
 * Wires up native-only listeners. Safe to call repeatedly; only the first
 * call attaches handlers. Must run AFTER the workspace + user are loaded
 * because every capture path needs a workspace_id to insert into.
 */
export async function initMobileBridge({ workspaceId, userId, onAutoCapture }: InitArgs): Promise<void> {
  if (!isNative() || initialized) return
  initialized = true

  watchForegroundCapture(workspaceId, userId, (item) => onAutoCapture?.(item))

  // Anonymous launch heartbeat — admin.snipotter.com counts active
  // installs and DAU/WAU/MAU. Fires once per app session, fully
  // anonymous (random device UUID stored via Capacitor Preferences,
  // OS+arch + version + locale; no email/IP/account). Failures are
  // swallowed silently so a network blip can never delay the splash.
  void sendLaunchHeartbeat()

  // Cosmetic: keep the status bar in sync with our dark UI. Splash hide is a
  // safety net — capacitor.config sets launchAutoHide=true but on cold start
  // the JS bundle sometimes loads faster than the native fade-out timer.
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#0a0a0f' })
  } catch {
    /* status bar plugin may be unavailable on some OEM skins */
  }
  try {
    await SplashScreen.hide()
  } catch {
    /* splash already hidden */
  }

  const saveClip = async (text: string, sourceApp: string | null): Promise<void> => {
    try {
      await createClipFromText(workspaceId, userId, text, sourceApp)
    } catch (err) {
      console.warn('[mobile] saveClip failed', err)
    }
  }

  // 1) Share Target — fires when another app sent text to us via the
  //    Android share sheet. send-intent reads the launching Intent extras
  //    and resolves with { title, description, type, url, webUrl, ... }.
  const handleShareIntent = async (): Promise<void> => {
    try {
      const result = await SendIntent.checkSendIntentReceived()
      if (!result) return
      const text = result.url || result.title || ''
      if (text.trim()) {
        await saveClip(text, sourceFromIntent(result.type))
        // Tell native to clear the intent so resuming the app doesn't replay
        // the same share over and over.
        SendIntent.finish()
      }
    } catch {
      // No intent waiting — normal launch path.
    }
  }
  await handleShareIntent()
  // ACTION_SEND from another app while ours is already running comes back as
  // a fresh appUrlOpen/Intent. Both fire on Android, so we just re-check.
  App.addListener('appUrlOpen', () => {
    void handleShareIntent()
  })

  // 3) Tile relaunch — the native TileService starts MainActivity with
  //    intent extra "snipotter.clip". Capacitor surfaces extras via the
  //    `appUrlOpen` event when the action matches. We additionally accept
  //    the snipotter:// deep-link form for forward compatibility (e.g.
  //    notification taps, NFC, etc.).
  App.addListener('appUrlOpen', ({ url }) => {
    if (!url) return
    if (url.startsWith('snipotter://clip?text=')) {
      const text = decodeURIComponent(url.slice('snipotter://clip?text='.length))
      void saveClip(text, 'android-tile')
    }
  })
}

function sourceFromIntent(mime: string | undefined): string {
  if (!mime) return 'android-share'
  if (mime.startsWith('text/')) return 'android-share-text'
  if (mime.startsWith('image/')) return 'android-share-image'
  return 'android-share'
}

/* ---------------------------------------------------------------------------
   Anonymous launch heartbeat. Mirrors what the Electron app does in
   electron/main/telemetry.ts so admin.snipotter.com can count Snipotter
   Android installs alongside desktop installs in DAU/WAU/MAU.

   Privacy:
     • deviceId is a random UUID generated client-side and persisted via
       Capacitor Preferences (encrypted on Android via Keystore-backed
       SharedPreferences). No email, no IP storage, no Supabase user_id.
     • Capacitor's Device API gives us OS + version which is the only
       extra info we attach.
     • Failures are silenced — the heartbeat is a nice-to-have, never a
       blocker for the actual app.
   ------------------------------------------------------------------------ */
const HEARTBEAT_URL =
  process.env.NEXT_PUBLIC_HEARTBEAT_URL ?? 'https://api.snipotter.com/heartbeat'
const DEVICE_ID_KEY = 'snipotter.deviceId'

async function ensureDeviceId(): Promise<string> {
  const { value } = await Preferences.get({ key: DEVICE_ID_KEY })
  if (value) return value
  // crypto.randomUUID is available in WebView on Android 8+
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  await Preferences.set({ key: DEVICE_ID_KEY, value: id })
  return id
}

async function sendLaunchHeartbeat(): Promise<void> {
  try {
    const [deviceId, deviceInfo, appInfo] = await Promise.all([
      ensureDeviceId(),
      Device.getInfo(),
      App.getInfo().catch(() => null),
    ])
    const platform = `${deviceInfo.operatingSystem}-${deviceInfo.osVersion}`
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 5000)
    await fetch(HEARTBEAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appSlug: 'snipotter-android',
        deviceId,
        platform,
        version: appInfo?.version ?? null,
        language: deviceInfo.operatingSystem,
      }),
      signal: controller.signal,
    })
    clearTimeout(t)
  } catch {
    /* offline / cf worker down / aborted — never surface to the user */
  }
}

export type CaptureResult =
  | { status: 'saved'; item: ClipboardItem }
  | { status: 'unchanged' }
  | { status: 'empty' }

const LAST_CAPTURE_KEY = 'snipotter.lastCaptureHash'

/**
 * Reads the system clipboard once and saves its text. Runs only after an
 * explicit tap, or on app launch/resume when the user switched on automatic
 * saving (see isAutoCaptureEnabled). `unchanged` means the same text was
 * already captured from this device, so returning to the app does not
 * re-save it.
 */
export async function saveClipboardFromUserAction(
  workspaceId: string,
  userId: string,
  source: 'button' | 'auto' = 'button',
): Promise<CaptureResult> {
  const { value, type } = await Clipboard.read()
  const text = type?.startsWith('text/') ? value?.trim() : ''
  if (!text) return { status: 'empty' }
  const hash = await textHash(text)
  if (source === 'auto') {
    const { value: last } = await Preferences.get({ key: LAST_CAPTURE_KEY })
    if (last === hash) return { status: 'unchanged' }
  }
  const item = await createClipFromText(workspaceId, userId, text, `${Capacitor.getPlatform()}-${source === 'auto' ? 'auto' : 'clipboard'}`)
  await Preferences.set({ key: LAST_CAPTURE_KEY, value: hash })
  return item ? { status: 'saved', item } : { status: 'empty' }
}

const AUTO_CAPTURE_KEY = 'snipotter.autoCapture'

/** Off until the user turns it on in Settings: launch/resume reads the clipboard only then. */
export async function isAutoCaptureEnabled(): Promise<boolean> {
  if (!isNative()) return false
  const { value } = await Preferences.get({ key: AUTO_CAPTURE_KEY })
  return value === '1'
}

export async function setAutoCaptureEnabled(on: boolean): Promise<void> {
  await Preferences.set({ key: AUTO_CAPTURE_KEY, value: on ? '1' : '0' })
}

/** Opens this app's page in iOS Settings, where "Paste from Other Apps" can be set to Allow. */
export function openAppSettings(): void {
  window.open('app-settings:', '_system')
}

async function textHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Saves the clipboard when the app opens or comes back to the foreground,
 * only while automatic saving is on. Each new text is saved once.
 */
function watchForegroundCapture(
  workspaceId: string,
  userId: string,
  onSaved: (item: ClipboardItem) => void,
): void {
  let running = false
  const capture = async (): Promise<void> => {
    if (running || !(await isAutoCaptureEnabled())) return
    running = true
    try {
      const result = await saveClipboardFromUserAction(workspaceId, userId, 'auto')
      if (result.status === 'saved') onSaved(result.item)
    } catch (err) {
      console.warn('[mobile] auto capture failed', err)
    } finally {
      running = false
    }
  }
  void capture()
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void capture()
  })
}
