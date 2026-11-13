import { useMemo, useState } from 'react'
import { Book, BookOpen, ChevronRight, FolderPlus, Hash, Inbox, MoreHorizontal, Notebook as NotebookIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Notebook } from '../types'
import { filterNotes, notebookTree, tagCounts } from './organize'
import type { NoteFilter, NotebookNode } from './organize'

export interface NotebookActions {
  create(name: string, parentId: string | null): Promise<void>
  rename(id: string, name: string): Promise<void>
  remove(id: string): Promise<void>
}

interface Props {
  notebooks: Notebook[]
  notes: Array<{ content: string; title?: string | null; notebookId?: string | null }>
  filter: NoteFilter
  onFilter: (filter: NoteFilter) => void
  actions: NotebookActions
  confirm: (title: string, message: string) => Promise<boolean>
  variant: 'desktop' | 'mobile'
}

const same = (a: NoteFilter, b: NoteFilter): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Notebook tree + tags. Used as the desktop sidebar section and the mobile notebook sheet. */
export function NotebookNav({ notebooks, notes, filter, onFilter, actions, confirm, variant }: Props): JSX.Element {
  const tree = useMemo(() => notebookTree(notebooks), [notebooks])
  const tags = useMemo(() => tagCounts(notes).slice(0, 30), [notes])
  const [editing, setEditing] = useState<{ mode: 'new'; parentId: string | null } | { mode: 'rename'; id: string; name: string } | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const mobile = variant === 'mobile'
  const rowH = mobile ? 'min-h-[44px]' : 'min-h-[32px]'
  const count = (f: NoteFilter): number => filterNotes(notes, f, notebooks).length

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      const msg = (err as Error).message ?? ''
      setError(
        msg.includes('4 levels') ? 'Defterler en fazla 4 kat iç içe olabilir.'
          // Server without migration 0013: PostgREST reports the table as missing.
          : /notebooks|schema cache|does not exist/i.test(msg) ? 'Defterler sunucuda henüz etkin değil.'
          : 'İşlem yapılamadı. Bağlantını kontrol et.',
      )
    }
  }

  const submit = async (name: string): Promise<void> => {
    const trimmed = name.trim()
    const current = editing
    setEditing(null)
    if (!trimmed || !current) return
    await run(() => (current.mode === 'new' ? actions.create(trimmed, current.parentId) : actions.rename(current.id, trimmed)))
  }

  const remove = async (nb: Notebook): Promise<void> => {
    setMenuFor(null)
    const ok = await confirm(`"${nb.name}" silinsin mi?`, 'İçindeki alt defterler de silinir. Notlar silinmez, "Deftersiz" bölümüne taşınır.')
    if (!ok) return
    await run(() => actions.remove(nb.id))
    if (filter.kind === 'notebook' && filter.id === nb.id) onFilter({ kind: 'all' })
  }

  const item = (f: NoteFilter, icon: JSX.Element, label: string, depth = 0, extra?: JSX.Element): JSX.Element => (
    <div className={`group flex items-center rounded-lg ${same(filter, f) ? 'bg-primary/15 text-primary' : 'hover:bg-accent'}`} style={{ paddingLeft: depth * 14 }}>
      <button type="button" onClick={() => onFilter(f)} aria-current={same(filter, f) ? 'true' : undefined} className={`flex flex-1 items-center gap-2 truncate px-2 text-left text-sm ${rowH}`}>
        {icon}
        <span className="flex-1 truncate">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{count(f)}</span>
      </button>
      {extra}
    </div>
  )

  const renderNode = (node: NotebookNode<Notebook>): JSX.Element => {
    const nb = node.notebook
    const open = !collapsed.has(nb.id)
    const toggle = node.children.length > 0 && (
      <button
        type="button"
        aria-label={open ? 'Daralt' : 'Genişlet'}
        onClick={() => setCollapsed((s) => { const n = new Set(s); if (open) n.add(nb.id); else n.delete(nb.id); return n })}
        className="flex h-6 w-5 items-center justify-center text-muted-foreground"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
    )
    return (
      <div key={nb.id}>
        {editing?.mode === 'rename' && editing.id === nb.id ? (
          <NameInput initial={nb.name} depth={node.depth} onDone={(v) => void submit(v)} />
        ) : item(
          { kind: 'notebook', id: nb.id },
          <span className="flex items-center">{toggle || <span className="w-5" />}{open && node.children.length ? <BookOpen className="h-4 w-4 shrink-0" /> : <Book className="h-4 w-4 shrink-0" />}</span>,
          nb.name,
          node.depth,
          <div className="relative">
            <button type="button" aria-label={`${nb.name} seçenekleri`} onClick={() => setMenuFor(menuFor === nb.id ? null : nb.id)} className={`flex items-center justify-center rounded-md text-muted-foreground ${mobile ? 'h-11 w-11' : 'h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuFor === nb.id && (
              <div role="menu" className="absolute right-0 top-full z-30 w-44 rounded-lg border border-border bg-popover p-1 shadow-xl">
                <MenuItem icon={<Pencil className="h-4 w-4" />} label="Yeniden adlandır" onClick={() => { setMenuFor(null); setEditing({ mode: 'rename', id: nb.id, name: nb.name }) }} />
                {node.depth < 3 && <MenuItem icon={<FolderPlus className="h-4 w-4" />} label="Alt defter ekle" onClick={() => { setMenuFor(null); setEditing({ mode: 'new', parentId: nb.id }) }} />}
                <MenuItem icon={<Trash2 className="h-4 w-4" />} label="Sil" danger onClick={() => void remove(nb)} />
              </div>
            )}
          </div>,
        )}
        {open && node.children.map(renderNode)}
        {editing?.mode === 'new' && editing.parentId === nb.id && <NameInput initial="" depth={node.depth + 1} onDone={(v) => void submit(v)} />}
      </div>
    )
  }

  return (
    <nav aria-label="Defterler ve etiketler" className="space-y-0.5 text-sm">
      {item({ kind: 'all' }, <NotebookIcon className="h-4 w-4" />, 'Tüm notlar')}
      {notebooks.length > 0 && item({ kind: 'unfiled' }, <Inbox className="h-4 w-4" />, 'Deftersiz')}

      <div className="flex items-center justify-between px-2 pb-1 pt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Defterler</span>
        <button type="button" onClick={() => setEditing({ mode: 'new', parentId: null })} aria-label="Yeni defter" title="Yeni defter" className={`flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground ${mobile ? 'h-11 w-11' : 'h-6 w-6'}`}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {tree.map(renderNode)}
      {editing?.mode === 'new' && editing.parentId === null && <NameInput initial="" depth={0} onDone={(v) => void submit(v)} />}
      {tree.length === 0 && editing === null && (
        <p className="px-2 py-1 text-xs text-muted-foreground">Notlarını gruplamak için bir defter oluştur.</p>
      )}
      {error && <p role="alert" className="px-2 py-1 text-xs text-destructive">{error}</p>}

      {tags.length > 0 && (
        <>
          <div className="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Etiketler</div>
          <div className="flex flex-wrap gap-1.5 px-2">
            {tags.map(({ tag, count: c }) => {
              const f: NoteFilter = { kind: 'tag', tag }
              return (
                <button key={tag} type="button" onClick={() => onFilter(same(filter, f) ? { kind: 'all' } : f)} aria-pressed={same(filter, f)}
                  className={`flex items-center gap-0.5 rounded-full px-2.5 text-xs ${mobile ? 'h-9' : 'h-7'} ${same(filter, f) ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}>
                  <Hash className="h-3 w-3" />{tag}<span className="ml-1 opacity-60">{c}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </nav>
  )
}

function NameInput({ initial, depth, onDone }: { initial: string; depth: number; onDone: (value: string) => void }): JSX.Element {
  const [value, setValue] = useState(initial)
  return (
    <form onSubmit={(e) => { e.preventDefault(); onDone(value) }} style={{ paddingLeft: depth * 14 + 8 }} className="py-1 pr-2">
      <input
        autoFocus
        value={value}
        maxLength={80}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onDone(value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onDone('') }}
        placeholder="Defter adı"
        aria-label="Defter adı"
        className="h-9 w-full rounded-lg border border-primary/50 bg-background px-2 text-sm outline-none"
      />
    </form>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: JSX.Element; label: string; onClick: () => void; danger?: boolean }): JSX.Element {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${danger ? 'text-destructive' : ''}`}>
      {icon}{label}
    </button>
  )
}
