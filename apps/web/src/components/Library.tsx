'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Pin, PinOff, Trash2, Check, Image as ImageIcon, CheckSquare, Square, Undo2, X, ClipboardPaste, Loader2, StickyNote, Eye, Timer, FileText } from 'lucide-react'
import { useStore } from '@/lib/store'
import { listClipboard, setClipPinned, deleteClipMany, createNote } from '@/lib/api'
import { cn, relativeTime, firstLine } from '@/lib/utils'
import type { ClipboardItem } from '@/lib/types'
import { isNative, saveClipboardFromUserAction } from '@/lib/mobile'
import { errorText, toast } from '@/lib/feedback'
import { analyze, otpExpired } from '@/lib/smart'
import { copyText } from '@/lib/native-bridge'
import { SmartActions } from './SmartActions'
import { CleanCopyMenu } from './CleanCopyMenu'
import { PaymentCopy, usePayment } from './PaymentCopy'

interface PendingDelete {
  items: ClipboardItem[]
  timer: ReturnType<typeof setTimeout>
}

export function Library(): JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const user = useStore((s) => s.user)
  const items = useStore((s) => s.clipboard)
  const setItems = useStore((s) => s.setClipboard)
  const upsert = useStore((s) => s.upsertClip)
  const removeClips = useStore((s) => s.removeClips)
  const shieldClips = useStore((s) => s.shieldClips)
  const unshieldClips = useStore((s) => s.unshieldClips)
  const query = useStore((s) => s.query)
  const [loaded, setLoaded] = useState(false)
  const [savingClipboard, setSavingClipboard] = useState(false)
  const native = isNative()

  const onSaveClipboard = async () => {
    if (!workspace || !user) return
    setSavingClipboard(true)
    try {
      const result = await saveClipboardFromUserAction(workspace.id, user.id)
      if (result.status === 'saved') {
        upsert(result.item)
        toast('Panodan kaydedildi')
      } else {
        toast('Panoda kaydedilecek metin yok', 'info')
      }
    } catch (e) {
      toast('Kaydedilemedi: ' + errorText(e), 'error', 3500)
    } finally {
      setSavingClipboard(false)
    }
  }

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

  const deleteItems = useCallback((ids: string[]) => {
    if (ids.length === 0) return
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
  }, [items, pendingDelete, removeClips, shieldClips, unshieldClips])

  const deleteSelected = () => deleteItems(Array.from(selectedIds))

  // One-time codes are removed ten minutes after they were copied (pinned ones stay).
  useEffect(() => {
    const sweep = () => {
      const expired = useStore.getState().clipboard.filter(
        (c) => !c.pinned && c.contentType !== 'image' && otpExpired(c.createdAt) && analyze(c.text).otp,
      )
      if (expired.length === 0) return
      const ids = expired.map((c) => c.id)
      removeClips(ids)
      void deleteClipMany(ids).catch((e) => console.warn('otp cleanup failed', e))
    }
    sweep()
    const timer = setInterval(sweep, 30_000)
    return () => clearInterval(timer)
  }, [removeClips])

  const onMakeNote = async (item: ClipboardItem) => {
    if (!workspace || !user) return
    try {
      const note = await createNote(workspace.id, user.id, textToNoteContent(item.text))
      if (note) {
        useStore.getState().upsertNote(note)
        useStore.getState().openNote(note.id)
      }
    } catch (e) {
      toast('Not oluşturulamadı: ' + errorText(e), 'error', 3500)
    }
  }

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

  const saveButton = native ? (
    <button
      onClick={onSaveClipboard}
      disabled={savingClipboard || !workspace}
      className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm active:opacity-80 disabled:opacity-60"
    >
      {savingClipboard ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
      Panodan kaydet
    </button>
  ) : null

  if (!loaded) return <Empty title="Yükleniyor…" hint="Pano geçmişin alınıyor." />
  if (filtered.length === 0 && !pendingDelete)
    return (
      <Empty
        title={query ? 'Sonuç yok' : 'Henüz kayıt yok'}
        hint={
          query
            ? 'Aramayı temizle ya da farklı bir kelime dene.'
            : native
              ? 'Bir şey kopyala, sonra aşağıdaki düğmeye dokun. Mac veya Windows’ta kopyaladıkların da burada kendiliğinden belirir.'
              : 'Mac veya Windows’ta kopyaladıkların burada kendiliğinden belirir.'
        }
        action={query ? null : saveButton}
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
          <>
            <span className="text-sm text-muted-foreground">{filtered.length} kayıt</span>
            {saveButton}
          </>
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
              onToggleSelect={() => toggleSelection(it.id)}
              onDelete={() => deleteItems([it.id])}
              onMakeNote={() => void onMakeNote(it)}
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
                {pendingDelete.items.length === 1 ? 'Kayıt silindi' : `${pendingDelete.items.length} kayıt silindi`}
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
                {selectedIds.size} kayıt seçili
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
  onToggleSelect,
  onDelete,
  onMakeNote,
  onCheckboxPointerDown,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: {
  item: ClipboardItem
  selected: boolean
  selectMode: boolean
  upsert: (i: ClipboardItem) => void
  onToggleSelect: () => void
  onDelete: () => void
  onMakeNote: () => void
  onCheckboxPointerDown: (e: React.PointerEvent) => void
  onTouchStart: () => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const file = useMemo(() => parseFileClip(item.text), [item.text])
  const imageSrc = item.contentType === 'image' && item.text.startsWith('data:image/')
    ? item.text
    : file?.mime.startsWith('image/') ? file.dataUrl : null
  const isImage = imageSrc !== null
  const smart = useMemo(() => (isImage || file ? null : analyze(item.text)), [isImage, file, item.text])
  const hidden = Boolean(smart?.sensitive) && !revealed
  const payment = usePayment(isImage || file ? '' : item.text)

  const onCopy = async () => {
    try {
      if (imageSrc) {
        await copyImage(imageSrc)
      } else if (file) {
        toast('Bu dosya türü iPhone panosuna kopyalanamıyor', 'info', 3000)
        return
      } else {
        await copyText(smart?.otp ?? item.text)
      }
      setCopied(true)
      toast('Kopyalandı')
      setTimeout(() => setCopied(false), 1200)
    } catch (e) {
      console.warn('copy failed', e)
      toast('Kopyalanamadı: ' + errorText(e), 'error', 3500)
    }
  }

  const onPin = async () => {
    upsert({ ...item, pinned: !item.pinned })
    await setClipPinned(item.id, !item.pinned)
  }

  return (
    <div
      data-clip-id={item.id}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={cn(
        'group relative rounded-2xl bg-card px-4 pb-2 pt-3 ring-1 ring-white/[0.04] transition-colors',
        item.pinned && !selected && 'ring-primary/40',
        selected && 'bg-primary/10 ring-primary',
        !selectMode && 'active:bg-white/[0.06]',
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

      <div className={cn((selectMode || selected) && 'pl-8')}>
        <button
          onClick={selectMode ? onToggleSelect : onCopy}
          className="block w-full min-w-0 text-left"
          aria-label="Kopyala"
        >
          {isImage ? (
            <div className="space-y-1.5">
              <img
                src={imageSrc}
                alt={file?.name ?? 'Panodaki görsel'}
                className="max-h-48 w-auto rounded border border-border"
              />
              {file && <div className="truncate text-xs text-muted-foreground">{file.name}</div>}
            </div>
          ) : file ? (
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">{formatBytes(file.bytes)}</div>
              </div>
            </div>
          ) : smart?.otp ? (
            <div>
              <div className="font-mono text-[28px] font-bold tracking-[0.2em] text-foreground">{smart.otp}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground">{item.text.slice(0, 160)}</div>
            </div>
          ) : (
            <div className={cn('line-clamp-4 whitespace-pre-line break-words text-[15px] leading-snug', hidden && 'select-none blur-[6px]')}>
              {item.text.slice(0, 400)}
            </div>
          )}
        </button>
        {hidden && (
          <button
            onClick={() => setRevealed(true)}
            className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Göster
          </button>
        )}
        {smart && !selectMode && (
          <SmartActions actions={smart.actions.filter((a) => a.kind !== 'otp' && !(payment?.iban && a.kind === 'iban'))} />
        )}
        {!isImage && !file && !selectMode && <PaymentCopy text={item.text} />}

        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          {isImage && <ImageIcon className="h-3 w-3" />}
          {item.pinned && <Pin className="h-3 w-3 text-primary" />}
          {smart?.otp && !item.pinned && <Timer className="h-3 w-3 text-amber-400" aria-label="Süreli" />}
          <span className="flex-1 truncate">
            {relativeTime(item.createdAt)}
            {smart?.otp && !item.pinned ? ' · 10 dk içinde silinir' : ''}
            {isImage ? ` · ~${Math.round(item.text.length / 1024)} KB` : ''}
          </span>
          {!selectMode && (
            <>
              <IconButton label={copied ? 'Kopyalandı' : 'Kopyala'} onClick={onCopy}>
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </IconButton>
              {!isImage && !file && <CleanCopyMenu text={item.text} />}
              {!isImage && !file && (
                <IconButton label="Nota çevir" onClick={onMakeNote}>
                  <StickyNote className="h-4 w-4" />
                </IconButton>
              )}
              <IconButton label={item.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'} onClick={onPin}>
                {item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </IconButton>
              <IconButton label="Sil" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Copy a data-URL image to the clipboard.
 */
/** Desktop stores copied files as data:<mime>;name=<file>;base64,<content>. */
function parseFileClip(text: string): { mime: string; name: string; dataUrl: string; bytes: number } | null {
  const m = text.match(/^data:([^;,]+);name=([^;,]+);base64,/)
  if (!m) return null
  let name = m[2]
  try { name = decodeURIComponent(name) } catch { /* keep encoded */ }
  const base64 = text.slice(m[0].length)
  return { mime: m[1], name, dataUrl: `data:${m[1]};base64,${base64}`, bytes: Math.round(base64.length * 0.75) }
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

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

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="-my-1 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-100 active:bg-white/10 hover:text-foreground"
    >
      {children}
    </button>
  )
}

function Empty({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }): JSX.Element {
  return (
    <div className="flex h-[65vh] flex-col items-center justify-center px-8 text-center text-muted-foreground">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <ClipboardPaste className="h-8 w-8" />
      </div>
      <div className="text-[17px] font-semibold text-foreground">{title}</div>
      <p className="mt-2 max-w-xs text-sm leading-relaxed">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Tiptap JSON for a note made from a clip: one paragraph per line. */
function textToNoteContent(text: string): string {
  const content = text.split('\n').map((line) =>
    line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
  )
  return JSON.stringify({ type: 'doc', content })
}
