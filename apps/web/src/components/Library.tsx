'use client'
import { useEffect, useMemo, useState } from 'react'
import { Copy, Pin, PinOff, Trash2, Check, Image as ImageIcon } from 'lucide-react'
import { useStore } from '@/lib/store'
import { listClipboard, setClipPinned, deleteClip } from '@/lib/api'
import { cn, relativeTime, firstLine } from '@/lib/utils'
import type { ClipboardItem } from '@/lib/types'

export function Library(): JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const items = useStore((s) => s.clipboard)
  const setItems = useStore((s) => s.setClipboard)
  const upsert = useStore((s) => s.upsertClip)
  const remove = useStore((s) => s.removeClip)
  const query = useStore((s) => s.query)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!workspace) return
    void listClipboard(workspace.id)
      .then((rows) => setItems(rows))
      .catch((e) => console.warn('library load failed', e))
      .finally(() => setLoaded(true))
  }, [workspace?.id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) =>
      it.text.toLowerCase().includes(q) ||
      (it.ai?.summary ?? '').toLowerCase().includes(q) ||
      (it.ai?.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    )
  }, [items, query])

  if (!loaded) return <Empty title="Yükleniyor…" hint="Pano kütüphanesi alınıyor." />
  if (filtered.length === 0)
    return (
      <Empty
        title={query ? 'Sonuç yok' : 'Henüz pano öğesi yok'}
        hint={
          query
            ? 'Aramayı temizle ya da farklı bir kelime dene.'
            : 'Mac/Windows uygulamasında bir şey kopyaladığında burada görünecek. Realtime, ayrıca yenilemen gerekmez.'
        }
      />
    )

  return (
    <div className="space-y-2 px-3 pb-24 pt-3 sm:px-6">
      {filtered.map((it) => (
        <Card key={it.id} item={it} upsert={upsert} remove={remove} />
      ))}
    </div>
  )
}

function Card({
  item,
  upsert,
  remove,
}: {
  item: ClipboardItem
  upsert: (i: ClipboardItem) => void
  remove: (id: string) => void
}): JSX.Element {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      if (item.contentType === 'image' && item.text.startsWith('data:image/')) {
        await copyImage(item.text)
      } else {
        if (!navigator.clipboard?.writeText) {
          throw new Error('Bu tarayıcıda pano API\'si yok.')
        }
        await navigator.clipboard.writeText(item.text)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch (e) {
      console.warn('copy failed', e)
      const msg = e instanceof Error ? e.message : String(e)
      alert(`Kopyalama başarısız: ${msg}\n\nİpucu: Görsele uzun bas → Görseli kopyala (Safari) ya da bilgisayardan kopyala.`)
    }
  }

  const onPin = async () => {
    upsert({ ...item, pinned: !item.pinned })
    await setClipPinned(item.id, !item.pinned)
  }

  const onDelete = async () => {
    if (!confirm('Bu öğeyi sil?')) return
    // Optimistic remove. If the server rejects (RLS, offline, etc.) put the
    // item back so the UI doesn't lie about a successful delete.
    remove(item.id)
    try {
      await deleteClip(item.id)
    } catch (e) {
      console.warn('delete failed', e)
      upsert(item)
      alert('Silme başarısız: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const isImage = item.contentType === 'image' && item.text.startsWith('data:image/')

  return (
    <div
      className={cn(
        'group rounded-lg border border-border bg-card/40 p-3 transition-colors',
        item.pinned && 'border-primary/40 bg-primary/5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button onClick={onCopy} className="flex-1 min-w-0 text-left">
          {isImage ? (
            <div className="space-y-1.5">
              <img
                src={item.text}
                alt="clipboard image"
                className="max-h-48 w-auto rounded border border-border"
              />
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ImageIcon className="h-3 w-3" />
                ~{Math.round(item.text.length / 1024)}KB · {relativeTime(item.createdAt)}
              </div>
            </div>
          ) : (
            <>
              <div className="line-clamp-3 text-sm leading-relaxed break-words">
                {firstLine(item.text, 200) || item.text.slice(0, 200)}
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{relativeTime(item.createdAt)}</span>
                {item.ai?.tags?.length ? (
                  <span className="flex flex-wrap gap-1">
                    {item.ai.tags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary"
                      >
                        {t}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </button>

        <div className="flex shrink-0 flex-col gap-1">
          <button
            onClick={onCopy}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Kopyala"
          >
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            onClick={onPin}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={item.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
          >
            {item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            title="Sil"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Copy a data-URL image to the clipboard. Two browser quirks matter here:
 *
 *   1. ClipboardItem's MIME map effectively only accepts `image/png` on
 *      Safari/iOS, so JPEGs/WEBPs from the desktop app are re-encoded to PNG
 *      via a canvas before being written.
 *
 *   2. iOS Safari requires `navigator.clipboard.write()` to be invoked
 *      synchronously within the user-gesture handler. Any `await` between
 *      the click and the `write` call drops the transient activation and
 *      the platform rejects the call with "The request is not allowed by
 *      the user agent or the platform in the current context".
 *      The fix: pass a `Promise<Blob>` directly to ClipboardItem — the
 *      browser will resolve it itself while keeping the gesture alive.
 */
function copyImage(dataUrl: string): Promise<void> {
  if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
    return Promise.reject(
      new Error("Tarayıcın gelişmiş pano kopyalamasını desteklemiyor."),
    )
  }

  // Build a Promise that resolves to a PNG Blob. We hand this Promise (not
  // an awaited Blob) to ClipboardItem so the user-activation token survives.
  const pngBlob: Promise<Blob> = (async () => {
    const initial = await (await fetch(dataUrl)).blob()
    return initial.type === 'image/png' ? initial : encodeAsPng(dataUrl)
  })()

  // Note: NO `await` between the gesture-firing click and this write call.
  return navigator.clipboard
    .write([new ClipboardItem({ 'image/png': pngBlob })])
    .catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`Pano API'si reddetti: ${reason}`)
    })
}

function encodeAsPng(dataUrl: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas context yok'))
        return
      }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((b) => {
        if (b) resolve(b)
        else reject(new Error('PNG dönüşümü başarısız'))
      }, 'image/png')
    }
    img.onerror = () => reject(new Error('Görsel yüklenemedi'))
    img.src = dataUrl
  })
}

function Empty({ title, hint }: { title: string; hint: string }): JSX.Element {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center px-8 text-center text-muted-foreground">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="mt-2 max-w-sm text-xs leading-relaxed">{hint}</p>
    </div>
  )
}
