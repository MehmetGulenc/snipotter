/**
 * Snipotter — Supabase service (main process)
 *
 * Handles anonymous auth, workspace pairing, and workspace-scoped CRUD.
 * No email/password — devices are linked via 6-char pair codes.
 */
import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js'
import { EventEmitter } from 'node:events'
import { authStorage } from './store'
import type {
  ClipboardItem,
  Note,
  SnipotterUser,
  Workspace,
  WorkspaceMember,
  PairCode,
} from '@shared/types'

interface SupabaseConfig {
  url?: string
  anonKey?: string
}

interface ClipboardRow {
  id: string
  workspace_id: string
  created_by: string | null
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
  created_by: string | null
  title: string | null
  content: string
  pinned: boolean
  from_clipboard_id: string | null
  ai: Note['ai']
  created_at: string
  updated_at: string
}

interface WorkspaceRow {
  id: string
  name: string
  created_at: string
}

interface WorkspaceMemberRow {
  workspace_id: string
  user_id: string
  role: 'owner' | 'member'
  device_name: string | null
  joined_at: string
}

function clipboardFromRow(row: ClipboardRow): ClipboardItem {
  return {
    id: row.id,
    userId: row.workspace_id,
    contentType: row.content_type,
    text: row.text,
    hash: row.hash,
    html: row.html,
    sourceApp: row.source_app,
    pinned: row.pinned,
    ai: row.ai,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    synced: true,
  }
}

function noteFromRow(row: NoteRow): Note {
  return {
    id: row.id,
    userId: row.workspace_id,
    title: row.title,
    content: row.content,
    pinned: row.pinned,
    fromClipboardId: row.from_clipboard_id,
    ai: row.ai,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    synced: true,
  }
}

export class SupabaseService extends EventEmitter {
  private client: SupabaseClient | null = null
  private user: SnipotterUser | null = null
  private workspaceId: string | null = null
  private workspace: Workspace | null = null
  private clipChannel: RealtimeChannel | null = null
  private noteChannel: RealtimeChannel | null = null

  constructor(private cfg: SupabaseConfig) {
    super()
    if (cfg.url && cfg.anonKey) {
      this.client = createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: true,
          storageKey: 'snipotter.session',
          autoRefreshToken: true,
          storage: authStorage,
        },
      })
      this.client.auth.onAuthStateChange((_event, session) => {
        this.user = session?.user
          ? {
              id: session.user.id,
              email: session.user.email ?? null,
              isAnonymous: session.user.is_anonymous ?? !session.user.email,
            }
          : null
        this.emit('auth', this.user)
      })
    }
  }

  isConfigured(): boolean {
    return !!this.client
  }

  getUser(): SnipotterUser | null {
    return this.user
  }

  getWorkspaceId(): string | null {
    return this.workspaceId
  }

  getWorkspace(): Workspace | null {
    return this.workspace
  }

  async ensureAnonymousSession(): Promise<SnipotterUser | null> {
    if (!this.client) return null
    const { data: cur } = await this.client.auth.getSession()
    if (cur.session) {
      this.user = {
        id: cur.session.user.id,
        email: cur.session.user.email ?? null,
        isAnonymous: cur.session.user.is_anonymous ?? !cur.session.user.email,
      }
      return this.user
    }
    const { data, error } = await this.client.auth.signInAnonymously()
    if (error) {
      console.warn('[supabase] anon sign-in failed', error.message)
      throw error
    }
    if (!data.user) return null
    this.user = {
      id: data.user.id,
      email: data.user.email ?? null,
      isAnonymous: true,
    }
    return this.user
  }

  async signOut(): Promise<void> {
    if (!this.client) return
    this.unsubscribeRealtime()
    await this.client.auth.signOut()
    this.workspaceId = null
    this.workspace = null
  }

  async fetchCurrentWorkspace(): Promise<Workspace | null> {
    if (!this.client || !this.user) return null
    const { data: memberRows, error: memberErr } = await this.client
      .from('workspace_members')
      .select('workspace_id, role, joined_at')
      .eq('user_id', this.user.id)
      .order('joined_at', { ascending: true })
      .limit(1)
    if (memberErr) throw memberErr
    if (!memberRows || memberRows.length === 0) {
      this.workspaceId = null
      this.workspace = null
      return null
    }
    const member = memberRows[0]
    const { data: ws, error: wsErr } = await this.client
      .from('workspaces')
      .select('id, name, created_at')
      .eq('id', member.workspace_id)
      .single()
    if (wsErr) throw wsErr
    const row = ws as WorkspaceRow
    this.workspaceId = row.id
    this.workspace = {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      isOwner: member.role === 'owner',
    }
    await this.subscribeRealtime()
    return this.workspace
  }

  async ensureWorkspace(deviceName?: string): Promise<Workspace | null> {
    if (!this.client || !this.user) return null
    const { error } = await this.client.rpc('ensure_workspace', {
      p_device_name: deviceName ?? null,
    })
    if (error) {
      console.warn('[supabase] ensure_workspace failed', error.message)
      throw error
    }
    return this.fetchCurrentWorkspace()
  }

  async createPairCode(): Promise<PairCode> {
    if (!this.client) throw new Error('Supabase not configured')
    const { data, error } = await this.client.rpc('create_pair_code')
    if (error) throw error
    return {
      code: data as string,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }
  }

  async redeemPairCode(code: string, deviceName?: string): Promise<Workspace | null> {
    if (!this.client) throw new Error('Supabase not configured')
    const { error } = await this.client.rpc('redeem_pair_code', {
      p_code: code,
      p_device_name: deviceName ?? null,
    })
    if (error) throw error
    return this.fetchCurrentWorkspace()
  }

  async listMembers(): Promise<WorkspaceMember[]> {
    if (!this.client || !this.workspaceId || !this.user) return []
    const { data, error } = await this.client
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('joined_at', { ascending: true })
    if (error) throw error
    const rows = (data ?? []) as WorkspaceMemberRow[]
    return rows.map((r) => ({
      userId: r.user_id,
      role: r.role,
      deviceName: r.device_name,
      joinedAt: r.joined_at,
      isSelf: r.user_id === this.user!.id,
    }))
  }

  async leaveWorkspace(): Promise<void> {
    if (!this.client || !this.workspaceId || !this.user) return
    await this.client
      .from('workspace_members')
      .delete()
      .eq('workspace_id', this.workspaceId)
      .eq('user_id', this.user.id)
    this.unsubscribeRealtime()
    this.workspaceId = null
    this.workspace = null
  }

  async listClipboard(limit = 200): Promise<ClipboardItem[]> {
    if (!this.client || !this.workspaceId) return []
    const { data, error } = await this.client
      .from('clipboard_items')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return ((data ?? []) as ClipboardRow[]).map(clipboardFromRow)
  }

  async insertClipboard(
    item: Omit<ClipboardItem, 'id' | 'userId' | 'synced'>,
  ): Promise<ClipboardItem | null> {
    if (!this.client || !this.workspaceId || !this.user) return null
    const payload = {
      workspace_id: this.workspaceId,
      created_by: this.user.id,
      content_type: item.contentType,
      text: item.text,
      hash: item.hash,
      html: item.html ?? null,
      source_app: item.sourceApp ?? null,
      pinned: item.pinned,
      ai: item.ai ?? null,
    }
    const { data, error } = await this.client
      .from('clipboard_items')
      .insert(payload)
      .select('*')
      .single()
    if (error) {
      console.warn('[supabase] insert clipboard failed', error.message)
      return null
    }
    return clipboardFromRow(data as ClipboardRow)
  }

  async updateClipboardAI(id: string, ai: ClipboardItem['ai']): Promise<void> {
    if (!this.client || !this.workspaceId) return
    const { error } = await this.client.from('clipboard_items').update({ ai }).eq('id', id)
    if (error) console.warn('[supabase] update ai failed', error.message)
  }

  async setClipboardPinned(id: string, pinned: boolean): Promise<void> {
    if (!this.client || !this.workspaceId) return
    await this.client.from('clipboard_items').update({ pinned }).eq('id', id)
  }

  async deleteClipboard(id: string): Promise<void> {
    if (!this.client || !this.workspaceId) return
    await this.client.from('clipboard_items').delete().eq('id', id)
  }

  async listNotes(): Promise<Note[]> {
    if (!this.client || !this.workspaceId) return []
    const { data, error } = await this.client
      .from('notes')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (error) throw error
    return ((data ?? []) as NoteRow[]).map(noteFromRow)
  }

  async createNote(partial: Partial<Note>): Promise<Note | null> {
    if (!this.client || !this.workspaceId || !this.user) return null
    const payload = {
      workspace_id: this.workspaceId,
      created_by: this.user.id,
      title: partial.title ?? null,
      content: partial.content ?? '',
      pinned: partial.pinned ?? false,
      from_clipboard_id: partial.fromClipboardId ?? null,
      ai: partial.ai ?? null,
    }
    const { data, error } = await this.client.from('notes').insert(payload).select('*').single()
    if (error) {
      console.warn('[supabase] create note failed', error.message)
      return null
    }
    return noteFromRow(data as NoteRow)
  }

  async updateNote(id: string, partial: Partial<Note>): Promise<Note | null> {
    if (!this.client || !this.workspaceId) return null
    const updates: Record<string, unknown> = {}
    if (partial.title !== undefined) updates['title'] = partial.title
    if (partial.content !== undefined) updates['content'] = partial.content
    if (partial.pinned !== undefined) updates['pinned'] = partial.pinned
    if (partial.ai !== undefined) updates['ai'] = partial.ai
    const { data, error } = await this.client
      .from('notes')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      console.warn('[supabase] update note failed', error.message)
      return null
    }
    return noteFromRow(data as NoteRow)
  }

  async deleteNote(id: string): Promise<void> {
    if (!this.client || !this.workspaceId) return
    await this.client.from('notes').delete().eq('id', id)
  }

  private async subscribeRealtime(): Promise<void> {
    if (!this.client || !this.workspaceId) return
    this.unsubscribeRealtime()

    this.clipChannel = this.client
      .channel(`clip-${this.workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clipboard_items',
          filter: `workspace_id=eq.${this.workspaceId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            this.emit('clip:deleted', (payload.old as { id: string }).id)
            return
          }
          this.emit('clip:upsert', clipboardFromRow(payload.new as ClipboardRow))
        },
      )
      .subscribe()

    this.noteChannel = this.client
      .channel(`notes-${this.workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `workspace_id=eq.${this.workspaceId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            this.emit('note:deleted', (payload.old as { id: string }).id)
            return
          }
          this.emit('note:upsert', noteFromRow(payload.new as NoteRow))
        },
      )
      .subscribe()
  }

  private unsubscribeRealtime(): void {
    if (this.clipChannel) {
      void this.client?.removeChannel(this.clipChannel)
      this.clipChannel = null
    }
    if (this.noteChannel) {
      void this.client?.removeChannel(this.noteChannel)
      this.noteChannel = null
    }
  }
}

