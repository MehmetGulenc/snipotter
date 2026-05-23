/**
 * Snipotter — Preload bridge
 * Exposes a typed `window.snipotter` API to the renderer.
 */
import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppSettings,
  type ClipboardItem,
  type Note,
  type SnipotterUser,
  type IpcResult,
  type AISummary,
  type Workspace,
  type WorkspaceMember,
  type PairCode,
  type UpdaterStatus,
  type DiagnosticsState,
} from '../../shared/types'

function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, payload)
}

const api = {
  auth: {
    getState: () => invoke<SnipotterUser | null>(IPC.AUTH_GET_STATE),
    signOut: () => invoke<null>(IPC.AUTH_SIGN_OUT),
    onChanged: (cb: (user: SnipotterUser | null) => void) => {
      const fn = (_: unknown, user: SnipotterUser | null) => cb(user)
      ipcRenderer.on(IPC.AUTH_STATE_CHANGED, fn)
      return () => ipcRenderer.off(IPC.AUTH_STATE_CHANGED, fn)
    },
  },
  workspace: {
    get: () => invoke<Workspace | null>(IPC.WORKSPACE_GET),
    create: () => invoke<Workspace | null>(IPC.WORKSPACE_CREATE),
    leave: () => invoke<null>(IPC.WORKSPACE_LEAVE),
    listMembers: () => invoke<WorkspaceMember[]>(IPC.WORKSPACE_LIST_MEMBERS),
    /** Unpair another device. Throws if RLS rejects (e.g. wrong workspace). */
    removeMember: (userId: string) => invoke<null>(IPC.WORKSPACE_REMOVE_MEMBER, userId),
    createPairCode: () => invoke<PairCode>(IPC.PAIR_CREATE),
    redeemPairCode: (code: string) => invoke<Workspace | null>(IPC.PAIR_REDEEM, code),
    onChanged: (cb: (ws: Workspace | null) => void) => {
      const fn = (_: unknown, ws: Workspace | null) => cb(ws)
      ipcRenderer.on(IPC.WORKSPACE_CHANGED, fn)
      return () => ipcRenderer.off(IPC.WORKSPACE_CHANGED, fn)
    },
  },
  clipboard: {
    list: () => invoke<ClipboardItem[]>(IPC.CLIP_LIST),
    delete: (id: string) => invoke<null>(IPC.CLIP_DELETE, id),
    deleteMany: (ids: string[]) => invoke<null>(IPC.CLIP_DELETE_MANY, ids),
    deleteAll: () => invoke<null>(IPC.CLIP_DELETE_ALL),
    pin: (id: string, pinned: boolean) => invoke<null>(IPC.CLIP_PIN, { id, pinned }),
    copy: (item: ClipboardItem) => invoke<null>(IPC.CLIP_COPY, item),
    promoteToNote: (item: ClipboardItem) => invoke<Note | null>(IPC.CLIP_PROMOTE_TO_NOTE, item),
    onNew: (cb: (item: ClipboardItem) => void) => {
      const fn = (_: unknown, item: ClipboardItem) => cb(item)
      ipcRenderer.on(IPC.CLIP_NEW, fn)
      return () => ipcRenderer.off(IPC.CLIP_NEW, fn)
    },
    onUpdated: (cb: (item: ClipboardItem & { deleted?: boolean }) => void) => {
      const fn = (_: unknown, item: ClipboardItem & { deleted?: boolean }) => cb(item)
      ipcRenderer.on(IPC.CLIP_UPDATED, fn)
      return () => ipcRenderer.off(IPC.CLIP_UPDATED, fn)
    },
  },
  notes: {
    list: () => invoke<Note[]>(IPC.NOTE_LIST),
    create: (partial: Partial<Note>) => invoke<Note | null>(IPC.NOTE_CREATE, partial),
    update: (id: string, partial: Partial<Note>) =>
      invoke<Note | null>(IPC.NOTE_UPDATE, { id, partial }),
    pin: (id: string, pinned: boolean) => invoke<Note | null>(IPC.NOTE_PIN, { id, pinned }),
    delete: (id: string) => invoke<null>(IPC.NOTE_DELETE, id),
    deleteMany: (ids: string[]) => invoke<null>(IPC.NOTE_DELETE_MANY, ids),
    onUpdated: (cb: (note: Note & { deleted?: boolean }) => void) => {
      const fn = (_: unknown, note: Note & { deleted?: boolean }) => cb(note)
      ipcRenderer.on(IPC.NOTE_UPDATED, fn)
      return () => ipcRenderer.off(IPC.NOTE_UPDATED, fn)
    },
  },
  settings: {
    get: () => invoke<AppSettings>(IPC.SETTINGS_GET),
    update: (partial: Partial<AppSettings>) =>
      invoke<AppSettings>(IPC.SETTINGS_UPDATE, partial),
    onChanged: (cb: (s: AppSettings) => void) => {
      const fn = (_: unknown, s: AppSettings) => cb(s)
      ipcRenderer.on(IPC.SETTINGS_CHANGED, fn)
      return () => ipcRenderer.off(IPC.SETTINGS_CHANGED, fn)
    },
  },
  window: {
    minimize: () => invoke<null>(IPC.WIN_MINIMIZE),
    close: () => invoke<null>(IPC.WIN_CLOSE),
    toggleQuickNote: () => invoke<null>(IPC.WIN_TOGGLE_QUICK_NOTE),
    toggleQuickPaste: () => invoke<null>(IPC.WIN_TOGGLE_QUICK_PASTE),
    hideQuickPaste: () => invoke<null>(IPC.WIN_HIDE_QUICK_PASTE),
    pasteAtCursor: () => invoke<null>(IPC.WIN_PASTE_AT_CURSOR),
    /** Renderer-side hook for the "popup re-shown" event so the QuickPaste UI
     *  can refocus the search input and reset selection without remounting. */
    onQuickPasteReopened: (cb: () => void) => {
      const fn = () => cb()
      ipcRenderer.on('quickpaste:opened', fn)
      return () => ipcRenderer.off('quickpaste:opened', fn)
    },
  },
  ai: {
    status: () =>
      invoke<{
        enabled: boolean
        primary: 'claude-haiku' | 'gemini-flash'
        providers: Record<'claude-haiku' | 'gemini-flash', boolean>
      }>(IPC.AI_STATUS),
    reenrich: (kind: 'clipboard' | 'note', id: string, text: string) =>
      invoke<AISummary>(IPC.AI_REENRICH, { kind, id, text }),
  },
  hotkeys: {
    /** Pause global shortcuts so the in-app recorder can capture key events. */
    recordStart: () => invoke<null>(IPC.HOTKEY_RECORD_START),
    /** Restore registered global shortcuts. */
    recordEnd: () => invoke<null>(IPC.HOTKEY_RECORD_END),
    /** Probe whether `accel` can be registered (returns false on OS-level conflict). */
    validate: (accel: string) => invoke<boolean>(IPC.HOTKEY_VALIDATE, accel),
  },
  updater: {
    getStatus: () => invoke<UpdaterStatus>(IPC.UPDATER_GET_STATUS),
    checkNow: () => invoke<UpdaterStatus>(IPC.UPDATER_CHECK_NOW),
    downloadNow: () => invoke<UpdaterStatus>(IPC.UPDATER_DOWNLOAD_NOW),
    installAndRestart: () => invoke<null>(IPC.UPDATER_INSTALL_AND_RESTART),
    openReleasePage: () => invoke<null>(IPC.UPDATER_OPEN_RELEASE_PAGE),
    /** True on macOS ad-hoc-signed builds, where in-app update install fails
     *  Squirrel's signature check and the user must download the DMG by hand. */
    isManualOnly: () => invoke<boolean>(IPC.UPDATER_IS_MANUAL_ONLY),
    onChanged: (cb: (status: UpdaterStatus) => void) => {
      const fn = (_: unknown, status: UpdaterStatus) => cb(status)
      ipcRenderer.on(IPC.UPDATER_STATUS_CHANGED, fn)
      return () => ipcRenderer.off(IPC.UPDATER_STATUS_CHANGED, fn)
    },
  },
  diag: {
    getState: () => invoke<DiagnosticsState>(IPC.DIAG_GET_STATE),
    testBroadcast: () => invoke<{ sent: boolean }>(IPC.DIAG_TEST_BROADCAST),
  },
}

export type SnipotterAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('snipotter', api)
  } catch (err) {
    console.error('[preload] contextBridge failed', err)
  }
} else {
  // Fallback for environments without context isolation (dev only).
  ;(globalThis as unknown as { snipotter: SnipotterAPI }).snipotter = api
}
