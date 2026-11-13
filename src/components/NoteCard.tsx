import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Note } from '@shared/types'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { relativeTime } from '@/lib/utils'
import { NoteEditor as RichEditor } from '@shared/notes/NoteEditor'
import { extractText, imageSources, noteTitleFallback, tiptapToMarkdown, tiptapToHtml, toTiptapContent } from '@shared/notes/content'
import type { SrcMap } from '@shared/notes/content'
import { ASSET_PREFIX, resolveAsset } from '@shared/notes/assets'
import { Pin, PinOff, Sparkles, Trash2, Check, FileDown, FileText, Loader2, History } from 'lucide-react'
import type { Editor as TiptapEditorInstance } from '@tiptap/react'
import { VersionHistory } from '@shared/notes/VersionHistory'
import { Backlinks, Highlighted, NotebookSelect, NotePicker } from '@shared/notes/pickers'
import type { SearchHit } from '@shared/notes/organize'
import { useStore } from '@/store/useStore'
import type { NoteLibrary } from '@shared/notes/library'
import { isMas } from '@/lib/runtime'
import { useNoteSync, syncStatusLabel } from '@shared/notes/useNoteSync'
import { createNoteTransport, createNoteAssets, attachLocalNote } from '@/lib/noteTransport'

interface Props {
  note: Note
  active: boolean
  selected?: boolean
  onSelect: () => void
  onToggleSelect?: () => void
  onCheckboxPointerDown?: (e: React.PointerEvent) => void
  /** Search match: the excerpt replaces the preview, matches highlighted. */
  hit?: Pick<SearchHit<unknown>, 'snippet' | 'ranges'>
  notebookLabel?: string
}

export const NoteCard = memo(function NoteCard({
  note,
  active,
  selected,
  onSelect,
  onToggleSelect,
  onCheckboxPointerDown,
  hit,
  notebookLabel,
}: Props): JSX.Element {
  return (
    <button
      data-note-id={note.id}
      onClick={(e) => {
        if (onToggleSelect && (e.target as HTMLElement).closest('.select-area')) {
          onToggleSelect()
          return
        }
        onSelect()
      }}
      className={`group relative flex w-full flex-col items-start gap-1 rounded-xl border px-4 py-4 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/5'
          : active
            ? 'border-primary/30 bg-primary/5'
            : 'border-transparent bg-background/70 hover:border-border hover:bg-background'
      }`}
    >
      {/* Selection checkbox */}
      {onToggleSelect && (
        <div
          className="select-area absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-colors"
          onPointerDown={(e) => {
            e.stopPropagation()
            onCheckboxPointerDown?.(e)
          }}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
        >
          <div
            className={`flex h-full w-full items-center justify-center rounded ${
              selected ? 'bg-primary text-primary-foreground' : 'bg-background/80 group-hover:border-primary/50'
            }`}
          >
            {selected && <Check className="h-3.5 w-3.5" />}
          </div>
        </div>
      )}
      <div className={`flex w-full items-center justify-between gap-2 ${onToggleSelect ? 'pl-7' : ''}`}>
        <span className="truncate text-sm font-medium">
          {note.title?.trim() || noteTitleFallback(note.content) || 'Yeni not'}
        </span>
        {note.pinned && <Badge variant="default">Sabit</Badge>}
      </div>
      {hit?.snippet ? (
        <span className="line-clamp-2 text-xs text-muted-foreground"><Highlighted hit={hit} /></span>
      ) : (
        <span className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
          {extractText(note.content) || 'Boş not'}
        </span>
      )}
      <div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{relativeTime(note.updatedAt)}{notebookLabel ? ` · ${notebookLabel}` : ''}</span>
        {note.ai?.tags?.[0] && <span>#{note.ai.tags[0]}</span>}
      </div>
    </button>
  )
})

let sharedTransport: ReturnType<typeof createNoteTransport> | null = null
const noteTransport = (): ReturnType<typeof createNoteTransport> => (sharedTransport ??= createNoteTransport())
const noteAssets = createNoteAssets()

/** Signed URLs for Storage images so exports can embed them. */
async function exportSrcMap(content: string): Promise<SrcMap> {
  const map: SrcMap = {}
  await Promise.all(imageSources(content).filter((s) => s.startsWith(ASSET_PREFIX)).map(async (s) => {
    try { map[s] = await resolveAsset(noteAssets, s) } catch { /* left out of the export */ }
  }))
  return map
}

interface EditorProps {
  note: Note | null
  onUpdate: (id: string, partial: Partial<Note>) => void
  /** Content changed under Yjs sync: refresh list previews only, the sync layer saves. */
  onLocalContent: (id: string, content: string) => void
  onDelete: (note: Note) => void
  onPin: (note: Note) => void
  onReenrich: (note: Note) => void
  /** Version history; omitted in tests. */
  library?: NoteLibrary
  onOpenNote?: (id: string) => void
  onTag?: (tag: string) => void
}

export function NoteEditor({ note, onUpdate, onLocalContent, onDelete, onPin, onReenrich, library, onOpenNote, onTag }: EditorProps): JSX.Element {
  const allNotes = useStore((s) => s.notes)
  const notebooks = useStore((s) => s.notebooks)
  const upsertNote = useStore((s) => s.upsertNote)
  const [picker, setPicker] = useState<((n: { id: string; title: string } | null) => void) | null>(null)
  const [title, setTitle] = useState(note?.title ?? '')
  const titleDirty = useRef(false)
  const [showHistory, setShowHistory] = useState(false)
  const editorRef = useRef<TiptapEditorInstance | null>(null)
  const noteSync = useNoteSync(note?.id ?? null, noteTransport(), { attachLocal: attachLocalNote })

  useEffect(() => {
    if (noteSync.mode !== 'sync') return
    const sync = noteSync.sync
    const resume = (): void => void sync.resume()
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    return () => {
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
    }
  }, [noteSync])

  useEffect(() => {
    titleDirty.current = false
    setTitle(note?.title ?? '')
  }, [note?.id])

  useEffect(() => {
    if (titleDirty.current) return
    setTitle(note?.title ?? '')
  }, [note?.updatedAt])

  // Debounced title save
  useEffect(() => {
    if (!note || !titleDirty.current) return
    const t = setTimeout(() => {
      onUpdate(note.id, { title: title || null })
      titleDirty.current = false
    }, 600)
    return () => clearTimeout(t)
  }, [title, note?.id, onUpdate])

  const syncMode = noteSync.mode
  const handleContentUpdate = useCallback(
    (jsonContent: string) => {
      if (!note) return
      if (syncMode === 'sync') onLocalContent(note.id, jsonContent)
      else onUpdate(note.id, { content: jsonContent })
    },
    [note?.id, onUpdate, onLocalContent, syncMode],
  )

  if (!note) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        Soldan bir not seç ya da Cmd+Shift+N ile yenisini oluştur.
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-r-2xl border border-l-0 border-border bg-card">
      {showHistory && library && (
        <VersionHistory
          noteId={note.id}
          library={library}
          currentContent={() => (editorRef.current ? JSON.stringify(editorRef.current.getJSON()) : note.content)}
          onRestore={(content) => editorRef.current?.commands.setContent(toTiptapContent(content))}
          onClose={() => setShowHistory(false)}
        />
      )}
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-6 py-4">
        <input
          value={title}
          aria-label="Not başlığı" placeholder="Başlıksız not"
          onChange={(e) => {
            titleDirty.current = true
            setTitle(e.target.value)
          }}
          className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground"
        />
        {!isMas() && (
          <Button variant="ghost" size="icon" title="AI ile yeniden işle" onClick={() => onReenrich(note)}>
            <Sparkles className="h-4 w-4" />
          </Button>
        )}
        {notebooks.length > 0 && (
          <NotebookSelect
            notebooks={notebooks}
            value={note.notebookId}
            onChange={(id) => {
              upsertNote({ ...note, notebookId: id })
              void window.snipotter.notes.move(note.id, id).then((r) => { if (r.ok) upsertNote(r.data) })
            }}
          />
        )}
        {library && (
          <Button variant="ghost" size="icon" title="Sürüm geçmişi" aria-label="Sürüm geçmişi" onClick={() => setShowHistory(true)}>
            <History className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          title="Markdown olarak dışa aktar"
          onClick={() => {
            const slug = (note.title?.trim() || 'not').replace(/[^a-z0-9ğüşıöçA-ZĞÜŞİÖÇ\s]/gi, '').trim().replace(/\s+/g, '-') || 'not'
            void exportSrcMap(note.content).then((map) => window.snipotter.notes.exportMd(`${slug}.md`, tiptapToMarkdown(note.title, note.content, map)))
          }}
        >
          <FileText className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="PDF olarak dışa aktar"
          onClick={() => {
            const slug = (note.title?.trim() || 'not').replace(/[^a-z0-9ğüşıöçA-ZĞÜŞİÖÇ\s]/gi, '').trim().replace(/\s+/g, '-') || 'not'
            void exportSrcMap(note.content).then((map) => window.snipotter.notes.exportPdf(`${slug}.pdf`, tiptapToHtml(note.title, note.content, map)))
          }}
        >
          <FileDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title={note.pinned ? 'Sabitten kaldır' : 'Sabitle'} onClick={() => onPin(note)}>
          {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" title="Sil" onClick={() => onDelete(note)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {/* AI summary strip */}
      {note.ai && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-card/30 px-4 py-2 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">{note.ai.summary}</span>
          {note.ai.tags?.map((t) => (
            <Badge key={t} variant="secondary">{t}</Badge>
          ))}
        </div>
      )}

      {/* Tiptap rich-text editor */}
      <div className="flex-1 overflow-hidden">
        {noteSync.mode === 'loading' ? (
          <div className="flex h-full items-start justify-center pt-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Not açılıyor" />
          </div>
        ) : (
        <RichEditor
          key={`${note.id}:${noteSync.mode}`}
          content={note.content}
          noteId={note.id}
          updatedAt={note.updatedAt}
          onUpdate={handleContentUpdate}
          ydoc={noteSync.mode === 'sync' ? noteSync.sync.doc : undefined}
          assets={noteAssets}
          onReady={(ed) => { editorRef.current = ed }}
          links={{
            onTag,
            onOpenNote,
            pickNote: () => new Promise((resolve) => setPicker(() => resolve)),
          }}
          variant="desktop"
        />
        )}
      </div>

      {picker && (
        <NotePicker
          notes={allNotes}
          excludeId={note.id}
          onPick={(n) => { picker({ id: n.id, title: n.title?.trim() || noteTitleFallback(n.content) }); setPicker(null) }}
          onClose={() => { picker(null); setPicker(null) }}
        />
      )}
      {onOpenNote && <Backlinks notes={allNotes} noteId={note.id} onOpen={onOpenNote} />}

      {/* Footer */}
      <div className="shrink-0 border-t border-border px-6 py-3 text-xs text-muted-foreground" aria-live="polite">
        Son güncelleme: {relativeTime(note.updatedAt)}
        {noteSync.mode === 'sync'
          ? ` · ${syncStatusLabel(noteSync.status)}`
          : !note.synced && ' · senkron bekliyor'}
      </div>
    </div>
  )
}
