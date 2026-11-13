import { useEffect, useState } from 'react'
import { NoteSync, NOTE_FRAGMENT } from './sync'
import type { NoteTransport, NoteSyncOptions, SyncStatus } from './sync'
import { noteSchema } from './extensions'

export type NoteSyncState =
  | { mode: 'loading' }
  /** Yjs document bound; the editor must use `sync.doc`. */
  | { mode: 'sync'; sync: NoteSync; status: SyncStatus }
  /** Server unreachable and nothing cached on this device: edit notes.content the old way. */
  | { mode: 'legacy' }

/**
 * Opens a note for conflict-free editing. Closing it (or switching notes)
 * flushes edits, mirrors notes.content and records a version.
 */
export function useNoteSync(
  noteId: string | null,
  transport: NoteTransport | null,
  options: Pick<NoteSyncOptions, 'attachLocal'> = {},
): NoteSyncState {
  const [state, setState] = useState<NoteSyncState>({ mode: 'loading' })

  useEffect(() => {
    if (!noteId || !transport) {
      setState({ mode: 'legacy' })
      return
    }
    let cancelled = false
    setState({ mode: 'loading' })
    const sync = new NoteSync(noteId, transport, noteSchema(), {
      ...options,
      onStatus: (status) => {
        if (!cancelled) setState((s) => (s.mode === 'sync' ? { ...s, status } : s))
      },
    })
    void sync.start().then(() => {
      if (cancelled) return
      const hasContent = sync.doc.getXmlFragment(NOTE_FRAGMENT).length > 0
      if (sync.status === 'offline' && !hasContent) {
        void sync.stop()
        setState({ mode: 'legacy' })
      } else {
        setState({ mode: 'sync', sync, status: sync.status })
      }
    }).catch((err) => {
      console.warn('[notes] sync start failed', err)
      if (!cancelled) setState({ mode: 'legacy' })
    })
    return () => {
      cancelled = true
      void sync.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, transport])

  return state
}

/** Human-readable save state for the note header. */
export function syncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'connecting': return 'Bağlanıyor…'
    case 'saving': return 'Kaydediliyor…'
    case 'synced': return 'Kaydedildi'
    case 'offline': return 'Çevrimdışı · cihazda saklandı'
    case 'gone': return 'Bu not silinmiş'
  }
}
