/**
 * Snipotter — Quick paste popup (Maccy-style)
 *
 * Frameless overlay window opened via the `quickPasteHotkey` global shortcut.
 * Shows recent clipboard items grouped as Pinned + Recent, with live search
 * and keyboard-only navigation:
 *
 *   ↑ / ↓        move selection
 *   Enter        copy selected item to system clipboard, hide window
 *   Esc          hide window
 *   ⌘ / Ctrl + 1..9   jump to nth visible item
 *   Type any character → adds to search filter
 *
 * The window is positioned near the cursor (see windows.ts) and auto-hides on
 * blur in production, so users never need to dismiss it manually.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import type { ClipboardItem } from '@shared/types'
import { Search, Pin, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const VISIBLE_LIMIT = 50

export function QuickPaste(): JSX.Element {
  const items = useStore((s) => s.clipboard)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Initial load — main process broadcasts CLIP_NEW / CLIP_UPDATED into the
  // store, so popping a stale list on first open could show empty briefly.
  // Force a refetch when the popup mounts.
  useEffect(() => {
    void window.snipotter.clipboard.list().then((r) => {
      if (r.ok) {
        useStore.getState().setClipboard(r.data)
      }
    })
  }, [])

  // Re-focus search + reset state when the same window is shown again.
  useEffect(() => {
    const off = window.snipotter.window.onQuickPasteReopened(() => {
      setQuery('')
      setSelectedId(null)
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => {
      off()
    }
  }, [])

  // Auto-focus search on first render.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Sectioned + filtered list (pinned first, then recent).
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
    const recent = items
      .filter((it) => !it.pinned && matches(it))
      .slice(0, VISIBLE_LIMIT)
    return { pinned, recent }
  }, [items, query])

  // Flattened list for keyboard navigation.
  const flat = useMemo(
    () => [...sections.pinned, ...sections.recent],
    [sections],
  )

  // Reset selection when filter changes; default to first match.
  useEffect(() => {
    if (flat.length === 0) {
      setSelectedId(null)
      return
    }
    if (!flat.some((it) => it.id === selectedId)) {
      setSelectedId(flat[0].id)
    }
  }, [flat, selectedId])

  // Scroll selected item into view.
  useEffect(() => {
    if (!selectedId) return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-clip-id="${CSS.escape(selectedId)}"]`,
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

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
    await window.snipotter.window.hideQuickPaste()
  }

  const togglePin = async (item: ClipboardItem): Promise<void> => {
    const nextPinned = !item.pinned
    // Optimistic store update for snappy UI.
    useStore.getState().upsertClipboard({ ...item, pinned: nextPinned })
    await window.snipotter.clipboard.pin(item.id, nextPinned)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveBy(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveBy(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void pasteSelected()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      void window.snipotter.window.hideQuickPaste()
    } else if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
      // ⌘1..⌘9 jump to nth visible row.
      const n = Number(e.key) - 1
      if (flat[n]) {
        e.preventDefault()
        setSelectedId(flat[n].id)
        void (async () => {
          await window.snipotter.clipboard.copy(flat[n])
          await window.snipotter.window.hideQuickPaste()
        })()
      }
    }
  }

  return (
    <div
      onKeyDown={onKeyDown}
      className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-white/10 bg-background/85 text-foreground shadow-2xl backdrop-blur-xl"
    >
      {/* Search header */}
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
        {flat.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            ↑↓ Enter · ESC kapat
          </span>
        )}
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-1">
        {flat.length === 0 ? (
          <Empty query={query} />
        ) : (
          <>
            {sections.pinned.length > 0 && (
              <SectionHeader label="Sabitlenmiş" />
            )}
            {sections.pinned.map((it, i) => (
              <Row
                key={it.id}
                item={it}
                index={i}
                selected={it.id === selectedId}
                onSelect={setSelectedId}
                onActivate={pasteSelected}
                onTogglePin={togglePin}
              />
            ))}
            {sections.recent.length > 0 && sections.pinned.length > 0 && (
              <SectionHeader label="Son kopyalananlar" />
            )}
            {sections.recent.map((it, i) => (
              <Row
                key={it.id}
                item={it}
                index={sections.pinned.length + i}
                selected={it.id === selectedId}
                onSelect={setSelectedId}
                onActivate={pasteSelected}
                onTogglePin={togglePin}
              />
            ))}
          </>
        )}
      </div>
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

function Row({
  item,
  index,
  selected,
  onSelect,
  onActivate,
  onTogglePin,
}: {
  item: ClipboardItem
  index: number
  selected: boolean
  onSelect: (id: string) => void
  onActivate: () => void | Promise<void>
  onTogglePin: (item: ClipboardItem) => void | Promise<void>
}): JSX.Element {
  const preview = previewFor(item)
  const isImage = item.contentType === 'image' && item.text.startsWith('data:image/')
  const shortcut = index < 9 ? `⌘${index + 1}` : null
  return (
    <div
      data-clip-id={item.id}
      onMouseEnter={() => onSelect(item.id)}
      onClick={() => void onActivate()}
      className={cn(
        'mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        selected ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-accent/40',
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/5 text-muted-foreground">
        {isImage ? (
          <img
            src={item.text}
            alt=""
            className="h-7 w-7 rounded object-cover"
          />
        ) : item.contentType === 'rich-text' ? (
          <span className="text-[10px] font-bold">RTF</span>
        ) : (
          <span className="text-[10px] font-mono">Aa</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className={cn('truncate', selected ? 'text-foreground' : 'text-foreground/80')}>
          {preview}
        </div>
        {item.ai?.tags?.length ? (
          <div className="mt-0.5 flex gap-1 overflow-hidden">
            {item.ai.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded bg-primary/15 px-1 py-0.5 text-[9px] text-primary"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          void onTogglePin(item)
        }}
        title={item.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
        className={cn(
          'shrink-0 rounded p-1 transition-colors',
          item.pinned
            ? 'text-primary hover:bg-primary/20'
            : 'text-muted-foreground/60 opacity-0 hover:bg-accent group-hover:opacity-100',
          selected && 'opacity-100',
        )}
      >
        <Pin className="h-3 w-3" />
      </button>

      {shortcut && (
        <span
          className={cn(
            'shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px]',
            selected ? 'text-foreground' : 'text-muted-foreground/60',
          )}
        >
          {shortcut}
        </span>
      )}
    </div>
  )
}

function previewFor(item: ClipboardItem): string {
  if (item.contentType === 'image') return 'Görsel'
  const firstLine = item.text.split('\n').find((l) => l.trim().length > 0) ?? item.text
  return firstLine.length > 120 ? firstLine.slice(0, 120) + '…' : firstLine
}

function Empty({ query }: { query: string }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
      <ImageIcon className="mb-2 h-6 w-6 opacity-40" />
      <div className="text-xs font-medium">
        {query ? 'Sonuç yok' : 'Henüz kopyalanan öğe yok'}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed">
        {query
          ? 'Farklı bir kelime dene ya da ESC ile kapat.'
          : 'Kopyaladıkça burada listelenir.'}
      </p>
    </div>
  )
}
