/**
 * Snipotter — Quick paste popup (Maccy-style)
 *
 * Two-panel layout: item list on the left, detail panel on the right.
 * Keyboard navigation:
 *   ↑ / ↓          move selection
 *   Enter           paste selected item and return to previous app
 *   Esc             close without pasting
 *   ⌘P             toggle pin on selected item
 *   ⌘⌫             delete selected item
 *   ⌘1..⌘9         jump to nth visible item and paste
 *   Type any char → adds to search filter
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import type { ClipboardItem } from '@shared/types'
import { Search, Pin, Image as ImageIcon, Trash2, Monitor, Clock, FileText } from 'lucide-react'
import { cn, formatDateTime, relativeTime } from '@/lib/utils'

const VISIBLE_LIMIT = 50

export function QuickPaste(): JSX.Element {
  const items = useStore((s) => s.clipboard)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void window.snipotter.clipboard.list().then((r) => {
      if (r.ok) useStore.getState().setClipboard(r.data)
    })
  }, [])

  useEffect(() => {
    const off = window.snipotter.window.onQuickPasteReopened(() => {
      setQuery('')
      setSelectedId(null)
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => { off() }
  }, [])

  useEffect(() => { inputRef.current?.focus() }, [])

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

  const selectedItem = flat.find((it) => it.id === selectedId) ?? null
  const hoveredItem = flat.find((it) => it.id === hoveredId) ?? null

  const moveBy = (delta: number): void => {
    if (flat.length === 0) return
    const idx = flat.findIndex((it) => it.id === selectedId)
    const next = idx === -1 ? 0 : Math.max(0, Math.min(flat.length - 1, idx + delta))
    setSelectedId(flat[next].id)
  }

  const pasteSelected = async (): Promise<void> => {
    const target = flat.find((it) => it.id === selectedId) ?? flat[0]
    if (!target) return
    await window.snipotter.clipboard.copy(target)
    await window.snipotter.window.pasteAtCursor()
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
    // Move selection to next item
    const next = flat[idx + 1] ?? flat[idx - 1]
    setSelectedId(next?.id ?? null)
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
        void (async () => {
          await window.snipotter.clipboard.copy(flat[n])
          await window.snipotter.window.pasteAtCursor()
        })()
      }
    }
  }

  return (
    <div
      onKeyDown={onKeyDown}
      className="flex h-screen w-screen overflow-hidden rounded-xl border border-white/10 bg-background/85 text-foreground shadow-2xl backdrop-blur-xl"
    >
      {/* Left: search + list */}
      <div className={cn(
        "flex shrink-0 flex-col transition-all duration-150",
        hoveredItem ? "w-[280px] border-r border-white/10" : "w-full"
      )}>
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pano öğelerinde ara…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto py-1" onMouseLeave={() => setHoveredId(null)}>
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
                  onSelect={setSelectedId} onHover={setHoveredId} onActivate={pasteSelected} />
              ))}
              {sections.recent.length > 0 && sections.pinned.length > 0 && (
                <SectionHeader label="Son kopyalananlar" />
              )}
              {sections.recent.map((it, i) => (
                <Row key={it.id} item={it} index={sections.pinned.length + i}
                  selected={it.id === selectedId} onSelect={setSelectedId} onHover={setHoveredId} onActivate={pasteSelected} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Right: detail panel — only visible while hovering an item */}
      {hoveredItem && (
        <div className="flex flex-1 flex-col">
          <DetailPanel
            item={hoveredItem}
            onPin={() => void togglePin(hoveredItem)}
            onDelete={() => { setHoveredId(null); void deleteSelected() }}
          />
        </div>
      )}
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

function Row({ item, index, selected, onSelect, onHover, onActivate }: {
  item: ClipboardItem
  index: number
  selected: boolean
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

function DetailPanel({ item, onPin, onDelete }: {
  item: ClipboardItem
  onPin: () => void
  onDelete: () => void
}): JSX.Element {
  const isImage = item.contentType === 'image' && item.text.startsWith('data:image/')
  const isFile = item.contentType === 'file'
  const fileName = isFile ? (() => { try { return decodeURIComponent(item.text.split('/').pop() ?? '') } catch { return item.text } })() : null
  const filePath = isFile ? (() => { try { return decodeURIComponent(new URL(item.text).pathname) } catch { return item.text } })() : null

  return (
    <div className="flex h-full flex-col">
      {/* Content preview */}
      <div className="flex-1 overflow-y-auto p-4">
        {isImage ? (
          <img
            src={item.text}
            alt="Kopyalanan görsel"
            className="max-h-48 max-w-full rounded-lg object-contain"
          />
        ) : isFile ? (
          <div className="flex flex-col items-center justify-center gap-3 pt-4 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <div className="text-sm font-medium text-foreground/90">{fileName}</div>
            <div className="max-w-full break-all text-[10px] text-muted-foreground/60">{filePath}</div>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/90">
            {item.text.slice(0, 2000)}{item.text.length > 2000 ? '\n…' : ''}
          </pre>
        )}
      </div>

      {/* Metadata */}
      <div className="border-t border-white/10 px-4 py-3 text-xs text-muted-foreground space-y-1.5">
        {item.sourceApp && (
          <div className="flex items-center gap-2">
            <Monitor className="h-3 w-3 shrink-0" />
            <span>Uygulama: <span className="text-foreground/80">{item.sourceApp}</span></span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 shrink-0" />
          <span>Kopyalanma: <span className="text-foreground/80">{formatDateTime(item.createdAt)}</span></span>
        </div>
        {item.updatedAt !== item.createdAt && (
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3 shrink-0 opacity-0" />
            <span>Güncelleme: <span className="text-foreground/80">{relativeTime(item.updatedAt)}</span></span>
          </div>
        )}
        {item.ai?.tags?.length ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {item.ai.tags.map((t) => (
              <span key={t} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{t}</span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Actions + shortcuts */}
      <div className="border-t border-white/10 px-4 py-2 text-[11px] text-muted-foreground/70 space-y-1">
        <div className="flex items-center justify-between">
          <button
            onClick={onPin}
            className="flex items-center gap-1.5 rounded px-2 py-1 hover:bg-white/10 hover:text-foreground transition-colors"
          >
            <Pin className="h-3 w-3" />
            {item.pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}
          </button>
          <kbd className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">⌘P</kbd>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded px-2 py-1 hover:bg-destructive/20 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Sil
          </button>
          <kbd className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">⌘⌫</kbd>
        </div>
        <div className="pt-1 text-center opacity-50">
          Enter: yapıştır · ESC: kapat · ↑↓: gezin
        </div>
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
