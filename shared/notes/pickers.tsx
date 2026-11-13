import { useMemo, useState } from 'react'
import { Link2, Search, X } from 'lucide-react'
import type { Notebook } from '../types'
import { noteTitleFallback } from './content'
import { backlinks, notebookTree, searchNotes } from './organize'
import type { NotebookNode, SearchHit } from './organize'

interface PickableNote {
  id: string
  title?: string | null
  content: string
  updatedAt: string
}

const titleOf = (n: PickableNote): string => n.title?.trim() || noteTitleFallback(n.content) || 'Adsız not'

/** Native select: an indented notebook tree; iOS shows its picker wheel. */
export function NotebookSelect({ notebooks, value, onChange, className }: {
  notebooks: Notebook[]
  value: string | null | undefined
  onChange: (notebookId: string | null) => void
  className?: string
}): JSX.Element {
  const options: Array<{ id: string; label: string }> = []
  const walk = (nodes: NotebookNode<Notebook>[]): void => {
    for (const n of nodes) {
      options.push({ id: n.notebook.id, label: `${' '.repeat(n.depth)}${n.notebook.name}` })
      walk(n.children)
    }
  }
  walk(notebookTree(notebooks))
  return (
    <select
      aria-label="Defter"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={className ?? 'h-8 max-w-[180px] truncate rounded-lg border border-border bg-background px-2 text-xs'}
    >
      <option value="">Deftersiz</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )
}

/** Search-as-you-type note chooser for `[[` links. */
export function NotePicker<T extends PickableNote>({ notes, excludeId, onPick, onClose }: {
  notes: T[]
  excludeId?: string
  onPick: (note: T) => void
  onClose: () => void
}): JSX.Element {
  const [q, setQ] = useState('')
  const candidates = useMemo(() => notes.filter((n) => n.id !== excludeId), [notes, excludeId])
  const results: T[] = useMemo(
    () => (q.trim() ? searchNotes(candidates, q).map((h) => h.note) : [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))).slice(0, 30),
    [candidates, q],
  )
  return (
    <div role="dialog" aria-modal="true" aria-label="Bağlanacak notu seç" className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]" onClick={onClose}>
      <div className="w-[min(92vw,480px)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'Enter' && results[0]) onPick(results[0])
            }}
            placeholder="Bağlanacak notu ara…"
            aria-label="Not ara"
            className="h-12 flex-1 bg-transparent text-sm outline-none"
          />
          <button type="button" onClick={onClose} aria-label="Kapat" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Not bulunamadı.</li>}
          {results.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onPick(n)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-accent">
                <Link2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{titleOf(n)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** "Bu nota bağlananlar" under the editor. */
export function Backlinks<T extends PickableNote>({ notes, noteId, onOpen }: { notes: T[]; noteId: string; onOpen: (id: string) => void }): JSX.Element | null {
  const linking = useMemo(() => backlinks(notes, noteId), [notes, noteId])
  if (linking.length === 0) return null
  return (
    <div className="border-t border-border px-4 py-2">
      <div className="mb-1 text-xs font-medium text-muted-foreground">Bu nota bağlananlar</div>
      <div className="flex flex-wrap gap-1.5">
        {linking.map((n) => (
          <button key={n.id} type="button" onClick={() => onOpen(n.id)} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary hover:bg-primary/20">
            <Link2 className="h-3 w-3" aria-hidden="true" />{titleOf(n)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Search excerpt with matches highlighted. */
export function Highlighted({ hit }: { hit: Pick<SearchHit<unknown>, 'snippet' | 'ranges'> }): JSX.Element {
  const parts: JSX.Element[] = []
  let at = 0
  hit.ranges.forEach(([s, e], i) => {
    if (s > at) parts.push(<span key={`t${i}`}>{hit.snippet.slice(at, s)}</span>)
    parts.push(<mark key={`m${i}`} className="rounded bg-primary/25 px-0.5 text-foreground">{hit.snippet.slice(s, e)}</mark>)
    at = e
  })
  if (at < hit.snippet.length) parts.push(<span key="end">{hit.snippet.slice(at)}</span>)
  return <>{parts}</>
}
