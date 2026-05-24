/**
 * QuickPaste hover detay penceresi — ayrı Electron penceresi olarak açılır.
 * Görseller tam boyutlu gösterilir, uzun metin kaydırılabilir.
 */
import { useEffect, useState } from 'react'
import type { ClipboardItem } from '@shared/types'
import { Monitor, Clock, Pin, PinOff, Trash2, FileText } from 'lucide-react'
import { formatDateTime, relativeTime } from '@/lib/utils'

export function ClipDetail(): JSX.Element {
  const [item, setItem] = useState<ClipboardItem | null>(null)

  useEffect(() => {
    const off = window.snipotter.window.onDetailItem((it) => setItem(it))
    return () => { off() }
  }, [])

  if (!item) {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center rounded-xl border border-white/10 bg-background/90 backdrop-blur-xl"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
    )
  }

  const isImage = item.contentType === 'image' && item.text.startsWith('data:image/')
  const isFile = item.contentType === 'file'
  const fileName = isFile
    ? (() => { try { return decodeURIComponent(item.text.split('/').pop() ?? '') } catch { return item.text } })()
    : null
  const filePath = isFile
    ? (() => { try { return decodeURIComponent(new URL(item.text).pathname) } catch { return item.text } })()
    : null

  const handlePin = (): void => {
    void window.snipotter.clipboard.pin(item.id, !item.pinned)
  }
  const handleDelete = (): void => {
    void window.snipotter.clipboard.delete(item.id)
    window.snipotter.window.hideClipDetail()
  }

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-white/10 bg-background/90 text-foreground shadow-2xl backdrop-blur-xl"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* İçerik alanı */}
      <div
        className="flex-1 overflow-y-auto p-4"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {isImage ? (
          <img
            src={item.text}
            alt="Kopyalanan görsel"
            className="w-full rounded-lg object-contain"
          />
        ) : isFile ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <FileText className="h-16 w-16 text-muted-foreground/40" />
            <div className="text-sm font-semibold text-foreground/90">{fileName}</div>
            <div className="max-w-full break-all text-[10px] text-muted-foreground/60">{filePath}</div>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/90">
            {item.text}
          </pre>
        )}
      </div>

      {/* AI etiketleri */}
      {item.ai?.tags?.length ? (
        <div
          className="flex flex-wrap gap-1 px-4 pb-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {item.ai.tags.map((t) => (
            <span key={t} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{t}</span>
          ))}
        </div>
      ) : null}

      {/* Metadata */}
      <div
        className="border-t border-white/10 px-4 py-2 text-xs text-muted-foreground space-y-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {item.sourceApp && (
          <div className="flex items-center gap-2">
            <Monitor className="h-3 w-3 shrink-0" />
            <span>Uygulama: <span className="text-foreground/70">{item.sourceApp}</span></span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 shrink-0" />
          <span>Kopyalanma: <span className="text-foreground/70">{formatDateTime(item.createdAt)}</span></span>
        </div>
        {item.updatedAt !== item.createdAt && (
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3 shrink-0 opacity-0" />
            <span>Güncelleme: <span className="text-foreground/70">{relativeTime(item.updatedAt)}</span></span>
          </div>
        )}
      </div>

      {/* Aksiyonlar */}
      <div
        className="border-t border-white/10 flex items-center gap-2 px-4 py-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={handlePin}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
        >
          {item.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {item.pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}
        </button>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3 w-3" />
          Sil
        </button>
      </div>
    </div>
  )
}
