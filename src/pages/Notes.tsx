import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { NoteCard, NoteEditor } from '@/components/NoteCard'
import { Button } from '@/components/ui/Button'
import { extractText } from '@shared/notes/content'
import { TrashView } from '@shared/notes/TrashView'
import { createNoteLibrary } from '@/lib/noteTransport'
import { filterNotes, notebookPath, searchNotes } from '@shared/notes/organize'
import { NotebookNav } from '@shared/notes/NotebookNav'
import type { NotebookActions } from '@shared/notes/NotebookNav'
import type { Note } from '@shared/types'
import { Plus, Trash2, CheckSquare, Square, Undo2 } from 'lucide-react'

interface PendingDelete {
  notes: Note[]
  timer: ReturnType<typeof setTimeout>
}

export function Notes(): JSX.Element {
  const notes = useStore((s) => s.notes)
  const upsert = useStore((s) => s.upsertNote)
  const removeNote = useStore((s) => s.removeNote)
  const removeNotes = useStore((s) => s.removeNotes)
  const shieldNotes = useStore((s) => s.shieldNotes)
  const unshieldNotes = useStore((s) => s.unshieldNotes)
  const query = useStore((s) => s.query)
  const notebooks = useStore((s) => s.notebooks)
  const setNotebooks = useStore((s) => s.setNotebooks)
  const noteFilter = useStore((s) => s.noteFilter)
  const setNoteFilter = useStore((s) => s.setNoteFilter)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // drag-to-select state (refs to avoid re-renders during drag)
  const dragActive = useRef(false)
  const dragMode = useRef<'select' | 'deselect'>('select')
  const dragVisited = useRef<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(288)
  const resizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    resizing.current = true
    startX.current = e.clientX
    startWidth.current = sidebarWidth
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return
      const delta = ev.clientX - startX.current
      setSidebarWidth(Math.max(200, Math.min(600, startWidth.current + delta)))
    }
    const onUp = () => {
      resizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const scoped = useMemo(() => filterNotes(notes, noteFilter, notebooks), [notes, noteFilter, notebooks])
  const hits = useMemo(() => (query.trim() ? searchNotes(scoped, query) : null), [scoped, query])
  const filtered = useMemo(() => (hits ? hits.map((h) => h.note) : scoped), [hits, scoped])
  const hitById = useMemo(() => new Map(hits?.map((h) => [h.note.id, h]) ?? []), [hits])

  // Notebooks: initial load, other devices' changes, and on window focus.
  useEffect(() => {
    const load = (): void => {
      void window.snipotter.notes.notebooks.list().then((r) => { if (r.ok) setNotebooks(r.data) })
    }
    load()
    const off = window.snipotter.notes.notebooks.onChanged(load)
    window.addEventListener('focus', load)
    return () => {
      off()
      window.removeEventListener('focus', load)
    }
  }, [setNotebooks])

  const openNote = useCallback((id: string) => {
    if (!filtered.some((n) => n.id === id)) setNoteFilter({ kind: 'all' })
    setActiveId(id)
  }, [filtered, setNoteFilter])

  const notebookActions: NotebookActions = useMemo(() => {
    const unwrap = async <T,>(p: Promise<{ ok: true; data: T } | { ok: false; error: string }>): Promise<T> => {
      const r = await p
      if (!r.ok) throw new Error(r.error)
      return r.data
    }
    const refresh = async (): Promise<void> => setNotebooks(await unwrap(window.snipotter.notes.notebooks.list()))
    return {
      create: async (name, parentId) => { await unwrap(window.snipotter.notes.notebooks.create(name, parentId)); await refresh() },
      rename: async (id, name) => { await unwrap(window.snipotter.notes.notebooks.update(id, { name })); await refresh() },
      remove: async (id) => { await unwrap(window.snipotter.notes.notebooks.remove(id)); await refresh() },
    }
  }, [setNotebooks])

  // Default-select first note when list changes
  useEffect(() => {
    if (!activeId && filtered.length > 0) {
      setActiveId(filtered[0].id)
    } else if (activeId && !filtered.find((n) => n.id === activeId)) {
      setActiveId(filtered[0]?.id ?? null)
    }
  }, [filtered, activeId])

  const active = notes.find((n) => n.id === activeId) ?? null

  const onCreate = async () => {
    const r = await window.snipotter.notes.create({ content: '' })
    if (r.ok && r.data) {
      let note = r.data
      // A note created while a notebook is open goes into that notebook.
      if (noteFilter.kind === 'notebook') {
        const moved = await window.snipotter.notes.move(note.id, noteFilter.id)
        if (moved.ok) note = moved.data
      }
      upsert(note)
      setActiveId(note.id)
    }
  }
  const onUpdate = useCallback(async (id: string, partial: Partial<Note>) => {
    try {
      const r = await window.snipotter.notes.update(id, partial)
      if (r.ok && r.data) {
        upsert(r.data)
        setSaveError(null)
      } else {
        setSaveError('Not kaydedilemedi. Metninizi koruyun ve bağlantınızı kontrol edin.')
      }
    } catch {
      setSaveError('Not kaydedilemedi. Metninizi koruyun ve bağlantınızı kontrol edin.')
    }
  }, [upsert])
  const [showTrash, setShowTrash] = useState(false)
  const noteLibrary = useMemo(() => createNoteLibrary((restored) => restored.forEach(upsert)), [upsert])
  const onLocalContent = useCallback((id: string, content: string) => {
    const current = useStore.getState().notes.find((n) => n.id === id)
    if (current) upsert({ ...current, content })
  }, [upsert])
  const onPin = async (note: Note) => {
    const r = await window.snipotter.notes.pin(note.id, !note.pinned)
    if (r.ok && r.data) upsert(r.data)
  }
  const onDelete = async (note: Note) => {
    removeNote(note.id)
    const r = await window.snipotter.notes.delete(note.id)
    if (!r.ok) {
      upsert(note)
      console.error('[notes] delete failed, reverted:', r.error)
    }
  }
  const onReenrich = async (note: Note) => {
    const r = await window.snipotter.ai.reenrich('note', note.id, extractText(note.content))
    if (r.ok) upsert({ ...note, ai: r.data })
  }

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((n) => n.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const deleteSelected = () => {
    if (selectedIds.size === 0) return

    const ids = Array.from(selectedIds)
    const noteObjects = ids.map((id) => notes.find((n) => n.id === id)).filter(Boolean) as Note[]

    // Shield these IDs so reconciliation/realtime can't resurrect them during undo window
    shieldNotes(ids)
    removeNotes(ids)
    if (activeId && selectedIds.has(activeId)) setActiveId(null)
    setSelectedIds(new Set())

    // Commit any previous pending delete immediately before starting a new batch
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer)
      const prevIds = pendingDelete.notes.map((n) => n.id)
      void window.snipotter.notes.deleteMany(prevIds).then(() => unshieldNotes(prevIds))
    }

    const timer = setTimeout(async () => {
      setPendingDelete(null)
      await window.snipotter.notes.deleteMany(ids)
      unshieldNotes(ids)
    }, 5000)

    setPendingDelete({ notes: noteObjects, timer })
  }

  const undoDelete = () => {
    if (!pendingDelete) return
    clearTimeout(pendingDelete.timer)
    // Unshield first so the store accepts the restored notes
    unshieldNotes(pendingDelete.notes.map((n) => n.id))
    pendingDelete.notes.forEach((n) => upsert(n))
    setPendingDelete(null)
  }

  // Drag-to-select: pointer events on list container
  const handleListPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragActive.current) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const card = el?.closest<HTMLElement>('[data-note-id]')
    const id = card?.dataset.noteId
    if (!id || dragVisited.current.has(id)) return
    dragVisited.current.add(id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (dragMode.current === 'select') next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleListPointerUp = useCallback(() => {
    dragActive.current = false
    dragVisited.current = new Set()
    listRef.current?.releasePointerCapture?.(0)
  }, [])

  // Called from NoteCard checkbox pointerdown — starts drag-select
  const handleCheckboxPointerDown = useCallback((noteId: string, alreadySelected: boolean, e: React.PointerEvent) => {
    e.preventDefault()
    dragActive.current = true
    dragMode.current = alreadySelected ? 'deselect' : 'select'
    dragVisited.current = new Set([noteId])
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (dragMode.current === 'select') next.add(noteId)
      else next.delete(noteId)
      return next
    })
    // Capture pointer on the list container so pointermove fires even outside card bounds
    try {
      listRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  const hasSelection = selectedIds.size > 0
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length

  return (
    <div className="flex h-full min-w-0 p-5 gap-0">
      <aside className="flex shrink-0 flex-col rounded-l-2xl border border-r-0 border-border bg-card" style={{ width: sidebarWidth }}>
        {saveError && <p role="alert" className="border-b border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{saveError}</p>}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-5">
          <span className="text-lg font-semibold tracking-tight">
            {showTrash ? 'Çöp Kutusu' : `Notlar (${filtered.length})`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={showTrash ? 'secondary' : 'ghost'}
              onClick={() => setShowTrash((v) => !v)}
              title={showTrash ? 'Notlara dön' : 'Çöp kutusu'}
              aria-label={showTrash ? 'Notlara dön' : 'Çöp kutusu'}
              aria-pressed={showTrash}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {!showTrash && filtered.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={allSelected ? clearSelection : selectAll}
                title={allSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}
              >
                {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </Button>
            )}
            {hasSelection || showTrash ? null : (
              <Button size="sm" variant="default" onClick={onCreate} className="gap-1.5 rounded-lg" aria-label="Yeni not oluştur">
                <Plus className="h-4 w-4" /> Yeni
              </Button>
            )}
          </div>
        </div>

        {!showTrash && (
          <div className="scrollbar-thin max-h-[42%] shrink-0 overflow-y-auto border-b border-border p-2">
            <NotebookNav
              notebooks={notebooks}
              notes={notes}
              filter={noteFilter}
              onFilter={setNoteFilter}
              actions={notebookActions}
              confirm={(title, message) => Promise.resolve(window.confirm(`${title}\n\n${message}`))}
              variant="desktop"
            />
          </div>
        )}
        {showTrash ? (
          <div className="min-h-0 flex-1">
            <TrashView
              library={noteLibrary}
              variant="desktop"
              confirm={(title, message) => Promise.resolve(window.confirm(`${title}\n\n${message}`))}
            />
          </div>
        ) : (
        <div
          ref={listRef}
          className={`scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3 ${dragActive.current ? 'touch-none select-none' : ''}`}
          onPointerMove={handleListPointerMove}
          onPointerUp={handleListPointerUp}
          onPointerCancel={handleListPointerUp}
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {query ? 'Sonuç yok.' : 'Henüz notun yok. Yeni butonuyla ilk notunu oluştur.'}
            </p>
          ) : (
            filtered.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                active={n.id === activeId}
                selected={selectedIds.has(n.id)}
                onSelect={() => setActiveId(n.id)}
                onToggleSelect={() => toggleSelection(n.id)}
                onCheckboxPointerDown={(e) => handleCheckboxPointerDown(n.id, selectedIds.has(n.id), e)}
                hit={hitById.get(n.id)}
                notebookLabel={n.notebookId && noteFilter.kind !== 'notebook' ? notebookPath(notebooks, n.notebookId) : undefined}
              />
            ))
          )}
        </div>
        )}

        {/* Sticky bottom bar — visible whenever there's a selection or pending undo */}
        {(hasSelection || pendingDelete) && (
          <div className="border-t border-border bg-card px-3 py-2">
            {pendingDelete ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {pendingDelete.notes.length} not silindi
                </span>
                <button
                  onClick={undoDelete}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Geri al
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size} not seçili
                </span>
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-1 rounded bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Sil
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        className="w-1 shrink-0 cursor-col-resize border-r border-border bg-transparent hover:bg-primary/30 active:bg-primary/50 transition-colors"
      />

      <NoteEditor
        note={active}
        onUpdate={onUpdate}
        onLocalContent={onLocalContent}
        library={noteLibrary}
        onOpenNote={openNote}
        onTag={(tag) => setNoteFilter({ kind: 'tag', tag })}
        onDelete={onDelete}
        onPin={onPin}
        onReenrich={onReenrich}
      />
    </div>
  )
}
