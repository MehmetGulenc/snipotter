/** Tags, note links, notebook trees and search. Pure: shared by desktop and iOS/web. */
import type { JSONContent } from '@tiptap/core'
import { extractText } from './content'

// ── Tags ──────────────────────────────────────────────────────────────────────

/** `#alışveriş`, `#proje-x`: a letter first, then letters, digits, `_` or `-`; 2–40 chars. */
export const TAG_RE = /(^|[\s(\[{,.;:!?])#(\p{L}[\p{L}\p{N}_-]{1,39})/gu

const trLower = (s: string): string => s.toLocaleLowerCase('tr-TR')

/** Unique tags in a note, lower-cased (Turkish rules), in order of first use. */
export function noteTags(content: string, title?: string | null): string[] {
  const text = `${title ?? ''}\n${extractText(content)}`
  const seen = new Set<string>()
  for (const m of text.matchAll(TAG_RE)) seen.add(trLower(m[2]))
  return [...seen]
}

/** Tag → number of notes using it, most used first. */
export function tagCounts(notes: Array<{ content: string; title?: string | null }>): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>()
  for (const n of notes) for (const t of noteTags(n.content, n.title)) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'tr'))
}

// ── Note links ────────────────────────────────────────────────────────────────

/** Notes link to each other with ordinary link marks, so older app versions keep them. */
export const NOTE_LINK_PREFIX = 'snipotter://note/'
const NOTE_LINK_RE = /^snipotter:\/\/note\/([0-9a-f-]{36})$/i

export function noteLinkHref(noteId: string): string {
  return `${NOTE_LINK_PREFIX}${noteId}`
}

export function noteIdFromHref(href: string | null | undefined): string | null {
  return href ? NOTE_LINK_RE.exec(href)?.[1] ?? null : null
}

/** Ids of notes this note links to. */
export function linkedNoteIds(content: string): string[] {
  const out = new Set<string>()
  let doc: JSONContent
  try {
    doc = JSON.parse(content)
  } catch {
    return []
  }
  const walk = (n: JSONContent): void => {
    for (const mark of n.marks ?? []) {
      const id = mark.type === 'link' ? noteIdFromHref(mark.attrs?.href as string) : null
      if (id) out.add(id)
    }
    n.content?.forEach(walk)
  }
  walk(doc)
  return [...out]
}

/** Notes that link to `noteId`. */
export function backlinks<T extends { id: string; content: string }>(notes: T[], noteId: string): T[] {
  return notes.filter((n) => n.id !== noteId && n.content.includes(noteId) && linkedNoteIds(n.content).includes(noteId))
}

// ── Notebooks ─────────────────────────────────────────────────────────────────

export interface NotebookLike {
  id: string
  parentId: string | null
  name: string
  sort: number
}

export interface NotebookNode<T extends NotebookLike> {
  notebook: T
  depth: number
  children: NotebookNode<T>[]
}

/** Nested tree ordered by `sort`, then name. Orphans (missing parent) become roots. */
export function notebookTree<T extends NotebookLike>(notebooks: T[]): NotebookNode<T>[] {
  const ids = new Set(notebooks.map((n) => n.id))
  const byParent = new Map<string | null, T[]>()
  for (const n of notebooks) {
    const parent = n.parentId && ids.has(n.parentId) ? n.parentId : null
    byParent.set(parent, [...(byParent.get(parent) ?? []), n])
  }
  const build = (parent: string | null, depth: number, path: Set<string>): NotebookNode<T>[] =>
    (byParent.get(parent) ?? [])
      .filter((n) => !path.has(n.id))
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'tr'))
      .map((n) => ({ notebook: n, depth, children: build(n.id, depth + 1, new Set([...path, n.id])) }))
  return build(null, 0, new Set())
}

/** The notebook and all notebooks nested under it. */
export function notebookAndDescendants(notebooks: NotebookLike[], id: string): Set<string> {
  const out = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const n of notebooks) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id)
        grew = true
      }
    }
  }
  return out
}

/** "İş › Toplantılar" */
export function notebookPath(notebooks: NotebookLike[], id: string | null | undefined): string {
  const byId = new Map(notebooks.map((n) => [n.id, n]))
  const parts: string[] = []
  let cur = id ? byId.get(id) : undefined
  while (cur && parts.length < 8) {
    parts.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.join(' › ')
}

// ── Filters ───────────────────────────────────────────────────────────────────

/** What the notes list shows: everything, one notebook (with sub-notebooks), unfiled, or one #tag. */
export type NoteFilter = { kind: 'all' } | { kind: 'notebook'; id: string } | { kind: 'unfiled' } | { kind: 'tag'; tag: string }

export function filterNotes<T extends { content: string; title?: string | null; notebookId?: string | null }>(
  notes: T[],
  filter: NoteFilter,
  notebooks: NotebookLike[],
): T[] {
  switch (filter.kind) {
    case 'all':
      return notes
    case 'unfiled': {
      const ids = new Set(notebooks.map((n) => n.id))
      return notes.filter((n) => !n.notebookId || !ids.has(n.notebookId))
    }
    case 'notebook': {
      const ids = notebookAndDescendants(notebooks, filter.id)
      return notes.filter((n) => n.notebookId && ids.has(n.notebookId))
    }
    case 'tag':
      return notes.filter((n) => noteTags(n.content, n.title).includes(filter.tag))
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchHit<T> {
  note: T
  score: number
  /** Body excerpt around the first match; `ranges` index into it. */
  snippet: string
  ranges: Array<[number, number]>
}

const fold = (s: string): string =>
  trLower(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')

/**
 * Every word of the query must appear in the title, body or tags (accent- and
 * case-insensitive). Title matches rank above body matches; `#tag` words only
 * match tags.
 */
export function searchNotes<T extends { content: string; title?: string | null; updatedAt: string }>(
  notes: T[],
  query: string,
): Array<SearchHit<T>> {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const tagWords = words.filter((w) => w.startsWith('#') && w.length > 1).map((w) => trLower(w.slice(1)))
  const textWords = words.filter((w) => !w.startsWith('#')).map(fold)
  const hits: Array<SearchHit<T>> = []
  for (const note of notes) {
    const body = extractText(note.content)
    const title = note.title ?? ''
    if (tagWords.length && !tagWords.every((t) => noteTags(note.content, note.title).includes(t))) continue
    const ft = fold(title)
    const fb = fold(body)
    let score = tagWords.length * 2
    let ok = true
    for (const w of textWords) {
      if (ft.includes(w)) score += 3
      else if (fb.includes(w)) score += 1
      else { ok = false; break }
    }
    if (!ok) continue
    const { snippet, ranges } = excerpt(body, textWords)
    hits.push({ note, score, snippet, ranges })
  }
  return hits.sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt))
}

/** ~160 chars around the first match, with match ranges for highlighting. */
export function excerpt(text: string, foldedWords: string[], width = 160): { snippet: string; ranges: Array<[number, number]> } {
  const flat = text.replace(/\s+/g, ' ').trim()
  // fold() keeps length for Turkish text (combining marks are stripped after NFD), so
  // positions in the folded string line up with the original for these scripts.
  const folded = fold(flat)
  const aligned = folded.length === flat.length
  const first = aligned ? Math.min(...foldedWords.map((w) => folded.indexOf(w)).filter((i) => i >= 0), Infinity) : Infinity
  const start = Number.isFinite(first) ? Math.max(0, first - 40) : 0
  const snippet = (start > 0 ? '…' : '') + flat.slice(start, start + width) + (start + width < flat.length ? '…' : '')
  const ranges: Array<[number, number]> = []
  if (aligned) {
    const fs = fold(snippet)
    for (const w of foldedWords) {
      if (!w) continue
      let i = fs.indexOf(w)
      while (i >= 0) {
        ranges.push([i, i + w.length])
        i = fs.indexOf(w, i + w.length)
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  return { snippet, ranges: mergeRanges(ranges) }
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const r of ranges) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else out.push([...r])
  }
  return out
}
