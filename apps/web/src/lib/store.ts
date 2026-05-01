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

  setNotes: (notes: Note[]) => void
  upsertNote: (note: Note) => void
  removeNote: (id: string) => void
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

  setUser: (u) => set({ user: u }),
  setWorkspace: (w) => set({ workspace: w }),
  setLoading: (b) => set({ loading: b }),
  setView: (v) => set({ view: v }),
  setQuery: (q) => set({ query: q }),

  setClipboard: (items) => set({ clipboard: sortClips(items) }),
  upsertClip: (item) =>
    set((s) => {
      // Handle realtime delete events
      if ('deleted' in item && item.deleted) {
        return { clipboard: s.clipboard.filter((c) => c.id !== item.id) }
      }
      const without = s.clipboard.filter((c) => c.id !== item.id)
      return { clipboard: sortClips([item, ...without]) }
    }),
  removeClip: (id) => set((s) => ({ clipboard: s.clipboard.filter((c) => c.id !== id) })),

  setNotes: (notes) => set({ notes: sortNotes(notes) }),
  upsertNote: (note) =>
    set((s) => {
      // Handle realtime delete events - note has 'deleted' flag
      if ('deleted' in note && note.deleted) {
        return { notes: s.notes.filter((n) => n.id !== note.id) }
      }
      const without = s.notes.filter((n) => n.id !== note.id)
      return { notes: sortNotes([note, ...without]) }
    }),
  removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
}))
