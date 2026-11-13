/**
 * Action row under a text clip: Temiz kopyala menu, IBAN / Alıcı / Tutar
 * buttons and "Telefona gönder". Derived copies go through
 * clipboard.writeText (no new history row); the phone action inserts a
 * device_actions row via main.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Smartphone, Sparkles, Table2, Type, WrapText, Link2, Landmark, User, Banknote, Users } from 'lucide-react'
import { useStore } from '@/store/useStore'
import type { ClipboardItem } from '@shared/types'
import { laundryOptions } from '@shared/laundry'
import { paymentButtons, phoneTarget } from '@/lib/clipActions'
import { Button } from './ui/Button'

type Status = { tone: 'ok' | 'error'; text: string } | null

const OPTION_ICONS = { table: Table2, plain: Type, paragraph: WrapText, links: Link2 } as const
const PAYMENT_ICONS = { iban: Landmark, recipient: User, amount: Banknote } as const

interface Props {
  item: ClipboardItem
  /** Sensitive and not revealed: keep values out of tooltips. */
  concealed?: boolean
}

export const ClipActions = memo(function ClipActions({ item, concealed }: Props): JSX.Element | null {
  const isText = item.contentType === 'text' || item.contentType === 'rich-text'
  const text = isText ? item.text : ''
  const options = useMemo(() => (text ? laundryOptions(text) : []), [text])
  const payments = useMemo(() => (text ? paymentButtons(text) : []), [text])
  const target = useMemo(() => (text ? phoneTarget(text) : null), [text])
  const [status, setStatus] = useState<Status>(null)
  const [sending, setSending] = useState(false)
  const spaces = useStore((s) => s.spaces)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (!isText || !text.trim() || (options.length === 0 && payments.length === 0 && !target && spaces.length === 0)) return null

  const flash = (next: Status): void => {
    setStatus(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus(null), 2500)
  }

  const write = async (value: string, html: string | undefined, done: string): Promise<void> => {
    const res = await window.snipotter.clipboard.writeText(value, html)
    flash(res.ok ? { tone: 'ok', text: done } : { tone: 'error', text: res.error })
  }

  /** Shares a copy as a note; the clip itself stays personal. */
  const shareToSpace = async (spaceId: string, name: string): Promise<void> => {
    const res = await window.snipotter.spaces.sendNote(spaceId, null, text)
    flash(res.ok ? { tone: 'ok', text: `"${name}" alanına not olarak eklendi` } : { tone: 'error', text: res.error })
  }

  const send = async (): Promise<void> => {
    if (!target || sending) return
    setSending(true)
    try {
      const res = await window.snipotter.actions.sendToPhone({
        kind: target.kind,
        payload: target.payload,
        label: target.label,
        clipId: item.synced ? item.id : null,
      })
      flash(res.ok ? { tone: 'ok', text: 'Telefona gönderildi' } : { tone: 'error', text: res.error })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-clip-actions>
      {options.length > 0 && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 rounded-lg px-2 text-xs" aria-label="Temiz kopyala seçenekleri">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Temiz kopyala <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={4}
              className="z-50 min-w-[200px] rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
            >
              {options.map((opt) => {
                const Icon = OPTION_ICONS[opt.id]
                return (
                  <DropdownMenu.Item
                    key={opt.id}
                    onSelect={() => void write(opt.result.text, opt.result.html, `${opt.label}: panoda`)}
                    className="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {opt.label}
                  </DropdownMenu.Item>
                )
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}

      {payments.map((p) => {
        const Icon = PAYMENT_ICONS[p.id]
        return (
          <Button
            key={p.id}
            variant="outline"
            size="sm"
            className="h-7 gap-1 rounded-lg px-2 text-xs"
            title={concealed ? `${p.label} kopyala` : `${p.label} kopyala: ${p.value}`}
            aria-label={`${p.label} kopyala`}
            onClick={() => void write(p.value, undefined, `${p.label} panoda`)}
          >
            <Icon className="h-3.5 w-3.5" /> {p.label}
          </Button>
        )
      })}

      {target && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 rounded-lg px-2 text-xs"
          title={concealed ? 'Telefona gönder' : `Telefona gönder: ${target.label}`}
          aria-label="Telefona gönder"
          disabled={sending}
          onClick={() => void send()}
        >
          <Smartphone className="h-3.5 w-3.5" /> Telefona gönder
        </Button>
      )}

      {spaces.length > 0 && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 rounded-lg px-2 text-xs" aria-label="Ortak alana not olarak gönder">
              <Users className="h-3.5 w-3.5" /> Ortak alana <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={4} className="z-50 min-w-[180px] rounded-xl border border-border bg-popover p-1 shadow-xl">
              {spaces.map((sp) => (
                <DropdownMenu.Item key={sp.id} onSelect={() => void shareToSpace(sp.id, sp.name)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent">
                  <Users className="h-3.5 w-3.5 text-primary" /> {sp.name}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}

      <span
        role="status"
        aria-live="polite"
        className={`text-[11px] ${status?.tone === 'error' ? 'text-destructive' : 'text-primary'}`}
      >
        {status?.text ?? ''}
      </span>
    </div>
  )
})
