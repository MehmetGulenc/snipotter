import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { NoteCard, NoteEditor } from '@/components/NoteCard'
import { Button } from '@/components/ui/Button'
import { extractText } from '@/components/TiptapEditor'
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

  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes
    return notes.filter((n) => {
      if (n.title?.toLowerCase().includes(q)) return true
      if (n.content.toLowerCase().includes(q)) return true
      if (n.ai?.summary?.toLowerCase().includes(q)) return true
      if (n.ai?.tags?.some((t) => t.toLowerCase().includes(q))) return true
      return false
    })
  }, [notes, query])

  // Default-select first note when list changes
  useEffect(() => {
    if (!activeId && filtered.length > 0) {
      setActiveId(filtered[0].id)
    } else if (activeId && !filtered.find((n) => n.id === activeId)) {
      setActiveId(filtered[0]?.id ?? null)
    }
  }, [filtered, activeId])

  const active = filtered.find((n) => n.id === activeId) ?? null

  const onCreate = async () => {
    const r = await window.snipotter.notes.create({ content: '' })
    if (r.ok && r.data) {
      upsert(r.data)
      setActiveId(r.data.id)
    }
  }
  const onUpdate = useCallback(async (id: string, partial: Partial<Note>) => {
    const r = await window.snipotter.notes.update(id, partial)
    if (r.ok && r.data) upsert(r.data)
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
    <div className="flex h-full">
      <aside className="flex shrink-0 flex-col bg-card/30" style={{ width: sidebarWidth }}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notlar ({filtered.length})
          </span>
          <div className="flex items-center gap-1">
            {filtered.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={allSelected ? clearSelection : selectAll}
                title={allSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}
              >
                {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </Button>
            )}
            {hasSelection ? null : (
              <Button size="sm" variant="ghost" onClick={onCreate}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div
          ref={listRef}
          className={`scrollbar-thin flex-1 space-y-1 overflow-y-auto p-2 ${dragActive.current ? 'touch-none select-none' : ''}`}
          onPointerMove={handleListPointerMove}
          onPointerUp={handleListPointerUp}
          onPointerCancel={handleListPointerUp}
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {query ? 'Sonuç yok.' : 'Henüz not yok. Cmd+Shift+N veya + butonu.'}
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
              />
            ))
          )}
        </div>

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
        onDelete={onDelete}
        onPin={onPin}
        onReenrich={onReenrich}
      />
    </div>
  )
}
