import { useState } from 'react'
import type { ClipboardItem } from '@shared/types'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { relativeTime, truncate } from '@/lib/utils'
import { Copy, Pin, PinOff, StickyNote, Trash2, Eye, EyeOff, Sparkles } from 'lucide-react'

interface Props {
  item: ClipboardItem
  onCopy: (item: ClipboardItem) => void
  onPin: (item: ClipboardItem) => void
  onPromote: (item: ClipboardItem) => void
  onDelete: (item: ClipboardItem) => void
  onReenrich: (item: ClipboardItem) => void
}

const isRedacted = (text: string) => text === '••• redacted •••'

export function ClipboardCard({ item, onCopy, onPin, onPromote, onDelete, onReenrich }: Props): JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const sensitive = isRedacted(item.text)
  const isImage = item.contentType === 'image' && item.text.startsWith('data:image/')
  const display = sensitive && !revealed ? '••• gizli içerik •••' : item.text

  return (
    <article
      className="group relative flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-3 transition-colors hover:border-primary/40 hover:bg-card/60 animate-fade-in"
    >
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => onCopy(item)}
          className="flex-1 text-left text-sm leading-snug text-foreground"
          title="Tekrar kopyala"
        >
          {isImage ? (
            <img
              src={item.text}
              alt="Pano görseli"
              className="max-h-48 w-auto rounded-md border border-border object-contain"
              draggable={false}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans line-clamp-4">
              {truncate(display, 600)}
            </pre>
          )}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[10px] text-muted-foreground">{relativeTime(item.createdAt)}</span>
          {!item.synced && <Badge variant="outline">offline</Badge>}
          {item.pinned && <Badge variant="default">pinned</Badge>}
        </div>
      </div>

      {item.ai && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {item.ai.summary && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              {item.ai.summary}
            </span>
          )}
          {item.ai.tags?.map((t) => (
            <Badge key={t} variant={t === 'sensitive' ? 'sensitive' : 'secondary'}>
              {t}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="text-[10px]">
          {isImage
            ? `görsel · ${Math.round((item.text.length * 3) / 4 / 1024)} KB`
            : `${item.contentType} · ${item.text.length} karakter`}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {sensitive && (
            <Button variant="ghost" size="icon" title={revealed ? 'Gizle' : 'Göster'} onClick={() => setRevealed((r) => !r)}>
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" title="Kopyala" onClick={() => onCopy(item)}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {!isImage && (
            <Button variant="ghost" size="icon" title="Nota dönüştür" onClick={() => onPromote(item)}>
              <StickyNote className="h-3.5 w-3.5" />
            </Button>
          )}
          {!isImage && (
            <Button
              variant="ghost"
              size="icon"
              title="AI ile yeniden işle"
              onClick={() => onReenrich(item)}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" title={item.pinned ? 'Sabitten kaldır' : 'Sabitle'} onClick={() => onPin(item)}>
            {item.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" title="Sil" onClick={() => onDelete(item)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </article>
  )
}
