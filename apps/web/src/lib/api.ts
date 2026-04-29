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

export async function setClipPinned(id: string, pinned: boolean): Promise<void> {
  const { error } = await getSupabase().from('clipboard_items').update({ pinned }).eq('id', id)
  if (error) throw error
}

export async function deleteClip(id: string): Promise<void> {
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
  return noteFromRow(data as NoteRow)
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
  return noteFromRow(data as NoteRow)
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await getSupabase().from('notes').delete().eq('id', id)
  if (error) throw error
}

// ---------- Realtime ----------

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
  const clipCh = sb
    .channel(`web-clip-${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'clipboard_items',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          handlers.onClipDelete?.((payload.old as { id: string }).id)
        } else {
          handlers.onClip?.(clipFromRow(payload.new as ClipboardRow))
        }
      },
    )
    .subscribe()

  const noteCh = sb
    .channel(`web-notes-${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notes',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          handlers.onNoteDelete?.((payload.old as { id: string }).id)
        } else {
          handlers.onNote?.(noteFromRow(payload.new as NoteRow))
        }
      },
    )
    .subscribe()

  return () => {
    void sb.removeChannel(clipCh)
    void sb.removeChannel(noteCh)
  }
}
