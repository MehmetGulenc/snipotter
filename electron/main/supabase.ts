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
    userId: row.created_by ?? row.workspace_id,
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
    userId: row.created_by ?? row.workspace_id,
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
  // Dedicated broadcast channel for instant (<50ms) sync between devices.
  // Broadcasts go through Supabase Realtime's pub/sub layer directly without
  // waiting for postgres WAL replication (which adds 100-500ms latency).
  private broadcastChannel: RealtimeChannel | null = null
  // Unique per-process ID used to ignore echoes of our own broadcasts
  // (self: false on the client should handle this, but we belt-and-brace).
  private readonly clientId: string = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  // Last realtime event timestamp — used to detect dead WebSockets and to
  // bound the catch-up replay window when reconnecting. ISO-8601.
  private lastClipEventAt: string = new Date(0).toISOString()
  private lastNoteEventAt: string = new Date(0).toISOString()
  // Heartbeat timer: pokes the broadcast channel every 25s to keep the
  // socket alive when the OS would otherwise suspend a backgrounded tray app.
  private heartbeatTimer: NodeJS.Timeout | null = null
  // Debounced reconnect to avoid storms when multiple channels fail at once.
  private reconnectTimer: NodeJS.Timeout | null = null

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
        realtime: {
          // Crank event rate up from default 10/s to 100/s so high-frequency
          // operations (bulk delete, rapid typing in notes) don't get throttled
          // at the socket layer. This is the knob Supabase exposes for
          // Telegram-like responsiveness.
          params: { eventsPerSecond: 100 },
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

  /**
   * Unpair another device by removing its workspace_members row. Relies on
   * the `wm member delete` RLS policy (migration 0004) which lets any
   * member of the workspace remove any other member. Throws on RLS
   * rejection so the renderer can surface the error.
   */
  async removeWorkspaceMember(userId: string): Promise<void> {
    if (!this.client || !this.workspaceId) {
      throw new Error('Workspace yok')
    }
    if (this.user && userId === this.user.id) {
      throw new Error('Kendi cihazını çıkarmak için "Eşleşmeden ayrıl"ı kullan')
    }
    const { error } = await this.client
      .from('workspace_members')
      .delete()
      .eq('workspace_id', this.workspaceId)
      .eq('user_id', userId)
    if (error) throw error
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

  /**
   * Look up an existing clipboard row by content hash within the active
   * workspace. Used to deduplicate "the user re-copied the same thing"
   * before we insert a brand new row.
   */
  async findClipboardByHash(hash: string): Promise<ClipboardItem | null> {
    if (!this.client || !this.workspaceId) return null
    const { data, error } = await this.client
      .from('clipboard_items')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('hash', hash)
      .limit(1)
      .maybeSingle()
    if (error) {
      console.warn('[supabase] find by hash failed', error.message)
      return null
    }
    return data ? clipboardFromRow(data as ClipboardRow) : null
  }

  /**
   * Bump an existing clipboard row's created_at to "now" so it floats back
   * to the top of the list (which is sorted by created_at desc). The
   * touch_updated_at trigger handles updated_at automatically.
   */
  async touchClipboard(id: string): Promise<ClipboardItem | null> {
    if (!this.client || !this.workspaceId) return null
    const { data, error } = await this.client
      .from('clipboard_items')
      .update({ created_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      console.warn('[supabase] touch clipboard failed', error.message)
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
    const { error, count } = await this.client
      .from('clipboard_items')
      .delete({ count: 'exact' })
      .eq('id', id)
    if (error) throw new Error(`[supabase] deleteClipboard: ${error.message}`)
    if (count === 0) {
      console.warn(`[supabase] deleteClipboard: RLS blocked deletion of clip ${id} (0 rows affected)`)
    }
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
    // Use `count: 'exact'` so we can detect silent RLS rejections.
    // When RLS blocks a DELETE, Postgres silently returns 0 rows affected —
    // no error is thrown. Without this check, the note stays in the DB and
    // comes back after the next 15s reconciliation fetch (the "ghost note" bug).
    const { error, count } = await this.client
      .from('notes')
      .delete({ count: 'exact' })
      .eq('id', id)
    if (error) throw new Error(`[supabase] deleteNote: ${error.message}`)
    if (count === 0) {
      // RLS blocked the delete (e.g. note created by a previous anonymous
      // session). Escalate via an RPC that deletes by workspace membership
      // instead of by owner, so workspace admins can clean up any note.
      const { error: rpcError } = await this.client.rpc('delete_note_by_workspace', {
        p_note_id: id,
        p_workspace_id: this.workspaceId,
      })
      if (rpcError) {
        throw new Error(
          `[supabase] deleteNote (rpc fallback): ${rpcError.message}. ` +
            'Note may have been created by a different session and cannot be removed ' +
            'without a matching workspace-admin RLS policy.',
        )
      }
    }
  }

  private async subscribeRealtime(): Promise<void> {
    if (!this.client || !this.workspaceId) return
    this.unsubscribeRealtime()

    const wsId = this.workspaceId

    this.clipChannel = this.client
      .channel(`clip-${wsId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clipboard_items', filter: `workspace_id=eq.${wsId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id
            if (id) this.emit('clip:deleted', id)
            return
          }
          const row = payload.new as ClipboardRow
          // Track high-water mark so reconnect-replay can bound its query.
          if (row.created_at && row.created_at > this.lastClipEventAt) {
            this.lastClipEventAt = row.created_at
          }
          this.emit('clip:upsert', clipboardFromRow(row))
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[supabase] clipboard channel error', status, err)
          this.emit('connection:state', { ready: false, reason: status })
          this.scheduleReconnect()
        } else if (status === 'SUBSCRIBED') {
          console.log('[supabase] clipboard realtime active')
          this.emit('connection:state', { ready: true })
          // On (re)connect, replay anything newer than our last event so a
          // backgrounded device that missed broadcasts catches up.
          void this.replayClipsSince(this.lastClipEventAt)
        }
      })

    this.noteChannel = this.client
      .channel(`notes-${wsId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `workspace_id=eq.${wsId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id
            if (id) this.emit('note:deleted', id)
            return
          }
          const row = payload.new as NoteRow
          if (row.updated_at && row.updated_at > this.lastNoteEventAt) {
            this.lastNoteEventAt = row.updated_at
          }
          this.emit('note:upsert', noteFromRow(row))
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[supabase] notes channel error', status, err)
          this.scheduleReconnect()
        } else if (status === 'SUBSCRIBED') {
          console.log('[supabase] notes realtime active')
          void this.replayNotesSince(this.lastNoteEventAt)
        }
      })

    // === INSTANT BROADCAST LAYER ===
    // Dedicated channel for sub-50ms sync. When any device performs a CRUD
    // op, it broadcasts the change on this channel; all other devices in the
    // workspace receive it near-instantly via WebSocket (no WAL round-trip).
    // postgres_changes above remains as the durable backstop.
    this.broadcastChannel = this.client
      .channel(`sync-${wsId}`, {
        config: {
          broadcast: { self: false, ack: false },
        },
      })
      .on('broadcast', { event: 'clip:upsert' }, ({ payload }) => {
        if (payload?.from === this.clientId) return // ignore own echo
        if (!payload?.item) return
        const item = payload.item as ClipboardItem
        if (item.createdAt && item.createdAt > this.lastClipEventAt) {
          this.lastClipEventAt = item.createdAt
        }
        this.emit('clip:upsert', item)
      })
      .on('broadcast', { event: 'clip:deleted' }, ({ payload }) => {
        if (payload?.from === this.clientId) return
        if (payload?.id) this.emit('clip:deleted', payload.id as string)
      })
      .on('broadcast', { event: 'note:upsert' }, ({ payload }) => {
        if (payload?.from === this.clientId) return
        if (!payload?.note) return
        const note = payload.note as Note
        if (note.updatedAt && note.updatedAt > this.lastNoteEventAt) {
          this.lastNoteEventAt = note.updatedAt
        }
        this.emit('note:upsert', note)
      })
      .on('broadcast', { event: 'note:deleted' }, ({ payload }) => {
        if (payload?.from === this.clientId) return
        if (payload?.id) this.emit('note:deleted', payload.id as string)
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[supabase] broadcast channel error', status, err)
          this.scheduleReconnect()
        } else if (status === 'SUBSCRIBED') {
          console.log('[supabase] instant-broadcast channel active')
          this.startHeartbeat()
        }
      })
  }

  /**
   * Schedule a single reconnect attempt. Multiple channels failing at once
   * (which happens whenever the network blips) collapses to one retry.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      console.log('[supabase] attempting realtime reconnect…')
      void this.subscribeRealtime()
    }, 2000)
  }

  /**
   * Send a no-op broadcast every 25s. Supabase Realtime closes idle sockets
   * after ~60s, and Electron tray apps with no foreground window get put on
   * a low-power schedule by macOS that further amplifies the gap. A periodic
   * tiny message keeps the WS alive end-to-end.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.broadcastChannel) return
      void this.broadcastChannel.send({
        type: 'broadcast',
        event: 'ping',
        payload: { ts: Date.now(), from: this.clientId },
      })
    }, 25_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Eventual consistency replay. After a reconnect we fetch any rows that
   * were created/updated while we were offline and emit them through the
   * normal upsert pipeline — the renderer's upsert is idempotent so this
   * is safe even if no events were missed.
   */
  private async replayClipsSince(sinceIso: string): Promise<void> {
    if (!this.client || !this.workspaceId) return
    if (sinceIso === new Date(0).toISOString()) return // first-ever connect, listClipboard handles this
    try {
      const { data, error } = await this.client
        .from('clipboard_items')
        .select('*')
        .eq('workspace_id', this.workspaceId)
        .gt('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) {
        console.warn('[supabase] replay clips failed', error.message)
        return
      }
      for (const row of (data ?? []) as ClipboardRow[]) {
        if (row.created_at && row.created_at > this.lastClipEventAt) {
          this.lastClipEventAt = row.created_at
        }
        this.emit('clip:upsert', clipboardFromRow(row))
      }
      if (data && data.length > 0) {
        console.log(`[supabase] replayed ${data.length} clips since ${sinceIso}`)
      }
    } catch (err) {
      console.warn('[supabase] replay clips threw', err)
    }
  }

  private async replayNotesSince(sinceIso: string): Promise<void> {
    if (!this.client || !this.workspaceId) return
    if (sinceIso === new Date(0).toISOString()) return
    try {
      const { data, error } = await this.client
        .from('notes')
        .select('*')
        .eq('workspace_id', this.workspaceId)
        .gt('updated_at', sinceIso)
        .order('updated_at', { ascending: true })
        .limit(500)
      if (error) {
        console.warn('[supabase] replay notes failed', error.message)
        return
      }
      for (const row of (data ?? []) as NoteRow[]) {
        if (row.updated_at && row.updated_at > this.lastNoteEventAt) {
          this.lastNoteEventAt = row.updated_at
        }
        this.emit('note:upsert', noteFromRow(row))
      }
      if (data && data.length > 0) {
        console.log(`[supabase] replayed ${data.length} notes since ${sinceIso}`)
      }
    } catch (err) {
      console.warn('[supabase] replay notes threw', err)
    }
  }

  /**
   * Send an instant broadcast to all other devices in this workspace.
   * Fire-and-forget: we don't wait for an ack. The DB mutation happens
   * separately and acts as the durable source of truth.
   */
  broadcastClipUpsert(item: ClipboardItem): void {
    if (!this.broadcastChannel) return
    void this.broadcastChannel.send({
      type: 'broadcast',
      event: 'clip:upsert',
      payload: { item, from: this.clientId },
    })
  }

  broadcastClipDeleted(id: string): void {
    if (!this.broadcastChannel) return
    void this.broadcastChannel.send({
      type: 'broadcast',
      event: 'clip:deleted',
      payload: { id, from: this.clientId },
    })
  }

  broadcastNoteUpsert(note: Note): void {
    if (!this.broadcastChannel) return
    void this.broadcastChannel.send({
      type: 'broadcast',
      event: 'note:upsert',
      payload: { note, from: this.clientId },
    })
  }

  broadcastNoteDeleted(id: string): void {
    if (!this.broadcastChannel) return
    void this.broadcastChannel.send({
      type: 'broadcast',
      event: 'note:deleted',
      payload: { id, from: this.clientId },
    })
  }

  private unsubscribeRealtime(): void {
    this.stopHeartbeat()
    if (this.clipChannel) {
      void this.client?.removeChannel(this.clipChannel)
      this.clipChannel = null
    }
    if (this.noteChannel) {
      void this.client?.removeChannel(this.noteChannel)
      this.noteChannel = null
    }
    if (this.broadcastChannel) {
      void this.client?.removeChannel(this.broadcastChannel)
      this.broadcastChannel = null
    }
  }
}

