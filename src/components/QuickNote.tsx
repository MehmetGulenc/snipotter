import { useEffect, useRef, useState } from 'react'
import { Logo } from './Logo'

export function QuickNote(): JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string>('Cmd+Enter ile kaydet · Esc ile kapat')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const close = () => {
    void window.snipotter.window.toggleQuickNote()
  }

  const submit = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setHint('Kaydediliyor…')
    try {
      const res = await window.snipotter.notes.create({ content: t })
      if (res.ok) {
        setText('')
        setHint('Kaydedildi ✓ AI etiketliyor…')
        setTimeout(close, 350)
      } else {
        setHint(res.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="flex h-full w-full items-start justify-center bg-transparent p-2">
      <div className="glass w-full max-w-[520px] overflow-hidden rounded-2xl border border-border shadow-2xl">
        <div className="drag-region flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <Logo size={16} />
          Snipotter — Hızlı Not
        </div>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Aklındakini yaz, Cmd+Enter ile kaydet…"
          className="h-32 w-full resize-none bg-transparent p-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>{hint}</span>
          <span>{text.length} karakter</span>
        </div>
      </div>
    </div>
  )
}
