/**
 * Snipotter — Shared types between main process, preload bridge, and renderer.
 */

export type ItemKind = 'clipboard' | 'note'

/** Clipboard payload variants we currently support. */
export type ClipboardContentType = 'text' | 'image' | 'file' | 'rich-text'

export interface NoteVersion {
  id: string
  kind: 'auto' | 'manual' | 'restore'
  createdAt: string
  /** Tiptap JSON at that moment. */
  content: string
}

export interface TrashedNote {
  id: string
  title: string | null
  content: string
  deletedAt: string
}

/** Server side of a note for Yjs sync: snapshot (base64) + updates after it. */
export interface NoteSyncState {
  ydoc: string | null
  seq: number
  content: string
  contentSha: string | null
  updates: Array<{ id: number; update: string }>
}

export interface SnipotterUser {
  id: string
  email: string | null
  displayName?: string | null
  avatarUrl?: string | null
  /** True for Supabase anonymous auth users. */
  isAnonymous?: boolean
}

export interface Workspace {
  id: string
  name: string
  createdAt: string
  /** Convenience flag: is the current user the owner? */
  isOwner: boolean
}

export interface WorkspaceMember {
  userId: string
  role: 'owner' | 'member'
  deviceName: string | null
  joinedAt: string
  /** True if this row represents the current device. */
  isSelf: boolean
}

export interface PairCode {
  code: string
  expiresAt: string
}

export interface AISummary {
  /** Short AI-generated summary, ≤140 chars. */
  summary: string
  /** Up to 5 lowercase tags. */
  tags: string[]
  /** AI-detected language (ISO 639-1). */
  language?: string
  /** Provider used for this enrichment. */
  provider: 'claude-haiku' | 'gemini-flash' | 'none'
  /** Token usage if available. */
  tokensIn?: number
  tokensOut?: number
}

export interface ClipboardItem {
  id: string
  userId: string
  contentType: ClipboardContentType
  /** Plain-text representation (always populated, used for search). */
  text: string
  /** Hash for deduplication. */
  hash: string
  /** Original raw HTML for rich-text. */
  html?: string | null
  /** Source app bundle identifier or process name. */
  sourceApp?: string | null
  /** Set when the user pins the entry; pinned items survive purge. */
  pinned: boolean
  /** AI metadata, if processed. */
  ai?: AISummary | null
  createdAt: string
  updatedAt: string
  /** Synced via realtime; can be set false if local-only. */
  synced: boolean
}

export interface Note {
  id: string
  userId: string
  workspaceId?: string
  /** Optional title (first line if empty). */
  title: string | null
  content: string
  pinned: boolean
  /** Source clipboard id if note was promoted from clipboard. */
  fromClipboardId?: string | null
  ai?: AISummary | null
  createdAt: string
  updatedAt: string
  synced: boolean
  /** Notebook (folder); null = not filed. */
  notebookId?: string | null
}

export interface Notebook {
  id: string
  workspaceId: string
  parentId: string | null
  name: string
  icon: string | null
  sort: number
}

export interface AppSettings {
  theme: 'system' | 'light' | 'dark'
  clipboardEnabled: boolean
  clipboardHistoryLimit: number
  /** Hotkey to focus / open the main library window. */
  globalHotkey: string
  /** Hotkey to toggle the quick-note overlay. */
  quickNoteHotkey: string
  /** Hotkey to open the Maccy-style quick-paste popup (recent clips with search). */
  quickPasteHotkey: string
  /** Auto-enrich items with AI metadata. */
  aiAutoEnrich: boolean
  /** Preferred AI provider; will fall back to the other on failure. */
  aiPrimaryProvider: 'claude-haiku' | 'gemini-flash'
  /** Run on system startup. */
  launchAtLogin: boolean
  /** Mask sensitive content (passwords, tokens) before AI processing. */
  redactSensitive: boolean
  /**
   * When enabled, items copied on any paired device are automatically written
   * to this device's OS clipboard, so Cmd/Ctrl+V immediately pastes the most
   * recent item from anywhere. Sensitive items (detected by redactSensitive
   * patterns) are *never* mirrored regardless of this setting.
   * Opt-in for safety: defaults to false because auto-mirror replaces the
   * user's current local clipboard whenever a remote copy arrives.
   */
  autoMirrorClipboard: boolean
  /**
   * When enabled, files copied in Finder / Explorer (< 5 MB) are captured
   * in the clipboard history and can be pasted back from the QuickPaste popup.
   * macOS only for now. Defaults to false because file copies are rare and
   * the feature requires Accessibility / Automation permissions.
   */
  fileCopyEnabled: boolean
  /**
   * When enabled, the app pings api.snipotter.com/heartbeat once per
   * launch with a fully anonymous payload (random device UUID stored
   * locally, OS+arch, app version). The data is used only to count
   * active installs and DAU/WAU/MAU on admin.snipotter.com — no email,
   * IP, account, or content. Default ON; toggle off to opt out fully.
   */
  telemetryEnabled: boolean
  /**
   * When a record from another paired device arrives (≤ 2 minutes old) and
   * contains a one-time code, write just the code to the OS clipboard and
   * show a "Kod panoda: 482913" notification. Records inserted by this device
   * are never auto-copied. Default ON; toggle off in Settings.
   */
  otpAutoCopy: boolean
  /**
   * When enabled, links the user copies on this device have tracking
   * parameters (utm_*, fbclid, gclid, igsh, si …) stripped and the cleaned
   * text is written back to the OS clipboard. Opt-in; defaults to false.
   */
  autoCleanCopiedLinks: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  clipboardEnabled: true,
  clipboardHistoryLimit: 500,
  globalHotkey: 'CommandOrControl+Shift+L',
  quickNoteHotkey: 'CommandOrControl+Shift+N',
  quickPasteHotkey: 'CommandOrControl+Shift+V',
  aiAutoEnrich: true,
  aiPrimaryProvider: 'claude-haiku',
  launchAtLogin: false,
  redactSensitive: true,
  autoMirrorClipboard: false,
  fileCopyEnabled: true,
  telemetryEnabled: true,
  otpAutoCopy: true,
  autoCleanCopiedLinks: false,
}

export interface AuthState {
  user: SnipotterUser | null
  isLoading: boolean
}

/** IPC channel names used between main and renderer. Centralized to prevent typos. */
export const IPC = {
  // Auth (anonymous; email login removed in favor of pairing codes)
  AUTH_GET_STATE: 'auth:get-state',
  AUTH_SIGN_OUT: 'auth:sign-out',
  AUTH_STATE_CHANGED: 'auth:state-changed',

  // Workspace / Pairing
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_CREATE: 'workspace:create', // bootstraps anon user + workspace
  WORKSPACE_LEAVE: 'workspace:leave',
  WORKSPACE_LIST_MEMBERS: 'workspace:list-members',
  WORKSPACE_REMOVE_MEMBER: 'workspace:remove-member',
  WORKSPACE_CHANGED: 'workspace:changed',
  PAIR_CREATE: 'pair:create',
  PAIR_REDEEM: 'pair:redeem',

  // Clipboard
  CLIP_LIST: 'clip:list',
  CLIP_DELETE: 'clip:delete',
  CLIP_DELETE_MANY: 'clip:delete-many',
  CLIP_DELETE_ALL: 'clip:delete-all',
  CLIP_PIN: 'clip:pin',
  CLIP_COPY: 'clip:copy',
  CLIP_PROMOTE_TO_NOTE: 'clip:promote-to-note',
  CLIP_NEW: 'clip:new', // pushed from main
  CLIP_UPDATED: 'clip:updated', // pushed from main
  /** Write arbitrary text (+ optional HTML) to the OS clipboard without recording a new item. */
  CLIP_WRITE_TEXT: 'clip:write-text',

  // Action bridge (desktop → phone)
  ACTION_SEND_TO_PHONE: 'action:send-to-phone',

  // Notes
  NOTE_LIST: 'note:list',
  NOTE_CREATE: 'note:create',
  NOTE_UPDATE: 'note:update',
  NOTE_DELETE: 'note:delete',
  NOTE_DELETE_MANY: 'note:delete-many',
  NOTE_PIN: 'note:pin',
  NOTE_UPDATED: 'note:updated', // pushed from main
  NOTE_EXPORT_MD: 'note:export-md',
  NOTE_EXPORT_PDF: 'note:export-pdf',
  // Yjs note sync (renderer ⇄ main)
  NOTE_Y_LOAD: 'note-y:load',
  NOTE_Y_AFTER: 'note-y:after',
  NOTE_Y_PUSH: 'note-y:push',
  NOTE_Y_CONTENT: 'note-y:content',
  NOTE_Y_COMPACT: 'note-y:compact',
  NOTE_Y_VERSION: 'note-y:version',
  NOTE_Y_UPDATE: 'note-y:update', // pushed from main
  NOTE_ASSET_UPLOAD: 'note-asset:upload',
  NOTE_ASSET_URL: 'note-asset:url',
  NOTEBOOK_LIST: 'notebook:list',
  NOTEBOOK_CREATE: 'notebook:create',
  NOTEBOOK_UPDATE: 'notebook:update',
  NOTEBOOK_DELETE: 'notebook:delete',
  NOTEBOOKS_CHANGED: 'notebook:changed', // pushed from main
  NOTE_MOVE: 'note:move',
  NOTE_VERSIONS: 'note:versions',
  E2E_STATUS: 'e2e:status',
  E2E_STATUS_CHANGED: 'e2e:status-changed', // pushed from main
  E2E_PREPARE: 'e2e:prepare',
  E2E_COMMIT: 'e2e:commit',
  E2E_HAS_PLAIN: 'e2e:has-plain',
  E2E_MIGRATE: 'e2e:migrate',
  E2E_PROGRESS: 'e2e:progress', // pushed from main
  E2E_PAIR_START: 'e2e:pair-start',
  E2E_PAIR_WAIT: 'e2e:pair-wait',
  E2E_PAIR_CANCEL: 'e2e:pair-cancel',
  PAIR_REQUESTS: 'pair:requests',
  PAIR_REQUESTS_CHANGED: 'pair:requests-changed', // pushed from main
  PAIR_APPROVE: 'pair:approve',
  PAIR_DECLINE: 'pair:decline',
  E2E_JOIN: 'e2e:join',
  // Shared spaces (docs/ortak-alan-tasarimi.md)
  SPACE_STATE: 'space:state',
  SPACE_CHANGED: 'space:changed', // pushed from main
  SPACE_OPEN: 'space:open',
  SPACE_CREATE: 'space:create',
  SPACE_JOIN: 'space:join',
  SPACE_PREVIEW: 'space:preview',
  SPACE_INVITE: 'space:invite',
  SPACE_MEMBERS: 'space:members',
  SPACE_RENAME: 'space:rename',
  SPACE_SET_NAME: 'space:set-name',
  SPACE_REMOVE: 'space:remove',
  SPACE_SEND_NOTE: 'space:send-note',
  NOTE_TRASH_LIST: 'note:trash-list',
  NOTE_RESTORE: 'note:restore',
  NOTE_PURGE: 'note:purge',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_CHANGED: 'settings:changed',

  // Window controls
  WIN_MINIMIZE: 'win:minimize',
  WIN_CLOSE: 'win:close',
  WIN_TOGGLE_QUICK_NOTE: 'win:toggle-quick-note',
  WIN_TOGGLE_QUICK_PASTE: 'win:toggle-quick-paste',
  WIN_HIDE_QUICK_PASTE: 'win:hide-quick-paste',
  WIN_PASTE_AT_CURSOR: 'win:paste-at-cursor',
  WIN_CLIP_DETAIL_SHOW: 'win:clip-detail-show',
  WIN_CLIP_DETAIL_HIDE: 'win:clip-detail-hide',
  CLIP_DETAIL_ITEM: 'clip:detail-item',

  // AI
  AI_REENRICH: 'ai:reenrich',
  AI_STATUS: 'ai:status',

  // Hotkey recording (so global shortcuts don't intercept the recorder UI)
  HOTKEY_RECORD_START: 'hotkey:record-start',
  HOTKEY_RECORD_END: 'hotkey:record-end',
  HOTKEY_VALIDATE: 'hotkey:validate',

  // Auto-updater
  UPDATER_GET_STATUS: 'updater:get-status',
  UPDATER_CHECK_NOW: 'updater:check-now',
  UPDATER_DOWNLOAD_NOW: 'updater:download-now',
  UPDATER_INSTALL_AND_RESTART: 'updater:install-and-restart',
  UPDATER_STATUS_CHANGED: 'updater:status-changed',
  UPDATER_OPEN_RELEASE_PAGE: 'updater:open-release-page',
  UPDATER_IS_MANUAL_ONLY: 'updater:is-manual-only',

  // Diagnostics — for debugging cross-device sync / mirror issues
  DIAG_GET_STATE: 'diag:get-state',
  DIAG_TEST_BROADCAST: 'diag:test-broadcast',
} as const

/** Live diagnostics state exposed to the renderer for the Settings → Tanılama panel. */
export interface DiagnosticsState {
  workspaceId: string | null
  userId: string | null
  clientId: string
  channels: {
    clip: ChannelStatus
    note: ChannelStatus
    broadcast: ChannelStatus
  }
  recentClipEvents: Array<{
    timestamp: number
    source: 'broadcast' | 'postgres_changes' | 'replay'
    itemId: string
    contentType: string
    snippet: string
    insertedByThisDevice: boolean
  }>
  recentMirrorAttempts: Array<{
    timestamp: number
    itemId: string
    result: 'mirrored' | 'skipped-disabled' | 'skipped-sensitive' | 'skipped-local-insert' | 'error'
    contentSnippet: string
    error?: string
  }>
  localInsertIdsCount: number
  autoMirrorEnabled: boolean
}

/** Kinds a desktop can push to the phone (device_actions.kind, minus 'text'). */
export type DeviceActionKind = 'phone' | 'address' | 'iban' | 'url' | 'text'

/** Renderer → main payload for "Telefona gönder" (inserted into device_actions). */
export interface SendToPhoneRequest {
  kind: DeviceActionKind
  /** Value the phone acts on: E.164 number, address query, IBAN, URL. ≤ 2000 chars. */
  payload: string
  /** Short human label shown in the phone notification. */
  label?: string | null
  /** Source clipboard row, when the action came from a synced clip. */
  clipId?: string | null
}

export type ChannelStatus = 'idle' | 'connecting' | 'subscribed' | 'channel_error' | 'timed_out' | 'closed'

/** Snapshot of the auto-update lifecycle exposed to the renderer. */
export type UpdaterStatus =
  | { kind: 'idle'; currentVersion: string }
  | { kind: 'checking'; currentVersion: string }
  | { kind: 'not-available'; currentVersion: string; checkedAt: number }
  | { kind: 'available'; currentVersion: string; nextVersion: string; releaseNotes?: string }
  | { kind: 'downloading'; currentVersion: string; nextVersion: string; percent: number; bytesPerSecond: number }
  | { kind: 'downloaded'; currentVersion: string; nextVersion: string }
  | { kind: 'error'; currentVersion: string; message: string }

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** Standard envelope for IPC responses to keep error handling consistent. */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }
