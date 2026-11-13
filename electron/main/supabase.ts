/**
 * Snipotter — Supabase service (main process)
 *
 * Handles anonymous auth, workspace pairing, and workspace-scoped CRUD.
 * No email/password — devices are linked via 6-char pair codes.
 */
import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { clearSpaceCodecs, codec, codecFor, E2ECodec, setCodec } from '@shared/crypto/codec'
import WebSocket from 'ws'
import { activeSpaceStore, authStorage, preferredWorkspace, workspaceKeyStore } from './store'
import {
  activateWorkspaceKey, commitEncryption, forgetWorkspaceKey, prepareEncryption, recoverWithWords,
  type KeyStatus, type PreparedKey,
} from '@shared/crypto/workspaceKey'
import { encryptExistingData, hasPlainData, type MigrationProgress } from '@shared/crypto/migrate'
import {
  approveKeyRequest, declineKeyRequest, pendingKeyRequests, requestKey, type KeyRequest, type PendingPair,
} from '@shared/crypto/pairing'
import {
  createInvite, createSpace, joinSpace, listMembers, loadSpaces, previewInvite, removeMember, renameSpace, setMyName,
  type Space, type SpaceInvite, type SpaceMember,
} from '@shared/crypto/spaces'
import type {
  ClipboardItem,
  Note,
  SnipotterUser,
  Workspace,
  WorkspaceMember,
  PairCode,
  ChannelStatus,
  DiagnosticsState,
  SendToPhoneRequest,
  NoteSyncState,
  NoteVersion,
  TrashedNote,
  Notebook,
} from '@shared/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  notebook_id?: string | null
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

function mapStatus(s: string): ChannelStatus {
  if (s === 'SUBSCRIBED') return 'subscribed'
  if (s === 'CHANNEL_ERROR') return 'channel_error'
  if (s === 'TIMED_OUT') return 'timed_out'
  if (s === 'CLOSED') return 'closed'
  return 'connecting'
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

// Rows pass through the end-to-end codec (a no-op until the workspace is encrypted).
const openClip = async (r: ClipboardRow): Promise<ClipboardItem> => clipboardFromRow(await codec().openRow('clipboard_items', r))
const openNote = async (r: NoteRow): Promise<Note> => noteFromRow(await codecFor(r.workspace_id).openRow('notes', r))
const openClips = (rows: unknown[] | null): Promise<ClipboardItem[]> => Promise.all(((rows ?? []) as ClipboardRow[]).map(openClip))
const openNotes = (rows: unknown[] | null): Promise<Note[]> => Promise.all(((rows ?? []) as NoteRow[]).map(openNote))

interface NotebookRow {
  id: string
  workspace_id: string
  parent_id: string | null
  name: string
  icon: string | null
  sort: number
}

function notebookFromRow(r: NotebookRow): Notebook {
  return { id: r.id, workspaceId: r.workspace_id, parentId: r.parent_id, name: r.name, icon: r.icon, sort: r.sort }
}

async function openNotebook(r: NotebookRow): Promise<Notebook> {
  const open = await codec().openRow('notebooks', r)
  return notebookFromRow({ ...open, name: open.name || 'Kilitli defter' })
}

function noteFromRow(row: NoteRow): Note {
  return {
    id: row.id,
    userId: row.created_by ?? row.workspace_id,
    workspaceId: row.workspace_id,
    title: row.title,
    content: row.content,
    pinned: row.pinned,
    fromClipboardId: row.from_clipboard_id,
    ai: row.ai,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    synced: true,
    notebookId: row.notebook_id ?? null,
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
  /** Broadcasts of the open shared space (notes only); null while notes are personal. */
  private spaceChannel: RealtimeChannel | null = null
  /** Open shared space for notes; null = personal notes. Clipboard is always personal. */
  private spaceId: string | null = null
  private spaces: Space[] = []
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
  // Live diagnostics — populated by channel subscribe callbacks and event handlers.
  private diagChannels: { clip: ChannelStatus; note: ChannelStatus; broadcast: ChannelStatus } = {
    clip: 'idle',
    note: 'idle',
    broadcast: 'idle',
  }
  private diagRecentClipEvents: DiagnosticsState['recentClipEvents'] = []

  recordClipEvent(
    source: 'broadcast' | 'postgres_changes' | 'replay',
    item: ClipboardItem,
    insertedByThisDevice: boolean,
  ): void {
    this.diagRecentClipEvents.unshift({
      timestamp: Date.now(),
      source,
      itemId: item.id,
      contentType: item.contentType,
      snippet: item.text.slice(0, 60),
      insertedByThisDevice,
    })
    if (this.diagRecentClipEvents.length > 10) this.diagRecentClipEvents.length = 10
  }

  getDiagnosticsSnapshot(): {
    workspaceId: string | null
    userId: string | null
    clientId: string
    channels: { clip: ChannelStatus; note: ChannelStatus; broadcast: ChannelStatus }
    recentClipEvents: DiagnosticsState['recentClipEvents']
  } {
    return {
      workspaceId: this.workspaceId,
      userId: this.user?.id ?? null,
      clientId: this.clientId,
      channels: { ...this.diagChannels },
      recentClipEvents: [...this.diagRecentClipEvents],
    }
  }

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
          // Electron's main process runs Node.js (20.x in Electron 33) which
          // has no native WebSocket global. Without an explicit transport,
          // realtime-js's websocket-factory throws and channels silently stay
          // in 'connecting' forever — the actual root cause of the cross-device
          // mirror not working. Pass `ws` so RealtimeClient can connect.
          transport: WebSocket as unknown as typeof globalThis.WebSocket,
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
    setCodec(new E2ECodec(null))
    clearSpaceCodecs()
    workspaceKeyStore.clear()
    activeSpaceStore.set(null)
    this.spaces = []
    this.spaceId = null
    this.e2eStatus = 'unknown'
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
    if (memberErr) throw memberErr
    if (!memberRows || memberRows.length === 0) {
      this.workspaceId = null
      this.workspace = null
      return null
    }
    // After pairing or recovery this device may belong to more than one workspace.
    const preferred = preferredWorkspace.get()
    const member = memberRows.find((m) => m.workspace_id === preferred) ?? memberRows[0]
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
    // Keys before realtime: incoming rows must already be decryptable.
    await this.refreshE2EStatus()
    await this.subscribeRealtime()
    return this.workspace
  }

  // ── End-to-end encryption (docs/sifreleme-tasarimi.md) ──────────────────────

  e2eStatus: KeyStatus | 'unknown' = 'unknown'
  private preparedKey: PreparedKey | null = null

  async refreshE2EStatus(): Promise<KeyStatus | 'unknown'> {
    if (!this.client || !this.workspaceId) return this.e2eStatus
    try {
      this.e2eStatus = await activateWorkspaceKey(this.client, workspaceKeyStore, this.workspaceId)
    } catch (err) {
      console.warn('[e2e] activation failed', (err as Error).message)
    }
    this.emit('e2e:status', this.e2eStatus)
    await this.refreshSpaces()
    return this.e2eStatus
  }

  // ── Shared spaces (docs/ortak-alan-tasarimi.md) ─────────────────────────────

  private get notesWs(): string | null {
    return this.spaceId ?? this.workspaceId
  }

  private nc(): E2ECodec {
    return codecFor(this.notesWs)
  }

  private requirePerson(): { client: SupabaseClient; personId: string } {
    if (!this.client || !this.workspaceId) throw new Error('Senkron hazır değil')
    if (this.e2eStatus !== 'ready') throw new Error('Ortak alan için önce şifrelemeyi tamamla')
    return { client: this.client, personId: this.workspaceId }
  }

  getSpaceState(): { spaces: Space[]; activeId: string | null } {
    return { spaces: this.spaces, activeId: this.spaceId }
  }

  /** Reloads spaces and their keys; falls back to personal notes if the open space is gone. */
  async refreshSpaces(): Promise<{ spaces: Space[]; activeId: string | null }> {
    if (!this.client || !this.workspaceId || this.e2eStatus !== 'ready') {
      this.spaces = []
    } else {
      try {
        this.spaces = await loadSpaces(this.client, this.workspaceId, codec())
      } catch (err) {
        console.warn('[spaces] load failed', (err as Error).message)
      }
    }
    const wanted = this.spaceId ?? activeSpaceStore.get()
    const next = wanted && this.spaces.some((s) => s.id === wanted) ? wanted : null
    if (next !== this.spaceId) await this.openSpace(next)
    else this.emit('spaces:changed', this.getSpaceState())
    return this.getSpaceState()
  }

  /** Switches the notes view between personal (null) and a shared space. */
  async openSpace(spaceId: string | null): Promise<{ spaces: Space[]; activeId: string | null }> {
    if (spaceId && !this.spaces.some((s) => s.id === spaceId)) throw new Error('Bu ortak alana üye değilsin')
    this.spaceId = spaceId
    activeSpaceStore.set(spaceId)
    this.lastNoteEventAt = new Date(0).toISOString()
    await this.subscribeRealtime()
    this.emit('spaces:changed', this.getSpaceState())
    return this.getSpaceState()
  }

  async spaceCreate(name: string, myName: string): Promise<Space> {
    const { client, personId } = this.requirePerson()
    const space = await createSpace(client, personId, codec(), name, myName)
    await this.refreshSpaces()
    await this.openSpace(space.id)
    return space
  }

  async spaceJoin(input: string, myName: string): Promise<Space> {
    const { client, personId } = this.requirePerson()
    const space = await joinSpace(client, personId, codec(), input, myName)
    await this.refreshSpaces()
    await this.openSpace(space.id)
    return space
  }

  spacePreview(input: string): Promise<{ name: string }> {
    const { client } = this.requirePerson()
    return previewInvite(client, input)
  }

  spaceInvite(spaceId: string): Promise<SpaceInvite> {
    const { client, personId } = this.requirePerson()
    return createInvite(client, personId, codec(), spaceId)
  }

  spaceMembers(spaceId: string): Promise<SpaceMember[]> {
    const { client, personId } = this.requirePerson()
    return listMembers(client, personId, codecFor(spaceId), spaceId)
  }

  async spaceRename(spaceId: string, name: string): Promise<void> {
    const { client } = this.requirePerson()
    await renameSpace(client, codecFor(spaceId), spaceId, name)
    await this.refreshSpaces()
  }

  async spaceSetMyName(spaceId: string, name: string): Promise<void> {
    const { client, personId } = this.requirePerson()
    await setMyName(client, personId, codecFor(spaceId), spaceId, name)
  }

  /** Owner removes someone, or target = null to leave the space yourself. */
  async spaceRemove(spaceId: string, targetPersonId: string | null): Promise<void> {
    const { client, personId } = this.requirePerson()
    await removeMember(client, personId, spaceId, targetPersonId ?? personId)
    await this.refreshSpaces()
  }

  /** "Send to space": a clip becomes a note in a shared space. */
  async createNoteIn(spaceId: string, partial: Partial<Note>): Promise<Note | null> {
    if (!this.client || !this.user) return null
    if (!this.spaces.some((s) => s.id === spaceId)) throw new Error('Bu ortak alana üye değilsin')
    const row = await codecFor(spaceId).sealRow('notes', {
      id: randomUUID(),
      workspace_id: spaceId,
      created_by: this.user.id,
      title: partial.title ?? null,
      content: partial.content ?? '',
      pinned: false,
    })
    const { data, error } = await this.client.from('notes').insert(row).select('*').single()
    if (error) throw new Error(error.message)
    const note = await openNote(data as NoteRow)
    if (spaceId === this.spaceId) this.broadcastNoteUpsert(note)
    return note
  }

  /** Step 1: new key + 24 recovery words; nothing is stored until the user confirms them. */
  e2ePrepare(): { words: string[] } {
    const { workspaceId } = this.requireSync()
    this.preparedKey = prepareEncryption(workspaceId)
    return { words: this.preparedKey.words }
  }

  /** Step 2: the user typed back some of the words; only then is encryption switched on. */
  async e2eCommit(answers: Array<{ index: number; word: string }>): Promise<'enabled' | 'lost-race'> {
    const { client } = this.requireSync()
    const prepared = this.preparedKey
    if (!prepared) throw new Error('Önce kurtarma kelimelerini oluştur')
    const ok = answers.length >= 3 && answers.every((a) => prepared.words[a.index] === a.word.trim().toLowerCase())
    if (!ok) throw new Error('Kelimeler eşleşmedi; kurtarma kelimelerini tekrar kontrol et')
    const enabled = await commitEncryption(client, workspaceKeyStore, prepared)
    this.preparedKey = null
    await this.refreshE2EStatus()
    return enabled ? 'enabled' : 'lost-race'
  }

  async e2eHasPlainData(): Promise<boolean> {
    const { client, workspaceId } = this.requireSync()
    return this.e2eStatus === 'ready' ? hasPlainData(client, workspaceId) : false
  }

  async e2eMigrate(onProgress: (p: MigrationProgress) => void): Promise<void> {
    const { client, workspaceId } = this.requireSync()
    await encryptExistingData(client, workspaceId, onProgress)
  }

  // ── New device by approval (migration 0016) ──
  private pairWait: { id: string; ctrl: AbortController; pending: PendingPair } | null = null

  /** This device asks the others for the key; returns the code both screens show. */
  async e2ePairStart(deviceName: string): Promise<{ id: string; code: string }> {
    const { client, workspaceId } = this.requireSync()
    this.pairWait?.ctrl.abort()
    const pending = await requestKey(client, workspaceKeyStore, workspaceId, deviceName)
    this.pairWait = { id: pending.id, ctrl: new AbortController(), pending }
    return { id: pending.id, code: pending.code }
  }

  /** Resolves once another device approved; the key is then stored and active. */
  async e2ePairWait(id: string): Promise<void> {
    const w = this.pairWait
    if (!w || w.id !== id) throw new Error('Eşleştirme isteği bulunamadı')
    await w.pending.wait(w.ctrl.signal)
    this.pairWait = null
    await this.refreshE2EStatus()
    await this.subscribeRealtime()
  }

  e2ePairCancel(): void {
    this.pairWait?.ctrl.abort()
    this.pairWait = null
  }

  /** Other devices waiting for this device's "Onayla". */
  async pairRequests(): Promise<KeyRequest[]> {
    if (!this.client || !this.workspaceId || !this.user || this.e2eStatus !== 'ready') return []
    return pendingKeyRequests(this.client, this.workspaceId, this.user.id)
  }

  async pairApprove(id: string): Promise<void> {
    const { client, workspaceId } = this.requireSync()
    await approveKeyRequest(client, workspaceKeyStore, workspaceId, id)
    this.emit('pair:requests', await this.pairRequests())
  }

  async pairDecline(id: string): Promise<void> {
    const { client } = this.requireSync()
    await declineKeyRequest(client, id)
    this.emit('pair:requests', await this.pairRequests())
  }

  /** All devices lost: the 24 recovery words bring the workspace back to this device. */
  async e2eJoin(words: string, deviceName: string): Promise<Workspace | null> {
    if (!this.client) throw new Error('Supabase not configured')
    await this.ensureAnonymousSession()
    const workspaceId = await recoverWithWords(this.client, workspaceKeyStore, words, deviceName)
    preferredWorkspace.set(workspaceId)
    this.unsubscribeRealtime()
    return this.fetchCurrentWorkspace()
  }

  async ensureWorkspace(deviceName?: string): Promise<Workspace | null> {
    if (!this.client) return null
    // Oturum çıkıştan sonra veya açılışta anonim giriş başarısız olduysa boş
    // olabilir; RPC'ler auth.uid() gerektirdiği için önce oturumu garanti et.
    await this.ensureAnonymousSession()
    if (!this.user) return null
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
    await this.ensureAnonymousSession()
    const { data, error } = await this.client.rpc('create_pair_code')
    if (error) throw error
    return {
      code: data as string,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }
  }

  async redeemPairCode(code: string, deviceName?: string): Promise<Workspace | null> {
    if (!this.client) throw new Error('Supabase not configured')
    await this.ensureAnonymousSession()
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
    await forgetWorkspaceKey(workspaceKeyStore, this.workspaceId)
    clearSpaceCodecs()
    activeSpaceStore.set(null)
    this.spaces = []
    this.spaceId = null
    if (preferredWorkspace.get() === this.workspaceId) preferredWorkspace.set(null)
    this.e2eStatus = 'unknown'
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

  async listClipboard(limit = 500): Promise<ClipboardItem[]> {
    if (!this.client || !this.workspaceId) return []
    const { data, error } = await this.client
      .from('clipboard_items')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return openClips(data)
  }

  async insertClipboard(
    item: Omit<ClipboardItem, 'id' | 'userId' | 'synced'>,
  ): Promise<ClipboardItem | null> {
    if (!this.client || !this.workspaceId || !this.user) return null
    const payload = await codec().sealRow('clipboard_items', {
      id: randomUUID(),
      workspace_id: this.workspaceId,
      created_by: this.user.id,
      content_type: item.contentType,
      text: item.text,
      hash: item.hash,
      html: item.html ?? null,
      source_app: item.sourceApp ?? null,
      pinned: item.pinned,
      ai: item.ai ?? null,
    })
    const { data, error } = await this.client
      .from('clipboard_items')
      .insert(payload)
      .select('*')
      .single()
    if (error) {
      console.warn('[supabase] insert clipboard failed', error.message)
      return null
    }
    return openClip(data as ClipboardRow)
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
    return data ? openClip(data as ClipboardRow) : null
  }

  /**
   * Same text saved recently by another device. Hashes differ across devices
   * (desktop hashes text + HTML, mobile hashes trimmed text), so iPhone copies
   * arriving via Universal Clipboard would otherwise be saved twice.
   */
  async findRecentClipboardByText(text: string, windowMs = 10 * 60 * 1000): Promise<ClipboardItem | null> {
    const trimmed = text.trim()
    // Encrypted workspaces dedupe by the shared keyed hash; ciphertext cannot be compared.
    if (codec().enabled || !this.client || !this.workspaceId || !trimmed || trimmed.length > 2000) return null
    const { data, error } = await this.client
      .from('clipboard_items')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('text', trimmed)
      .gte('created_at', new Date(Date.now() - windowMs).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.warn('[supabase] find by text failed', error.message)
      return null
    }
    return data ? openClip(data as ClipboardRow) : null
  }

  /**
   * Bump an existing clipboard row's created_at to "now" so it floats back
   * to the top of the list (which is sorted by created_at desc). The
   * touch_updated_at trigger handles updated_at automatically.
   */
  async touchClipboard(
    id: string,
    file?: Pick<ClipboardItem, 'contentType' | 'text' | 'html' | 'sourceApp' | 'ai'>,
  ): Promise<ClipboardItem | null> {
    if (!this.client || !this.workspaceId) return null
    const updates: Record<string, unknown> = { created_at: new Date().toISOString() }
    // A prior failed capture may have stored plain text under this same hash.
    // Re-copying a file must repair its payload, not just bump that stale row.
    if (file?.contentType === 'file') {
      const { id: _id, ...sealed } = await codec().sealRow('clipboard_items', {
        id, text: file.text, html: file.html ?? null, ai: file.ai ?? null,
      })
      Object.assign(updates, { content_type: file.contentType, source_app: file.sourceApp ?? null, ...sealed })
    }
    const { data, error } = await this.client
      .from('clipboard_items')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', this.workspaceId)
      .select('*')
      .single()
    if (error) {
      console.warn('[supabase] touch clipboard failed', error.message)
      return null
    }
    return openClip(data as ClipboardRow)
  }

  /**
   * "Telefona gönder": queue an action for the paired iPhone. The row lands in
   * device_actions (RLS: workspace members); a database webhook turns it into
   * an APNs push and the open iOS app also receives it via realtime.
   * sender_user_id / created_at / expires_at come from column defaults.
   */
  async insertDeviceAction(
    action: SendToPhoneRequest,
    senderDevice: string,
  ): Promise<{ id: string }> {
    if (!this.client || !this.workspaceId || !this.user) {
      throw new Error('Önce bir çalışma alanına bağlanın.')
    }
    const clipId = action.clipId && UUID_RE.test(action.clipId) ? action.clipId : null
    const { data, error } = await this.client
      .from('device_actions')
      .insert(await codec().sealRow('device_actions', {
        id: randomUUID(),
        workspace_id: this.workspaceId,
        sender_device: senderDevice.slice(0, 200) || 'Masaüstü',
        target_platform: 'ios',
        kind: action.kind,
        payload: action.payload,
        label: action.label ?? null,
        clip_id: clipId,
      }))
      .select('id')
      .single()
    if (error) {
      // 0009_action_bridge.sql rate-limit trigger raises P0001.
      if (error.code === 'P0001' || /rate limit/i.test(error.message)) {
        throw new Error('Çok sık gönderim yapıldı. Biraz bekleyip tekrar deneyin.')
      }
      throw new Error(`Telefona gönderilemedi: ${error.message}`)
    }
    return { id: (data as { id: string }).id }
  }

  async updateClipboardAI(id: string, ai: ClipboardItem['ai']): Promise<void> {
    if (!this.client || !this.workspaceId) return
    const { error } = await this.client.from('clipboard_items').update({ ai: (await codec().sealRow('clipboard_items', { id, ai })).ai }).eq('id', id)
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

  async deleteClipboardMany(ids: string[]): Promise<void> {
    if (!this.client || !this.workspaceId || ids.length === 0) return
    const { error } = await this.client
      .from('clipboard_items')
      .delete()
      .in('id', ids)
    if (error) throw new Error(`[supabase] deleteClipboardMany: ${error.message}`)
  }

  async deleteAllClipboard(): Promise<void> {
    if (!this.client || !this.workspaceId) return
    const { error } = await this.client
      .from('clipboard_items')
      .delete()
      .eq('workspace_id', this.workspaceId)
      .eq('pinned', false)
    if (error) throw new Error(`[supabase] deleteAllClipboard: ${error.message}`)
  }

  async listNotes(): Promise<Note[]> {
    if (!this.client || !this.notesWs) return []
    const { data, error } = await this.client
      .from('notes')
      .select('*')
      .eq('workspace_id', this.notesWs)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (error) throw error
    return openNotes(data)
  }

  /** New note in the open notes space, or always personal (e.g. a clip saved as a note). */
  async createNote(partial: Partial<Note>, personal = false): Promise<Note | null> {
    const ws = personal ? this.workspaceId : this.notesWs
    if (!this.client || !ws || !this.user) return null
    const payload = await codecFor(ws).sealRow('notes', {
      id: randomUUID(),
      workspace_id: ws,
      created_by: this.user.id,
      title: partial.title ?? null,
      content: partial.content ?? '',
      pinned: partial.pinned ?? false,
      from_clipboard_id: partial.fromClipboardId ?? null,
      ai: partial.ai ?? null,
    })
    const { data, error } = await this.client.from('notes').insert(payload).select('*').single()
    if (error) {
      console.warn('[supabase] create note failed', error.message)
      return null
    }
    return openNote(data as NoteRow)
  }

  async updateNote(id: string, partial: Partial<Note>): Promise<Note | null> {
    if (!this.client || !this.notesWs) return null
    const updates: Record<string, unknown> = {}
    if (partial.title !== undefined) updates['title'] = partial.title
    if (partial.content !== undefined) updates['content'] = partial.content
    if (partial.pinned !== undefined) updates['pinned'] = partial.pinned
    if (partial.ai !== undefined) updates['ai'] = partial.ai
    // With a space open the note may still be personal (AI summary of a saved clip): seal with its own key.
    let ws = this.notesWs
    if (this.spaceId) {
      const { data: row } = await this.client.from('notes').select('workspace_id').eq('id', id).maybeSingle()
      ws = (row as { workspace_id?: string } | null)?.workspace_id ?? ws
    }
    const { id: _id, ...sealed } = await codecFor(ws).sealRow('notes', { id, ...updates })
    const { data, error } = await this.client
      .from('notes')
      .update(sealed)
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      console.warn('[supabase] update note failed', error.message)
      return null
    }
    return openNote(data as NoteRow)
  }

  // ── Yjs note sync (shared/notes/sync.ts). These throw so the renderer can tell
  // "offline" from "empty" and keep edits locally until the next resync.

  private requireSync(): { client: SupabaseClient; workspaceId: string } {
    if (!this.client || !this.workspaceId) throw new Error('Senkron hazır değil')
    return { client: this.client, workspaceId: this.workspaceId }
  }

  /** Notes live in the personal workspace or in the open shared space. */
  private requireNotes(): { client: SupabaseClient; workspaceId: string } {
    if (!this.client || !this.notesWs) throw new Error('Senkron hazır değil')
    return { client: this.client, workspaceId: this.notesWs }
  }

  async noteSyncLoad(noteId: string): Promise<NoteSyncState | null> {
    const { client } = this.requireNotes()
    const { data, error } = await client
      .from('notes')
      .select('ydoc, ydoc_seq, content, ydoc_content_sha')
      .eq('id', noteId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const seq = Number(data.ydoc_seq ?? 0)
    const open = await this.nc().openRow('notes', { id: noteId, content: (data.content as string) ?? '' })
    return {
      ydoc: data.ydoc ? await this.nc().openNoteBlob(noteId, 'ydoc', data.ydoc as string) : null,
      seq,
      content: open.content,
      contentSha: data.ydoc_content_sha as string | null,
      updates: await this.noteUpdatesAfter(noteId, seq),
    }
  }

  async noteUpdatesAfter(noteId: string, afterId: number): Promise<Array<{ id: number; update: string }>> {
    const { client } = this.requireNotes()
    const out: Array<{ id: number; update: string }> = []
    let cursor = afterId
    for (;;) {
      const { data, error } = await client
        .from('note_updates')
        .select('id, update')
        .eq('note_id', noteId)
        .gt('id', cursor)
        .order('id', { ascending: true })
        .limit(1000)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as Array<{ id: number; update: string }>
      for (const r of rows) out.push({ id: r.id, update: await this.nc().openNoteBlob(noteId, 'update', r.update) })
      if (rows.length < 1000) return out
      cursor = rows[rows.length - 1].id
    }
  }

  async notePushUpdate(noteId: string, plain: string): Promise<void> {
    const { client, workspaceId } = this.requireNotes()
    const update = await this.nc().sealNoteBlob(noteId, 'update', plain)
    void this.noteBus?.send({ type: 'broadcast', event: 'note:y', payload: { noteId, update, from: this.clientId } })
    const { error } = await client.from('note_updates').insert({ note_id: noteId, workspace_id: workspaceId, update })
    if (error) throw new Error(error.message)
  }

  async noteSaveContent(noteId: string, content: string, contentSha: string): Promise<Note> {
    const { client } = this.requireNotes()
    const { data, error } = await client
      .from('notes')
      .update({ content: (await this.nc().sealRow('notes', { id: noteId, content })).content, ydoc_content_sha: contentSha })
      .eq('id', noteId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    const note = await openNote(data as NoteRow)
    this.broadcastNoteUpsert(note)
    return note
  }

  async noteCompact(noteId: string, ydoc: string, seq: number, content: string, contentSha: string): Promise<boolean> {
    const { client } = this.requireNotes()
    const { data, error } = await client.rpc('compact_note', {
      p_note_id: noteId,
      p_ydoc: await this.nc().sealNoteBlob(noteId, 'ydoc', ydoc),
      p_seq: seq,
      p_content: (await this.nc().sealRow('notes', { id: noteId, content })).content,
      p_content_sha: contentSha,
    })
    if (error) throw new Error(error.message)
    return data === true
  }

  async noteSaveVersion(noteId: string, content: string, kind: 'auto' | 'manual' | 'restore'): Promise<void> {
    const { client, workspaceId } = this.requireNotes()
    const row = await this.nc().sealRow('note_versions', { id: randomUUID(), note_id: noteId, workspace_id: workspaceId, kind, content })
    const { error } = await client.from('note_versions').insert(row)
    if (error) throw new Error(error.message)
  }

  // ── Notebooks (migration 0013) ──────────────────────────────────────────────

  /** Empty when the server predates notebooks. */
  async listNotebooks(): Promise<Notebook[]> {
    const { client, workspaceId } = this.requireNotes()
    const { data, error } = await client.from('notebooks').select('*').eq('workspace_id', workspaceId).order('sort')
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return []
      throw new Error(error.message)
    }
    return Promise.all(((data ?? []) as NotebookRow[]).map(openNotebook))
  }

  async createNotebook(name: string, parentId: string | null): Promise<Notebook> {
    const { client, workspaceId } = this.requireNotes()
    const { data, error } = await client
      .from('notebooks')
      .insert(await this.nc().sealRow('notebooks', { id: randomUUID(), workspace_id: workspaceId, name: name.trim(), parent_id: parentId }))
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return openNotebook(data as NotebookRow)
  }

  async updateNotebook(id: string, patch: { name?: string; parentId?: string | null; sort?: number }): Promise<Notebook> {
    const { client } = this.requireNotes()
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = (await this.nc().sealRow('notebooks', { id, name: patch.name.trim() })).name
    if (patch.parentId !== undefined) row.parent_id = patch.parentId
    if (patch.sort !== undefined) row.sort = patch.sort
    const { data, error } = await client.from('notebooks').update(row).eq('id', id).select('*').single()
    if (error) throw new Error(error.message)
    return openNotebook(data as NotebookRow)
  }

  async deleteNotebook(id: string): Promise<void> {
    const { client } = this.requireNotes()
    const { error } = await client.from('notebooks').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async moveNote(noteId: string, notebookId: string | null): Promise<Note> {
    const { client } = this.requireNotes()
    const { data, error } = await client.from('notes').update({ notebook_id: notebookId }).eq('id', noteId).select('*').single()
    if (error) throw new Error(error.message)
    const note = await openNote(data as NoteRow)
    this.broadcastNoteUpsert(note)
    return note
  }

  /** Uploads a note image into <workspace>/<note>/<uuid>.<ext> and returns that path. */
  async noteAssetUpload(noteId: string, mime: string, bytes: Buffer, ext: string): Promise<string> {
    const { client, workspaceId } = this.requireNotes()
    const path = `${workspaceId}/${noteId}/${randomUUID()}.${ext}`
    const body = this.nc().enabled ? Buffer.from(await this.nc().sealFile(path, new Uint8Array(bytes))) : bytes
    const { error } = await client.storage.from('note-assets').upload(path, body, { contentType: mime, upsert: false })
    if (error) throw new Error(error.message)
    return path
  }

  /** Signed URL for an image of the active workspace only. */
  async noteAssetUrl(path: string): Promise<string> {
    const { client, workspaceId } = this.requireNotes()
    if (!path.startsWith(`${workspaceId}/`) || path.includes('..')) throw new Error('Görsel bu çalışma alanına ait değil')
    const { data, error } = await client.storage.from('note-assets').createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Görsel bağlantısı alınamadı')
    if (!this.nc().enabled) return data.signedUrl
    // Encrypted workspace: decrypt here and hand the renderer a data: URL. Images stored
    // before encryption fail authentication and are shown as they are.
    const res = await fetch(data.signedUrl)
    if (!res.ok) throw new Error(`Görsel indirilemedi (${res.status})`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const plain = await this.nc().openFile(path, bytes).catch(() => bytes)
    const ext = path.split('.').pop() ?? 'jpeg'
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${Buffer.from(plain).toString('base64')}`
  }

  /**
   * Moves notes to the trash (migration 0011). Returns false when the server
   * predates it, so callers fall back to a permanent delete.
   */
  private async trashNotes(ids: string[]): Promise<boolean> {
    const { client } = this.requireNotes()
    const { error } = await client.rpc('trash_notes', { p_ids: ids })
    if (!error) return true
    if (error.code === 'PGRST202') return false
    throw new Error(`[supabase] trash notes: ${error.message}`)
  }

  async listTrash(): Promise<TrashedNote[]> {
    const { client, workspaceId } = this.requireNotes()
    const { data, error } = await client
      .from('notes_trash')
      .select('id, deleted_at, title:note->>title, content:note->>content')
      .eq('workspace_id', workspaceId)
      .order('deleted_at', { ascending: false })
      .limit(500)
    if (error) throw new Error(error.message)
    return Promise.all(((data ?? []) as unknown as Array<{ id: string; deleted_at: string; title: string | null; content: string | null }>)
      .map(async (r) => {
        const open = await this.nc().openRow('notes', { id: r.id, title: r.title, content: r.content ?? '' })
        return { id: r.id, title: open.title, content: open.content, deletedAt: r.deleted_at }
      }))
  }

  async restoreNotes(ids: string[]): Promise<Note[]> {
    const { client } = this.requireNotes()
    const { error } = await client.rpc('restore_notes', { p_ids: ids })
    if (error) throw new Error(error.message)
    const { data, error: readError } = await client.from('notes').select('*').in('id', ids)
    if (readError) throw new Error(readError.message)
    const notes = await openNotes(data)
    notes.forEach((n) => this.broadcastNoteUpsert(n))
    return notes
  }

  async purgeTrashedNotes(ids: string[]): Promise<void> {
    const { client } = this.requireNotes()
    const { error } = await client.rpc('purge_trashed_notes', { p_ids: ids })
    if (error) throw new Error(error.message)
  }

  async listNoteVersions(noteId: string): Promise<NoteVersion[]> {
    const { client } = this.requireNotes()
    const { data, error } = await client
      .from('note_versions')
      .select('id, kind, created_at, content')
      .eq('note_id', noteId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return Promise.all(((data ?? []) as Array<{ id: string; kind: NoteVersion['kind']; created_at: string; content: string }>)
      .map(async (r) => {
        const open = await this.nc().openRow('note_versions', r)
        return { id: r.id, kind: r.kind, createdAt: r.created_at, content: open.content }
      }))
  }

  async deleteNote(id: string): Promise<void> {
    if (!this.client || !this.notesWs) return
    if (await this.trashNotes([id])) return
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
        p_workspace_id: this.notesWs,
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

  async deleteNotesMany(ids: string[]): Promise<void> {
    if (!this.client || !this.notesWs || ids.length === 0) return
    if (await this.trashNotes(ids)) return
    const { error } = await this.client
      .from('notes')
      .delete()
      .in('id', ids)
    if (error) throw new Error(`[supabase] deleteNotesMany: ${error.message}`)
  }

  private async subscribeRealtime(): Promise<void> {
    if (!this.client || !this.workspaceId) return
    this.unsubscribeRealtime()

    const wsId = this.workspaceId

    this.diagChannels.clip = 'connecting'
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
          void openClip(row).then((item) => {
            this.recordClipEvent('postgres_changes', item, false)
            this.emit('clip:upsert', item)
          })
        },
      )
      // A new device asking for the key ("Onayla" prompt on this device).
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'key_requests', filter: `workspace_id=eq.${wsId}` },
        () => void this.pairRequests().then((r) => this.emit('pair:requests', r)).catch(() => undefined),
      )
      .subscribe((status, err) => {
        this.diagChannels.clip = mapStatus(status)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[supabase] clipboard channel error', status, err)
          this.emit('connection:state', { ready: false, reason: status })
          this.scheduleReconnect()
        } else if (status === 'SUBSCRIBED') {
          console.log('[supabase] clipboard realtime active')
          this.emit('connection:state', { ready: true })
          void this.replayClipsSince(this.lastClipEventAt)
        }
      })

    this.diagChannels.note = 'connecting'
    const notesWs = this.notesWs ?? wsId
    this.noteChannel = this.client
      .channel(`notes-${notesWs}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `workspace_id=eq.${notesWs}` },
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
          void openNote(row).then((note) => this.emit('note:upsert', note))
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'note_updates', filter: `workspace_id=eq.${notesWs}` },
        (payload) => {
          const row = payload.new as { note_id?: string; update?: string }
          if (row.note_id && row.update) this.emitNoteY(row.note_id, row.update)
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notebooks', filter: `workspace_id=eq.${notesWs}` },
        () => this.emit('notebooks:changed'),
      )
      .subscribe((status, err) => {
        this.diagChannels.note = mapStatus(status)
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
    const personal = this.client
      .channel(`sync-${wsId}`, {
        config: {
          broadcast: { self: false, ack: false },
        },
      })
      .on('broadcast', { event: 'clip:upsert' }, async ({ payload }) => {
        if (payload?.from === this.clientId) return // ignore own echo
        const body = await codec().openBroadcast('clip:upsert', payload ?? {})
        if (!body?.item) return
        const item = body.item as ClipboardItem
        if (item.createdAt && item.createdAt > this.lastClipEventAt) {
          this.lastClipEventAt = item.createdAt
        }
        this.recordClipEvent('broadcast', item, false)
        this.emit('clip:upsert', item)
      })
      .on('broadcast', { event: 'clip:deleted' }, ({ payload }) => {
        if (payload?.from === this.clientId) return
        if (payload?.id) this.emit('clip:deleted', payload.id as string)
      })
    // Note events ride the personal channel, or the space's own channel when one is open.
    const noteBus = notesWs === wsId ? personal : this.client.channel(`sync-${notesWs}`, { config: { broadcast: { self: false, ack: false } } })
    this.registerNoteBroadcasts(noteBus)
    if (noteBus !== personal) {
      this.spaceChannel = noteBus.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') this.scheduleReconnect()
      })
    }
    this.broadcastChannel = personal
      .subscribe((status, err) => {
        this.diagChannels.broadcast = mapStatus(status)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[supabase] broadcast channel error', status, err)
          this.scheduleReconnect()
        } else if (status === 'SUBSCRIBED') {
          console.log('[supabase] instant-broadcast channel active')
          this.startHeartbeat()
        }
      })
    this.diagChannels.broadcast = 'connecting'
  }

  private registerNoteBroadcasts(channel: RealtimeChannel): void {
    channel
      .on('broadcast', { event: 'note:upsert' }, async ({ payload }) => {
        if (payload?.from === this.clientId) return
        const body = await this.nc().openBroadcast('note:upsert', payload ?? {})
        if (!body?.note) return
        const note = body.note as Note
        if (note.updatedAt && note.updatedAt > this.lastNoteEventAt) {
          this.lastNoteEventAt = note.updatedAt
        }
        this.emit('note:upsert', note)
      })
      .on('broadcast', { event: 'note:deleted' }, ({ payload }) => {
        if (payload?.from === this.clientId) return
        if (payload?.id) this.emit('note:deleted', payload.id as string)
      })
      .on('broadcast', { event: 'note:y' }, ({ payload }) => {
        if (payload?.from === this.clientId) return
        if (typeof payload?.noteId === 'string' && typeof payload?.update === 'string') {
          this.emitNoteY(payload.noteId, payload.update)
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
        this.emit('clip:upsert', await openClip(row))
      }
      if (data && data.length > 0) {
        console.log(`[supabase] replayed ${data.length} clips since ${sinceIso}`)
      }
    } catch (err) {
      console.warn('[supabase] replay clips threw', err)
    }
  }

  private async replayNotesSince(sinceIso: string): Promise<void> {
    if (!this.client || !this.notesWs) return
    if (sinceIso === new Date(0).toISOString()) return
    try {
      const { data, error } = await this.client
        .from('notes')
        .select('*')
        .eq('workspace_id', this.notesWs)
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
        this.emit('note:upsert', await openNote(row))
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
  /** Yjs updates arrive sealed (realtime row or broadcast); the renderer gets plain base64. */
  private get noteBus(): RealtimeChannel | null {
    return this.spaceChannel ?? this.broadcastChannel
  }

  private emitNoteY(noteId: string, sealed: string): void {
    void this.nc().openNoteBlob(noteId, 'update', sealed)
      .then((update) => this.emit('note:y', { noteId, update }))
      .catch(() => undefined)
  }

  /** Broadcasts travel through the server: in encrypted workspaces the payload is sealed. */
  private sendSealed(event: string, id: string, payload: Record<string, unknown>, bus: 'clip' | 'note' = 'clip'): void {
    const channel = bus === 'note' ? this.noteBus : this.broadcastChannel
    if (!channel) return
    void codecFor(bus === 'note' ? this.notesWs : this.workspaceId).sealBroadcast(event, id, payload).then((body) =>
      channel.send({ type: 'broadcast', event, payload: { ...body, from: this.clientId } }),
    )
  }

  broadcastClipUpsert(item: ClipboardItem): void {
    this.sendSealed('clip:upsert', item.id, { item })
  }

  broadcastClipDeleted(id: string): void {
    if (!this.broadcastChannel) return
    void this.broadcastChannel.send({
      type: 'broadcast',
      event: 'clip:deleted',
      payload: { id, from: this.clientId },
    })
  }

  /** Each note goes only to its own workspace's channel: a personal note never reaches a space. */
  broadcastNoteUpsert(note: Note): void {
    const ws = note.workspaceId ?? this.notesWs
    if (ws === this.notesWs) this.sendSealed('note:upsert', note.id, { note }, 'note')
    else if (ws === this.workspaceId) this.sendSealed('note:upsert', note.id, { note }, 'clip')
  }

  broadcastNoteDeleted(id: string): void {
    if (!this.noteBus) return
    void this.noteBus.send({
      type: 'broadcast',
      event: 'note:deleted',
      payload: { id, from: this.clientId },
    })
  }

  broadcastClipDeletedMany(ids: string[]): void {
    if (!this.broadcastChannel || ids.length === 0) return
    for (const id of ids) {
      void this.broadcastChannel.send({
        type: 'broadcast',
        event: 'clip:deleted',
        payload: { id, from: this.clientId },
      })
    }
  }

  broadcastNoteDeletedMany(ids: string[]): void {
    const bus = this.noteBus
    if (!bus || ids.length === 0) return
    for (const id of ids) {
      void bus.send({
        type: 'broadcast',
        event: 'note:deleted',
        payload: { id, from: this.clientId },
      })
    }
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
    if (this.spaceChannel) {
      void this.client?.removeChannel(this.spaceChannel)
      this.spaceChannel = null
    }
  }
}

