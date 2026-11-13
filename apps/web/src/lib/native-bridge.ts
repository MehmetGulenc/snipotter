/**
 * iOS only: keeps the native Share extension, Shortcuts action and widget in
 * step with the web app.
 *
 *  - The Supabase access token and workspace are mirrored to the shared
 *    Keychain so the extensions can upload directly. Only this app refreshes
 *    the session (refresh tokens rotate); extensions queue text when the
 *    mirrored token has expired.
 *  - Queued texts are uploaded here whenever the app becomes active.
 *  - The latest clips are mirrored for the widget, which links back with
 *    snipotter://copy?id=… to copy one.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Clipboard } from '@capacitor/clipboard'
import { getSupabase } from './supabase'
import { createClipFromText } from './api'
import { useStore } from './store'
import { toast } from './feedback'
import { codec } from '@shared/crypto/codec'
import type { ClipboardItem } from './types'

export interface PushAction {
  actionId: string
  kind: 'phone' | 'address' | 'iban' | 'url' | 'text'
  payload: string
  button: 'call' | 'map' | 'copy' | 'open'
}

interface SnipotterNativePlugin {
  registerPush(): Promise<{ token: string; environment: 'sandbox' | 'production' }>
  /** Dynamic Island push-to-start token; empty below iOS 17.2 or with Live Activities off. */
  liveActivityToken(): Promise<{ token?: string }>
  copyRich(options: { text: string; html?: string }): Promise<void>
  addListener(event: 'pushAction', cb: (action: PushAction) => void): Promise<PluginListenerHandle>
  syncSession(options: {
    url: string
    anonKey: string
    accessToken: string
    expiresAt: number
    userId: string
    workspaceId: string
  }): Promise<void>
  clearSession(): Promise<void>
  setRecentClips(options: { items: Array<Pick<ClipboardItem, 'id' | 'text' | 'createdAt' | 'pinned'>> }): Promise<void>
  takePending(): Promise<{ items: Array<{ text: string; source: string }> }>
  addEvent(options: { title: string; start: number; durationMin?: number; notes?: string }): Promise<{ saved: boolean }>
  setWorkspaceKey(options: { workspaceId: string; key: string }): Promise<void>
  getWorkspaceKey(options: { workspaceId: string }): Promise<{ key: string | null }>
  deleteWorkspaceKey(options: { workspaceId: string }): Promise<void>
}

export const SnipotterNative = registerPlugin<SnipotterNativePlugin>('SnipotterNative')

export const nativeBridgeAvailable = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

/** Starts mirroring for this workspace; the returned function stops it and clears the shared session. */
export function startNativeBridge(workspaceId: string, userId: string): () => void {
  if (!nativeBridgeAvailable()) return () => {}
  const sb = getSupabase()
  let stopped = false

  const syncSession = async (): Promise<void> => {
    const { data } = await sb.auth.getSession()
    const session = data.session
    if (stopped || !session?.access_token || !session.expires_at) return
    await SnipotterNative.syncSession({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      accessToken: session.access_token,
      expiresAt: session.expires_at,
      userId,
      workspaceId,
    })
  }

  const flushPending = async (): Promise<void> => {
    const { items } = await SnipotterNative.takePending()
    let saved = 0
    for (const item of items) {
      try {
        const clip = await createClipFromText(workspaceId, userId, item.text, item.source)
        if (clip) {
          useStore.getState().upsertClip(clip)
          saved++
        }
      } catch (err) {
        console.warn('[native] pending upload failed', err)
      }
    }
    if (saved > 0) toast(saved === 1 ? 'Paylaşılan metin gönderildi' : `${saved} paylaşılan metin gönderildi`)
  }

  const onActive = (): void => {
    void syncSession().catch((e) => console.warn('[native] session sync failed', e))
    void flushPending().catch((e) => console.warn('[native] flush failed', e))
  }
  onActive()

  const { data: authSub } = sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') void SnipotterNative.clearSession()
    else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') void syncSession()
  })
  const stateSub = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) onActive()
  })
  const urlSub = App.addListener('appUrlOpen', ({ url }) => void handleUrl(url))

  // Mirror the newest clips for the widget whenever the list changes.
  let lastKey = ''
  const pushRecent = (clips: ClipboardItem[]): void => {
    // Pinned clips first (lock screen widget, Siri), then the newest ones.
    const text = clips.filter((c) => c.contentType !== 'image')
    const pinned = text.filter((c) => c.pinned).slice(0, 12)
    const recent = [...pinned, ...text.filter((c) => !c.pinned).slice(0, 8)]
    const key = recent.map((c) => `${c.id}:${c.pinned}`).join('|')
    if (key === lastKey) return
    lastKey = key
    void SnipotterNative.setRecentClips({
      items: recent.map(({ id, text, createdAt, pinned }) => ({ id, text: text.slice(0, 300), createdAt, pinned })),
    })
  }
  pushRecent(useStore.getState().clipboard)
  const unsubStore = useStore.subscribe((s) => pushRecent(s.clipboard))

  return () => {
    stopped = true
    authSub.subscription.unsubscribe()
    void stateSub.then((h) => h.remove())
    void urlSub.then((h) => h.remove())
    unsubStore()
    void SnipotterNative.clearSession()
  }
}

/** snipotter://copy?id=<clip id> from the widget: copy that clip. */
async function handleUrl(url: string): Promise<void> {
  // Shared-space invite (snipotter://katil#…): the Notes screen offers to join.
  // Dynamic Island tap: snipotter://not?space=…&note=…
  if (url.startsWith('snipotter://not')) {
    const q = new URL(url.replace('snipotter://', 'https://snipotter.app/')).searchParams
    const space = q.get('space') ?? ''
    const note = q.get('note') ?? ''
    const st = useStore.getState()
    if (!st.workspace || !st.spaces.some((s) => s.id === space)) return
    const { openSpace } = await import('./spaces')
    openSpace(st.workspace.id, space)
    st.setView('notes')
    if (/^[0-9a-f-]{36}$/i.test(note)) st.openNote(note)
    return
  }
  if (url.startsWith('snipotter://katil')) {
    useStore.getState().setPendingInvite(url)
    useStore.getState().setView('notes')
    return
  }
  if (!url.startsWith('snipotter://copy')) return
  const id = new URL(url.replace('snipotter://', 'https://snipotter.app/')).searchParams.get('id')
  const clip = useStore.getState().clipboard.find((c) => c.id === id)
  if (!clip) {
    toast('Bu kayıt artık yok', 'info')
    return
  }
  await Clipboard.write({ string: clip.text })
  toast('Kopyalandı')
}

/** Copies text to the system clipboard (native API inside the app, browser API on the web). */
export async function copyText(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await Clipboard.write({ string: text })
  else await navigator.clipboard.writeText(text)
}

/** Opens a link, phone number or map outside the app. */
export function openExternal(href: string): void {
  window.open(href, Capacitor.isNativePlatform() ? '_system' : '_blank', 'noopener')
}

/** Shows the system "New Event" sheet (iOS). Returns false where unavailable. */
export async function addToCalendar(title: string, start: number, notes?: string): Promise<boolean> {
  if (!nativeBridgeAvailable()) return false
  const { saved } = await SnipotterNative.addEvent({ title, start, notes })
  return saved
}

/** Requests notification permission and resolves after APNs registration. */
export async function registerPush(): Promise<{ token: string; environment: 'sandbox' | 'production' } | null> {
  if (!nativeBridgeAvailable()) return null
  return SnipotterNative.registerPush()
}

export function onPushAction(cb: (action: PushAction) => void): () => void {
  if (!nativeBridgeAvailable()) return () => {}
  // In encrypted workspaces the push carries ciphertext; open it with the action's id.
  const listener = SnipotterNative.addListener('pushAction', (action) => {
    if ((action.kind as string) === 'space_note') return
    void codec().openRow('device_actions', { id: action.actionId, payload: action.payload })
      .then((open) => cb({ ...action, payload: open.payload }))
  })
  return () => { void listener.then((handle) => handle.remove()) }
}

/** Tapped "new note in your shared space" notification: ids of the space and the note. */
export function onSpaceNotePush(cb: (p: { spaceId: string; noteId: string }) => void): () => void {
  if (!nativeBridgeAvailable()) return () => {}
  const listener = SnipotterNative.addListener('pushAction', (action) => {
    if ((action.kind as string) === 'space_note') cb({ spaceId: action.payload, noteId: action.actionId })
  })
  return () => { void listener.then((handle) => handle.remove()) }
}

export async function copyRich(options: { text: string; html?: string }): Promise<void> {
  if (nativeBridgeAvailable()) return SnipotterNative.copyRich(options)
  if (options.html && typeof globalThis.ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    await navigator.clipboard.write([new globalThis.ClipboardItem({
      'text/plain': new Blob([options.text], { type: 'text/plain' }),
      'text/html': new Blob([options.html], { type: 'text/html' }),
    })])
  } else await copyText(options.text)
}
