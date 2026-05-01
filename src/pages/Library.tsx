import { useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { ClipboardCard } from '@/components/ClipboardCard'
import type { ClipboardItem } from '@shared/types'
import { Inbox, Trash2, CheckSquare, Square } from 'lucide-react'

export function Library(): JSX.Element {
  const items = useStore((s) => s.clipboard)
  const upsert = useStore((s) => s.upsertClipboard)
  const remove = useStore((s) => s.removeClipboard)
  const upsertNote = useStore((s) => s.upsertNote)
  const query = useStore((s) => s.query)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

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
    remove(item.id)
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

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((i) => i.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`${selectedIds.size} öğeyi silmek istediğine emin misin?`)) return
    setBulkDeleting(true)
    const ids = Array.from(selectedIds)
    // Optimistic: remove from UI immediately
    ids.forEach((id) => remove(id))
    setSelectedIds(new Set())
    // Then delete from backend
    for (const id of ids) {
      await window.snipotter.clipboard.delete(id)
    }
    setBulkDeleting(false)
  }

  if (filtered.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Inbox className="h-8 w-8" />
        {query ? 'Bu aramaya uygun bir şey yok.' : 'Henüz pano geçmişi yok. Bir şey kopyala 👀'}
      </div>
    )
  }

  const hasSelection = selectedIds.size > 0
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length

  return (
    <div className="scrollbar-thin h-full overflow-y-auto p-4">
      {/* Selection toolbar */}
      {filtered.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={allSelected ? clearSelection : selectAll}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              disabled={bulkDeleting}
            >
              {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}
            </button>
            {hasSelection && (
              <span className="text-xs text-muted-foreground">{selectedIds.size} seçili</span>
            )}
          </div>
          {hasSelection && (
            <button
              onClick={deleteSelected}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 rounded bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {bulkDeleting ? 'Siliniyor...' : 'Seçilileri Sil'}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">
        {filtered.map((item) => (
          <ClipboardCard
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            onSelect={() => toggleSelection(item.id)}
            onCopy={onCopy}
            onPin={onPin}
            onDelete={onDelete}
            onPromote={onPromote}
            onReenrich={onReenrich}
          />
        ))}
      </div>
    </div>
  )
}
