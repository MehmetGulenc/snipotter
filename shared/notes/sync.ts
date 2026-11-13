/**
 * Conflict-free note sync on top of Yjs. Platform-neutral: iOS/web and desktop
 * supply a NoteTransport (Supabase directly, or IPC to the Electron main process).
 *
 * Server model (migration 0011): notes.ydoc = compacted snapshot covering
 * note_updates ids <= notes.ydoc_seq; newer edits are rows in note_updates.
 *
 * Offline: local edits stay in the Y.Doc (persisted by `attachLocal`). Every
 * resync rebuilds the server document and pushes exactly what it lacks, so
 * nothing needs a separate outbox.
 */
import * as Y from 'yjs'
import type { Schema } from '@tiptap/pm/model'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import { toTiptapContent } from './content'

/** Field the Tiptap Collaboration extension binds to. */
export const NOTE_FRAGMENT = 'default'
export const REMOTE = Symbol('remote')
const SEED = Symbol('seed')

export interface ServerUpdate { id: number; update: string }

export interface ServerNoteState {
  ydoc: string | null
  seq: number
  content: string
  contentSha: string | null
  updates: ServerUpdate[]
}

export interface NoteTransport {
  /** Snapshot + all updates after it; null when the note no longer exists. */
  load(noteId: string): Promise<ServerNoteState | null>
  updatesAfter(noteId: string, afterId: number): Promise<ServerUpdate[]>
  push(noteId: string, update: string): Promise<void>
  /** Live updates from other devices (broadcast and/or realtime). */
  subscribe(noteId: string, onUpdate: (update: string) => void): () => void
  saveContent(noteId: string, content: string, contentSha: string): Promise<void>
  compact(noteId: string, ydoc: string, seq: number, content: string, contentSha: string): Promise<boolean>
  saveVersion(noteId: string, content: string, kind: 'auto' | 'manual' | 'restore'): Promise<void>
}

export type SyncStatus = 'connecting' | 'synced' | 'saving' | 'offline' | 'gone'

export interface NoteSyncOptions {
  /** Loads persisted local state into the doc and keeps persisting it; returns a detach function. */
  attachLocal?: (doc: Y.Doc, noteId: string) => Promise<() => void>
  onStatus?: (status: SyncStatus) => void
  /** Compact once this many updates sit on top of the snapshot. */
  compactAfter?: number
  timers?: { flushMs: number; contentMs: number; pollMs: number; resyncMs: number; versionMs: number }
}

const DEFAULT_TIMERS = { flushMs: 250, contentMs: 1500, pollMs: 10_000, resyncMs: 60_000, versionMs: 60 * 60_000 }
/** Re-read this many ids before the cursor: concurrent inserts can commit out of id order. */
const CURSOR_OVERLAP = 50

export class NoteSync {
  readonly doc = new Y.Doc()
  status: SyncStatus = 'connecting'

  private lastId = 0
  private pending: Uint8Array[] = []
  private needsResync = false
  private contentDirty = false
  private changedSinceVersion = false
  private stopped = false
  private flushing: Promise<void> | null = null
  private timers: typeof DEFAULT_TIMERS
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private contentTimer: ReturnType<typeof setTimeout> | null = null
  private intervals: ReturnType<typeof setInterval>[] = []
  private cleanups: Array<() => void> = []

  constructor(
    readonly noteId: string,
    private transport: NoteTransport,
    private schema: Schema,
    private opts: NoteSyncOptions = {},
  ) {
    this.timers = opts.timers ?? DEFAULT_TIMERS
  }

  async start(): Promise<void> {
    if (this.opts.attachLocal) this.cleanups.push(await this.opts.attachLocal(this.doc, this.noteId))
    this.doc.on('update', this.onDocUpdate)
    this.cleanups.push(() => this.doc.off('update', this.onDocUpdate))
    this.cleanups.push(this.transport.subscribe(this.noteId, (update) => this.applyRemote(update)))
    await this.resync()
    this.intervals.push(setInterval(() => void this.catchUp(), this.timers.pollMs))
    this.intervals.push(setInterval(() => void this.resync(), this.timers.resyncMs))
    this.intervals.push(setInterval(() => void this.saveVersion('auto'), this.timers.versionMs))
  }

  /** Flushes pending edits, mirrors content, records a version, then detaches. */
  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.intervals.forEach(clearInterval)
    if (this.flushTimer) clearTimeout(this.flushTimer)
    if (this.contentTimer) clearTimeout(this.contentTimer)
    await this.flush()
    if (this.contentDirty) await this.mirrorContent().catch(() => undefined)
    await this.saveVersion('auto').catch(() => undefined)
    this.cleanups.forEach((fn) => fn())
    // The editor bound to this doc unmounts in the same React commit; let it detach first.
    setTimeout(() => this.doc.destroy(), 0)
  }

  /** App returned to the foreground or the network came back. */
  async resume(): Promise<void> {
    await this.resync()
  }

  /** Current document as Tiptap JSON (for previews, export, versions). */
  json(): Record<string, unknown> {
    return yXmlFragmentToProsemirrorJSON(this.doc.getXmlFragment(NOTE_FRAGMENT)) as Record<string, unknown>
  }

  contentString(): string {
    return JSON.stringify(this.json())
  }

  async saveVersion(kind: 'auto' | 'manual'): Promise<void> {
    if (kind === 'auto' && !this.changedSinceVersion) return
    this.changedSinceVersion = false
    await this.transport.saveVersion(this.noteId, this.contentString(), kind)
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === REMOTE || this.stopped) return
    this.pending.push(update)
    this.contentDirty = true
    this.changedSinceVersion = true
    this.setStatus('saving')
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => void this.flush(), this.timers.flushMs)
    if (this.contentTimer) clearTimeout(this.contentTimer)
    this.contentTimer = setTimeout(() => void this.mirrorContent().catch(() => { this.contentDirty = true }), this.timers.contentMs)
  }

  private applyRemote(update: string): void {
    if (this.stopped) return
    try {
      Y.applyUpdate(this.doc, fromBase64(update), REMOTE)
    } catch (err) {
      console.warn('[notes] bad remote update', err)
    }
  }

  private async flush(): Promise<void> {
    if (this.flushing) await this.flushing
    if (this.pending.length === 0) return
    const merged = Y.mergeUpdates(this.pending)
    this.pending = []
    this.flushing = this.transport.push(this.noteId, toBase64(merged))
      .then(() => this.setStatus(this.needsResync ? 'offline' : 'synced'))
      .catch(() => {
        // The doc still holds the edit; the next resync pushes everything the server lacks.
        this.needsResync = true
        this.setStatus('offline')
      })
      .finally(() => { this.flushing = null })
    await this.flushing
  }

  private async catchUp(): Promise<void> {
    if (this.stopped) return
    if (this.needsResync) return this.resync()
    try {
      const updates = await this.transport.updatesAfter(this.noteId, Math.max(0, this.lastId - CURSOR_OVERLAP))
      for (const u of updates) {
        this.applyRemote(u.update)
        if (u.id > this.lastId) this.lastId = u.id
      }
    } catch {
      this.needsResync = true
      this.setStatus('offline')
    }
  }

  private async resync(): Promise<void> {
    if (this.stopped) return
    let state: ServerNoteState | null
    try {
      state = await this.transport.load(this.noteId)
    } catch {
      this.needsResync = true
      this.setStatus('offline')
      return
    }
    if (!state) {
      this.setStatus('gone')
      return
    }

    const server = new Y.Doc()
    if (state.ydoc) Y.applyUpdate(server, fromBase64(state.ydoc))
    for (const u of state.updates) Y.applyUpdate(server, fromBase64(u.update))
    this.lastId = Math.max(state.seq, ...state.updates.map((u) => u.id), 0)
    const neverConverted = !state.ydoc && state.updates.length === 0

    if (neverConverted) {
      // Legacy note: build the doc from notes.content the same way on every device.
      if (fragmentEmpty(this.doc) && state.content.trim()) this.seed(state.content, '')
    } else {
      Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(server), REMOTE)
      if (state.contentSha && (await sha256(state.content)) !== state.contentSha) {
        // An older app version rewrote notes.content without touching the Yjs history.
        // Re-read first: another device may already have re-seeded and mirrored.
        const fresh = await this.transport.load(this.noteId).catch(() => null)
        if (fresh?.contentSha && fresh.content === state.content && (await sha256(fresh.content)) !== fresh.contentSha) {
          for (const u of fresh.updates) Y.applyUpdate(this.doc, fromBase64(u.update), REMOTE)
          this.seed(fresh.content, fresh.contentSha)
        }
      }
    }

    const missing = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(server))
    server.destroy()
    try {
      if (missing.length > 2) await this.transport.push(this.noteId, toBase64(missing))
      this.needsResync = false
      this.setStatus(this.pending.length ? 'saving' : 'synced')
      if (this.contentDirty || (neverConverted && !fragmentEmpty(this.doc))) await this.mirrorContent()
      if (state.updates.length >= (this.opts.compactAfter ?? 50)) await this.compact()
    } catch {
      this.needsResync = true
      this.setStatus('offline')
    }
  }

  /**
   * Replaces the document with `content`. Insert IDs come from a client id derived
   * from the content (and the previous mirror), so devices seeding concurrently
   * produce identical items and Yjs merges them into one copy instead of two.
   */
  private seed(content: string, salt: string): void {
    const json = toTiptapContent(content)
    if (typeof json === 'string') return
    const seedId = seedClientId(content + '\u0000' + salt)
    const source = new Y.Doc()
    source.clientID = seedId
    prosemirrorJSONToYXmlFragment(this.schema, json, source.getXmlFragment(NOTE_FRAGMENT))
    const fragment = this.doc.getXmlFragment(NOTE_FRAGMENT)
    this.doc.transact(() => {
      // Keep this seed's own items: another device may have applied the same seed
      // already, and Yjs would ignore re-inserting ids it has seen (deleted or not).
      const children = fragment.toArray()
      for (let i = children.length - 1; i >= 0; i--) {
        if ((children[i] as unknown as { _item?: { id: { client: number } } })._item?.id.client !== seedId) fragment.delete(i, 1)
      }
      Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(source))
    }, SEED)
    source.destroy()
  }

  private async mirrorContent(): Promise<void> {
    const content = this.contentString()
    const sha = await sha256(content)
    this.contentDirty = false
    try {
      await this.transport.saveContent(this.noteId, content, sha)
    } catch (err) {
      this.contentDirty = true
      throw err
    }
  }

  private async compact(): Promise<void> {
    const content = this.contentString()
    await this.transport.compact(this.noteId, toBase64(Y.encodeStateAsUpdate(this.doc)), this.lastId, content, await sha256(content))
  }

  private setStatus(status: SyncStatus): void {
    if (this.status === status) return
    this.status = status
    this.opts.onStatus?.(status)
  }
}

function fragmentEmpty(doc: Y.Doc): boolean {
  return doc.getXmlFragment(NOTE_FRAGMENT).length === 0
}

/** 32-bit FNV-1a, kept clear of 0 and of ids Yjs generates at random for live editing. */
export function seedClientId(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h % 0x3fffffff) + 1
}

export async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
