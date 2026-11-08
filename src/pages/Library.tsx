import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { ClipboardCard } from '@/components/ClipboardCard'
import type { ClipboardItem } from '@shared/types'
import { Inbox, Trash2, CheckSquare, Square, Undo2, LayoutGrid, List, Plus, ArrowUpRight } from 'lucide-react'
import {
  isTypingTarget, loadFilter, loadView, resolveLibraryShortcut, saveFilter, saveView,
  type LibraryFilter, type LibraryView,
} from '@/lib/libraryPrefs'

interface PendingDelete {
  items: ClipboardItem[]
  timer: ReturnType<typeof setTimeout>
}

const UNDO_WINDOW_MS = 5000
const STATUS_CLEAR_MS = 2500

export function Library(): JSX.Element {
  const items = useStore((s) => s.clipboard)
  const upsert = useStore((s) => s.upsertClipboard)
  const removeClipboards = useStore((s) => s.removeClipboards)
  const clearClipboard = useStore((s) => s.clearClipboard)
  const shieldClips = useStore((s) => s.shieldClips)
  const unshieldClips = useStore((s) => s.unshieldClips)
  const upsertNote = useStore((s) => s.upsertNote)
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const [filter, setFilterState] = useState<LibraryFilter>(loadFilter)
  const [view, setViewState] = useState<LibraryView>(loadView)
  const [copyStatus, setCopyStatus] = useState('')
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setFilter = (f: LibraryFilter) => { setFilterState(f); saveFilter(f) }
  const setView = (v: LibraryView) => { setViewState(v); saveView(v) }

  // Durum mesajını kısa süre gösterip temizle; art arda kopyalamada süre yeniden başlar.
  const flashStatus = useCallback((message: string) => {
    if (statusTimer.current) clearTimeout(statusTimer.current)
    setCopyStatus(message)
    statusTimer.current = setTimeout(() => setCopyStatus(''), STATUS_CLEAR_MS)
  }, [])
  useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current) }, [])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  // drag-to-select
  const dragActive = useRef(false)
  const dragMode = useRef<'select' | 'deselect'>('select')
  const dragVisited = useRef<Set<string>>(new Set())
  const gridRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (filter === 'pinned' && !i.pinned) return false
      if (filter === 'text' && i.contentType !== 'text' && i.contentType !== 'rich-text') return false
      if (filter === 'image' && i.contentType !== 'image') return false
      if (filter === 'file' && i.contentType !== 'file') return false
      if (!q) return true
      if (i.text.toLowerCase().includes(q)) return true
      if (i.ai?.summary?.toLowerCase().includes(q)) return true
      if (i.ai?.tags?.some((t) => t.toLowerCase().includes(q))) return true
      return false
    })
  }, [items, query, filter])

  const onCopy = async (item: ClipboardItem) => {
    try {
      const result = await window.snipotter.clipboard.copy(item)
      flashStatus(result.ok ? 'Panoya kopyalandı. Yapıştırmaya hazır.' : 'Kopyalanamadı. Tekrar deneyin.')
    } catch {
      flashStatus('Kopyalanamadı. Tekrar deneyin.')
    }
  }
  const onPin = async (item: ClipboardItem) => {
    upsert({ ...item, pinned: !item.pinned })
    await window.snipotter.clipboard.pin(item.id, !item.pinned)
  }
  // Tekil silme de toplu silme ile aynı geri alınabilir akışı kullanır.
  const onDelete = (item: ClipboardItem) => {
    scheduleDelete([item])
    setSelectedIds((prev) => {
      if (!prev.has(item.id)) return prev
      const next = new Set(prev)
      next.delete(item.id)
      return next
    })
  }
  const onPromote = async (item: ClipboardItem) => {
    const r = await window.snipotter.clipboard.promoteToNote(item)
    if (r.ok && r.data) {
      upsertNote(r.data)
      window.location.hash = '#/notes'
    }
  }
  const onReenrich = async (item: ClipboardItem) => {
    const r = await window.snipotter.ai.reenrich('clipboard', item.id, item.text)
    if (r.ok) upsert({ ...item, ai: r.data })
  }

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = () => setSelectedIds(new Set(filtered.map((i) => i.id)))
  const clearSelection = () => setSelectedIds(new Set())

  const deleteSelected = () => {
    if (selectedIds.size === 0) return
    const itemObjects = Array.from(selectedIds)
      .map((id) => items.find((i) => i.id === id))
      .filter(Boolean) as ClipboardItem[]
    setSelectedIds(new Set())
    scheduleDelete(itemObjects)
  }

  function scheduleDelete(itemObjects: ClipboardItem[]) {
    if (itemObjects.length === 0) return
    const ids = itemObjects.map((i) => i.id)

    shieldClips(ids)
    removeClipboards(ids)

    if (pendingDelete) {
      clearTimeout(pendingDelete.timer)
      const prevIds = pendingDelete.items.map((i) => i.id)
      void window.snipotter.clipboard.deleteMany(prevIds).then(() => unshieldClips(prevIds))
    }

    const timer = setTimeout(async () => {
      setPendingDelete(null)
      await window.snipotter.clipboard.deleteMany(ids)
      unshieldClips(ids)
    }, UNDO_WINDOW_MS)

    setPendingDelete({ items: itemObjects, timer })
  }

  const undoDelete = () => {
    if (!pendingDelete) return
    clearTimeout(pendingDelete.timer)
    unshieldClips(pendingDelete.items.map((i) => i.id))
    pendingDelete.items.forEach((i) => upsert(i))
    setPendingDelete(null)
  }

  const clearAll = async () => {
    if (!window.confirm('Tüm pano geçmişini temizlemek istediğinden emin misin? Sabitlenmiş öğeler korunur.')) return
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer)
      setPendingDelete(null)
    }
    setSelectedIds(new Set())
    clearClipboard()
    await window.snipotter.clipboard.deleteAll()
  }

  // Drag-to-select
  const handleGridPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
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

  const handleGridPointerUp = useCallback(() => {
    dragActive.current = false
    dragVisited.current = new Set()
  }, [])

  const handleCheckboxPointerDown = useCallback((itemId: string, alreadySelected: boolean, e: React.PointerEvent) => {
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
      gridRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  const hasSelection = selectedIds.size > 0
  const allSelected = filtered.length > 0 && filtered.every((item) => selectedIds.has(item.id))

  // Klavye kısayolları: Esc seçimi temizler, ⌘/Ctrl+A tümünü seçer,
  // Delete/⌫ seçilenleri siler, ⌘/Ctrl+Z son silmeyi geri alır.
  // Dinleyici bir kez bağlanır; güncel durum ve eylemler ref üzerinden okunur.
  const shortcutCtx = useRef({ hasSelection, hasItems: filtered.length > 0, hasPendingDelete: !!pendingDelete, selectAll, clearSelection, deleteSelected, undoDelete })
  shortcutCtx.current = { hasSelection, hasItems: filtered.length > 0, hasPendingDelete: !!pendingDelete, selectAll, clearSelection, deleteSelected, undoDelete }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctx = shortcutCtx.current
      const action = resolveLibraryShortcut(
        { key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, typing: isTypingTarget(e.target) },
        ctx,
      )
      if (!action) return
      e.preventDefault()
      if (action === 'clear-selection') ctx.clearSelection()
      else if (action === 'select-all') ctx.selectAll()
      else if (action === 'delete-selected') ctx.deleteSelected()
      else if (action === 'undo-delete') ctx.undoDelete()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-7 pb-5 pt-7">
        <div className="flex items-center justify-between gap-4">
          <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Kütüphane / Pano</p>
        <h1 className="text-3xl font-semibold tracking-tight">Kaldığın yerden devam et.</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kopyaladıklarını bul, tekrar kopyala veya nota dönüştür.</p>
          </div><button onClick={() => window.snipotter.window.toggleQuickNote()} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent"><Plus className="h-4 w-4" />Hızlı not</button>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[['Kaydedilen öğe', items.length], ['Sabitlenen', items.filter((i) => i.pinned).length], ['Görsel ve dosya', items.filter((i) => i.contentType === 'image' || i.contentType === 'file').length]].map(([label, count]) => <div key={label} className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{count}</p></div>)}
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-secondary/70 p-1" role="group" aria-label="İçerik türüne göre filtrele">
          {([
            ['all', 'Tümü'], ['pinned', 'Sabitlenenler'], ['text', 'Metinler'],
            ['image', 'Görseller'], ['file', 'Dosyalar'],
          ] as [LibraryFilter, string][]).map(([id, label]) => (
            <button key={id} aria-pressed={filter === id}
              onClick={() => { setFilter(id); clearSelection() }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${filter === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-1 rounded-xl border border-border bg-card p-1" role="group" aria-label="Görünüm">
          <button onClick={() => setView('grid')} aria-label="Kart görünümü" aria-pressed={view === 'grid'} className={`rounded-lg p-2 ${view === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setView('list')} aria-label="Liste görünümü" aria-pressed={view === 'list'} className={`rounded-lg p-2 ${view === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}><List className="h-4 w-4" /></button>
        </div></div>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span role="status">{filtered.length} öğe gösteriliyor</span><span className="inline-flex items-center gap-1">Kopyalamak için karta tıkla <ArrowUpRight className="h-3 w-3" /></span></div>
        <p role="status" aria-live="polite" className="mt-2 text-xs font-medium text-primary">{copyStatus}</p>
      </div>
      {filtered.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-medium">{items.length ? 'Eşleşen öğe bulunamadı' : 'Panon henüz boş'}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{items.length ? 'Başka bir kelime ara veya filtreleri temizle.' : 'Bir metin, görsel veya dosya kopyaladığında burada görünecek.'}</p>
          {(query || filter !== 'all') && <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => { setQuery(''); setFilter('all') }}>Aramayı ve filtreleri temizle</button>}
        </div>
      )}
      {/* Toolbar */}
      {filtered.length > 0 && (
        <div className="mx-7 flex items-center justify-between border-b border-border pb-3">
          <button
            onClick={allSelected ? clearSelection : selectAll}
            title={allSelected ? 'Seçimi kaldır (Esc)' : 'Tümünü seç (⌘/Ctrl A)'}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {allSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}
          </button>
          <div className="flex items-center gap-3">
            {hasSelection && (
              <span className="text-xs text-muted-foreground">{selectedIds.size} seçili</span>
            )}
            {!hasSelection && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                title="Pano geçmişini temizle (sabitlenmiş öğeler korunur)"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Tümünü Temizle
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={gridRef}
        className={`scrollbar-thin min-h-0 overflow-y-auto px-7 py-4 ${filtered.length ? 'flex-1' : 'hidden'}`}
        onPointerMove={handleGridPointerMove}
        onPointerUp={handleGridPointerUp}
        onPointerCancel={handleGridPointerUp}
      >
        <div className={`grid grid-cols-1 gap-4 items-stretch ${view === 'grid' ? 'lg:grid-cols-2 2xl:grid-cols-3' : ''}`}>
          {filtered.map((item) => (
            <ClipboardCard
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onSelect={() => toggleSelection(item.id)}
              onCheckboxPointerDown={(e) => handleCheckboxPointerDown(item.id, selectedIds.has(item.id), e)}
              onCopy={onCopy}
              onPin={onPin}
              onDelete={onDelete}
              onPromote={onPromote}
              onReenrich={onReenrich}
            />
          ))}
        </div>
      </div>

      {/* Sticky bottom bar */}
      {(hasSelection || pendingDelete) && (
        <div className="border-t border-border bg-card px-4 py-2.5">
          {pendingDelete ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {pendingDelete.items.length} öğe silindi
              </span>
              <button
                onClick={undoDelete}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Geri al
                <kbd className="ml-1 rounded border border-border px-1 py-0.5 font-mono text-[10px] text-muted-foreground">⌘Z</kbd>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} öğe seçili
                <span className="ml-2 opacity-70">· Esc: seçimi temizle</span>
              </span>
              <button
                onClick={deleteSelected}
                className="flex items-center gap-1.5 rounded bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Sil
                <kbd className="ml-1 rounded border border-destructive/30 px-1 py-0.5 font-mono text-[10px]">⌫</kbd>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
