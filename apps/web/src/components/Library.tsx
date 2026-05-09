'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Pin, PinOff, Trash2, Check, Image as ImageIcon, CheckSquare, Square, Undo2, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { listClipboard, setClipPinned, deleteClip, deleteClipMany } from '@/lib/api'
import { cn, relativeTime, firstLine } from '@/lib/utils'
import type { ClipboardItem } from '@/lib/types'

interface PendingDelete {
  items: ClipboardItem[]
  timer: ReturnType<typeof setTimeout>
}

export function Library(): JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const items = useStore((s) => s.clipboard)
  const setItems = useStore((s) => s.setClipboard)
  const upsert = useStore((s) => s.upsertClip)
  const remove = useStore((s) => s.removeClip)
  const removeClips = useStore((s) => s.removeClips)
  const shieldClips = useStore((s) => s.shieldClips)
  const unshieldClips = useStore((s) => s.unshieldClips)
  const query = useStore((s) => s.query)
  const [loaded, setLoaded] = useState(false)

  // multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  // drag-to-select
  const dragActive = useRef(false)
  const dragMode = useRef<'select' | 'deselect'>('select')
  const dragVisited = useRef<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)

  // long-press
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchMoved = useRef(false)

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

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const selectAll = () => setSelectedIds(new Set(filtered.map((i) => i.id)))
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length
  const hasSelection = selectedIds.size > 0

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const itemObjects = ids.map((id) => items.find((i) => i.id === id)).filter(Boolean) as ClipboardItem[]

    shieldClips(ids)
    removeClips(ids)
    setSelectedIds(new Set())
    setSelectMode(false)

    if (pendingDelete) {
      clearTimeout(pendingDelete.timer)
      const prevIds = pendingDelete.items.map((i) => i.id)
      void deleteClipMany(prevIds).then(() => unshieldClips(prevIds))
    }

    const timer = setTimeout(async () => {
      setPendingDelete(null)
      await deleteClipMany(ids)
      unshieldClips(ids)
    }, 5000)

    setPendingDelete({ items: itemObjects, timer })
  }, [selectedIds, items, pendingDelete, removeClips, shieldClips, unshieldClips])

  const undoDelete = useCallback(() => {
    if (!pendingDelete) return
    clearTimeout(pendingDelete.timer)
    unshieldClips(pendingDelete.items.map((i) => i.id))
    pendingDelete.items.forEach((i) => upsert(i))
    setPendingDelete(null)
  }, [pendingDelete, upsert, unshieldClips])

  // Drag-to-select
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragActive.current) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const card = el?.closest<HTMLElement>('[data-clip-id]')
    const id = card?.dataset.clipId
    if (!id || dragVisited.current.has(id)) return
    dragVisited.current.add(id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (dragMode.current === 'select') next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragActive.current = false
    dragVisited.current = new Set()
  }, [])

  const startDrag = useCallback((itemId: string, alreadySelected: boolean, e: React.PointerEvent) => {
    e.preventDefault()
    dragActive.current = true
    dragMode.current = alreadySelected ? 'deselect' : 'select'
    dragVisited.current = new Set([itemId])
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (dragMode.current === 'select') next.add(itemId)
      else next.delete(itemId)
      return next
    })
    try {
      listRef.current?.setPointerCapture(e.pointerId)
    } catch { /* ignore */ }
  }, [])

  const handleTouchStart = useCallback((itemId: string) => {
    touchMoved.current = false
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        navigator.vibrate?.(30)
        setSelectMode(true)
        setSelectedIds(new Set([itemId]))
      }
    }, 400)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchMoved.current = true
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (!selectMode) return
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const card = el?.closest<HTMLElement>('[data-clip-id]')
    const id = card?.dataset.clipId
    if (!id || dragVisited.current.has(id)) return
    dragVisited.current.add(id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [selectMode])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    dragVisited.current = new Set()
  }, [])

  if (!loaded) return <Empty title="Yükleniyor…" hint="Pano kütüphanesi alınıyor." />
  if (filtered.length === 0 && !pendingDelete)
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
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 sm:px-6">
        {selectMode ? (
          <>
            <button
              onClick={allSelected ? () => setSelectedIds(new Set()) : selectAll}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}
            </button>
            <button onClick={exitSelectMode} className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{filtered.length} öğe</span>
        )}
      </div>

      <div
        ref={listRef}
        className={cn('flex-1 space-y-2 overflow-y-auto px-3 pb-4 pt-3 sm:px-6', selectMode && 'touch-none')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {filtered.map((it) => {
          const isSelected = selectedIds.has(it.id)
          return (
            <Card
              key={it.id}
              item={it}
              selected={isSelected}
              selectMode={selectMode}
              upsert={upsert}
              remove={remove}
              onToggleSelect={() => toggleSelection(it.id)}
              onCheckboxPointerDown={(e) => startDrag(it.id, isSelected, e)}
              onTouchStart={() => handleTouchStart(it.id)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          )
        })}
      </div>

      {/* Sticky bottom bar */}
      {(hasSelection || pendingDelete) && (
        <div className="border-t border-border bg-card px-4 py-3">
          {pendingDelete ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                {pendingDelete.items.length} öğe silindi
              </span>
              <button
                onClick={undoDelete}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Undo2 className="h-4 w-4" />
                Geri al
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} öğe seçili
              </span>
              <button
                onClick={deleteSelected}
                className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 active:bg-destructive/30"
              >
                <Trash2 className="h-4 w-4" />
                Sil
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Card({
  item,
  selected,
  selectMode,
  upsert,
  remove,
  onToggleSelect,
  onCheckboxPointerDown,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: {
  item: ClipboardItem
  selected: boolean
  selectMode: boolean
  upsert: (i: ClipboardItem) => void
  remove: (id: string) => void
  onToggleSelect: () => void
  onCheckboxPointerDown: (e: React.PointerEvent) => void
  onTouchStart: () => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
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
      data-clip-id={item.id}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={cn(
        'group relative rounded-lg border border-border bg-card/40 p-3 transition-colors',
        item.pinned && !selected && 'border-primary/40 bg-primary/5',
        selected && 'border-primary bg-primary/10',
        !selectMode && 'hover:border-primary/30',
      )}
    >
      {/* Checkbox */}
      {(selectMode || selected) && (
        <button
          className="absolute left-3 top-3 z-10"
          onPointerDown={(e) => {
            e.stopPropagation()
            onCheckboxPointerDown(e)
          }}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
        >
          <div
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded border',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background/80',
            )}
          >
            {selected && <Check className="h-3.5 w-3.5" />}
          </div>
        </button>
      )}

      <div className={cn('flex items-start justify-between gap-3', (selectMode || selected) && 'pl-8')}>
        <button
          onClick={selectMode ? onToggleSelect : onCopy}
          className="flex-1 min-w-0 text-left"
        >
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

        {!selectMode && (
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
        )}
      </div>
    </div>
  )
}

/**
 * Copy a data-URL image to the clipboard.
 */
function copyImage(dataUrl: string): Promise<void> {
  if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
    return Promise.reject(
      new Error("Tarayıcın gelişmiş pano kopyalamasını desteklemiyor."),
    )
  }

  const initial = dataUrlToBlob(dataUrl)
  const png: Blob | Promise<Blob> =
    initial.type === 'image/png' ? initial : encodeAsPng(dataUrl)

  return navigator.clipboard
    .write([new ClipboardItem({ 'image/png': png })])
    .catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`Pano API'si reddetti: ${reason}`)
    })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/.exec(dataUrl)
  if (!match) throw new Error('Geçersiz data URL')
  const mime = match[1] || 'application/octet-stream'
  const isBase64 = !!match[2]
  const payload = match[3]
  if (isBase64) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(payload)], { type: mime })
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
