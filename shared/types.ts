/**
 * Snipotter — Shared types between main process, preload bridge, and renderer.
 */

export type ItemKind = 'clipboard' | 'note'

/** Clipboard payload variants we currently support. */
export type ClipboardContentType = 'text' | 'image' | 'file' | 'rich-text'

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
  CLIP_PIN: 'clip:pin',
  CLIP_COPY: 'clip:copy',
  CLIP_PROMOTE_TO_NOTE: 'clip:promote-to-note',
  CLIP_NEW: 'clip:new', // pushed from main
  CLIP_UPDATED: 'clip:updated', // pushed from main

  // Notes
  NOTE_LIST: 'note:list',
  NOTE_CREATE: 'note:create',
  NOTE_UPDATE: 'note:update',
  NOTE_DELETE: 'note:delete',
  NOTE_PIN: 'note:pin',
  NOTE_UPDATED: 'note:updated', // pushed from main

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
