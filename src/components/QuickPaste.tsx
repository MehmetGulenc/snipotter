/**
 * Snipotter — Quick paste popup (Maccy-style)
 *
 * İki panel düzeni: sol tarafta öğe listesi, sağda detay overlay (Maccy gibi
 * bekledikten sonra açılır).
 *
 * Klavye navigasyonu:
 *   ↑ / ↓          seçimi hareket ettir
 *   Enter           seçili öğeyi yapıştır ve önceki uygulamaya dön
 *   Esc             yapıştırmadan kapat
 *   ⌘P             seçili öğeyi sabitle/kaldır
 *   ⌘⌫             seçili öğeyi sil
 *   ⌘1..⌘9         n. öğeye atla ve yapıştır
 *   Herhangi karakter → arama filtresine ekler
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import type { ClipboardItem } from '@shared/types'
import { Search, Pin, Image as ImageIcon, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isMas } from '@/lib/runtime'

const VISIBLE_LIMIT = 50
const HOVER_DELAY_MS = 500

export async function copyAndPasteItem(item: ClipboardItem): Promise<void> {
  const result = await window.snipotter.clipboard.copy(item)
  if (!result.ok) throw new Error(result.error || 'Öğe kopyalanamadı.')
  await window.snipotter.window.pasteAtCursor()
}

export function QuickPaste(): JSX.Element {
  const items = useStore((s) => s.clipboard)
  const [query, setQuery] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [visibleDetailId, setVisibleDetailId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void window.snipotter.clipboard.list().then((r) => {
      if (r.ok) useStore.getState().setClipboard(r.data)
    })
  }, [])

  useEffect(() => {
    const off = window.snipotter.window.onQuickPasteReopened(() => {
      setPasteError(null)
      setQuery('')
      setSelectedId(null)
      setHoveredId(null)
      setVisibleDetailId(null)
      void window.snipotter.window.hideClipDetail()
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => { off() }
  }, [])

  useEffect(() => { inputRef.current?.focus() }, [])

  // Timer cleanup
  useEffect(() => {
    return () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current) }
  }, [])

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (it: ClipboardItem): boolean => {
      if (!q) return true
      if (it.text.toLowerCase().includes(q)) return true
      if (it.ai?.summary?.toLowerCase().includes(q)) return true
      if (it.ai?.tags?.some((t) => t.toLowerCase().includes(q))) return true
      return false
    }
    const pinned = items.filter((it) => it.pinned && matches(it))
    const recent = items.filter((it) => !it.pinned && matches(it)).slice(0, VISIBLE_LIMIT)
    return { pinned, recent }
  }, [items, query])

  const flat = useMemo(() => [...sections.pinned, ...sections.recent], [sections])

  useEffect(() => {
    if (flat.length === 0) { setSelectedId(null); return }
    if (!flat.some((it) => it.id === selectedId)) setSelectedId(flat[0].id)
  }, [flat, selectedId])

  useEffect(() => {
    if (!selectedId) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-clip-id="${CSS.escape(selectedId)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  // Detay paneli görünür öğeyi takip eden state — flat güncellenince geçersiz öğeyi temizle
  useEffect(() => {
    if (visibleDetailId && !flat.some((it) => it.id === visibleDetailId)) {
      setVisibleDetailId(null)
    }
  }, [flat, visibleDetailId])

  const selectedItem = flat.find((it) => it.id === selectedId) ?? null
  const visibleDetailItem = flat.find((it) => it.id === visibleDetailId) ?? null

  // Hover delay: HOVER_DELAY_MS sonra ayrı detail penceresi aç
  const handleHover = useCallback((id: string | null) => {
    setHoveredId(id)
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    if (!id) {
      setVisibleDetailId(null)
      void window.snipotter.window.hideClipDetail()
      return
    }
    hoverTimerRef.current = setTimeout(() => {
      setVisibleDetailId(id)
      const item = useStore.getState().clipboard.find((it) => it.id === id)
      if (item) void window.snipotter.window.showClipDetail(item)
    }, HOVER_DELAY_MS)
  }, [])

  const moveBy = (delta: number): void => {
    if (flat.length === 0) return
    const idx = flat.findIndex((it) => it.id === selectedId)
    const next = idx === -1 ? 0 : Math.max(0, Math.min(flat.length - 1, idx + delta))
    setSelectedId(flat[next].id)
  }

  const pasteItem = async (item: ClipboardItem): Promise<void> => {
    setPasteError(null)
    try {
      await copyAndPasteItem(item)
    } catch (err) {
      setPasteError((err as Error).message || 'Yapıştırılamadı. Tekrar deneyin.')
    }
  }

  const pasteSelected = async (): Promise<void> => {
    const target = flat.find((it) => it.id === selectedId) ?? flat[0]
    if (!target) return
    await pasteItem(target)
  }

  const togglePin = async (item: ClipboardItem): Promise<void> => {
    useStore.getState().upsertClipboard({ ...item, pinned: !item.pinned })
    await window.snipotter.clipboard.pin(item.id, !item.pinned)
  }

  const deleteSelected = async (): Promise<void> => {
    if (!selectedItem) return
    const idx = flat.findIndex((it) => it.id === selectedItem.id)
    useStore.getState().upsertClipboard({ ...selectedItem, deleted: true })
    void window.snipotter.clipboard.delete(selectedItem.id)
    const next = flat[idx + 1] ?? flat[idx - 1]
    setSelectedId(next?.id ?? null)
  }

  // Detay panelindeki silme — paneli da kapat
  const deleteItem = async (item: ClipboardItem): Promise<void> => {
    const idx = flat.findIndex((it) => it.id === item.id)
    useStore.getState().upsertClipboard({ ...item, deleted: true })
    void window.snipotter.clipboard.delete(item.id)
    const next = flat[idx + 1] ?? flat[idx - 1]
    setSelectedId(next?.id ?? null)
    setVisibleDetailId(null)
    setHoveredId(null)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveBy(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveBy(-1) }
    else if (e.key === 'Enter') { e.preventDefault(); void pasteSelected() }
    else if (e.key === 'Escape') { e.preventDefault(); void window.snipotter.window.hideQuickPaste() }
    else if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault()
      if (selectedItem) void togglePin(selectedItem)
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault()
      void deleteSelected()
    } else if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
      const n = Number(e.key) - 1
      if (flat[n]) {
        e.preventDefault()
        setSelectedId(flat[n].id)
        void pasteItem(flat[n])
      }
    }
  }

  return (
    <div
      onKeyDown={onKeyDown}
      className="relative flex h-screen w-screen overflow-hidden rounded-xl border border-white/10 bg-background/85 text-foreground shadow-2xl backdrop-blur-xl"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Sol: arama + liste — her zaman tam genişlik, detay paneli bunu daraltmaz */}
      <div className="flex w-full flex-col">
        {pasteError && <p role="alert" className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{pasteError}</p>}
        {/* Arama çubuğu — sürüklenebilir (input hariç) */}
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pano öğelerinde ara…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto py-1" onMouseLeave={() => handleHover(null)} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {flat.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <ImageIcon className="mb-2 h-6 w-6 opacity-40" />
              <div className="text-xs font-medium">
                {query ? 'Sonuç yok' : 'Henüz kopyalanan öğe yok'}
              </div>
            </div>
          ) : (
            <>
              {sections.pinned.length > 0 && <SectionHeader label="Sabitlenmiş" />}
              {sections.pinned.map((it, i) => (
                <Row key={it.id} item={it} index={i} selected={it.id === selectedId}
                  hovered={it.id === hoveredId}
                  onSelect={setSelectedId} onHover={handleHover} onActivate={pasteSelected} />
              ))}
              {sections.recent.length > 0 && sections.pinned.length > 0 && (
                <SectionHeader label="Son kopyalananlar" />
              )}
              {sections.recent.map((it, i) => (
                <Row key={it.id} item={it} index={sections.pinned.length + i}
                  selected={it.id === selectedId}
                  hovered={it.id === hoveredId}
                  onSelect={setSelectedId} onHover={handleHover} onActivate={pasteSelected} />
              ))}
            </>
          )}
        </div>
        <ShortcutHints count={flat.length} />
      </div>

      {/* Detay ayrı Electron penceresinde açılır — buraya overlay yok */}
    </div>
  )
}

function SectionHeader({ label }: { label: string }): JSX.Element {
  return (
    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
      {label}
    </div>
  )
}

function Row({ item, index, selected, hovered, onSelect, onHover, onActivate }: {
  item: ClipboardItem
  index: number
  selected: boolean
  hovered: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onActivate: () => void | Promise<void>
}): JSX.Element {
  const preview = previewFor(item)
  const isImage = item.contentType === 'image' && item.text.startsWith('data:image/')
  const shortcut = index < 9 ? `⌘${index + 1}` : null
  return (
    <div
      data-clip-id={item.id}
      onMouseEnter={() => { onSelect(item.id); onHover(item.id) }}
      onClick={() => void onActivate()}
      className={cn(
        'mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        selected ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-accent/40',
        hovered && !selected && 'bg-accent/25',
      )}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/5 text-muted-foreground">
        {isImage ? (
          <img src={item.text} alt="" className="h-6 w-6 rounded object-cover" />
        ) : item.contentType === 'rich-text' ? (
          <span className="text-[9px] font-bold">RTF</span>
        ) : item.contentType === 'file' ? (
          <FileText className="h-3.5 w-3.5" />
        ) : (
          <span className="text-[9px] font-mono">Aa</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-xs', selected ? 'text-foreground' : 'text-foreground/80')}>
          {preview}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.pinned && <Pin className="h-3 w-3 text-primary" />}
        {shortcut && (
          <span className={cn('rounded bg-white/5 px-1 font-mono text-[10px]', selected ? 'text-foreground' : 'text-muted-foreground/60')}>
            {shortcut}
          </span>
        )}
      </div>
    </div>
  )
}

// MAS sandbox cannot synthesise ⌘V: Enter copies, hides Snipotter, and the user pastes with ⌘V.
const hints = (): [string, string][] => [['↵', isMas() ? 'kopyala, sonra ⌘V' : 'yapıştır'], ['⌘P', 'sabitle'], ['⌘⌫', 'sil'], ['esc', 'kapat']]

export function ShortcutHints({ count }: { count: number }): JSX.Element {
  return (
    <div
      aria-label="Klavye kısayolları"
      className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-3 py-1.5 text-[10px] text-muted-foreground"
    >
      <span className="tabular-nums">{count} öğe</span>
      <div className="flex items-center gap-2.5">
        {hints().map(([key, label]) => (
          <span key={key} className="inline-flex items-center gap-1">
            <kbd className="rounded bg-white/5 px-1 font-mono">{key}</kbd>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function previewFor(item: ClipboardItem): string {
  if (item.contentType === 'image') return 'Görsel'
  if (item.contentType === 'file') {
    try { return decodeURIComponent(item.text.split('/').pop() ?? item.text) } catch { return item.text }
  }
  const firstLine = item.text.split('\n').find((l) => l.trim().length > 0) ?? item.text
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine
}
