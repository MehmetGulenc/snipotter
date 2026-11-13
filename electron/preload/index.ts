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
  type SendToPhoneRequest,
  type NoteSyncState,
  type NoteVersion,
  type TrashedNote,
  type Notebook,
} from '../../shared/types'
import type { Space, SpaceInvite, SpaceMember } from '../../shared/crypto/spaces'

type SpaceState = { spaces: Space[]; activeId: string | null }

type E2EStatus = 'unknown' | 'unsupported' | 'plain' | 'ready' | 'needs-key'

function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, payload)
}

const api = {
  /** Build flavour. `isMas` = Mac App Store (sandboxed) build: AI enrichment,
   *  Finder file capture, auto-paste and the in-app updater are unavailable. */
  runtime: {
    isMas: process.platform === 'darwin' && process.mas === true,
  },
  auth: {
    getState: () => invoke<SnipotterUser | null>(IPC.AUTH_GET_STATE),
    // Çıkıştan sonra main yeni anonim oturum açar ve onun kullanıcısını döner.
    signOut: () => invoke<SnipotterUser | null>(IPC.AUTH_SIGN_OUT),
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
    /** Write derived text (and HTML, e.g. a cleaned table) to the OS clipboard
     *  without adding a history row. Used by Temiz kopyala and IBAN/Alıcı/Tutar. */
    writeText: (text: string, html?: string) => invoke<null>(IPC.CLIP_WRITE_TEXT, { text, html }),
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
    exportMd: (filename: string, content: string) =>
      invoke<string | null>(IPC.NOTE_EXPORT_MD, { filename, content }),
    exportPdf: (filename: string, html: string) =>
      invoke<string | null>(IPC.NOTE_EXPORT_PDF, { filename, html }),
    onUpdated: (cb: (note: Note & { deleted?: boolean }) => void) => {
      const fn = (_: unknown, note: Note & { deleted?: boolean }) => cb(note)
      ipcRenderer.on(IPC.NOTE_UPDATED, fn)
      return () => ipcRenderer.off(IPC.NOTE_UPDATED, fn)
    },
    /** Note images in Storage; returns the object path. */
    uploadAsset: (noteId: string, mime: string, data: Uint8Array) =>
      invoke<string>(IPC.NOTE_ASSET_UPLOAD, { noteId, mime, data }),
    assetUrl: (path: string) => invoke<string>(IPC.NOTE_ASSET_URL, path),
    versions: (noteId: string) => invoke<NoteVersion[]>(IPC.NOTE_VERSIONS, noteId),
    move: (noteId: string, notebookId: string | null) => invoke<Note>(IPC.NOTE_MOVE, { noteId, notebookId }),
    notebooks: {
      list: () => invoke<Notebook[]>(IPC.NOTEBOOK_LIST),
      create: (name: string, parentId: string | null) => invoke<Notebook>(IPC.NOTEBOOK_CREATE, { name, parentId }),
      update: (id: string, patch: { name?: string; parentId?: string | null; sort?: number }) =>
        invoke<Notebook>(IPC.NOTEBOOK_UPDATE, { id, ...patch }),
      remove: (id: string) => invoke<void>(IPC.NOTEBOOK_DELETE, id),
      onChanged: (cb: () => void) => {
        const fn = (): void => cb()
        ipcRenderer.on(IPC.NOTEBOOKS_CHANGED, fn)
        return () => ipcRenderer.off(IPC.NOTEBOOKS_CHANGED, fn)
      },
    },
    trash: {
      list: () => invoke<TrashedNote[]>(IPC.NOTE_TRASH_LIST),
      restore: (ids: string[]) => invoke<Note[]>(IPC.NOTE_RESTORE, ids),
      purge: (ids: string[]) => invoke<void>(IPC.NOTE_PURGE, ids),
    },
    /** Yjs note sync; see shared/notes/sync.ts. */
    y: {
      load: (noteId: string) => invoke<NoteSyncState | null>(IPC.NOTE_Y_LOAD, noteId),
      after: (noteId: string, afterId: number) =>
        invoke<Array<{ id: number; update: string }>>(IPC.NOTE_Y_AFTER, { noteId, afterId }),
      push: (noteId: string, update: string) => invoke<void>(IPC.NOTE_Y_PUSH, { noteId, update }),
      saveContent: (noteId: string, content: string, sha: string) =>
        invoke<void>(IPC.NOTE_Y_CONTENT, { noteId, content, sha }),
      compact: (noteId: string, ydoc: string, seq: number, content: string, sha: string) =>
        invoke<boolean>(IPC.NOTE_Y_COMPACT, { noteId, ydoc, seq, content, sha }),
      saveVersion: (noteId: string, content: string, kind: 'auto' | 'manual' | 'restore') =>
        invoke<void>(IPC.NOTE_Y_VERSION, { noteId, content, kind }),
      onUpdate: (cb: (payload: { noteId: string; update: string }) => void) => {
        const fn = (_: unknown, payload: { noteId: string; update: string }) => cb(payload)
        ipcRenderer.on(IPC.NOTE_Y_UPDATE, fn)
        return () => ipcRenderer.off(IPC.NOTE_Y_UPDATE, fn)
      },
    },
  },
  /** Shared spaces for notes (docs/ortak-alan-tasarimi.md). */
  spaces: {
    state: () => invoke<SpaceState>(IPC.SPACE_STATE),
    onChange: (cb: (state: SpaceState) => void) => {
      const fn = (_: unknown, state: SpaceState) => cb(state)
      ipcRenderer.on(IPC.SPACE_CHANGED, fn)
      return () => ipcRenderer.off(IPC.SPACE_CHANGED, fn)
    },
    open: (id: string | null) => invoke<SpaceState>(IPC.SPACE_OPEN, id),
    create: (name: string, myName: string) => invoke<Space>(IPC.SPACE_CREATE, { name, myName }),
    join: (input: string, myName: string) => invoke<Space>(IPC.SPACE_JOIN, { input, myName }),
    invite: (id: string) => invoke<SpaceInvite>(IPC.SPACE_INVITE, id),
    members: (id: string) => invoke<SpaceMember[]>(IPC.SPACE_MEMBERS, id),
    rename: (id: string, name: string) => invoke<void>(IPC.SPACE_RENAME, { id, name }),
    setMyName: (id: string, name: string) => invoke<void>(IPC.SPACE_SET_NAME, { id, name }),
    remove: (id: string, target: string | null) => invoke<void>(IPC.SPACE_REMOVE, { id, target }),
    sendNote: (id: string, title: string | null, content: string) => invoke<Note | null>(IPC.SPACE_SEND_NOTE, { id, title, content }),
  },
  /** End-to-end encryption (docs/sifreleme-tasarimi.md). */
  e2e: {
    status: () => invoke<E2EStatus>(IPC.E2E_STATUS),
    onStatus: (cb: (status: E2EStatus) => void) => {
      const fn = (_: unknown, status: E2EStatus) => cb(status)
      ipcRenderer.on(IPC.E2E_STATUS_CHANGED, fn)
      return () => ipcRenderer.off(IPC.E2E_STATUS_CHANGED, fn)
    },
    prepare: () => invoke<{ words: string[] }>(IPC.E2E_PREPARE),
    commit: (answers: Array<{ index: number; word: string }>) => invoke<'enabled' | 'lost-race'>(IPC.E2E_COMMIT, answers),
    hasPlainData: () => invoke<boolean>(IPC.E2E_HAS_PLAIN),
    migrate: () => invoke<void>(IPC.E2E_MIGRATE),
    onProgress: (cb: (p: { step: string; done: number }) => void) => {
      const fn = (_: unknown, p: { step: string; done: number }) => cb(p)
      ipcRenderer.on(IPC.E2E_PROGRESS, fn)
      return () => ipcRenderer.off(IPC.E2E_PROGRESS, fn)
    },
    createTransfer: () => invoke<{ words: string[]; expiresAt: number }>(IPC.E2E_TRANSFER),
    join: (words: string) => invoke<Workspace | null>(IPC.E2E_JOIN, words),
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
    showClipDetail: (item: ClipboardItem) => invoke<null>(IPC.WIN_CLIP_DETAIL_SHOW, item),
    hideClipDetail: () => invoke<null>(IPC.WIN_CLIP_DETAIL_HIDE),
    /** Renderer-side hook for the "popup re-shown" event so the QuickPaste UI
     *  can refocus the search input and reset selection without remounting. */
    onQuickPasteReopened: (cb: () => void) => {
      const fn = () => cb()
      ipcRenderer.on('quickpaste:opened', fn)
      return () => ipcRenderer.off('quickpaste:opened', fn)
    },
    /** Detail penceresinde öğe değişince tetiklenir. */
    onDetailItem: (cb: (item: ClipboardItem) => void) => {
      const fn = (_: unknown, item: ClipboardItem) => cb(item)
      ipcRenderer.on(IPC.CLIP_DETAIL_ITEM, fn)
      return () => ipcRenderer.off(IPC.CLIP_DETAIL_ITEM, fn)
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
  actions: {
    /** "Telefona gönder": queue a device_actions row for the paired iPhone. */
    sendToPhone: (req: SendToPhoneRequest) => invoke<{ id: string }>(IPC.ACTION_SEND_TO_PHONE, req),
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
