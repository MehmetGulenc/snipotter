import { useStore } from '@/store/useStore'
import { Search, Wifi, WifiOff } from 'lucide-react'
import { Input } from './ui/Input'
import { Logo } from './Logo'

export function Topbar(): JSX.Element {
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const aiStatus = useStore((s) => s.aiStatus)
  const user = useStore((s) => s.user)

  return (
    <header className="drag-region flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/40 px-4">
      <div className="flex items-center gap-2.5 pl-16">
        {/* Logo with soft glow behind it */}
        <div className="relative flex items-center justify-center">
          <div className="absolute h-7 w-7 animate-logo-glow rounded-full bg-fuchsia-500/40 blur-md" />
          <Logo size={20} className="relative" />
        </div>
        <BrandWordmark />
      </div>
      <div className="no-drag relative ml-4 flex-1 max-w-xl">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pano ve notlarda ara…"
          className="pl-8"
        />
      </div>
      <div className="no-drag flex items-center gap-3 text-xs text-muted-foreground">
        {aiStatus?.enabled ? (
          <span className="inline-flex items-center gap-1 text-primary">
            <Wifi className="h-3 w-3" /> AI aktif ({aiStatus.primary})
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <WifiOff className="h-3 w-3" /> AI yok
          </span>
        )}
        {user?.email && <span className="hidden md:inline">{user.email}</span>}
      </div>
    </header>
  )
}

function BrandWordmark(): JSX.Element {
  const snip = 'Snip'.split('')
  const otter = 'Otter'.split('')
  return (
    <span className="group inline-flex select-none items-baseline text-sm font-bold tracking-tight">
      {snip.map((l, i) => (
        <span
          key={i}
          className="inline-block animate-brand-reveal text-fuchsia-400 group-hover:animate-letter-wave"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          {l}
        </span>
      ))}
      {otter.map((l, i) => (
        <span
          key={i}
          className={`inline-block animate-brand-reveal text-violet-300 group-hover:animate-letter-wave${i === 0 ? ' animate-otter-breathe' : ''}`}
          style={{ animationDelay: `${(i + 4) * 40}ms` }}
        >
          {l}
        </span>
      ))}
    </span>
  )
}
