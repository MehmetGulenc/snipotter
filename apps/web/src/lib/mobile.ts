/**
 * Snipotter mobile bridge.
 *
 * Capacitor wraps the static export of this app into an Android binary. On
 * native platforms we register two extra clipboard-capture surfaces that the
 * web app doesn't have:
 *
 *   1. Share Target — user selects text in any app, taps "Share → Snipotter".
 *   2. Resume read   — when the app comes to the foreground we read the
 *                      OS clipboard once (Android 10+ blocks this in the
 *                      background, but a fresh resume counts as foreground).
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
import { SendIntent } from 'send-intent'
import { createClipFromText } from './api'

export const isNative = (): boolean => Capacitor.isNativePlatform()

interface InitArgs {
  workspaceId: string
  userId: string
}

let initialized = false

/**
 * Wires up native-only listeners. Safe to call repeatedly; only the first
 * call attaches handlers. Must run AFTER the workspace + user are loaded
 * because every capture path needs a workspace_id to insert into.
 */
export async function initMobileBridge({ workspaceId, userId }: InitArgs): Promise<void> {
  if (!isNative() || initialized) return
  initialized = true

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

  // 2) Resume — read the OS clipboard once when the app becomes active.
  //    User intent is implicit ("they opened us right after copying"). We
  //    skip empty / non-text payloads and let the Supabase hash dedupe
  //    avoid double-saves when the same text is shared AND on the clipboard.
  const readClipboardIfText = async (): Promise<void> => {
    try {
      const { value, type } = await Clipboard.read()
      if (type?.startsWith('text/') && value?.trim()) {
        await saveClip(value, 'android-clipboard')
      }
    } catch {
      /* permission denied or empty clipboard — silently skip */
    }
  }
  // Cold-start read happens after the splash so we don't race the auth
  // bootstrap. We rely on the resume listener for warm starts.
  await readClipboardIfText()
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void readClipboardIfText()
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
