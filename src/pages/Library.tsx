import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { ClipboardCard } from '@/components/ClipboardCard'
import type { ClipboardItem } from '@shared/types'
import { Inbox } from 'lucide-react'

export function Library(): JSX.Element {
  const items = useStore((s) => s.clipboard)
  const upsert = useStore((s) => s.upsertClipboard)
  const remove = useStore((s) => s.removeClipboard)
  const upsertNote = useStore((s) => s.upsertNote)
  const query = useStore((s) => s.query)

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

  if (filtered.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Inbox className="h-8 w-8" />
        {query ? 'Bu aramaya uygun bir şey yok.' : 'Henüz pano geçmişi yok. Bir şey kopyala 👀'}
      </div>
    )
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <ClipboardCard
            key={item.id}
            item={item}
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
