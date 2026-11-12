import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { Search, Sparkles, X } from 'lucide-react'
import { Input } from './ui/Input'
import { Logo } from './Logo'
import { isMas } from '@/lib/runtime'

export function Topbar({ route }: { route: 'library' | 'notes' | 'settings' }): JSX.Element {
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const aiStatus = useStore((s) => s.aiStatus)
  const input = useRef<HTMLInputElement>(null)
  const searchable = route !== 'settings'
  const label = route === 'notes' ? 'Notlarında ara…' : 'Pano geçmişinde ara…'
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && searchable) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchable])

  return (
    <header className="drag-region flex h-[72px] shrink-0 items-center gap-6 border-b border-border bg-card px-6">
      <div className="flex w-[198px] shrink-0 items-center gap-2.5 pl-16">
        <Logo size={25} />
        <span className="text-base font-semibold tracking-tight">SnipOtter<span className="text-primary">.</span></span>
      </div>
      {searchable ? (
        <div className="no-drag relative max-w-2xl flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={input} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={label} aria-label={label} onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
            className="h-11 rounded-xl border-transparent bg-secondary/60 pl-10 pr-24 focus-visible:bg-background" />
          {query ? <button onClick={() => { setQuery(''); input.current?.focus() }} aria-label="Aramayı temizle" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
            : <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘ / Ctrl K</kbd>}
        </div>
      ) : <span className="flex-1 text-sm text-muted-foreground">Çalışma alanı / Ayarlar</span>}
      {!isMas() && (
        <span className="hidden shrink-0 items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground lg:inline-flex">
          <Sparkles className="h-3.5 w-3.5" />{aiStatus?.enabled ? 'AI yardımcısı açık' : 'AI yardımcısı kapalı'}
        </span>
      )}
    </header>
  )
}
