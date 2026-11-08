import { memo, useState } from 'react'
import type { ClipboardItem } from '@shared/types'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { relativeTime, truncate } from '@/lib/utils'
import { Copy, Pin, PinOff, StickyNote, Trash2, Eye, EyeOff, Sparkles, Check, FileText, Download } from 'lucide-react'
import { isMas } from '@/lib/runtime'

interface FileInfo {
  fileName: string
  sizeLabel: string | null
  isStored: boolean
  downloadUrl: string | null
}

function parseFileText(text: string): FileInfo {
  if (text.startsWith('data:')) {
    const match = text.match(/^data:([^;]+);name=([^;,]+)(?:;base64)?,/)
    const fileName = match ? decodeURIComponent(match[2]) : 'dosya'
    const base64 = match ? text.slice(match[0].length) : ''
    const bytes = Math.round(base64.length * 0.75)
    const sizeLabel = bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`
    return { fileName, sizeLabel, isStored: true, downloadUrl: text }
  }
  try {
    const pathname = decodeURIComponent(new URL(text).pathname)
    const fileName = pathname.split('/').pop() ?? text
    return { fileName, sizeLabel: null, isStored: false, downloadUrl: null }
  } catch {
    return { fileName: text, sizeLabel: null, isStored: false, downloadUrl: null }
  }
}

interface Props {
  item: ClipboardItem
  selected?: boolean
  onSelect?: () => void
  onCheckboxPointerDown?: (e: React.PointerEvent) => void
  onCopy: (item: ClipboardItem) => void
  onPin: (item: ClipboardItem) => void
  onPromote: (item: ClipboardItem) => void
  onDelete: (item: ClipboardItem) => void
  onReenrich: (item: ClipboardItem) => void
}

// Legacy: very early builds replaced sensitive payloads with this literal
// string. Treat such rows as sensitive too so old DB entries still hide.
const LEGACY_REDACTED = '••• redacted •••'

export const ClipboardCard = memo(function ClipboardCard({ item, selected, onSelect, onCheckboxPointerDown, onCopy, onPin, onPromote, onDelete, onReenrich }: Props): JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const sensitive =
    item.ai?.tags?.includes('sensitive') === true || item.text === LEGACY_REDACTED
  const isImage = item.contentType === 'image' && item.text.startsWith('data:image/')
  const isFile = item.contentType === 'file'
  // data:mime;name=filename;base64,... → saklanan içerik  |  file:// → yerel referans
  const fileInfo = isFile ? parseFileText(item.text) : null
  const display =
    sensitive && !revealed
      ? '••• gizli içerik •••'
      : item.text === LEGACY_REDACTED
        ? '(içerik korumaya alınmıştı, görünmüyor)'
        : item.text

  return (
    <article
      data-clip-id={item.id}
      className={`group relative flex flex-col gap-2 min-w-0 rounded-2xl border p-5 shadow-sm transition-colors overflow-hidden ${
        selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'
      }`}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <div className="absolute left-5 top-5 z-10">
          <button
            onPointerDown={(e) => {
              e.stopPropagation()
              onCheckboxPointerDown?.(e)
            }}
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
            className={`flex h-6 w-6 items-center justify-center rounded border ${
              selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/80 hover:border-primary/50'
            }`}
            aria-label="Öğeyi seç"
            aria-pressed={!!selected}
          >
            {selected && <Check className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      <div className={`flex items-start justify-between gap-3 min-w-0 ${onSelect ? 'pl-8' : ''}`}>
        <button
          onClick={() => onCopy(item)}
          className="flex-1 min-w-0 overflow-hidden text-left text-sm leading-6 text-foreground"
          title="Tekrar kopyala"
        >
          {isImage ? (
            <img
              src={item.text}
              alt="Pano görseli"
              className="max-h-48 w-auto rounded-md border border-border object-contain"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          ) : isFile && fileInfo ? (
            <div className="flex items-center gap-2 py-1">
              <FileText className="h-8 w-8 shrink-0 text-muted-foreground/50" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground/90">{fileInfo.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {fileInfo.isStored ? `içerik kaydedildi · ${fileInfo.sizeLabel}` : 'yerel dosya referansı'}
                </div>
              </div>
            </div>
          ) : (
            // line-clamp-4 alone breaks down with whitespace-pre-wrap on very
            // long single-word/URL payloads (the -webkit-box display ignores
            // the wrap rules and the card grows past its grid cell, causing
            // neighbours to overlap). Bounding by max-height + overflow-hidden
            // keeps the card height fixed; break-all lets URLs wrap.
            <div
              className="whitespace-pre-wrap break-words overflow-hidden"
              style={{ maxHeight: '7.5rem' }}
            >
              {truncate(display, 300)}
            </div>
          )}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
          {!item.synced && <Badge variant="outline">Senkron bekliyor</Badge>}
          {item.pinned && <Badge variant="default">Sabitlendi</Badge>}
        </div>
      </div>

      {item.ai && (
        <div className="rounded-lg bg-secondary/50 p-2.5 flex flex-wrap items-center gap-1.5 text-xs">
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

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="text-[10px]">
          {isImage
            ? `görsel · ${Math.round((item.text.length * 3) / 4 / 1024)} KB`
            : isFile && fileInfo
              ? fileInfo.isStored
                ? `dosya · ${fileInfo.sizeLabel}`
                : `dosya · yerel`
              : `${item.contentType === 'rich-text' ? 'Biçimli metin' : 'Metin'} · ${item.text.length} karakter`}
        </span>
        <div className="flex items-center gap-0.5 flex-wrap justify-end">
          {sensitive && (
            <Button variant="ghost" size="icon" aria-label={revealed ? 'İçeriği gizle' : 'İçeriği göster'} title={revealed ? 'Gizle' : 'Göster'} onClick={() => setRevealed((r) => !r)}>
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          )}
          {isFile && fileInfo?.isStored && fileInfo.downloadUrl && (
            <a href={fileInfo.downloadUrl} download={fileInfo.fileName}>
              <Button variant="ghost" size="icon" title="İndir">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </a>
          )}
          <Button variant="secondary" size="sm" title="Kopyala" onClick={() => onCopy(item)} className="gap-1.5 rounded-lg">
            <Copy className="h-3.5 w-3.5" /> Kopyala
          </Button>
          {!isImage && !isFile && (
            <Button variant="ghost" size="icon" aria-label="Nota dönüştür" title="Nota dönüştür" onClick={() => onPromote(item)}>
              <StickyNote className="h-3.5 w-3.5" />
            </Button>
          )}
          {!isImage && !isFile && !isMas() && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="AI ile yeniden işle" title="AI ile yeniden işle"
              onClick={() => onReenrich(item)}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label={item.pinned ? 'Sabitten kaldır' : 'Sabitle'} title={item.pinned ? 'Sabitten kaldır' : 'Sabitle'} onClick={() => onPin(item)}>
            {item.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Öğeyi sil" title="Sil" onClick={() => onDelete(item)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </article>
  )
})
