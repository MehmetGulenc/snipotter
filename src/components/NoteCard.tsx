import { useEffect, useRef, useState } from 'react'
import type { Note } from '@shared/types'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { firstLine, relativeTime } from '@/lib/utils'
import { Pin, PinOff, Sparkles, Trash2 } from 'lucide-react'

interface Props {
  note: Note
  active: boolean
  onSelect: () => void
}

export function NoteCard({ note, active, onSelect }: Props): JSX.Element {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors ${
        active
          ? 'border-primary/40 bg-card'
          : 'border-transparent bg-card/30 hover:bg-card/60'
      }`}
    >
      <div className="flex w-full items-center justify-between gap-2">
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
}

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

  useEffect(() => {
    setTitle(note?.title ?? '')
    setContent(note?.content ?? '')
    dirty.current = false
  }, [note?.id])

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
