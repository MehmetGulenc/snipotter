'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pin, PinOff, Trash2, Loader2, ArrowLeft, Check, CheckSquare, Square, Undo2, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { listNotes, createNote, updateNote, deleteNote, deleteNoteMany } from '@/lib/api'
import { cn, relativeTime, firstLine } from '@/lib/utils'
import { Textarea } from './ui/Input'
import { Button } from './ui/Button'
import type { Note } from '@/lib/types'

interface PendingDelete {
  notes: Note[]
  timer: ReturnType<typeof setTimeout>
}

export function Notes(): JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const user = useStore((s) => s.user)
  const items = useStore((s) => s.notes)
  const setItems = useStore((s) => s.setNotes)
  const upsert = useStore((s) => s.upsertNote)
  const remove = useStore((s) => s.removeNote)
  const removeNotes = useStore((s) => s.removeNotes)
  const shieldNotes = useStore((s) => s.shieldNotes)
  const unshieldNotes = useStore((s) => s.unshieldNotes)
  const query = useStore((s) => s.query)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)
  const dirtyContent = useRef(false)
  const dirtyTitle = useRef(false)

  // multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  // drag-to-select
  const dragActive = useRef(false)
  const dragMode = useRef<'select' | 'deselect'>('select')
  const dragVisited = useRef<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)

  // long-press detection (mobile)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressId = useRef<string | null>(null)
  const touchMoved = useRef(false)

  useEffect(() => {
    if (!workspace) return
    void listNotes(workspace.id)
      .then((rows) => setItems(rows))
      .catch((e) => console.warn('notes load failed', e))
      .finally(() => setLoaded(true))
  }, [workspace?.id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (n) =>
        (n.title ?? '').toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        (n.ai?.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    )
  }, [items, query])

  const active = filtered.find((n) => n.id === activeId) ?? null

  // Reset editor on note navigation
  useEffect(() => {
    dirtyContent.current = false
    dirtyTitle.current = false
    setDraft(active?.content ?? '')
    setTitleDraft(active?.title ?? '')
  }, [activeId])

  // Adopt remote changes when user isn't actively editing
  useEffect(() => {
    if (!dirtyContent.current) setDraft(active?.content ?? '')
  }, [active?.content])

  useEffect(() => {
    if (!dirtyTitle.current) setTitleDraft(active?.title ?? '')
  }, [active?.title])

  // Content save (only when user has typed)
  useEffect(() => {
    if (!active) return
    if (!dirtyContent.current) return
    setSavingDraft(true)
    const t = setTimeout(async () => {
      try {
        await updateNote(active.id, { content: draft })
        upsert({ ...active, content: draft })
        dirtyContent.current = false
      } catch (e) {
        console.warn('note save failed', e)
      } finally {
        setSavingDraft(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [draft, active?.id])

  // Title save (only when user has typed)
  useEffect(() => {
    if (!active) return
    if (!dirtyTitle.current) return
    const t = setTimeout(async () => {
      try {
        await updateNote(active.id, { title: titleDraft.trim() || null })
        upsert({ ...active, title: titleDraft.trim() || null })
        dirtyTitle.current = false
      } catch (e) {
        console.warn('title save failed', e)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [titleDraft, active?.id])

  const onCreate = async () => {
    if (!workspace || !user) return
    setCreating(true)
    try {
      const note = await createNote(workspace.id, user.id, '')
      if (note) {
        upsert(note)
        setActiveId(note.id)
      }
    } finally {
      setCreating(false)
    }
  }

  const onPin = async (n: Note) => {
    upsert({ ...n, pinned: !n.pinned })
    await updateNote(n.id, { pinned: !n.pinned })
  }

  const onDelete = async (n: Note) => {
    if (!confirm('Notu sil?')) return
    remove(n.id)
    if (activeId === n.id) setActiveId(null)
    await deleteNote(n.id)
  }

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const selectAll = () => setSelectedIds(new Set(filtered.map((n) => n.id)))
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const noteObjects = ids.map((id) => items.find((n) => n.id === id)).filter(Boolean) as Note[]

    shieldNotes(ids)
    removeNotes(ids)
    if (activeId && selectedIds.has(activeId)) setActiveId(null)
    setSelectedIds(new Set())
    setSelectMode(false)

    if (pendingDelete) {
      clearTimeout(pendingDelete.timer)
      const prevIds = pendingDelete.notes.map((n) => n.id)
      void deleteNoteMany(prevIds).then(() => unshieldNotes(prevIds))
    }

    const timer = setTimeout(async () => {
      setPendingDelete(null)
      await deleteNoteMany(ids)
      unshieldNotes(ids)
    }, 5000)

    setPendingDelete({ notes: noteObjects, timer })
  }, [selectedIds, items, activeId, pendingDelete, removeNotes, shieldNotes, unshieldNotes])

  const undoDelete = useCallback(() => {
    if (!pendingDelete) return
    clearTimeout(pendingDelete.timer)
    unshieldNotes(pendingDelete.notes.map((n) => n.id))
    pendingDelete.notes.forEach((n) => upsert(n))
    setPendingDelete(null)
  }, [pendingDelete, upsert, unshieldNotes])

  // ─── Drag-to-select (pointer events) ────────────────────────────────────────
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
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

  const handlePointerUp = useCallback(() => {
    dragActive.current = false
    dragVisited.current = new Set()
  }, [])

  const startDrag = useCallback((noteId: string, alreadySelected: boolean, e: React.PointerEvent) => {
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
    try {
      listRef.current?.setPointerCapture(e.pointerId)
    } catch { /* ignore */ }
  }, [])

  // ─── Long-press (mobile) ────────────────────────────────────────────────────
  const handleTouchStart = useCallback((noteId: string, e: React.TouchEvent) => {
    touchMoved.current = false
    longPressId.current = noteId
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        navigator.vibrate?.(30)
        setSelectMode(true)
        setSelectedIds(new Set([noteId]))
      }
    }, 400)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchMoved.current = true
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    // While in select mode, drag-select by touch
    if (!selectMode) return
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const card = el?.closest<HTMLElement>('[data-note-id]')
    const id = card?.dataset.noteId
    if (!id || dragVisited.current.has(id)) return
    dragVisited.current.add(id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [selectMode])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    dragVisited.current = new Set()
  }, [])

  // ─── Editor view ─────────────────────────────────────────────────────────────
  if (active) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <button
            onClick={() => setActiveId(null)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden"
            title="Geri"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 truncate text-xs text-muted-foreground">
            {active.title?.trim() || firstLine(active.content, 60) || 'Yeni not'}
          </div>
          <button
            onClick={() => onPin(active)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={active.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
          >
            {active.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onDelete(active)}
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            title="Sil"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <input
          value={titleDraft}
          onChange={(e) => { dirtyTitle.current = true; setTitleDraft(e.target.value) }}
          placeholder="Başlık (opsiyonel)"
          className="border-b border-border bg-transparent px-4 py-3 text-base font-semibold outline-none placeholder:text-muted-foreground"
        />
        <Textarea
          value={draft}
          onChange={(e) => { dirtyContent.current = true; setDraft(e.target.value) }}
          placeholder="Notunu yaz…"
          className="flex-1 resize-none rounded-none border-0 bg-transparent px-4 py-4 text-base focus-visible:ring-0"
        />
        {savingDraft && (
          <div className="px-4 pb-1 text-[11px] text-muted-foreground">Kaydediliyor…</div>
        )}
        {active.ai?.tags?.length ? (
          <div className="border-t border-border px-4 py-2">
            <div className="flex flex-wrap gap-1.5">
              {active.ai.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-primary/15 px-2 py-0.5 text-[11px] text-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  // ─── List view ───────────────────────────────────────────────────────────────
  const hasSelection = selectedIds.size > 0

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pb-2 pt-3 sm:px-6">
        {selectMode ? (
          <>
            <button
              onClick={allSelected ? () => setSelectedIds(new Set()) : selectAll}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}
            </button>
            <button
              onClick={exitSelectMode}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <h2 className="text-sm font-medium text-muted-foreground">
              {filtered.length} not
            </h2>
            <Button onClick={onCreate} disabled={creating} size="sm">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Yeni not
            </Button>
          </>
        )}
      </div>

      {!loaded && <div className="py-12 text-center text-xs text-muted-foreground">Yükleniyor…</div>}
      {loaded && filtered.length === 0 && !pendingDelete && (
        <div className="flex h-[50vh] flex-col items-center justify-center px-8 text-center text-muted-foreground">
          <div className="text-sm font-medium text-foreground">Henüz not yok</div>
          <p className="mt-2 max-w-sm text-xs leading-relaxed">
            "Yeni not" ile başla. Yazdığın notlar tüm cihazlarına anında senkronlanır.
          </p>
        </div>
      )}

      <div
        ref={listRef}
        className={cn('flex-1 space-y-2 overflow-y-auto px-3 pb-4 sm:px-6', selectMode && 'touch-none')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {filtered.map((n) => {
          const isSelected = selectedIds.has(n.id)
          return (
            <div
              key={n.id}
              data-note-id={n.id}
              onTouchStart={(e) => handleTouchStart(n.id, e)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={cn(
                'relative block w-full rounded-lg border border-border bg-card/40 p-3 text-left transition-colors',
                n.pinned && !isSelected && 'border-primary/40 bg-primary/5',
                isSelected && 'border-primary bg-primary/10',
                !selectMode && 'hover:border-primary/30',
              )}
            >
              {/* Checkbox (visible in select mode or when selected) */}
              {(selectMode || isSelected) && (
                <button
                  className="absolute left-3 top-3 z-10"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    startDrag(n.id, isSelected, e)
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelection(n.id)
                  }}
                >
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded border',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background/80',
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>
                </button>
              )}

              <button
                className={cn('block w-full text-left', (selectMode || isSelected) && 'pl-8')}
                onClick={() => {
                  if (selectMode) {
                    toggleSelection(n.id)
                  } else {
                    setActiveId(n.id)
                  }
                }}
              >
                <div className="line-clamp-2 text-sm font-medium">
                  {n.title?.trim() || firstLine(n.content, 80) || (
                    <span className="italic text-muted-foreground">Boş not</span>
                  )}
                </div>
                {n.content.length > 80 && (
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {n.content.slice(80, 240)}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{relativeTime(n.updatedAt)}</span>
                  {n.pinned && <Pin className="h-3 w-3 text-primary" />}
                  {n.ai?.tags?.slice(0, 3).map((t) => (
                    <span key={t} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                      {t}
                    </span>
                  ))}
                </div>
              </button>
            </div>
          )
        })}
      </div>

      {/* Sticky bottom bar */}
      {(hasSelection || pendingDelete) && (
        <div className="border-t border-border bg-card px-4 py-3">
          {pendingDelete ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                {pendingDelete.notes.length} not silindi
              </span>
              <button
                onClick={undoDelete}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Undo2 className="h-4 w-4" />
                Geri al
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} not seçili
              </span>
              <button
                onClick={deleteSelected}
                className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 active:bg-destructive/30"
              >
                <Trash2 className="h-4 w-4" />
                Sil
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
