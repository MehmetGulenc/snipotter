'use client'
import { useEffect } from 'react'
import { Check, AlertCircle, Info } from 'lucide-react'
import { answerConfirm, useFeedback } from '@/lib/feedback'
import { cn } from '@/lib/utils'

/** Renders the confirm sheet and toasts requested through lib/feedback. Mount once. */
export function FeedbackHost(): JSX.Element {
  const confirm = useFeedback((s) => s.confirm)
  const toasts = useFeedback((s) => s.toasts)

  useEffect(() => {
    if (!confirm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answerConfirm(false)
      if (e.key === 'Enter') answerConfirm(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirm])

  return (
    <>
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-8 animate-fade-in"
          onClick={() => answerConfirm(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[300px] overflow-hidden rounded-2xl bg-[#1e1e24] text-center shadow-2xl animate-pop-in"
          >
            <div className="px-5 pb-4 pt-5">
              <h2 id="confirm-title" className="text-[17px] font-semibold leading-snug">
                {confirm.title}
              </h2>
              {confirm.message && (
                <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{confirm.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 border-t border-white/10 text-[17px]">
              <button
                onClick={() => answerConfirm(false)}
                className="border-r border-white/10 py-3 text-primary active:bg-white/5"
              >
                {confirm.cancelLabel ?? 'Vazgeç'}
              </button>
              <button
                autoFocus
                onClick={() => answerConfirm(true)}
                className={cn(
                  'py-3 font-semibold active:bg-white/5',
                  confirm.destructive ? 'text-destructive' : 'text-primary',
                )}
              >
                {confirm.confirmLabel ?? 'Tamam'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex max-w-sm items-center gap-2 rounded-full bg-[#26262d] px-4 py-2.5 text-sm font-medium shadow-lg ring-1 ring-white/10 backdrop-blur-xl animate-drop-in"
          >
            {t.kind === 'success' && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
            {t.kind === 'error' && <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />}
            {t.kind === 'info' && <Info className="h-4 w-4 shrink-0 text-primary" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </>
  )
}
