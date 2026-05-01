'use client'
import { useEffect, useMemo, useState } from 'react'
import { Plus, Pin, PinOff, Trash2, Loader2, ArrowLeft } from 'lucide-react'
import { useStore } from '@/lib/store'
import { listNotes, createNote, updateNote, deleteNote } from '@/lib/api'
import { cn, relativeTime, firstLine } from '@/lib/utils'
import { Textarea } from './ui/Input'
import { Button } from './ui/Button'
import type { Note } from '@/lib/types'

export function Notes(): JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const user = useStore((s) => s.user)
  const items = useStore((s) => s.notes)
  const setItems = useStore((s) => s.setNotes)
  const upsert = useStore((s) => s.upsertNote)
  const remove = useStore((s) => s.removeNote)
  const query = useStore((s) => s.query)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  // Editor draft is intentionally decoupled from the store. The naive
  // approach (binding <Textarea value> directly to items[activeId].content)
  // races against Supabase realtime: every keystroke does an UPDATE, the
  // postgres_changes channel echoes the row back, upsertNote() rewrites
  // the store, and React re-renders the textarea with stale text — chars
  // typed in the ~150–400ms RTT window get clobbered. Keeping a local
  // draft string makes the editor authoritative for its own content while
  // we save in the background.
  const [draft, setDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)

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

  // When the user opens a different note (or closes the editor), seed the
  // draft from whatever the store currently has for that note. We deliberately
  // key off `activeId` only — not `active.content` — so realtime updates
  // arriving while the user is typing don't reset the textarea mid-edit.
  useEffect(() => {
    setDraft(active?.content ?? '')
    setTitleDraft(active?.title ?? '')
  }, [activeId])

  // Debounced background save. The textarea is bound to `draft` so typing is
  // always smooth; we only push to Supabase 400 ms after the last keystroke,
  // and we only do it if the draft has actually diverged from the store.
  useEffect(() => {
    if (!active) return
    if (draft === active.content) return
    setSavingDraft(true)
    const t = setTimeout(async () => {
      try {
        await updateNote(active.id, { content: draft })
        upsert({ ...active, content: draft })
      } catch (e) {
        console.warn('note save failed', e)
      } finally {
        setSavingDraft(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [draft, active?.id])

  useEffect(() => {
    if (!active) return
    const stored = active.title ?? ''
    if (titleDraft === stored) return
    const t = setTimeout(async () => {
      try {
        await updateNote(active.id, { title: titleDraft.trim() || null })
        upsert({ ...active, title: titleDraft.trim() || null })
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

  // Mobile: 2-pane responsive — list OR editor
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
          onChange={(e) => setTitleDraft(e.target.value)}
          placeholder="Başlık (opsiyonel)"
          className="border-b border-border bg-transparent px-4 py-3 text-base font-semibold outline-none placeholder:text-muted-foreground"
        />
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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

  return (
    <div className="space-y-2 px-3 pb-24 pt-3 sm:px-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {filtered.length} not
        </h2>
        <Button onClick={onCreate} disabled={creating} size="sm">
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Yeni not
        </Button>
      </div>

      {!loaded && <div className="py-12 text-center text-xs text-muted-foreground">Yükleniyor…</div>}
      {loaded && filtered.length === 0 && (
        <div className="flex h-[50vh] flex-col items-center justify-center px-8 text-center text-muted-foreground">
          <div className="text-sm font-medium text-foreground">Henüz not yok</div>
          <p className="mt-2 max-w-sm text-xs leading-relaxed">
            "Yeni not" ile başla. Yazdığın notlar tüm cihazlarına anında senkronlanır.
          </p>
        </div>
      )}

      {filtered.map((n) => (
        <button
          key={n.id}
          onClick={() => setActiveId(n.id)}
          className={cn(
            'block w-full rounded-lg border border-border bg-card/40 p-3 text-left transition-colors hover:border-primary/30',
            n.pinned && 'border-primary/40 bg-primary/5',
          )}
        >
          <div className="line-clamp-2 text-sm font-medium">
            {n.title?.trim() || firstLine(n.content, 80) || <span className="italic text-muted-foreground">Boş not</span>}
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
      ))}
    </div>
  )
}
