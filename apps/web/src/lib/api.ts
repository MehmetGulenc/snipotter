import { getSupabase } from './supabase'
import type {
  ClipboardItem,
  Note,
  SnipotterUser,
  Workspace,
  WorkspaceMember,
} from './types'
import type { Notebook, NoteVersion, TrashedNote } from '@shared/types'
import { codec, codecFor } from '@shared/crypto/codec'

interface ClipboardRow {
  id: string
  workspace_id: string
  content_type: ClipboardItem['contentType']
  text: string
  hash: string
  html: string | null
  source_app: string | null
  pinned: boolean
  ai: ClipboardItem['ai']
  created_at: string
  updated_at: string
}

interface NoteRow {
  id: string
  workspace_id: string
  title: string | null
  content: string
  pinned: boolean
  from_clipboard_id: string | null
  ai: Note['ai']
  created_at: string
  updated_at: string
  notebook_id?: string | null
}

function clipFromRow(r: ClipboardRow): ClipboardItem {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    contentType: r.content_type,
    text: r.text,
    hash: r.hash,
    html: r.html,
    sourceApp: r.source_app,
    pinned: r.pinned,
    ai: r.ai,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function noteFromRow(r: NoteRow): Note {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    content: r.content,
    pinned: r.pinned,
    fromClipboardId: r.from_clipboard_id,
    ai: r.ai,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    notebookId: r.notebook_id ?? null,
  }
}

// Rows pass through the end-to-end codec (a no-op until the workspace is encrypted).
const openClip = async (r: ClipboardRow): Promise<ClipboardItem> => clipFromRow(await codec().openRow('clipboard_items', r))
const openNote = async (r: NoteRow): Promise<Note> => noteFromRow(await codecFor(r.workspace_id).openRow('notes', r))
const openClips = (rows: unknown[] | null): Promise<ClipboardItem[]> => Promise.all(((rows ?? []) as ClipboardRow[]).map(openClip))
const openNotes = (rows: unknown[] | null): Promise<Note[]> => Promise.all(((rows ?? []) as NoteRow[]).map(openNote))

// ---------- Auth ----------

export async function ensureAnonymousSession(): Promise<SnipotterUser | null> {
  const sb = getSupabase()
  const { data: cur } = await sb.auth.getSession()
  if (cur.session) {
    const u = cur.session.user
    return {
      id: u.id,
      email: u.email ?? null,
      isAnonymous: u.is_anonymous ?? !u.email,
    }
  }
  const { data, error } = await sb.auth.signInAnonymously()
  if (error) throw error
  if (!data.user) return null
  return { id: data.user.id, email: null, isAnonymous: true }
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut()
}

/** No target ID is accepted: the server derives the account from auth.uid(). */
export async function deleteOwnAccount(): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('delete_own_account')
  if (error) throw error
  // Remove the now-invalid local session, even when remote logout is unavailable.
  await sb.auth.signOut({ scope: 'local' })
  window.localStorage.removeItem('snipotter.web.session')
}

// ---------- Workspace / pairing ----------

export async function getCurrentWorkspace(userId: string): Promise<Workspace | null> {
  const sb = getSupabase()
  const { data: members, error } = await sb
    .from('workspace_members')
    .select('workspace_id, role, joined_at')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  if (!members || members.length === 0) return null
  // After pairing or recovery this device may belong to more than one workspace.
  let preferred: string | null = null
  try { preferred = window.localStorage.getItem('snipotter.preferredWorkspace') } catch { /* private mode */ }
  const m = members.find((x) => x.workspace_id === preferred) ?? members[0]
  const { data: ws, error: wsErr } = await sb
    .from('workspaces')
    .select('id, name, created_at')
    .eq('id', m.workspace_id)
    .single()
  if (wsErr) throw wsErr
  return {
    id: ws.id,
    name: ws.name,
    createdAt: ws.created_at,
    isOwner: m.role === 'owner',
  }
}

export async function ensureWorkspace(deviceName: string): Promise<Workspace | null> {
  const sb = getSupabase()
  const { error } = await sb.rpc('ensure_workspace', { p_device_name: deviceName })
  if (error) throw error
  const { data: u } = await sb.auth.getUser()
  if (!u.user) return null
  return getCurrentWorkspace(u.user.id)
}

export async function createPairCode(): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_pair_code')
  if (error) throw error
  return data as string
}

export async function redeemPairCode(
  code: string,
  deviceName: string,
): Promise<Workspace | null> {
  const sb = getSupabase()
  const { error } = await sb.rpc('redeem_pair_code', {
    p_code: code,
    p_device_name: deviceName,
  })
  if (error) throw error
  const { data: u } = await sb.auth.getUser()
  if (!u.user) return null
  return getCurrentWorkspace(u.user.id)
}

export async function listMembers(
  workspaceId: string,
  selfId: string,
): Promise<WorkspaceMember[]> {
  const { data, error } = await getSupabase()
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    role: r.role,
    deviceName: r.device_name,
    joinedAt: r.joined_at,
    isSelf: r.user_id === selfId,
  }))
}

export async function leaveWorkspace(workspaceId: string, userId: string): Promise<void> {
  await getSupabase()
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
}

export async function removeWorkspaceMember(workspaceId: string, targetUserId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId)
  if (error) throw error
}

// ---------- Clipboard ----------

export async function listClipboard(workspaceId: string): Promise<ClipboardItem[]> {
  const { data, error } = await getSupabase()
    .from('clipboard_items')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return openClips(data)
}

/**
 * Insert a clipboard item from a plain text payload (mobile share target,
 * Quick Settings tile, "save current clipboard" button). Mirrors the desktop
 * monitor's hash format so dedupe works across platforms.
 */
export async function createClipFromText(
  workspaceId: string,
  userId: string,
  text: string,
  sourceApp: string | null = null,
): Promise<ClipboardItem | null> {
  const trimmed = text?.trim()
  if (!trimmed) return null
  const hash = await codec().clipHash(trimmed, () => sha1(`${trimmed}`))

  // Skip if the same payload was just inserted from another device. The
  // desktop monitor does the same in-memory check; we go to the DB because we
  // don't have a local cache of recent hashes on mobile.
  const { data: existing } = await getSupabase()
    .from('clipboard_items')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('hash', hash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) return openClip(existing as ClipboardRow)

  // Desktop hashes text + HTML, so a copy that reached the Mac via Universal
  // Clipboard has a different hash; match recent identical text instead.
  // Encrypted workspaces share one keyed hash of the trimmed text, so the hash check covers it.
  if (!codec().enabled && trimmed.length <= 2000) {
    const { data: sameText } = await getSupabase()
      .from('clipboard_items')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('text', trimmed)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (sameText) return openClip(sameText as ClipboardRow)
  }

  const { data, error } = await getSupabase()
    .from('clipboard_items')
    .insert(await codec().sealRow('clipboard_items', {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      created_by: userId,
      content_type: 'text',
      text: trimmed,
      hash,
      html: null,
      source_app: sourceApp,
      pinned: false,
      ai: null,
    }))
    .select('*')
    .single()
  if (error) throw error
  const clip = await openClip(data as ClipboardRow)
  broadcastClipUpsert(clip)
  return clip
}

async function sha1(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function setClipPinned(id: string, pinned: boolean): Promise<void> {
  const { data, error } = await getSupabase()
    .from('clipboard_items')
    .update({ pinned })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  if (data) broadcastClipUpsert(await openClip(data as ClipboardRow))
}

export async function deleteClip(id: string): Promise<void> {
  // Announce the deletion to other devices before the DB round-trip so they
  // see the removal within ~50ms instead of waiting for WAL replication.
  broadcastClipDeleted(id)
  // RLS rejects this silently if the user isn't a workspace member, so we
  // surface the underlying error to the caller and let the UI revert its
  // optimistic update.
  const { error } = await getSupabase().from('clipboard_items').delete().eq('id', id)
  if (error) throw error
}

export async function deleteClipMany(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  ids.forEach((id) => broadcastClipDeleted(id))
  const { error } = await getSupabase().from('clipboard_items').delete().in('id', ids)
  if (error) throw error
}

// ---------- Notes ----------

/** Workspace whose notes are open: the personal one or a shared space. Clipboard stays personal. */
let notesWs: string | null = null
export function setNotesWorkspace(id: string | null): void {
  notesWs = id
}
const nc = () => codecFor(notesWs)

export async function listNotes(workspaceId: string): Promise<Note[]> {
  const { data, error } = await getSupabase()
    .from('notes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return openNotes(data)
}

export async function createNote(
  workspaceId: string,
  userId: string,
  content: string,
): Promise<Note | null> {
  const { data, error } = await getSupabase()
    .from('notes')
    .insert(await codecFor(workspaceId).sealRow('notes', {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      created_by: userId,
      content,
      title: null,
      pinned: false,
    }))
    .select('*')
    .single()
  if (error) throw error
  const note = await openNote(data as NoteRow)
  broadcastNoteUpsert(note)
  return note
}

// ---------- Notebooks ----------

interface NotebookRow {
  id: string
  workspace_id: string
  parent_id: string | null
  name: string
  icon: string | null
  sort: number
}

const notebookFromRow = (r: NotebookRow): Notebook => ({
  id: r.id, workspaceId: r.workspace_id, parentId: r.parent_id, name: r.name, icon: r.icon, sort: r.sort,
})
const openNotebook = async (r: NotebookRow): Promise<Notebook> => {
  const open = await codecFor(r.workspace_id).openRow('notebooks', r)
  return notebookFromRow({ ...open, name: open.name || 'Kilitli defter' })
}

/** Empty when the server predates notebooks (migration 0013). */
export async function listNotebooks(workspaceId: string): Promise<Notebook[]> {
  const { data, error } = await getSupabase().from('notebooks').select('*').eq('workspace_id', workspaceId).order('sort')
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return Promise.all(((data ?? []) as NotebookRow[]).map(openNotebook))
}

export async function createNotebook(workspaceId: string, name: string, parentId: string | null): Promise<Notebook> {
  const { data, error } = await getSupabase()
    .from('notebooks')
    .insert(await codecFor(workspaceId).sealRow('notebooks', { id: crypto.randomUUID(), workspace_id: workspaceId, name: name.trim(), parent_id: parentId }))
    .select('*')
    .single()
  if (error) throw error
  return openNotebook(data as NotebookRow)
}

export async function updateNotebook(id: string, patch: { name?: string; parentId?: string | null; sort?: number }): Promise<Notebook> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = (await nc().sealRow('notebooks', { id, name: patch.name.trim() })).name
  if (patch.parentId !== undefined) row.parent_id = patch.parentId
  if (patch.sort !== undefined) row.sort = patch.sort
  const { data, error } = await getSupabase().from('notebooks').update(row).eq('id', id).select('*').single()
  if (error) throw error
  return openNotebook(data as NotebookRow)
}

/** Child notebooks go with it; its notes stay, unfiled. */
export async function deleteNotebook(id: string): Promise<void> {
  const { error } = await getSupabase().from('notebooks').delete().eq('id', id)
  if (error) throw error
}

export async function moveNoteToNotebook(noteId: string, notebookId: string | null): Promise<Note> {
  const { data, error } = await getSupabase().from('notes').update({ notebook_id: notebookId }).eq('id', noteId).select('*').single()
  if (error) throw error
  const note = await openNote(data as NoteRow)
  broadcastNoteUpsert(note)
  return note
}

export async function updateNote(
  id: string,
  partial: { title?: string | null; content?: string; pinned?: boolean },
): Promise<Note | null> {
  const { id: _id, ...sealed } = await nc().sealRow('notes', { id, ...partial })
  const { data, error } = await getSupabase()
    .from('notes')
    .update(sealed)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  const note = await openNote(data as NoteRow)
  broadcastNoteUpsert(note)
  return note
}

/** Mirror of the Yjs document for search, previews and older app versions. */
export async function saveNoteContent(id: string, content: string, contentSha: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from('notes')
    .update({ content: (await nc().sealRow('notes', { id, content })).content, ydoc_content_sha: contentSha })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  broadcastNoteUpsert(await openNote(data as NoteRow))
}

export async function deleteNote(id: string): Promise<void> {
  // Announce deletion to other devices first for sub-50ms feedback, then
  // issue the durable DB delete (postgres_changes is the backstop).
  broadcastNoteDeleted(id)
  const { error: trashError } = await getSupabase().rpc('trash_notes', { p_ids: [id] })
  if (!trashError) return
  if (trashError.code !== 'PGRST202') throw trashError
  const { error, count } = await getSupabase()
    .from('notes')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) throw error
  if (count === 0) {
    // RLS blocked the delete silently (e.g. note created by a previous
    // anonymous session). Throw so the caller can revert the optimistic remove.
    throw new Error('Bu not başka bir oturumdan oluşturulmuş ve bu hesapla silinemiyor.')
  }
}

export async function deleteNoteMany(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  ids.forEach((id) => broadcastNoteDeleted(id))
  // Trash (migration 0011) first; a server without it falls back to a permanent delete.
  const { error: trashError } = await getSupabase().rpc('trash_notes', { p_ids: ids })
  if (!trashError) return
  if (trashError.code !== 'PGRST202') throw trashError
  const { error } = await getSupabase().from('notes').delete().in('id', ids)
  if (error) throw error
}

export async function listTrashedNotes(workspaceId: string): Promise<TrashedNote[]> {
  const { data, error } = await getSupabase()
    .from('notes_trash')
    .select('id, deleted_at, title:note->>title, content:note->>content')
    .eq('workspace_id', workspaceId)
    .order('deleted_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return Promise.all(((data ?? []) as unknown as Array<{ id: string; deleted_at: string; title: string | null; content: string | null }>)
    .map(async (r) => {
      const open = await codecFor(workspaceId).openRow('notes', { id: r.id, title: r.title, content: r.content ?? '' })
      return { id: r.id, title: open.title, content: open.content, deletedAt: r.deleted_at }
    }))
}

/** Restores trashed notes and returns them so lists can show them again. */
export async function restoreTrashedNotes(ids: string[]): Promise<Note[]> {
  const sb = getSupabase()
  const { error } = await sb.rpc('restore_notes', { p_ids: ids })
  if (error) throw error
  const { data, error: readError } = await sb.from('notes').select('*').in('id', ids)
  if (readError) throw readError
  const notes = await openNotes(data)
  notes.forEach(broadcastNoteUpsert)
  return notes
}

export async function purgeTrashedNotes(ids: string[]): Promise<void> {
  const { error } = await getSupabase().rpc('purge_trashed_notes', { p_ids: ids })
  if (error) throw error
}

export async function listNoteVersions(noteId: string): Promise<NoteVersion[]> {
  const { data, error } = await getSupabase()
    .from('note_versions')
    .select('id, kind, created_at, content')
    .eq('note_id', noteId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return Promise.all(((data ?? []) as Array<{ id: string; kind: NoteVersion['kind']; created_at: string; content: string }>)
    .map(async (r) => {
      const open = await nc().openRow('note_versions', r)
      return { id: r.id, kind: r.kind, createdAt: r.created_at, content: open.content }
    }))
}

// ---------- Realtime ----------

// Per-tab client ID so we can ignore echoes of our own broadcasts.
const CLIENT_ID = `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

// Active sync channel for the current workspace. Kept at module scope so the
// mutation helpers below (broadcastNoteUpsert / broadcastClipDeleted / …)
// can push events through it without needing a handle passed around.
let activeSyncChannel: ReturnType<ReturnType<typeof getSupabase>['channel']> | null = null
/** The open shared space's channel; note events go there instead of the personal one. */
let activeNoteChannel: ReturnType<ReturnType<typeof getSupabase>['channel']> | null = null

/**
 * Send an instant broadcast to every other device in the workspace. Fire and
 * forget: Supabase Realtime delivers it via WebSocket in a few tens of ms,
 * independent of the DB write. Caller is still responsible for the durable
 * mutation (postgres_changes is the backstop).
 */
function broadcast(event: string, id: string, payload: Record<string, unknown>, sealed = true): void {
  const isNote = event.startsWith('note')
  const channel = isNote ? activeNoteChannel ?? activeSyncChannel : activeSyncChannel
  if (!channel) return
  // Broadcasts travel through the server: in encrypted workspaces the payload is sealed.
  void (sealed ? (isNote ? nc() : codec()).sealBroadcast(event, id, payload) : Promise.resolve(payload)).then((body) =>
    channel.send({ type: 'broadcast', event, payload: { ...body, from: CLIENT_ID } }),
  )
}

/** Only to the note's own workspace: a personal note never reaches a shared space. */
export function broadcastNoteUpsert(note: Note): void {
  if (note.workspaceId && notesWs && note.workspaceId !== notesWs) return
  broadcast('note:upsert', note.id, { note })
}

export function broadcastNoteDeleted(id: string): void {
  broadcast('note:deleted', id, { id }, false)
}

export function broadcastClipUpsert(item: ClipboardItem): void {
  broadcast('clip:upsert', item.id, { item })
}

export function broadcastClipDeleted(id: string): void {
  broadcast('clip:deleted', id, { id }, false)
}

// Yjs note updates arrive twice (instant broadcast + durable postgres_changes);
// applying the same update again is a no-op in Yjs.
const noteYListeners = new Map<string, Set<(update: string) => void>>()

/** `update` is already sealed by the note transport. */
export function broadcastNoteY(noteId: string, update: string): void {
  broadcast('note:y', noteId, { noteId, update }, false)
}

export function onNoteY(noteId: string, cb: (update: string) => void): () => void {
  let set = noteYListeners.get(noteId)
  if (!set) noteYListeners.set(noteId, (set = new Set()))
  set.add(cb)
  return () => {
    set.delete(cb)
    if (set.size === 0) noteYListeners.delete(noteId)
  }
}

function dispatchNoteY(noteId: unknown, update: unknown): void {
  if (typeof noteId !== 'string' || typeof update !== 'string') return
  noteYListeners.get(noteId)?.forEach((cb) => cb(update))
}

export function subscribeWorkspace(
  workspaceId: string,
  notesWorkspaceId: string,
  handlers: {
    onClip?: (item: ClipboardItem) => void
    onClipDelete?: (id: string) => void
    onNote?: (note: Note) => void
    onNoteDelete?: (id: string) => void
    /** Any notebook added, renamed, moved or deleted on another device. */
    onNotebooksChanged?: () => void
  },
): () => void {
  const sb = getSupabase()

  // High-water marks for eventual-consistency replay on reconnect.
  let lastClipAt = new Date(0).toISOString()
  let lastNoteAt = new Date(0).toISOString()

  const replayClips = async () => {
    if (lastClipAt === new Date(0).toISOString()) return
    const { data } = await sb
      .from('clipboard_items')
      .select('*')
      .eq('workspace_id', workspaceId)
      .gt('created_at', lastClipAt)
      .order('created_at', { ascending: true })
      .limit(500)
    for (const row of (data ?? []) as ClipboardRow[]) {
      if (row.created_at && row.created_at > lastClipAt) lastClipAt = row.created_at
      handlers.onClip?.(await openClip(row))
    }
  }

  const replayNotes = async () => {
    if (lastNoteAt === new Date(0).toISOString()) return
    const { data } = await sb
      .from('notes')
      .select('*')
      .eq('workspace_id', notesWorkspaceId)
      .gt('updated_at', lastNoteAt)
      .order('updated_at', { ascending: true })
      .limit(500)
    for (const row of (data ?? []) as NoteRow[]) {
      if (row.updated_at && row.updated_at > lastNoteAt) lastNoteAt = row.updated_at
      handlers.onNote?.(await openNote(row))
    }
  }

  // --- postgres_changes: durable, slower (100-500ms WAL) ---
  const clipCh = sb
    .channel(`web-clip-${workspaceId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'clipboard_items' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          if (id) handlers.onClipDelete?.(id)
        } else {
          const row = payload.new as ClipboardRow
          if (row.workspace_id !== workspaceId) return
          if (row.created_at && row.created_at > lastClipAt) lastClipAt = row.created_at
          void openClip(row).then((item) => handlers.onClip?.(item))
        }
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void replayClips()
    })

  const noteCh = sb
    .channel(`web-notes-${notesWorkspaceId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notes' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          if (id) handlers.onNoteDelete?.(id)
        } else {
          const row = payload.new as NoteRow
          if (row.workspace_id !== notesWorkspaceId) return
          if (row.updated_at && row.updated_at > lastNoteAt) lastNoteAt = row.updated_at
          void openNote(row).then((note) => handlers.onNote?.(note))
        }
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void replayNotes()
    })

  // --- broadcast: instant (<50ms) pub/sub, no DB round-trip ---
  let heartbeat: ReturnType<typeof setInterval> | null = null
  const syncCh = sb
    .channel(`sync-${workspaceId}`, {
      config: { broadcast: { self: false, ack: false } },
    })
    .on('broadcast', { event: 'clip:upsert' }, async ({ payload }) => {
      if (payload?.from === CLIENT_ID) return
      const body = await codec().openBroadcast('clip:upsert', payload ?? {})
      if (!body?.item) return
      const item = body.item as ClipboardItem
      if (item.createdAt && item.createdAt > lastClipAt) lastClipAt = item.createdAt
      handlers.onClip?.(item)
    })
    .on('broadcast', { event: 'clip:deleted' }, ({ payload }) => {
      if (payload?.from === CLIENT_ID) return
      if (payload?.id) handlers.onClipDelete?.(payload.id as string)
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        activeSyncChannel = syncCh
        // Heartbeat: prevents Supabase + browser tab throttle from killing the
        // socket. 25s < the 60s idle limit on the server side.
        if (heartbeat) clearInterval(heartbeat)
        heartbeat = setInterval(() => {
          void syncCh.send({
            type: 'broadcast',
            event: 'ping',
            payload: { ts: Date.now(), from: CLIENT_ID },
          })
        }, 25_000)
      }
    })

  // Note broadcasts: on the personal channel, or on the open space's own channel.
  const separate = notesWorkspaceId !== workspaceId
  const noteBus = separate ? sb.channel(`sync-${notesWorkspaceId}`, { config: { broadcast: { self: false, ack: false } } }) : syncCh
  noteBus
    .on('broadcast', { event: 'note:upsert' }, async ({ payload }) => {
      if (payload?.from === CLIENT_ID) return
      const body = await codecFor(notesWorkspaceId).openBroadcast('note:upsert', payload ?? {})
      if (!body?.note) return
      const note = body.note as Note
      if (note.updatedAt && note.updatedAt > lastNoteAt) lastNoteAt = note.updatedAt
      handlers.onNote?.(note)
    })
    .on('broadcast', { event: 'note:deleted' }, ({ payload }) => {
      if (payload?.from === CLIENT_ID) return
      if (payload?.id) handlers.onNoteDelete?.(payload.id as string)
    })
    .on('broadcast', { event: 'note:y' }, ({ payload }) => {
      if (payload?.from === CLIENT_ID) return
      dispatchNoteY(payload?.noteId, payload?.update)
    })
  if (separate) noteBus.subscribe((status) => { if (status === 'SUBSCRIBED') activeNoteChannel = noteBus })
  else activeNoteChannel = null

  const noteYCh = sb
    .channel(`web-note-y-${notesWorkspaceId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'note_updates', filter: `workspace_id=eq.${notesWorkspaceId}` },
      (payload) => {
        const row = payload.new as { note_id?: string; update?: string }
        dispatchNoteY(row.note_id, row.update)
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notebooks', filter: `workspace_id=eq.${notesWorkspaceId}` },
      () => handlers.onNotebooksChanged?.(),
    )
    .subscribe()

  return () => {
    activeSyncChannel = null
    activeNoteChannel = null
    if (separate) void sb.removeChannel(noteBus)
    if (heartbeat) clearInterval(heartbeat)
    void sb.removeChannel(clipCh)
    void sb.removeChannel(noteCh)
    void sb.removeChannel(syncCh)
    void sb.removeChannel(noteYCh)
  }
}
