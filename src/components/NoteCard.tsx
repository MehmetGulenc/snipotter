import { memo, useEffect, useRef, useState } from 'react'
import type { Note } from '@shared/types'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { firstLine, relativeTime } from '@/lib/utils'
import { Pin, PinOff, Sparkles, Trash2, Check } from 'lucide-react'

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
          {note.title?.trim() || firstLine(note.content) || 'Yeni not'}
        </span>
        {note.pinned && <Badge variant="default">pinned</Badge>}
      </div>
      <span className="line-clamp-2 text-xs text-muted-foreground">
        {note.content || 'Boş not'}
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
  const [content, setContent] = useState(note?.content ?? '')
  const dirty = useRef(false)

  // Reset dirty flag when the user navigates to a different note so the
  // remote-update sync below can re-engage cleanly.
  useEffect(() => {
    dirty.current = false
  }, [note?.id])

  // Sync editor state from props. Two cases:
  // - note.id changed: user navigated to a different note → adopt that note's text.
  // - note.id same but title/content changed: a remote edit arrived. Only adopt if
  //   the user isn't mid-edit (dirty) — otherwise we'd clobber unsaved local keystrokes.
  //   After 600ms of inactivity our debounce flushes and dirty resets, so subsequent
  //   remote updates flow through automatically.
  useEffect(() => {
    if (dirty.current) return
    setTitle(note?.title ?? '')
    setContent(note?.content ?? '')
  }, [note?.id, note?.title, note?.content])

  // Debounced auto-save
  useEffect(() => {
    if (!note) return
    if (!dirty.current) return
    const t = setTimeout(() => {
      onUpdate(note.id, { title: title || null, content })
      dirty.current = false
    }, 600)
    return () => clearTimeout(t)
  }, [title, content, note?.id, onUpdate])

  if (!note) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        Soldan bir not seç ya da Cmd+Shift+N ile yenisini oluştur.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <input
          value={title}
          placeholder="Başlık (opsiyonel)"
          onChange={(e) => {
            dirty.current = true
            setTitle(e.target.value)
          }}
          className="flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground"
        />
        <Button variant="ghost" size="icon" title="AI ile yeniden işle" onClick={() => onReenrich(note)}>
          <Sparkles className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title={note.pinned ? 'Sabitten kaldır' : 'Sabitle'} onClick={() => onPin(note)}>
          {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" title="Sil" onClick={() => onDelete(note)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {note.ai && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-card/30 px-4 py-2 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">{note.ai.summary}</span>
          {note.ai.tags?.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </div>
      )}

      <textarea
        value={content}
        onChange={(e) => {
          dirty.current = true
          setContent(e.target.value)
        }}
        placeholder="Notunu yaz…"
        className="flex-1 resize-none bg-transparent p-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
      />

      <div className="border-t border-border px-4 py-1.5 text-[10px] text-muted-foreground">
        Son güncelleme: {relativeTime(note.updatedAt)} · {content.length} karakter
        {!note.synced && ' · senkron bekliyor'}
      </div>
    </div>
  )
}
