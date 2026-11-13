import { IndexeddbPersistence } from 'y-indexeddb'
import type * as Y from 'yjs'
import type { IpcResult, Note } from '@shared/types'
import type { NoteLibrary } from '@shared/notes/library'
import type { NoteTransport } from '@shared/notes/sync'
import { ASSET_PREFIX } from '@shared/notes/assets'
import type { NoteAssets } from '@shared/notes/assets'

async function unwrap<T>(result: Promise<IpcResult<T>>): Promise<T> {
  const r = await result
  if (!r.ok) throw new Error(r.error)
  return r.data
}

/** Yjs note sync through the main process, which owns the Supabase session. */
export function createNoteTransport(): NoteTransport {
  // Resolved per call: components may render before the preload bridge exists (tests, SSR).
  const y = (): typeof window.snipotter.notes.y => window.snipotter.notes.y
  const listeners = new Map<string, Set<(update: string) => void>>()
  let detach: (() => void) | null = null

  return {
    load: (noteId) => unwrap(y().load(noteId)),
    updatesAfter: (noteId, afterId) => unwrap(y().after(noteId, afterId)),
    push: (noteId, update) => unwrap(y().push(noteId, update)),
    subscribe(noteId, cb) {
      detach ??= y().onUpdate(({ noteId: id, update }) => listeners.get(id)?.forEach((fn) => fn(update)))
      let set = listeners.get(noteId)
      if (!set) listeners.set(noteId, (set = new Set()))
      set.add(cb)
      return () => {
        set.delete(cb)
        if (set.size === 0) listeners.delete(noteId)
        if (listeners.size === 0 && detach) {
          detach()
          detach = null
        }
      }
    },
    saveContent: (noteId, content, sha) => unwrap(y().saveContent(noteId, content, sha)),
    compact: (noteId, ydoc, seq, content, sha) => unwrap(y().compact(noteId, ydoc, seq, content, sha)),
    saveVersion: (noteId, content, kind) => unwrap(y().saveVersion(noteId, content, kind)),
  }
}

/** Note images, uploaded and signed by the main process. */
export function createNoteAssets(): NoteAssets {
  return {
    async upload(image, noteId) {
      const path = await unwrap(window.snipotter.notes.uploadAsset(noteId, image.type || 'image/jpeg', new Uint8Array(await image.arrayBuffer())))
      return `${ASSET_PREFIX}${path}`
    },
    signedUrl: (path) => unwrap(window.snipotter.notes.assetUrl(path)),
  }
}

/** Version history and trash through the main process. */
export function createNoteLibrary(onRestored: (notes: Note[]) => void): NoteLibrary {
  const notes = (): typeof window.snipotter.notes => window.snipotter.notes
  return {
    versions: (noteId) => unwrap(notes().versions(noteId)),
    saveVersion: (noteId, content, kind) => unwrap(notes().y.saveVersion(noteId, content, kind)),
    trashList: () => unwrap(notes().trash.list()),
    restore: async (ids) => onRestored(await unwrap(notes().trash.restore(ids))),
    purge: (ids) => unwrap(notes().trash.purge(ids)),
  }
}

/** Keeps each open note in IndexedDB so it opens and edits offline. */
export async function attachLocalNote(doc: Y.Doc, noteId: string): Promise<() => void> {
  const persistence = new IndexeddbPersistence(`snipotter-note-${noteId}`, doc)
  await Promise.race([persistence.whenSynced, new Promise((r) => setTimeout(r, 2000))])
  return () => void persistence.destroy()
}
