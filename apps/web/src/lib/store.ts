import { create } from 'zustand'
import type { ClipboardItem, Note, SnipotterUser, Workspace } from './types'

interface Store {
  user: SnipotterUser | null
  workspace: Workspace | null
  loading: boolean
  view: 'library' | 'notes' | 'settings'
  query: string
  clipboard: ClipboardItem[]
  notes: Note[]

  setUser: (u: SnipotterUser | null) => void
  setWorkspace: (w: Workspace | null) => void
  setLoading: (b: boolean) => void
  setView: (v: Store['view']) => void
  setQuery: (q: string) => void

  setClipboard: (items: ClipboardItem[]) => void
  upsertClip: (item: ClipboardItem) => void
  removeClip: (id: string) => void
  removeClips: (ids: string[]) => void

  setNotes: (notes: Note[]) => void
  upsertNote: (note: Note) => void
  removeNote: (id: string) => void
  removeNotes: (ids: string[]) => void

  // Pending-delete shields — block reconciliation/realtime from resurrecting
  // items that are in the 5-second undo window (still in DB, removed from UI).
  _shieldedNoteIds: Set<string>
  _shieldedClipIds: Set<string>
  shieldNotes: (ids: string[]) => void
  unshieldNotes: (ids: string[]) => void
  shieldClips: (ids: string[]) => void
  unshieldClips: (ids: string[]) => void
}

const sortClips = (a: ClipboardItem[]) =>
  [...a].sort((x, y) => {
    if (x.pinned !== y.pinned) return x.pinned ? -1 : 1
    return new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
  })

const sortNotes = (a: Note[]) =>
  [...a].sort((x, y) => {
    if (x.pinned !== y.pinned) return x.pinned ? -1 : 1
    return new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime()
  })

export const useStore = create<Store>((set) => ({
  user: null,
  workspace: null,
  loading: true,
  view: 'library',
  query: '',
  clipboard: [],
  notes: [],

  _shieldedNoteIds: new Set(),
  _shieldedClipIds: new Set(),
  shieldNotes: (ids) =>
    set((s) => ({ _shieldedNoteIds: new Set([...s._shieldedNoteIds, ...ids]) })),
  unshieldNotes: (ids) =>
    set((s) => {
      const next = new Set(s._shieldedNoteIds)
      ids.forEach((id) => next.delete(id))
      return { _shieldedNoteIds: next }
    }),
  shieldClips: (ids) =>
    set((s) => ({ _shieldedClipIds: new Set([...s._shieldedClipIds, ...ids]) })),
  unshieldClips: (ids) =>
    set((s) => {
      const next = new Set(s._shieldedClipIds)
      ids.forEach((id) => next.delete(id))
      return { _shieldedClipIds: next }
    }),

  setUser: (u) => set({ user: u }),
  setWorkspace: (w) => set({ workspace: w }),
  setLoading: (b) => set({ loading: b }),
  setView: (v) => set({ view: v }),
  setQuery: (q) => set({ query: q }),

  setClipboard: (items) =>
    set((s) => ({
      clipboard: s._shieldedClipIds.size
        ? sortClips(items.filter((c) => !s._shieldedClipIds.has(c.id)))
        : sortClips(items),
    })),
  upsertClip: (item) =>
    set((s) => {
      if (s._shieldedClipIds.has(item.id)) return s
      if ('deleted' in item && item.deleted) {
        return { clipboard: s.clipboard.filter((c) => c.id !== item.id) }
      }
      const without = s.clipboard.filter((c) => c.id !== item.id)
      return { clipboard: sortClips([item, ...without]) }
    }),
  removeClip: (id) => set((s) => ({ clipboard: s.clipboard.filter((c) => c.id !== id) })),
  removeClips: (ids) => {
    const set_ = new Set(ids)
    set((s) => ({ clipboard: s.clipboard.filter((c) => !set_.has(c.id)) }))
  },

  setNotes: (notes) =>
    set((s) => ({
      notes: s._shieldedNoteIds.size
        ? sortNotes(notes.filter((n) => !s._shieldedNoteIds.has(n.id)))
        : sortNotes(notes),
    })),
  upsertNote: (note) =>
    set((s) => {
      if (s._shieldedNoteIds.has(note.id)) return s
      if ('deleted' in note && note.deleted) {
        return { notes: s.notes.filter((n) => n.id !== note.id) }
      }
      const without = s.notes.filter((n) => n.id !== note.id)
      return { notes: sortNotes([note, ...without]) }
    }),
  removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
  removeNotes: (ids) => {
    const set_ = new Set(ids)
    set((s) => ({ notes: s.notes.filter((n) => !set_.has(n.id)) }))
  },
}))
