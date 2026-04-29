import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { NoteCard, NoteEditor } from '@/components/NoteCard'
import { Button } from '@/components/ui/Button'
import type { Note } from '@shared/types'
import { Plus } from 'lucide-react'

export function Notes(): JSX.Element {
  const notes = useStore((s) => s.notes)
  const upsert = useStore((s) => s.upsertNote)
  const remove = useStore((s) => s.removeNote)
  const query = useStore((s) => s.query)

  const [activeId, setActiveId] = useState<string | null>(null)

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
  const onUpdate = async (id: string, partial: Partial<Note>) => {
    const r = await window.snipotter.notes.update(id, partial)
    if (r.ok && r.data) upsert(r.data)
  }
  const onPin = async (note: Note) => {
    const r = await window.snipotter.notes.pin(note.id, !note.pinned)
    if (r.ok && r.data) upsert(r.data)
  }
  const onDelete = async (note: Note) => {
    remove(note.id)
    await window.snipotter.notes.delete(note.id)
  }
  const onReenrich = async (note: Note) => {
    const r = await window.snipotter.ai.reenrich('note', note.id, note.content)
    if (r.ok) upsert({ ...note, ai: r.data })
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card/30">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notlar ({filtered.length})
          </span>
          <Button size="sm" variant="ghost" onClick={onCreate}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-2">
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
                onSelect={() => setActiveId(n.id)}
              />
            ))
          )}
        </div>
      </aside>

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
