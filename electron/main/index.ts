/**
 * Snipotter — Main process entry
 * Wires the clipboard monitor, AI service, Supabase service, IPC, hotkeys, tray, and windows.
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron'
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
} from './windows'
import { createTray, refreshMenu } from './tray'
import { registerHotkeys, unregisterAll, setRecordingPaused, validateAccelerator } from './hotkeys'
import { UpdaterService } from './updater'
import { hostname, userInfo } from 'node:os'
import {
  IPC,
  type IpcResult,
  type ClipboardItem,
  type Note,
  type AppSettings,
  type UpdaterStatus,
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
})

const updater = new UpdaterService()

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
    broadcast(IPC.CLIP_UPDATED, { ...item, ai: summary })
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
    await supabase.deleteClipboard(id)
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.CLIP_PIN, async (_e, { id, pinned }: { id: string; pinned: boolean }) => {
    await supabase.setClipboardPinned(id, pinned)
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.CLIP_COPY, async (_e, item: ClipboardItem) => {
    monitor.copy(item)
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
        // Best-effort: re-enrich with note context if no AI yet
        if (!note.ai && settingsStore.get().aiAutoEnrich) {
          void (async () => {
            const summary = await ai.enrich({ text: note.content, kind: 'note' })
            if (summary) {
              const updated = await supabase.updateNote(note.id, { ai: summary })
              if (updated) broadcast(IPC.NOTE_UPDATED, updated)
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
    if (note && !note.ai && settingsStore.get().aiAutoEnrich && note.content.length > 8) {
      void (async () => {
        const summary = await ai.enrich({ text: note.content, kind: 'note' })
        if (summary) {
          const updated = await supabase.updateNote(note.id, { ai: summary })
          if (updated) broadcast(IPC.NOTE_UPDATED, updated)
        }
      })()
    }
    return { ok: true, data: note }
  })
  ipcMain.handle(IPC.NOTE_UPDATE, async (_e, { id, partial }: { id: string; partial: Partial<Note> }) => {
    const note = await supabase.updateNote(id, partial)
    return { ok: true, data: note }
  })
  ipcMain.handle(IPC.NOTE_DELETE, async (_e, id: string) => {
    await supabase.deleteNote(id)
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.NOTE_PIN, async (_e, { id, pinned }: { id: string; pinned: boolean }) => {
    const note = await supabase.updateNote(id, { pinned })
    return { ok: true, data: note }
  })

  // ===== Settings =====
  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    return { ok: true, data: settingsStore.get() }
  })
  ipcMain.handle(IPC.SETTINGS_UPDATE, async (_e, partial: Partial<AppSettings>) => {
    const next = settingsStore.set(partial)
    monitor.setRedactSensitive(next.redactSensitive)
    if (next.clipboardEnabled) monitor.start()
    else monitor.stop()
    registerHotkeys()
    refreshMenu(monitor)
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
  updater.on('changed', (status: UpdaterStatus) => broadcast(IPC.UPDATER_STATUS_CHANGED, status))
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
  createTray(monitor)
  registerHotkeys()
  updater.start()

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
