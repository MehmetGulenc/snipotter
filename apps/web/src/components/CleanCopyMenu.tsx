'use client'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import { laundryOptions } from '@shared/laundry'
import { copyRich, copyText } from '@/lib/native-bridge'
import { errorText, toast } from '@/lib/feedback'

const MAX_SCAN = 20_000

/** The "Temiz kopyala" options that apply to this text (table, plain, paragraph, links). */
export function useLaundryOptions(text: string): ReturnType<typeof laundryOptions> {
  return useMemo(() => {
    try {
      return laundryOptions(text.slice(0, MAX_SCAN))
    } catch (e) {
      console.warn('[laundry] failed', e)
      return []
    }
  }, [text])
}

/** Icon button + bottom sheet. Renders nothing when no cleanup applies. */
export function CleanCopyMenu({ text }: { text: string }): JSX.Element | null {
  const options = useLaundryOptions(text)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (options.length === 0) return null

  const choose = async (o: (typeof options)[number]): Promise<void> => {
    setOpen(false)
    try {
      if (o.result.html) await copyRich({ text: o.result.text, html: o.result.html })
      else await copyText(o.result.text)
      toast(`Temiz kopyalandı · ${o.label}`)
    } catch (e) {
      toast('Kopyalanamadı: ' + errorText(e), 'error', 3500)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Temiz kopyala"
        title="Temiz kopyala"
        className="-my-1 flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors duration-100 active:bg-white/10"
      >
        <Sparkles className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Temiz kopyala">
          <button className="absolute inset-0 bg-black/60" aria-label="Kapat" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-3xl bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 ring-1 ring-white/10">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[17px] font-semibold">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Temiz kopyala
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Kapat"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground active:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl bg-white/[0.04]">
              {options.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => void choose(o)}
                    className="flex min-h-[52px] w-full flex-col justify-center px-4 py-2 text-left active:bg-white/[0.06]"
                  >
                    <span className="text-[15px] font-medium">{o.label}</span>
                    <span className="line-clamp-1 break-all text-xs text-muted-foreground">{o.result.text.slice(0, 80)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
