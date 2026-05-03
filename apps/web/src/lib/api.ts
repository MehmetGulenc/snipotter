import { getSupabase } from './supabase'
import type {
  ClipboardItem,
  Note,
  SnipotterUser,
  Workspace,
  WorkspaceMember,
} from './types'

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
  }
}

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

// ---------- Workspace / pairing ----------

export async function getCurrentWorkspace(userId: string): Promise<Workspace | null> {
  const sb = getSupabase()
  const { data: members, error } = await sb
    .from('workspace_members')
    .select('workspace_id, role, joined_at')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
  if (error) throw error
  if (!members || members.length === 0) return null
  const m = members[0]
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
  return ((data ?? []) as ClipboardRow[]).map(clipFromRow)
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
  const hash = await sha1(`${trimmed}`)

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
  if (existing) return clipFromRow(existing as ClipboardRow)

  const { data, error } = await getSupabase()
    .from('clipboard_items')
    .insert({
      workspace_id: workspaceId,
      created_by: userId,
      content_type: 'text',
      text: trimmed,
      hash,
      html: null,
      source_app: sourceApp,
      pinned: false,
      ai: null,
    })
    .select('*')
    .single()
  if (error) throw error
  const clip = clipFromRow(data as ClipboardRow)
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
  if (data) broadcastClipUpsert(clipFromRow(data as ClipboardRow))
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

// ---------- Notes ----------

export async function listNotes(workspaceId: string): Promise<Note[]> {
  const { data, error } = await getSupabase()
    .from('notes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as NoteRow[]).map(noteFromRow)
}

export async function createNote(
  workspaceId: string,
  userId: string,
  content: string,
): Promise<Note | null> {
  const { data, error } = await getSupabase()
    .from('notes')
    .insert({
      workspace_id: workspaceId,
      created_by: userId,
      content,
      title: null,
      pinned: false,
    })
    .select('*')
    .single()
  if (error) throw error
  const note = noteFromRow(data as NoteRow)
  broadcastNoteUpsert(note)
  return note
}

export async function updateNote(
  id: string,
  partial: { title?: string | null; content?: string; pinned?: boolean },
): Promise<Note | null> {
  const { data, error } = await getSupabase()
    .from('notes')
    .update(partial)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  const note = noteFromRow(data as NoteRow)
  broadcastNoteUpsert(note)
  return note
}

export async function deleteNote(id: string): Promise<void> {
  // Announce deletion to other devices first for sub-50ms feedback, then
  // issue the durable DB delete (postgres_changes is the backstop).
  broadcastNoteDeleted(id)
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

// ---------- Realtime ----------

// Per-tab client ID so we can ignore echoes of our own broadcasts.
const CLIENT_ID = `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

// Active sync channel for the current workspace. Kept at module scope so the
// mutation helpers below (broadcastNoteUpsert / broadcastClipDeleted / …)
// can push events through it without needing a handle passed around.
let activeSyncChannel: ReturnType<ReturnType<typeof getSupabase>['channel']> | null = null

/**
 * Send an instant broadcast to every other device in the workspace. Fire and
 * forget: Supabase Realtime delivers it via WebSocket in a few tens of ms,
 * independent of the DB write. Caller is still responsible for the durable
 * mutation (postgres_changes is the backstop).
 */
function broadcast(event: string, payload: Record<string, unknown>): void {
  if (!activeSyncChannel) return
  void activeSyncChannel.send({
    type: 'broadcast',
    event,
    payload: { ...payload, from: CLIENT_ID },
  })
}

export function broadcastNoteUpsert(note: Note): void {
  broadcast('note:upsert', { note })
}

export function broadcastNoteDeleted(id: string): void {
  broadcast('note:deleted', { id })
}

export function broadcastClipUpsert(item: ClipboardItem): void {
  broadcast('clip:upsert', { item })
}

export function broadcastClipDeleted(id: string): void {
  broadcast('clip:deleted', { id })
}

export function subscribeWorkspace(
  workspaceId: string,
  handlers: {
    onClip?: (item: ClipboardItem) => void
    onClipDelete?: (id: string) => void
    onNote?: (note: Note) => void
    onNoteDelete?: (id: string) => void
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
      handlers.onClip?.(clipFromRow(row))
    }
  }

  const replayNotes = async () => {
    if (lastNoteAt === new Date(0).toISOString()) return
    const { data } = await sb
      .from('notes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .gt('updated_at', lastNoteAt)
      .order('updated_at', { ascending: true })
      .limit(500)
    for (const row of (data ?? []) as NoteRow[]) {
      if (row.updated_at && row.updated_at > lastNoteAt) lastNoteAt = row.updated_at
      handlers.onNote?.(noteFromRow(row))
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
          handlers.onClip?.(clipFromRow(row))
        }
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void replayClips()
    })

  const noteCh = sb
    .channel(`web-notes-${workspaceId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notes' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          if (id) handlers.onNoteDelete?.(id)
        } else {
          const row = payload.new as NoteRow
          if (row.workspace_id !== workspaceId) return
          if (row.updated_at && row.updated_at > lastNoteAt) lastNoteAt = row.updated_at
          handlers.onNote?.(noteFromRow(row))
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
    .on('broadcast', { event: 'clip:upsert' }, ({ payload }) => {
      if (payload?.from === CLIENT_ID) return
      if (!payload?.item) return
      const item = payload.item as ClipboardItem
      if (item.createdAt && item.createdAt > lastClipAt) lastClipAt = item.createdAt
      handlers.onClip?.(item)
    })
    .on('broadcast', { event: 'clip:deleted' }, ({ payload }) => {
      if (payload?.from === CLIENT_ID) return
      if (payload?.id) handlers.onClipDelete?.(payload.id as string)
    })
    .on('broadcast', { event: 'note:upsert' }, ({ payload }) => {
      if (payload?.from === CLIENT_ID) return
      if (!payload?.note) return
      const note = payload.note as Note
      if (note.updatedAt && note.updatedAt > lastNoteAt) lastNoteAt = note.updatedAt
      handlers.onNote?.(note)
    })
    .on('broadcast', { event: 'note:deleted' }, ({ payload }) => {
      if (payload?.from === CLIENT_ID) return
      if (payload?.id) handlers.onNoteDelete?.(payload.id as string)
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

  return () => {
    activeSyncChannel = null
    if (heartbeat) clearInterval(heartbeat)
    void sb.removeChannel(clipCh)
    void sb.removeChannel(noteCh)
    void sb.removeChannel(syncCh)
  }
}
