import { IndexeddbPersistence } from 'y-indexeddb'
import type * as Y from 'yjs'
import type { NoteTransport, ServerNoteState, ServerUpdate } from '@shared/notes/sync'
import { ASSET_PREFIX } from '@shared/notes/assets'
import type { NoteAssets } from '@shared/notes/assets'
import { getSupabase } from './supabase'
import { codecFor } from '@shared/crypto/codec'
import { broadcastNoteY, listNoteVersions, listTrashedNotes, onNoteY, purgeTrashedNotes, restoreTrashedNotes, saveNoteContent } from './api'
import type { NoteLibrary } from '@shared/notes/library'
import type { Note } from './types'

const PAGE = 1000

/** Yjs note sync straight against Supabase (iOS app and web). */
export function createNoteTransport(workspaceId: string): NoteTransport {
  const sb = getSupabase()

  const updatesAfter = async (noteId: string, afterId: number): Promise<ServerUpdate[]> => {
    const out: ServerUpdate[] = []
    let cursor = afterId
    for (;;) {
      const { data, error } = await sb
        .from('note_updates')
        .select('id, update')
        .eq('note_id', noteId)
        .gt('id', cursor)
        .order('id', { ascending: true })
        .limit(PAGE)
      if (error) throw error
      const rows = (data ?? []) as Array<{ id: number; update: string }>
      for (const r of rows) out.push({ id: r.id, update: await codecFor(workspaceId).openNoteBlob(noteId, 'update', r.update) })
      if (rows.length < PAGE) return out
      cursor = rows[rows.length - 1].id
    }
  }

  return {
    async load(noteId): Promise<ServerNoteState | null> {
      const { data, error } = await sb
        .from('notes')
        .select('ydoc, ydoc_seq, content, ydoc_content_sha')
        .eq('id', noteId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as { ydoc: string | null; ydoc_seq: number; content: string; ydoc_content_sha: string | null }
      const open = await codecFor(workspaceId).openRow('notes', { id: noteId, content: row.content ?? '' })
      return {
        ydoc: row.ydoc ? await codecFor(workspaceId).openNoteBlob(noteId, 'ydoc', row.ydoc) : null,
        seq: Number(row.ydoc_seq ?? 0),
        content: open.content,
        contentSha: row.ydoc_content_sha,
        updates: await updatesAfter(noteId, Number(row.ydoc_seq ?? 0)),
      }
    },
    updatesAfter,
    async push(noteId, plain) {
      const update = await codecFor(workspaceId).sealNoteBlob(noteId, 'update', plain)
      broadcastNoteY(noteId, update)
      const { error } = await sb.from('note_updates').insert({ note_id: noteId, workspace_id: workspaceId, update })
      if (error) throw error
    },
    subscribe: (noteId, cb) => onNoteY(noteId, (sealed) => {
      void codecFor(workspaceId).openNoteBlob(noteId, 'update', sealed).then(cb).catch(() => undefined)
    }),
    saveContent: saveNoteContent,
    async compact(noteId, ydoc, seq, content, contentSha) {
      const { data, error } = await sb.rpc('compact_note', {
        p_note_id: noteId,
        p_ydoc: await codecFor(workspaceId).sealNoteBlob(noteId, 'ydoc', ydoc),
        p_seq: seq,
        p_content: (await codecFor(workspaceId).sealRow('notes', { id: noteId, content })).content,
        p_content_sha: contentSha,
      })
      if (error) throw error
      return data === true
    },
    async saveVersion(noteId, content, kind) {
      const row = await codecFor(workspaceId).sealRow('note_versions', { id: crypto.randomUUID(), note_id: noteId, workspace_id: workspaceId, kind, content })
      const { error } = await sb.from('note_versions').insert(row)
      if (error) throw error
    },
  }
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic' }

/** Note images in the private `note-assets` bucket (see migration 0012). */
export function createNoteAssets(workspaceId: string): NoteAssets {
  const bucket = () => getSupabase().storage.from('note-assets')
  return {
    async upload(image, noteId) {
      const type = EXT[image.type] ? image.type : 'image/jpeg'
      const path = `${workspaceId}/${noteId}/${crypto.randomUUID()}.${EXT[type]}`
      const body = codecFor(workspaceId).enabled ? new Blob([await codecFor(workspaceId).sealFile(path, new Uint8Array(await image.arrayBuffer())) as BlobPart], { type }) : image
      const { error } = await bucket().upload(path, body, { contentType: type, upsert: false })
      if (error) throw error
      return `${ASSET_PREFIX}${path}`
    },
    async signedUrl(path) {
      const { data, error } = await bucket().createSignedUrl(path, 3600)
      if (error || !data?.signedUrl) throw error ?? new Error('Görsel bağlantısı alınamadı')
      if (!codecFor(workspaceId).enabled) return data.signedUrl
      // Encrypted workspace: fetch, decrypt and show from memory. Images stored before
      // encryption was switched on are plain and fail authentication; show those as they are.
      const bytes = new Uint8Array(await (await fetch(data.signedUrl)).arrayBuffer())
      const plain = await codecFor(workspaceId).openFile(path, bytes).catch(() => bytes)
      return URL.createObjectURL(new Blob([plain as BlobPart], { type: `image/${path.split('.').pop() === 'jpg' ? 'jpeg' : path.split('.').pop()}` }))
    },
  }
}

/** Version history and trash straight against Supabase. */
export function createNoteLibrary(workspaceId: string, onRestored: (notes: Note[]) => void): NoteLibrary {
  const transport = createNoteTransport(workspaceId)
  return {
    versions: listNoteVersions,
    saveVersion: (noteId, content, kind) => transport.saveVersion(noteId, content, kind),
    trashList: () => listTrashedNotes(workspaceId),
    restore: async (ids) => onRestored(await restoreTrashedNotes(ids)),
    purge: purgeTrashedNotes,
  }
}

/** Keeps each open note in IndexedDB so it opens and edits offline. */
export async function attachLocalNote(doc: Y.Doc, noteId: string): Promise<() => void> {
  const persistence = new IndexeddbPersistence(`snipotter-note-${noteId}`, doc)
  // IndexedDB can be unavailable (private browsing); continue online-only after 2 s.
  await Promise.race([persistence.whenSynced, new Promise((r) => setTimeout(r, 2000))])
  return () => void persistence.destroy()
}
