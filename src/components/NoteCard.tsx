import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Note } from '@shared/types'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { relativeTime } from '@/lib/utils'
import { TiptapEditor, extractText, tiptapToMarkdown, tiptapToHtml } from './TiptapEditor'
import { Pin, PinOff, Sparkles, Trash2, Check, FileDown, FileText } from 'lucide-react'

interface Props {
  note: Note
  active: boolean
  selected?: boolean
  onSelect: () => void
  onToggleSelect?: () => void
  onCheckboxPointerDown?: (e: React.PointerEvent) => void
}

export const NoteCard = memo(function NoteCard({
  note,
  active,
  selected,
  onSelect,
  onToggleSelect,
  onCheckboxPointerDown,
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
      className={`group relative flex w-full flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/5'
          : active
            ? 'border-primary/40 bg-card'
            : 'border-transparent bg-card/30 hover:bg-card/60'
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
          {note.title?.trim() || extractText(note.content).split('\n')[0] || 'Yeni not'}
        </span>
        {note.pinned && <Badge variant="default">pinned</Badge>}
      </div>
      <span className="line-clamp-2 text-xs text-muted-foreground">
        {extractText(note.content) || 'Boş not'}
      </span>
      <div className="flex w-full items-center justify-between text-[10px] text-muted-foreground">
        <span>{relativeTime(note.updatedAt)}</span>
        {note.ai?.tags?.[0] && <span>#{note.ai.tags[0]}</span>}
      </div>
    </button>
  )
})

interface EditorProps {
  note: Note | null
  onUpdate: (id: string, partial: Partial<Note>) => void
  onDelete: (note: Note) => void
  onPin: (note: Note) => void
  onReenrich: (note: Note) => void
}

export function NoteEditor({ note, onUpdate, onDelete, onPin, onReenrich }: EditorProps): JSX.Element {
  const [title, setTitle] = useState(note?.title ?? '')
  const titleDirty = useRef(false)

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

  const handleContentUpdate = useCallback(
    (jsonContent: string) => {
      if (!note) return
      onUpdate(note.id, { content: jsonContent })
    },
    [note?.id, onUpdate],
  )

  if (!note) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        Soldan bir not seç ya da Cmd+Shift+N ile yenisini oluştur.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
        <input
          value={title}
          placeholder="Başlık (opsiyonel)"
          onChange={(e) => {
            titleDirty.current = true
            setTitle(e.target.value)
          }}
          className="flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground"
        />
        <Button variant="ghost" size="icon" title="AI ile yeniden işle" onClick={() => onReenrich(note)}>
          <Sparkles className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Markdown olarak dışa aktar"
          onClick={() => {
            const slug = (note.title?.trim() || 'not').replace(/[^a-z0-9ğüşıöçA-ZĞÜŞİÖÇ\s]/gi, '').trim().replace(/\s+/g, '-') || 'not'
            const md = tiptapToMarkdown(note.title, note.content)
            void window.snipotter.notes.exportMd(`${slug}.md`, md)
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
            const html = tiptapToHtml(note.title, note.content)
            void window.snipotter.notes.exportPdf(`${slug}.pdf`, html)
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
        <TiptapEditor
          content={note.content}
          noteId={note.id}
          noteUpdatedAt={note.updatedAt}
          onUpdate={handleContentUpdate}
        />
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border px-4 py-1.5 text-[10px] text-muted-foreground">
        Son güncelleme: {relativeTime(note.updatedAt)}
        {!note.synced && ' · senkron bekliyor'}
      </div>
    </div>
  )
}
