import { useCallback, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { ClipboardCard } from '@/components/ClipboardCard'
import type { ClipboardItem } from '@shared/types'
import { Inbox, Trash2, CheckSquare, Square, Undo2 } from 'lucide-react'

interface PendingDelete {
  items: ClipboardItem[]
  timer: ReturnType<typeof setTimeout>
}

export function Library(): JSX.Element {
  const items = useStore((s) => s.clipboard)
  const upsert = useStore((s) => s.upsertClipboard)
  const removeClipboard = useStore((s) => s.removeClipboard)
  const removeClipboards = useStore((s) => s.removeClipboards)
  const clearClipboard = useStore((s) => s.clearClipboard)
  const shieldClips = useStore((s) => s.shieldClips)
  const unshieldClips = useStore((s) => s.unshieldClips)
  const upsertNote = useStore((s) => s.upsertNote)
  const query = useStore((s) => s.query)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  // drag-to-select
  const dragActive = useRef(false)
  const dragMode = useRef<'select' | 'deselect'>('select')
  const dragVisited = useRef<Set<string>>(new Set())
  const gridRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => {
      if (i.text.toLowerCase().includes(q)) return true
      if (i.ai?.summary?.toLowerCase().includes(q)) return true
      if (i.ai?.tags?.some((t) => t.toLowerCase().includes(q))) return true
      return false
    })
  }, [items, query])

  const onCopy = async (item: ClipboardItem) => {
    await window.snipotter.clipboard.copy(item)
  }
  const onPin = async (item: ClipboardItem) => {
    upsert({ ...item, pinned: !item.pinned })
    await window.snipotter.clipboard.pin(item.id, !item.pinned)
  }
  const onDelete = async (item: ClipboardItem) => {
    removeClipboard(item.id)
    await window.snipotter.clipboard.delete(item.id)
  }
  const onPromote = async (item: ClipboardItem) => {
    const r = await window.snipotter.clipboard.promoteToNote(item)
    if (r.ok && r.data) {
      upsertNote(r.data)
      window.location.hash = '#/notes'
    }
  }
  const onReenrich = async (item: ClipboardItem) => {
    const r = await window.snipotter.ai.reenrich('clipboard', item.id, item.text)
    if (r.ok) upsert({ ...item, ai: r.data })
  }

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = () => setSelectedIds(new Set(filtered.map((i) => i.id)))
  const clearSelection = () => setSelectedIds(new Set())

  const deleteSelected = () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const itemObjects = ids.map((id) => items.find((i) => i.id === id)).filter(Boolean) as ClipboardItem[]

    shieldClips(ids)
    removeClipboards(ids)
    setSelectedIds(new Set())

    if (pendingDelete) {
      clearTimeout(pendingDelete.timer)
      const prevIds = pendingDelete.items.map((i) => i.id)
      void window.snipotter.clipboard.deleteMany(prevIds).then(() => unshieldClips(prevIds))
    }

    const timer = setTimeout(async () => {
      setPendingDelete(null)
      await window.snipotter.clipboard.deleteMany(ids)
      unshieldClips(ids)
    }, 5000)

    setPendingDelete({ items: itemObjects, timer })
  }

  const undoDelete = () => {
    if (!pendingDelete) return
    clearTimeout(pendingDelete.timer)
    unshieldClips(pendingDelete.items.map((i) => i.id))
    pendingDelete.items.forEach((i) => upsert(i))
    setPendingDelete(null)
  }

  const clearAll = async () => {
    if (!window.confirm('Tüm pano geçmişini temizlemek istediğinden emin misin? Sabitlenmiş öğeler korunur.')) return
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer)
      setPendingDelete(null)
    }
    setSelectedIds(new Set())
    clearClipboard()
    await window.snipotter.clipboard.deleteAll()
  }

  // Drag-to-select
  const handleGridPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragActive.current) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const card = el?.closest<HTMLElement>('[data-clip-id]')
    const id = card?.dataset.clipId
    if (!id || dragVisited.current.has(id)) return
    dragVisited.current.add(id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (dragMode.current === 'select') next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleGridPointerUp = useCallback(() => {
    dragActive.current = false
    dragVisited.current = new Set()
  }, [])

  const handleCheckboxPointerDown = useCallback((itemId: string, alreadySelected: boolean, e: React.PointerEvent) => {
    e.preventDefault()
    dragActive.current = true
    dragMode.current = alreadySelected ? 'deselect' : 'select'
    dragVisited.current = new Set([itemId])
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (dragMode.current === 'select') next.add(itemId)
      else next.delete(itemId)
      return next
    })
    try {
      gridRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  const hasSelection = selectedIds.size > 0
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length

  if (filtered.length === 0 && !pendingDelete) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Inbox className="h-8 w-8" />
        {query ? 'Bu aramaya uygun bir şey yok.' : 'Henüz pano geçmişi yok. Bir şey kopyala 👀'}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between border-b border-border bg-card/30 px-4 py-2">
          <button
            onClick={allSelected ? clearSelection : selectAll}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {allSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}
          </button>
          <div className="flex items-center gap-3">
            {hasSelection && (
              <span className="text-xs text-muted-foreground">{selectedIds.size} seçili</span>
            )}
            {!hasSelection && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                title="Pano geçmişini temizle (sabitlenmiş öğeler korunur)"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Tümünü Temizle
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={gridRef}
        className="scrollbar-thin flex-1 overflow-y-auto p-4"
        onPointerMove={handleGridPointerMove}
        onPointerUp={handleGridPointerUp}
        onPointerCancel={handleGridPointerUp}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">
          {filtered.map((item) => (
            <ClipboardCard
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onSelect={() => toggleSelection(item.id)}
              onCheckboxPointerDown={(e) => handleCheckboxPointerDown(item.id, selectedIds.has(item.id), e)}
              onCopy={onCopy}
              onPin={onPin}
              onDelete={onDelete}
              onPromote={onPromote}
              onReenrich={onReenrich}
            />
          ))}
        </div>
      </div>

      {/* Sticky bottom bar */}
      {(hasSelection || pendingDelete) && (
        <div className="border-t border-border bg-card px-4 py-2.5">
          {pendingDelete ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {pendingDelete.items.length} öğe silindi
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
                {selectedIds.size} öğe seçili
              </span>
              <button
                onClick={deleteSelected}
                className="flex items-center gap-1.5 rounded bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Sil
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
