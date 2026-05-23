import { create } from 'zustand'
import type {
  AppSettings,
  ClipboardItem,
  Note,
  SnipotterUser,
  Workspace,
} from '@shared/types'

interface SnipotterState {
  // Auth
  user: SnipotterUser | null
  authLoading: boolean
  setUser: (u: SnipotterUser | null) => void
  setAuthLoading: (b: boolean) => void

  // Workspace (pairing-based; null means onboarding required)
  workspace: Workspace | null
  setWorkspace: (w: Workspace | null) => void

  // Library
  clipboard: ClipboardItem[]
  notes: Note[]
  query: string
  setQuery: (q: string) => void

  // Settings
  settings: AppSettings | null
  setSettings: (s: AppSettings) => void

  // Clipboard actions (local state mutations, network handled via IPC)
  setClipboard: (items: ClipboardItem[]) => void
  upsertClipboard: (item: ClipboardItem & { deleted?: boolean }) => void
  removeClipboard: (id: string) => void
  removeClipboards: (ids: string[]) => void
  clearClipboard: () => void

  // Notes actions
  setNotes: (notes: Note[]) => void
  upsertNote: (note: Note & { deleted?: boolean }) => void
  removeNote: (id: string) => void
  removeNotes: (ids: string[]) => void

  // Pending-delete shields — IDs in these sets are filtered out of any
  // incoming setNotes/upsertNote/setClipboard/upsertClipboard call so that
  // the 15s reconciliation loop and realtime replays can't resurrect items
  // that the user just deleted while the undo timer is still running.
  _shieldedNoteIds: Set<string>
  _shieldedClipIds: Set<string>
  shieldNotes: (ids: string[]) => void
  unshieldNotes: (ids: string[]) => void
  shieldClips: (ids: string[]) => void
  unshieldClips: (ids: string[]) => void

  // AI status
  aiStatus: {
    enabled: boolean
    primary: 'claude-haiku' | 'gemini-flash'
    providers: Record<'claude-haiku' | 'gemini-flash', boolean>
  } | null
  setAiStatus: (s: SnipotterState['aiStatus']) => void
}

export const useStore = create<SnipotterState>((set) => ({
  user: null,
  authLoading: true,
  setUser: (u) => set({ user: u, authLoading: false }),
  setAuthLoading: (b) => set({ authLoading: b }),

  workspace: null,
  setWorkspace: (w) => set({ workspace: w }),

  clipboard: [],
  notes: [],
  query: '',
  setQuery: (q) => set({ query: q }),

  settings: null,
  setSettings: (s) => set({ settings: s }),

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

  setClipboard: (items) =>
    set((s) => ({
      clipboard: s._shieldedClipIds.size
        ? sortClipboard(items.filter((c) => !s._shieldedClipIds.has(c.id)))
        : sortClipboard(items),
    })),
  upsertClipboard: (item) =>
    set((state) => {
      if (state._shieldedClipIds.has(item.id)) return state
      if (item.deleted) {
        return { clipboard: state.clipboard.filter((c) => c.id !== item.id) }
      }
      const exists = state.clipboard.findIndex((c) => c.id === item.id)
      if (exists >= 0) {
        const next = state.clipboard.slice()
        next[exists] = { ...next[exists], ...item }
        return { clipboard: sortClipboard(next) }
      }
      return { clipboard: sortClipboard([item, ...state.clipboard]) }
    }),
  removeClipboard: (id) =>
    set((s) => ({ clipboard: s.clipboard.filter((c) => c.id !== id) })),
  removeClipboards: (ids) => {
    const set_ = new Set(ids)
    set((s) => ({ clipboard: s.clipboard.filter((c) => !set_.has(c.id)) }))
  },
  clearClipboard: () => set((s) => ({ clipboard: s.clipboard.filter((c) => c.pinned) })),

  setNotes: (notes) =>
    set((s) => ({
      notes: s._shieldedNoteIds.size
        ? sortNotes(notes.filter((n) => !s._shieldedNoteIds.has(n.id)))
        : sortNotes(notes),
    })),
  upsertNote: (note) =>
    set((state) => {
      if (state._shieldedNoteIds.has(note.id)) return state
      if (note.deleted) {
        return { notes: state.notes.filter((n) => n.id !== note.id) }
      }
      const exists = state.notes.findIndex((n) => n.id === note.id)
      if (exists >= 0) {
        const next = state.notes.slice()
        next[exists] = { ...next[exists], ...note }
        return { notes: sortNotes(next) }
      }
      return { notes: sortNotes([note, ...state.notes]) }
    }),
  removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
  removeNotes: (ids) => {
    const set_ = new Set(ids)
    set((s) => ({ notes: s.notes.filter((n) => !set_.has(n.id)) }))
  },

  aiStatus: null,
  setAiStatus: (s) => set({ aiStatus: s }),
}))

function sortClipboard(items: ClipboardItem[]): ClipboardItem[] {
  return items
    .slice()
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
}

function sortNotes(items: Note[]): Note[] {
  return items
    .slice()
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
}
