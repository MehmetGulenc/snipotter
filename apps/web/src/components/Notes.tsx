'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pin, PinOff, Trash2, Loader2, ChevronLeft, Check, CheckSquare, Square, Undo2, X, StickyNote, History, BookOpen } from 'lucide-react'
import { useStore } from '@/lib/store'
import { listNotes, createNote, updateNote, deleteNoteMany, listNotebooks, createNotebook, updateNotebook, deleteNotebook, moveNoteToNotebook } from '@/lib/api'
import { filterNotes, notebookPath, searchNotes } from '@shared/notes/organize'
import { NotebookNav } from '@shared/notes/NotebookNav'
import type { NotebookActions } from '@shared/notes/NotebookNav'
import { Backlinks, Highlighted, NotebookSelect, NotePicker } from '@shared/notes/pickers'
import { cn, relativeTime, firstLine } from '@/lib/utils'
import { App } from '@capacitor/app'
import { NoteEditor as RichEditor } from '@shared/notes/NoteEditor'
import { extractText, noteTitleFallback, toTiptapContent } from '@shared/notes/content'
import { VersionHistory } from '@shared/notes/VersionHistory'
import { TrashView } from '@shared/notes/TrashView'
import type { Editor } from '@tiptap/react'
import { confirmDialog, toast } from '@/lib/feedback'
import { useNoteSync, syncStatusLabel } from '@shared/notes/useNoteSync'
import { createNoteTransport, createNoteAssets, createNoteLibrary, attachLocalNote } from '@/lib/noteTransport'
import { isNative } from '@/lib/mobile'
import type { Note } from '@/lib/types'
import { analyze } from '@/lib/smart'
import { SmartActions } from './SmartActions'

interface PendingDelete {
  notes: Note[]
  timer: ReturnType<typeof setTimeout>
}

export function Notes(): JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const user = useStore((s) => s.user)
  const items = useStore((s) => s.notes)
  const notebooks = useStore((s) => s.notebooks)
  const setNotebooks = useStore((s) => s.setNotebooks)
  const noteFilter = useStore((s) => s.noteFilter)
  const setNoteFilter = useStore((s) => s.setNoteFilter)
  const [showNotebooks, setShowNotebooks] = useState(false)
  const [picker, setPicker] = useState<((n: { id: string; title: string } | null) => void) | null>(null)
  const setItems = useStore((s) => s.setNotes)
  const upsert = useStore((s) => s.upsertNote)
  const removeNotes = useStore((s) => s.removeNotes)
  const shieldNotes = useStore((s) => s.shieldNotes)
  const unshieldNotes = useStore((s) => s.unshieldNotes)
  const query = useStore((s) => s.query)
  const openNoteId = useStore((s) => s.openNoteId)
  const clearOpenNote = useStore((s) => s.clearOpenNote)
  const setEditingNote = useStore((s) => s.setEditingNote)

  const [activeId, setActiveId] = useState<string | null>(null)
  const noteTransport = useMemo(() => (workspace ? createNoteTransport(workspace.id) : null), [workspace?.id])
  const noteAssets = useMemo(() => (workspace ? createNoteAssets(workspace.id) : undefined), [workspace?.id])
  const noteLibrary = useMemo(
    () => (workspace ? createNoteLibrary(workspace.id, (notes) => notes.forEach((n) => useStore.getState().upsertNote(n))) : null),
    [workspace?.id],
  )
  const [showTrash, setShowTrash] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const noteSync = useNoteSync(activeId, noteTransport, { attachLocal: attachLocalNote })

  // Back in the foreground: pull what other devices wrote and push what we wrote offline.
  useEffect(() => {
    if (noteSync.mode !== 'sync') return
    const sync = noteSync.sync
    const onVisible = (): void => { if (document.visibilityState === 'visible') void sync.resume() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    const appSub = isNative() ? App.addListener('appStateChange', ({ isActive }) => { if (isActive) void sync.resume() }) : null
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
      void appSub?.then((h) => h.remove())
    }
  }, [noteSync])
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const dirtyTitle = useRef(false)
  const contentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const scoped = useMemo(() => filterNotes(items, noteFilter, notebooks), [items, noteFilter, notebooks])
  const hits = useMemo(() => (query.trim() ? searchNotes(scoped, query) : null), [scoped, query])
  const filtered = useMemo(() => (hits ? hits.map((h) => h.note) : scoped), [hits, scoped])
  const hitById = useMemo(() => new Map(hits?.map((h) => [h.note.id, h]) ?? []), [hits])
  const filterLabel = noteFilter.kind === 'all' ? 'Tüm notlar'
    : noteFilter.kind === 'unfiled' ? 'Deftersiz'
    : noteFilter.kind === 'tag' ? `#${noteFilter.tag}`
    : notebookPath(notebooks, noteFilter.id) || 'Defter'

  // Linked notes may sit outside the current filter, so look them up in all notes.
  const active = items.find((n) => n.id === activeId) ?? null

  // Open a note requested from elsewhere (a clip turned into a note).
  useEffect(() => {
    if (!openNoteId) return
    setActiveId(openNoteId)
    clearOpenNote()
  }, [openNoteId, clearOpenNote])

  useEffect(() => {
    setEditingNote(Boolean(active))
    return () => setEditingNote(false)
  }, [Boolean(active), setEditingNote])

  // Reset title on note navigation
  useEffect(() => {
    setSaveState('idle')
    dirtyTitle.current = false
    setTitleDraft(active?.title ?? '')
  }, [activeId])

  // Adopt remote title changes when user isn't mid-edit
  useEffect(() => {
    if (!dirtyTitle.current) setTitleDraft(active?.title ?? '')
  }, [active?.id, active?.updatedAt])

  // Title save (only when user has typed)
  useEffect(() => {
    if (!active) return
    if (!dirtyTitle.current) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        await updateNote(active.id, { title: titleDraft.trim() || null })
        upsert({ ...active, title: titleDraft.trim() || null })
        dirtyTitle.current = false
        setSaveState('saved')
      } catch (e) {
        console.warn('title save failed', e)
        setSaveState('error')
      }
    }, 400)
    return () => clearTimeout(t)
  }, [titleDraft, active?.id])

  const onCreate = async () => {
    if (!workspace || !user) return
    setCreating(true)
    try {
      let note = await createNote(workspace.id, user.id, '')
      if (note) {
        // A note created while a notebook is open goes into that notebook.
        if (noteFilter.kind === 'notebook') note = await moveNoteToNotebook(note.id, noteFilter.id).catch(() => note!)
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

  const deleteItems = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const noteObjects = ids.map((id) => items.find((n) => n.id === id)).filter(Boolean) as Note[]

    shieldNotes(ids)
    removeNotes(ids)
    if (activeId && ids.includes(activeId)) setActiveId(null)
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
  }, [items, activeId, pendingDelete, removeNotes, shieldNotes, unshieldNotes])

  const deleteSelected = () => deleteItems(Array.from(selectedIds))

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
    const noteActions = analyze(`${active.title ?? ''}\n${extractText(active.content)}`).actions.filter(
      (a) => a.kind !== 'otp' && a.kind !== 'wifi',
    )
    return (
      <div className="flex h-full flex-col">
        {showHistory && noteLibrary && (
          <VersionHistory
            noteId={active.id}
            library={noteLibrary}
            currentContent={() => (editorRef.current ? JSON.stringify(editorRef.current.getJSON()) : active.content)}
            onRestore={(content) => {
              editorRef.current?.commands.setContent(toTiptapContent(content))
              toast('Sürüm geri yüklendi')
            }}
            onClose={() => setShowHistory(false)}
          />
        )}
        <div className="flex items-center gap-1 px-1 py-1">
          <button
            onClick={() => setActiveId(null)}
            className="flex h-11 items-center gap-0.5 rounded-lg pl-1 pr-3 text-[17px] text-primary transition-opacity duration-100 active:opacity-50"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            Notlar
          </button>
          <div className="flex-1" />
          <NoteAction label={active.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'} onClick={() => void onPin(active)}>
            {active.pinned ? <PinOff className="h-5 w-5" /> : <Pin className="h-5 w-5" />}
          </NoteAction>
          {noteLibrary && (
            <NoteAction label="Sürüm geçmişi" onClick={() => setShowHistory(true)}>
              <History className="h-5 w-5" />
            </NoteAction>
          )}
          <NoteAction label="Notu sil" onClick={() => deleteItems([active.id])}>
            <Trash2 className="h-5 w-5" />
          </NoteAction>
        </div>
        <input
          value={titleDraft}
          onChange={(e) => { dirtyTitle.current = true; setTitleDraft(e.target.value) }}
          placeholder="Başlık"
          aria-label="Not başlığı"
          className="bg-transparent px-4 pb-1 pt-2 text-[24px] font-bold tracking-tight outline-none placeholder:text-muted-foreground/60"
        />
        {notebooks.length > 0 && (
          <div className="px-4 pb-1">
            <NotebookSelect
              notebooks={notebooks}
              value={active.notebookId}
              onChange={(id) => {
                upsert({ ...active, notebookId: id })
                void moveNoteToNotebook(active.id, id).then(upsert).catch(() => toast('Defter değiştirilemedi', 'error'))
              }}
              className="h-9 max-w-[220px] truncate rounded-lg border border-border bg-card px-2 text-sm text-muted-foreground"
            />
          </div>
        )}
        {picker && (
          <NotePicker
            notes={items}
            excludeId={active.id}
            onPick={(n) => { picker({ id: n.id, title: n.title?.trim() || noteTitleFallback(n.content) }); setPicker(null) }}
            onClose={() => { picker(null); setPicker(null) }}
          />
        )}
        <div className="px-4 pb-1 text-xs text-muted-foreground" aria-live="polite">
          {noteSync.mode === 'sync' ? (
            noteSync.status === 'synced' && saveState !== 'saving' ? `${relativeTime(active.updatedAt)} düzenlendi · tüm cihazlarda` : syncStatusLabel(noteSync.status)
          ) : saveState === 'saving' ? 'Kaydediliyor…' : saveState === 'error' ? (
            <span className="text-destructive">Kaydedilemedi, bağlantını kontrol et</span>
          ) : saveState === 'saved' ? 'Tüm cihazlarına kaydedildi' : `${relativeTime(active.updatedAt)} düzenlendi`}
        </div>
        {noteActions.length > 0 && (
          <div className="px-4 pb-2">
            <SmartActions actions={noteActions} />
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {noteSync.mode === 'loading' ? (
            <div className="flex h-full items-start justify-center pt-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Not açılıyor" />
            </div>
          ) : (
            <RichEditor
              key={`${active.id}:${noteSync.mode}`}
              variant="mobile"
              ydoc={noteSync.mode === 'sync' ? noteSync.sync.doc : undefined}
              assets={noteAssets}
              onReady={(ed) => { editorRef.current = ed }}
              links={{
                onTag: (tag) => { setActiveId(null); setNoteFilter({ kind: 'tag', tag }) },
                onOpenNote: (id) => setActiveId(id),
                pickNote: () => new Promise((resolve) => setPicker(() => resolve)),
              }}
              content={active.content}
              noteId={active.id}
              updatedAt={active.updatedAt}
              onUpdate={(jsonContent) => {
                upsert({ ...active, content: jsonContent })
                if (noteSync.mode === 'sync') return
                // Server unreachable on open and nothing cached: save the whole note as before.
                setSaveState('saving')
                if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current)
                contentSaveTimer.current = setTimeout(async () => {
                  try {
                    await updateNote(active.id, { content: jsonContent })
                    setSaveState('saved')
                  } catch (e) {
                    console.warn('note save failed', e)
                    setSaveState('error')
                  }
                }, 600)
              }}
            />
          )}
        </div>
        <Backlinks notes={items} noteId={active.id} onOpen={setActiveId} />
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

  // ─── Trash ───────────────────────────────────────────────────────────────────
  if (showTrash && noteLibrary) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center px-1 py-1">
          <button
            onClick={() => setShowTrash(false)}
            className="flex h-11 items-center gap-0.5 rounded-lg pl-1 pr-3 text-[17px] text-primary active:opacity-50"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            Notlar
          </button>
          <h2 className="flex-1 pr-16 text-center text-[17px] font-semibold">Çöp Kutusu</h2>
        </div>
        <TrashView
          library={noteLibrary}
          variant="mobile"
          confirm={(title, message) => confirmDialog({ title, message, confirmLabel: 'Kalıcı sil', destructive: true })}
          onRestored={(ids) => toast(ids.length === 1 ? 'Not geri yüklendi' : `${ids.length} not geri yüklendi`)}
        />
      </div>
    )
  }

  // ─── List view ───────────────────────────────────────────────────────────────
  const hasSelection = selectedIds.size > 0
  const newNoteButton = (
    <button
      onClick={onCreate}
      disabled={creating}
      className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity duration-100 active:opacity-80 disabled:opacity-60"
    >
      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      Yeni not
    </button>
  )

  const refreshNotebooks = async (): Promise<void> => {
    if (workspace) setNotebooks(await listNotebooks(workspace.id))
  }
  const notebookActions: NotebookActions = {
    create: async (name, parentId) => {
      if (!workspace) return
      await createNotebook(workspace.id, name, parentId)
      await refreshNotebooks()
    },
    rename: async (id, name) => {
      await updateNotebook(id, { name })
      await refreshNotebooks()
    },
    remove: async (id) => {
      await deleteNotebook(id)
      await refreshNotebooks()
    },
  }

  return (
    <div className="flex h-full flex-col">
      {showNotebooks && (
        <div role="dialog" aria-modal="true" aria-label="Defterler" className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={() => setShowNotebooks(false)}>
          <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-card px-2 pb-[max(env(safe-area-inset-bottom),16px)] pt-2" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
            <NotebookNav
              notebooks={notebooks}
              notes={items}
              filter={noteFilter}
              onFilter={(f) => { setNoteFilter(f); setShowNotebooks(false) }}
              actions={notebookActions}
              confirm={(title, message) => confirmDialog({ title, message, confirmLabel: 'Sil', destructive: true })}
              variant="mobile"
            />
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex min-h-[52px] items-center justify-between px-4 py-2 sm:px-6">
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
            <button
              onClick={() => setShowNotebooks(true)}
              className="flex h-11 min-w-0 items-center gap-1.5 rounded-lg pr-2 text-sm text-muted-foreground active:opacity-60"
              aria-label="Defterler ve etiketler"
            >
              <BookOpen className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">{filterLabel} · {filtered.length}</span>
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowTrash(true)}
                aria-label="Çöp kutusu"
                title="Çöp kutusu"
                className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground active:bg-white/10"
              >
                <Trash2 className="h-5 w-5" />
              </button>
              {newNoteButton}
            </div>
          </>
        )}
      </div>

      {!loaded && <div className="py-12 text-center text-xs text-muted-foreground">Yükleniyor…</div>}
      {loaded && filtered.length === 0 && !pendingDelete && (
        <div className="flex h-[60vh] flex-col items-center justify-center px-8 text-center text-muted-foreground">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <StickyNote className="h-8 w-8" aria-hidden="true" />
          </div>
          <div className="text-[17px] font-semibold text-foreground">{query ? 'Sonuç yok' : 'Henüz not yok'}</div>
          <p className="mt-2 max-w-xs text-sm leading-relaxed">
            {query ? 'Aramayı temizle ya da farklı bir kelime dene.' : 'Yazdığın notlar tüm cihazlarında anında güncellenir.'}
          </p>
        </div>
      )}

      <div
        ref={listRef}
        className={cn('flex-1 space-y-2.5 overflow-y-auto px-3 pb-4 sm:px-6', selectMode && 'touch-none')}
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
                'relative block w-full rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-white/[0.04] transition-colors duration-100',
                n.pinned && !isSelected && 'ring-primary/40',
                isSelected && 'bg-primary/10 ring-primary',
                !selectMode && 'active:bg-white/[0.06]',
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
                <div className="line-clamp-2 break-words text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">
                  {n.title?.trim() || noteTitleFallback(n.content) || (
                    <span className="italic text-muted-foreground">Boş not</span>
                  )}
                </div>
                {hitById.get(n.id)?.snippet ? (
                  <div className="mt-1 line-clamp-3 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]"><Highlighted hit={hitById.get(n.id)!} /></div>
                ) : notePreview(n) ? (
                  <div className="mt-1 line-clamp-3 whitespace-pre-line break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{notePreview(n)}</div>
                ) : null}
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {n.pinned && <Pin className="h-3 w-3 text-primary" aria-label="Sabitlendi" />}
                  <span>{relativeTime(n.updatedAt)}</span>
                  {n.notebookId && noteFilter.kind !== 'notebook' && notebookPath(notebooks, n.notebookId) && (
                    <span className="truncate">· {notebookPath(notebooks, n.notebookId)}</span>
                  )}
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
                {pendingDelete.notes.length === 1 ? 'Not silindi' : `${pendingDelete.notes.length} not silindi`}
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

/** Body text under the title: skips the line already shown as the title. */
function notePreview(n: Note): string {
  const text = extractText(n.content).trim()
  if (n.title?.trim()) return text.slice(0, 200)
  const first = firstLine(text, 80)
  return text.slice(first.replace(/…$/, '').length).trim().slice(0, 200)
}

function NoteAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors duration-100 active:bg-white/10"
    >
      {children}
    </button>
  )
}
