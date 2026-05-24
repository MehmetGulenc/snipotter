/**
 * Snipotter — Main process entry
 * Wires the clipboard monitor, AI service, Supabase service, IPC, hotkeys, tray, and windows.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ClipboardMonitor } from './clipboard'
import { AIService } from './ai'
import { SupabaseService } from './supabase'
import { settingsStore } from './store'
import {
  createMainWindow,
  getMainWindow,
  focusOrCreateMainWindow,
  toggleQuickNoteWindow,
  toggleQuickPasteWindow,
  hideQuickPasteWindow,
  pasteAtCursor,
  createClipDetailWindow,
  showClipDetail,
  hideClipDetail,
} from './windows'
import { createTray, refreshMenu } from './tray'
import { registerHotkeys, unregisterAll, setRecordingPaused, validateAccelerator } from './hotkeys'
import { UpdaterService } from './updater'
import { sendLaunchHeartbeat } from './telemetry'
import { hostname, userInfo } from 'node:os'
import {
  IPC,
  type IpcResult,
  type ClipboardItem,
  type Note,
  type AppSettings,
  type UpdaterStatus,
  type DiagnosticsState,
} from '@shared/types'

const DEVICE_NAME = (() => {
  try {
    const host = hostname() || 'Cihaz'
    const user = userInfo().username
    return user ? `${user}@${host}` : host
  } catch {
    return 'Snipotter Cihazı'
  }
})()

// Single instance lock — prevents two Snipotter instances on the same machine.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

// electron-vite exposes MAIN_VITE_* via import.meta.env (statically replaced at build time)
// and also injects them into process.env in the main process.
const env = {
  MAIN_VITE_SUPABASE_URL:
    import.meta.env.MAIN_VITE_SUPABASE_URL ?? process.env.MAIN_VITE_SUPABASE_URL,
  MAIN_VITE_SUPABASE_ANON_KEY:
    import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY ?? process.env.MAIN_VITE_SUPABASE_ANON_KEY,
  MAIN_VITE_ANTHROPIC_API_KEY:
    import.meta.env.MAIN_VITE_ANTHROPIC_API_KEY ?? process.env.MAIN_VITE_ANTHROPIC_API_KEY,
  MAIN_VITE_GEMINI_API_KEY:
    import.meta.env.MAIN_VITE_GEMINI_API_KEY ?? process.env.MAIN_VITE_GEMINI_API_KEY,
} as Record<string, string | undefined>

console.info('[snipotter] env loaded:', {
  supabase: !!env.MAIN_VITE_SUPABASE_URL,
  anthropic: !!env.MAIN_VITE_ANTHROPIC_API_KEY,
  gemini: !!env.MAIN_VITE_GEMINI_API_KEY,
})

const supabase = new SupabaseService({
  url: env.MAIN_VITE_SUPABASE_URL,
  anonKey: env.MAIN_VITE_SUPABASE_ANON_KEY,
})

const ai = new AIService({
  anthropicKey: env.MAIN_VITE_ANTHROPIC_API_KEY,
  geminiKey: env.MAIN_VITE_GEMINI_API_KEY,
  primary: settingsStore.get().aiPrimaryProvider,
})

const monitor = new ClipboardMonitor({
  redactSensitive: settingsStore.get().redactSensitive,
  fileCopyEnabled: settingsStore.get().fileCopyEnabled,
})

const updater = new UpdaterService()

// IDs of clipboard items that THIS device inserted. Used by the auto-mirror
// handler to skip self-echos.
const localInsertIds = new Set<string>()
function trackLocalInsert(id: string): void {
  localInsertIds.add(id)
  setTimeout(() => localInsertIds.delete(id), 30_000)
}

// Rolling buffer of recent mirror attempts — exposed via DIAG_GET_STATE so the
// Settings → Tanılama panel can show users why a mirror succeeded or was skipped.
const recentMirrorAttempts: DiagnosticsState['recentMirrorAttempts'] = []
function recordMirror(attempt: DiagnosticsState['recentMirrorAttempts'][number]): void {
  recentMirrorAttempts.unshift(attempt)
  if (recentMirrorAttempts.length > 10) recentMirrorAttempts.length = 10
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

async function handleClipboardChange(
  draft: Omit<ClipboardItem, 'id' | 'userId' | 'synced'>,
): Promise<void> {
  // Skip everything until the user is in a workspace. Avoids spamming AI/Supabase
  // during onboarding and prevents RLS-rejected inserts.
  if (!supabase.getWorkspaceId()) {
    return
  }

  // Dedupe by content hash: if the user re-copies a clip we already have,
  // bump the existing row to the top instead of inserting a duplicate.
  // QuickPaste and Library both sort by created_at desc, so a touch is
  // enough to re-promote it visually.
  const existing = await supabase.findClipboardByHash(draft.hash).catch(() => null)
  if (existing) {
    const refreshed = await supabase.touchClipboard(existing.id).catch(() => null)
    const item = refreshed ?? { ...existing, createdAt: new Date().toISOString() }
    broadcast(IPC.CLIP_UPDATED, item)
    // Also broadcast to other devices instantly.
    trackLocalInsert(item.id)
    supabase.broadcastClipUpsert(item)
    return
  }

  const inserted = await supabase.insertClipboard(draft).catch((e) => {
    console.warn('[clip] insert failed', e)
    return null
  })

  const item: ClipboardItem = inserted ?? {
    ...draft,
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    userId: supabase.getUser()?.id ?? 'anon',
    synced: false,
  }

  broadcast(IPC.CLIP_NEW, item)
  // Instant broadcast to other devices — don't wait for WAL replication.
  if (inserted) {
    trackLocalInsert(inserted.id)
    supabase.broadcastClipUpsert(item)
  }

  // Fire-and-forget AI enrichment
  if (settingsStore.get().aiAutoEnrich && draft.contentType !== 'image' && draft.text.length > 0) {
    void enrichAndUpdate(item)
  }
}

async function enrichAndUpdate(item: ClipboardItem): Promise<void> {
  try {
    const summary = await ai.enrich({ text: item.text, kind: 'clipboard' })
    if (!summary) return
    if (item.synced) {
      await supabase.updateClipboardAI(item.id, summary)
    }
    const enriched = { ...item, ai: summary }
    broadcast(IPC.CLIP_UPDATED, enriched)
    // Broadcast enriched item to other devices instantly.
    if (item.synced) supabase.broadcastClipUpsert(enriched)
  } catch (err) {
    console.warn('[ai] enrichment failed', err)
  }
}

function wireSupabaseEvents(): void {
  supabase.on('auth', (user) => {
    broadcast(IPC.AUTH_STATE_CHANGED, user)
  })
  supabase.on('clip:upsert', (item: ClipboardItem) => {
    broadcast(IPC.CLIP_UPDATED, item)
    // === OS Clipboard Auto-Mirror ===
    // If the user opted in, write the remote payload onto this device's
    // OS clipboard so Cmd/Ctrl+V immediately pastes the latest item from
    // any paired device. Sensitive items are NEVER mirrored (security).
    // Loop prevention: monitor.copy() refreshes lastHash so the polling
    // tick won't re-broadcast our own write back to the source.
    const settings = settingsStore.get()
    const snippet = item.text.slice(0, 60)
    if (!settings.autoMirrorClipboard) {
      console.log('[mirror] skipped: autoMirrorClipboard is disabled on this device')
      recordMirror({ timestamp: Date.now(), itemId: item.id, result: 'skipped-disabled', contentSnippet: snippet })
      return
    }
    const isSensitive = item.ai?.tags?.includes('sensitive') === true
    if (isSensitive) {
      console.log('[mirror] skipped: item marked sensitive')
      recordMirror({ timestamp: Date.now(), itemId: item.id, result: 'skipped-sensitive', contentSnippet: snippet })
      return
    }
    if (localInsertIds.has(item.id)) {
      console.log('[mirror] skipped: inserted by this device')
      recordMirror({ timestamp: Date.now(), itemId: item.id, result: 'skipped-local-insert', contentSnippet: snippet })
      return
    }
    void monitor.copy({
      contentType: item.contentType,
      text: item.text,
      html: item.html ?? null,
    }).then(() => {
      console.log('[mirror] OS clipboard updated successfully')
      recordMirror({ timestamp: Date.now(), itemId: item.id, result: 'mirrored', contentSnippet: snippet })
    }).catch((err: unknown) => {
      console.warn('[mirror] failed to write to OS clipboard', err)
      recordMirror({ timestamp: Date.now(), itemId: item.id, result: 'error', contentSnippet: snippet, error: (err as Error).message })
    })
  })
  supabase.on('clip:deleted', (id: string) => {
    broadcast(IPC.CLIP_UPDATED, { id, deleted: true })
  })
  supabase.on('note:upsert', (note: Note) => {
    broadcast(IPC.NOTE_UPDATED, note)
  })
  supabase.on('note:deleted', (id: string) => {
    broadcast(IPC.NOTE_UPDATED, { id, deleted: true })
  })
}

function wireIPC(): void {
  // ===== Auth (anonymous; pairing handled separately) =====
  ipcMain.handle(IPC.AUTH_GET_STATE, async () => {
    return { ok: true, data: supabase.getUser() }
  })
  ipcMain.handle(IPC.AUTH_SIGN_OUT, async () => {
    await supabase.signOut()
    return { ok: true, data: null }
  })

  // ===== Workspace / Pairing =====
  ipcMain.handle(IPC.WORKSPACE_GET, async () => {
    return { ok: true, data: supabase.getWorkspace() }
  })
  ipcMain.handle(IPC.WORKSPACE_CREATE, async () => {
    try {
      const ws = await supabase.ensureWorkspace(DEVICE_NAME)
      if (ws) broadcast(IPC.WORKSPACE_CHANGED, ws)
      return { ok: true, data: ws }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.WORKSPACE_LEAVE, async () => {
    await supabase.leaveWorkspace()
    broadcast(IPC.WORKSPACE_CHANGED, null)
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.WORKSPACE_LIST_MEMBERS, async () => {
    try {
      const members = await supabase.listMembers()
      return { ok: true, data: members }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.WORKSPACE_REMOVE_MEMBER, async (_e, userId: string) => {
    try {
      await supabase.removeWorkspaceMember(userId)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.PAIR_CREATE, async () => {
    try {
      const code = await supabase.createPairCode()
      return { ok: true, data: code }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.PAIR_REDEEM, async (_e, code: string) => {
    try {
      const ws = await supabase.redeemPairCode(code, DEVICE_NAME)
      if (ws) broadcast(IPC.WORKSPACE_CHANGED, ws)
      return { ok: true, data: ws }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ===== Clipboard =====
  ipcMain.handle(IPC.CLIP_LIST, async () => {
    try {
      const items = await supabase.listClipboard()
      return { ok: true, data: items }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.CLIP_DELETE, async (_e, id: string) => {
    supabase.broadcastClipDeleted(id)
    try {
      await supabase.deleteClipboard(id)
      return { ok: true, data: null }
    } catch (err) {
      console.error('[ipc] CLIP_DELETE failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.CLIP_DELETE_MANY, async (_e, ids: string[]) => {
    supabase.broadcastClipDeletedMany(ids)
    try {
      await supabase.deleteClipboardMany(ids)
      return { ok: true, data: null }
    } catch (err) {
      console.error('[ipc] CLIP_DELETE_MANY failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.CLIP_DELETE_ALL, async () => {
    try {
      await supabase.deleteAllClipboard()
      return { ok: true, data: null }
    } catch (err) {
      console.error('[ipc] CLIP_DELETE_ALL failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.CLIP_PIN, async (_e, { id, pinned }: { id: string; pinned: boolean }) => {
    await supabase.setClipboardPinned(id, pinned)
    // After DB update, broadcast the new state so other devices see pin toggle instantly.
    const list = await supabase.listClipboard(500).catch(() => [])
    const updated = list.find((c) => c.id === id)
    if (updated) supabase.broadcastClipUpsert(updated)
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.CLIP_COPY, async (_e, item: ClipboardItem) => {
    await monitor.copy(item)
    // Touch the item so it rises to the top of created_at desc ordering.
    // Mirrors the dedup logic in handleClipboardChange for OS-level re-copies.
    const refreshed = await supabase.touchClipboard(item.id).catch(() => null)
    const updated = refreshed ?? { ...item, createdAt: new Date().toISOString() }
    broadcast(IPC.CLIP_UPDATED, updated)
    trackLocalInsert(item.id)
    supabase.broadcastClipUpsert(updated)
    return { ok: true, data: null }
  })
  ipcMain.handle(
    IPC.CLIP_PROMOTE_TO_NOTE,
    async (_e, item: ClipboardItem): Promise<IpcResult<Note | null>> => {
      const note = await supabase.createNote({
        title: null,
        content: item.text,
        fromClipboardId: item.id,
        ai: item.ai ?? null,
      })
      if (note) {
        supabase.broadcastNoteUpsert(note)
        // Best-effort: re-enrich with note context if no AI yet
        if (!note.ai && settingsStore.get().aiAutoEnrich) {
          void (async () => {
            const summary = await ai.enrich({ text: note.content, kind: 'note' })
            if (summary) {
              const updated = await supabase.updateNote(note.id, { ai: summary })
              if (updated) {
                supabase.broadcastNoteUpsert(updated)
                broadcast(IPC.NOTE_UPDATED, updated)
              }
            }
          })()
        }
      }
      return { ok: true, data: note }
    },
  )

  // ===== Notes =====
  ipcMain.handle(IPC.NOTE_LIST, async () => {
    try {
      const notes = await supabase.listNotes()
      return { ok: true, data: notes }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.NOTE_CREATE, async (_e, partial: Partial<Note>) => {
    const note = await supabase.createNote(partial)
    if (note) {
      supabase.broadcastNoteUpsert(note)
      if (!note.ai && settingsStore.get().aiAutoEnrich && note.content.length > 8) {
        void (async () => {
          const summary = await ai.enrich({ text: note.content, kind: 'note' })
          if (summary) {
            const updated = await supabase.updateNote(note.id, { ai: summary })
            if (updated) {
              supabase.broadcastNoteUpsert(updated)
              broadcast(IPC.NOTE_UPDATED, updated)
            }
          }
        })()
      }
    }
    return { ok: true, data: note }
  })
  ipcMain.handle(IPC.NOTE_UPDATE, async (_e, { id, partial }: { id: string; partial: Partial<Note> }) => {
    const note = await supabase.updateNote(id, partial)
    if (note) supabase.broadcastNoteUpsert(note)
    return { ok: true, data: note }
  })
  ipcMain.handle(IPC.NOTE_DELETE, async (_e, id: string) => {
    // Broadcast first for instant feedback on other devices.
    supabase.broadcastNoteDeleted(id)
    try {
      await supabase.deleteNote(id)
      return { ok: true, data: null }
    } catch (err) {
      // DB delete failed (e.g. RLS blocked) — tell renderer to revert the
      // optimistic remove so the note comes back immediately rather than
      // after the next 15s reconciliation cycle.
      console.error('[ipc] NOTE_DELETE failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.NOTE_DELETE_MANY, async (_e, ids: string[]) => {
    supabase.broadcastNoteDeletedMany(ids)
    try {
      await supabase.deleteNotesMany(ids)
      return { ok: true, data: null }
    } catch (err) {
      console.error('[ipc] NOTE_DELETE_MANY failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.NOTE_PIN, async (_e, { id, pinned }: { id: string; pinned: boolean }) => {
    const note = await supabase.updateNote(id, { pinned })
    if (note) supabase.broadcastNoteUpsert(note)
    return { ok: true, data: note }
  })

  // ===== Export =====
  ipcMain.handle(
    IPC.NOTE_EXPORT_MD,
    async (_e, { filename, content }: { filename: string; content: string }) => {
      const win = getMainWindow()
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: filename,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (canceled || !filePath) return { ok: true, data: null }
      await writeFile(filePath, content, 'utf-8')
      shell.showItemInFolder(filePath)
      return { ok: true, data: filePath }
    },
  )

  ipcMain.handle(
    IPC.NOTE_EXPORT_PDF,
    async (_e, { filename, html }: { filename: string; html: string }) => {
      const win = getMainWindow()
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: filename,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (canceled || !filePath) return { ok: true, data: null }

      const pdfWin = new BrowserWindow({ show: false, width: 800, height: 1000 })
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, system-ui, sans-serif; font-size: 14px; line-height: 1.7; color: #1a1a1a; padding: 48px 64px; max-width: 800px; }
  h1 { font-size: 28px; font-weight: 700; margin: 0 0 8px; } h2 { font-size: 22px; font-weight: 600; margin: 24px 0 6px; } h3 { font-size: 18px; font-weight: 600; margin: 20px 0 4px; }
  p { margin: 0 0 10px; } ul, ol { padding-left: 24px; margin: 0 0 10px; } li { margin: 4px 0; }
  input[type=checkbox] { margin-right: 6px; }
  blockquote { border-left: 3px solid #7c3aed; padding-left: 16px; color: #555; margin: 12px 0; font-style: italic; }
  code { background: #f0f0f0; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 12px; }
  pre { background: #f0f0f0; padding: 16px; border-radius: 6px; overflow-x: auto; } pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
  strong { font-weight: 600; } em { font-style: italic; } s { text-decoration: line-through; color: #888; }
</style></head><body>${html}</body></html>`
      await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)
      const pdfBuffer = await pdfWin.webContents.printToPDF({ printBackground: true })
      pdfWin.destroy()
      await writeFile(filePath, pdfBuffer)
      shell.showItemInFolder(filePath)
      return { ok: true, data: filePath }
    },
  )

  // ===== Settings =====
  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    return { ok: true, data: settingsStore.get() }
  })
  ipcMain.handle(IPC.SETTINGS_UPDATE, async (_e, partial: Partial<AppSettings>) => {
    const next = settingsStore.set(partial)
    monitor.setRedactSensitive(next.redactSensitive)
    monitor.setFileCopyEnabled(next.fileCopyEnabled)
    if (next.clipboardEnabled) monitor.start()
    else monitor.stop()
    registerHotkeys()
    refreshMenu(monitor, updater)
    broadcast(IPC.SETTINGS_CHANGED, next)
    return { ok: true, data: next }
  })

  // ===== Window / quick-note / quick-paste =====
  ipcMain.handle(IPC.WIN_TOGGLE_QUICK_NOTE, async () => {
    toggleQuickNoteWindow()
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.WIN_TOGGLE_QUICK_PASTE, async () => {
    toggleQuickPasteWindow()
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.WIN_HIDE_QUICK_PASTE, async () => {
    hideQuickPasteWindow()
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.WIN_PASTE_AT_CURSOR, async () => {
    await pasteAtCursor()
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.WIN_CLIP_DETAIL_SHOW, (_e, item: ClipboardItem) => {
    showClipDetail(item)
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.WIN_CLIP_DETAIL_HIDE, () => {
    hideClipDetail()
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.WIN_MINIMIZE, async () => {
    getMainWindow()?.minimize()
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.WIN_CLOSE, async () => {
    getMainWindow()?.hide()
    return { ok: true, data: null }
  })

  // ===== AI =====
  ipcMain.handle(IPC.AI_STATUS, async () => {
    return { ok: true, data: ai.status() }
  })
  ipcMain.handle(IPC.AI_REENRICH, async (_e, { kind, id, text }: { kind: 'clipboard' | 'note'; id: string; text: string }) => {
    const summary = await ai.enrich({ text, kind })
    if (!summary) return { ok: false, error: 'AI unavailable' }
    if (kind === 'clipboard') {
      await supabase.updateClipboardAI(id, summary)
    } else {
      const updated = await supabase.updateNote(id, { ai: summary })
      if (updated) broadcast(IPC.NOTE_UPDATED, updated)
    }
    return { ok: true, data: summary }
  })

  // ===== Hotkey recorder support =====
  ipcMain.handle(IPC.HOTKEY_RECORD_START, async () => {
    setRecordingPaused(true)
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.HOTKEY_RECORD_END, async () => {
    setRecordingPaused(false)
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.HOTKEY_VALIDATE, async (_e, accel: string) => {
    return { ok: true, data: validateAccelerator(accel) }
  })

  // ===== Auto-updater =====
  ipcMain.handle(IPC.UPDATER_GET_STATUS, async () => {
    return { ok: true, data: updater.getStatus() }
  })
  ipcMain.handle(IPC.UPDATER_CHECK_NOW, async () => {
    const status = await updater.checkNow()
    return { ok: true, data: status }
  })
  ipcMain.handle(IPC.UPDATER_DOWNLOAD_NOW, async () => {
    const status = await updater.downloadNow()
    return { ok: true, data: status }
  })
  ipcMain.handle(IPC.UPDATER_INSTALL_AND_RESTART, async () => {
    try {
      updater.installAndRestart()
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.UPDATER_OPEN_RELEASE_PAGE, async () => {
    updater.openReleasePage()
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.UPDATER_IS_MANUAL_ONLY, async () => {
    return { ok: true, data: updater.isManualInstallOnly() }
  })
  updater.on('changed', (status: UpdaterStatus) => {
    broadcast(IPC.UPDATER_STATUS_CHANGED, status)
    refreshMenu(monitor, updater)
  })

  // ===== Diagnostics =====
  ipcMain.handle(IPC.DIAG_GET_STATE, async (): Promise<IpcResult<DiagnosticsState>> => {
    const snap = supabase.getDiagnosticsSnapshot()
    return {
      ok: true,
      data: {
        ...snap,
        recentMirrorAttempts: [...recentMirrorAttempts],
        localInsertIdsCount: localInsertIds.size,
        autoMirrorEnabled: settingsStore.get().autoMirrorClipboard,
      },
    }
  })
  ipcMain.handle(IPC.DIAG_TEST_BROADCAST, async (): Promise<IpcResult<{ sent: boolean }>> => {
    // Inserts a synthetic test row + broadcasts it. The other paired device
    // should receive it and (if autoMirrorClipboard is on) write the marker
    // text to its OS clipboard. Useful for end-to-end verification.
    const wsId = supabase.getWorkspaceId()
    if (!wsId) return { ok: false, error: 'Henüz bir çalışma alanı yok' }
    const marker = `[snipotter-test ${new Date().toISOString()}]`
    const draft: Omit<ClipboardItem, 'id' | 'userId' | 'synced'> = {
      contentType: 'text',
      text: marker,
      hash: `test-${Date.now()}`,
      html: null,
      sourceApp: null,
      pinned: false,
      ai: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const inserted = await supabase.insertClipboard(draft).catch(() => null)
    if (!inserted) return { ok: false, error: 'Test mesajı eklenemedi (RLS / ağ?)' }
    trackLocalInsert(inserted.id)
    supabase.broadcastClipUpsert(inserted)
    return { ok: true, data: { sent: true } }
  })
}

async function bootstrapAuth(): Promise<void> {
  if (!supabase.isConfigured()) {
    console.warn('[snipotter] Supabase not configured — sync disabled')
    return
  }
  try {
    await supabase.ensureAnonymousSession()
    const ws = await supabase.fetchCurrentWorkspace()
    if (ws) {
      broadcast(IPC.WORKSPACE_CHANGED, ws)
      console.info('[snipotter] workspace ready', ws.id)
    } else {
      console.info('[snipotter] anonymous user has no workspace yet (onboarding required)')
    }
  } catch (err) {
    console.warn('[snipotter] bootstrap auth failed', (err as Error).message)
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.snipotter.app')

  // Menubar mode on macOS - hide dock icon
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Wire everything
  wireSupabaseEvents()
  wireIPC()
  monitor.on('change', handleClipboardChange)
  monitor.on('error', (err) => console.warn('[clip] monitor error', err))

  if (settingsStore.get().clipboardEnabled) monitor.start()

  await bootstrapAuth()

  createMainWindow()
  createClipDetailWindow()
  createTray(monitor, updater)
  registerHotkeys()
  updater.start()

  // Anonymous launch heartbeat → admin.snipotter.com sees us as one
  // active install in DAU/WAU/MAU. Settings.telemetryEnabled gates the
  // whole call, default ON, payload is genuinely anonymous (random
  // device UUID, OS+arch, version, locale). Fire-and-forget — failures
  // never block startup.
  void sendLaunchHeartbeat()

  // Re-check for updates whenever the user brings the app back to foreground
  // (focus or activate). Throttled to once per 15 minutes inside checkOnFocus
  // so we don't hammer GitHub. Catches new releases between the hourly periodic
  // checks — important right after a release ships.
  app.on('browser-window-focus', () => updater.checkOnFocus())
  app.on('activate', () => updater.checkOnFocus())

  // Open external links in user's default browser
  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http')) {
        shell.openExternal(url)
        return { action: 'deny' }
      }
      return { action: 'allow' }
    })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    else focusOrCreateMainWindow()
  })

  if (is.dev) {
    console.info('[snipotter] running in dev mode')
  }
})

app.on('second-instance', () => {
  focusOrCreateMainWindow()
})

app.on('window-all-closed', () => {
  // Stay alive on macOS unless user explicitly quits — typical menubar app behavior.
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  unregisterAll()
  monitor.stop()
})
