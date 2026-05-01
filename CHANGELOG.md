# Changelog

## [0.3.3] - 2025-05-01

### 🔔 Update Notification Banner
- Non-intrusive banner at the top of the app shows when a new version is available, downloading, or ready to install.
- **Available**: amber bar with version number — download starts automatically in background.
- **Downloading**: progress bar with percentage.
- **Ready**: green bar with "Yeniden Başlat" button — one click to install.
- Dismissible per session; reappears when a newer update is detected.

### 📝 Note Titles (Web)
- Web app now shows a title input above the content editor.
- Auto-saves with 400ms debounce — no save button needed.
- Note list shows title (or first line of content as fallback).
- Syncs in real-time with desktop app titles.

### 🐛 Bug Fixes (from v0.3.2.x patches)
- **Ghost notes**: `deleteNote` now uses `count: 'exact'` to detect silent RLS failures; falls back to workspace-member RPC for notes created in previous anonymous sessions.
- **Windows tray icon**: `tray-icon.png/.ico` now included in `extraResources` for packaged builds; Windows uses `.ico` for native rendering quality.
- **autoMirrorClipboard**: Added diagnostic logs to pinpoint why mirror is skipped; setting description updated to note it must be enabled on each device separately.
- **userId fix**: `clipboardFromRow` / `noteFromRow` now correctly maps `created_by` to `userId` instead of `workspace_id`.

## [0.3.2] - 2025-05-01

### 🔄 OS Clipboard Auto-Mirror (Opt-in)

The headline feature: when enabled in Settings, items copied on **any** paired device are written directly to *this* device's OS clipboard. Hit `Cmd/Ctrl+V` and paste — no need to find the item in the library first.

- **Setting**: `Cihazlar arası otomatik panoya yaz` (Settings → Pano)
- **Default**: OFF — opt-in only. Auto-mirror replaces the user's local clipboard whenever a remote copy arrives, so we never enable it without consent.
- **Security**: Items flagged as sensitive (passwords, JWTs, API keys, IBANs, phone numbers, emails) are *never* mirrored regardless of the setting.
- **Loop prevention**: `clipboard.copy()` now refreshes the polling watermark for every content type (text/image/rich-text), so writes from the mirror don't get re-broadcast back to the source device.

### ⚡ Faster Source Detection
- Clipboard polling: 200ms → **100ms** (avg detection latency 50ms; CPU cost negligible).

### 🛡️ Reliability — Eventual Consistency
A backgrounded tray-app or a sleeping laptop missing broadcasts no longer means a stale list. Both desktop and web clients now:

- **High-water cursor** (`lastClipEventAt` / `lastNoteEventAt`) updated on every realtime event.
- **Replay on reconnect**: when a channel transitions to `SUBSCRIBED`, fetch all rows newer than the cursor and emit them through the normal upsert pipeline. Idempotent — safe even if no events were missed.
- **Single debounced reconnect**: when multiple channels fail at once (typical network blip), we fire one reconnect attempt instead of N parallel ones.
- **Heartbeat**: 25s no-op broadcast keeps the WebSocket alive past Supabase's 60s idle timeout and macOS power-save schedules.

### 🔧 Internal
- `connection:state` events emitted from the desktop Supabase service for future UI indicators.
- Auto-mirror migration in settings store: existing users upgrading from <0.3.2 default to OFF.

---

## [0.3.1] - 2025-05-01

### ⚡ Instant Sync (Telegram-like)

The flagship change: **sub-50ms cross-device synchronization**. Actions now propagate to every paired device almost instantly, even if the other app is minimized, in the background, or the screen is locked.

#### Architecture
- **Hybrid sync layer** — every CRUD operation now fires on two parallel channels:
  - **Broadcast channel** (`sync-<workspace>`): direct WebSocket pub/sub, no database round-trip. Typical latency: **10–50ms**.
  - **postgres_changes** (existing): durable backstop via WAL replication. Catches anything the broadcast missed.
- **Eventual consistency**: broadcasts are fire-and-forget; the DB write is the source of truth. Both handlers are idempotent so duplicate delivery is safe.

#### Covered operations
Electron desktop **and** web app both emit and listen for:
- `clip:upsert` — new clipboard item, re-copy (touch), pin toggle, AI enrichment
- `clip:deleted` — single and bulk delete
- `note:upsert` — create, update, pin, AI enrichment
- `note:deleted` — single and bulk delete

#### Supporting changes
- Supabase Realtime `eventsPerSecond` raised from default 10 → 100 on both desktop and web clients (no more socket-level throttling on bulk operations or rapid typing).
- `self: false` on broadcast config + per-process `clientId` tag means devices never process echoes of their own broadcasts.
- Removed `document.visibilityState === 'visible'` guard on the reconciliation interval on both clients — when a tab/window is hidden we still catch up in the background. Interval relaxed from 10s → 15s since broadcasts cover the hot path.
- Auto-retry on broadcast channel errors (2s backoff) matching the existing postgres_changes retry.

### Result
Delete a note on your Mac → it's gone from your Windows app and browser tab within ~30ms, whether or not those windows are in focus. Copy something on Windows → it appears in Mac's QuickPaste instantly.

---

## [0.3.0] - 2025-05-01

### ✨ New Features

#### Instant Real-time Sync (Priority)
- Clipboard polling interval reduced from 700ms to 200ms (3.5x faster detection)
- Optimized Supabase realtime channels with broadcast acknowledgment
- Auto-retry on connection errors for reliable sync across devices
- Changes propagate to all paired devices almost instantly

#### macOS Menubar Mode (Like Maccy)
- App now runs exclusively in the menubar (top panel)
- Dock icon is hidden (`LSUIElement: true`)
- Clean, native macOS menubar experience
- Click menubar icon to open library window

#### Windows System Tray Optimization
- Fixed tray icon visibility issue (now uses proper 16x16 sizing)
- App runs only in system tray (hidden from taskbar)
- Close button minimizes to tray instead of quitting
- Click tray icon to restore window

#### Multi-Select Bulk Deletion
- New checkbox selection system for both Clipboard and Notes
- "Select All" button to quickly select all visible items
- "Delete Selected" button for bulk operations
- Optimistic UI: items disappear immediately, then deleted from backend
- Shows count of selected items

### 🐛 Bug Fixes

#### Browser Notes Reliability
- Fixed flickering when deleting notes via realtime sync
- Fixed "saving..." text appearing incorrectly
- Proper handling of `deleted` flag in store updates
- Notes now sync instantly without visual glitches

### 🔧 Improvements
- Improved clipboard change detection responsiveness
- Better realtime channel error handling with automatic reconnection
- Enhanced UI feedback during bulk operations

---

## [0.2.10] - Previous

- Windows Store packaging configuration
- Smart download button with OS detection
- Privacy policy page
- Icon generation script for Store assets

---

## [0.4.0] - Coming Soon

### Planned Features
- **Note Titles**: Add title field to notes in browser and desktop apps
- **AI Summarization**: Summarize notes with AI and save as new note
- **Database Encryption**: Encrypt note content at rest, decrypt on read
- **File Support**: Import txt, md, and Excel files to clipboard
- **Browser Clipboard Capture**: Research browser extension for web app

Stay tuned! 🚀
