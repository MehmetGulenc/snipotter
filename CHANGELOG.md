# Changelog

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
