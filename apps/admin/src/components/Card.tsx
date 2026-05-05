import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: string | number
  delta?: string
  hint?: string
  icon?: React.ReactNode
  /** Visual emphasis: 'strong' = primary tint, 'muted' = standard. */
  emphasis?: 'strong' | 'muted'
  /** "—" placeholder treatment when value is missing. */
  pending?: boolean
}

/**
 * Compact metric tile used across the dashboard. One job: show a number
 * with a label and optional delta. Anything more complex (sparkline,
 * breakdown table) lives in its own component so this stays the
 * universal "stat" primitive.
 */
export function MetricCard({
  label,
  value,
  delta,
  hint,
  icon,
  emphasis = 'muted',
  pending,
}: MetricCardProps): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-2xl border p-5 transition-colors',
        emphasis === 'strong'
          ? 'border-primary/30 bg-gradient-to-br from-primary/10 to-card/40 hover:border-primary/50'
          : 'border-border bg-card/40 hover:border-border/80',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div
        className={cn(
          'mt-2 text-3xl font-bold tabular-nums tracking-tight',
          pending && 'text-muted-foreground/40',
        )}
      >
        {value}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        {delta && (
          <span
            className={cn(
              'font-medium',
              delta.startsWith('+') && 'text-emerald-400',
              delta.startsWith('-') && 'text-rose-400',
            )}
          >
            {delta}
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  )
}

export function PanelCard({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-card/40">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}
