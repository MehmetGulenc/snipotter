# Changelog

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
