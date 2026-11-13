import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { Editor } from '@tiptap/react'
import { filterCommands } from './templates'
import type { SlashCommand } from './templates'

/** `/` at the start of a line or after a space, followed by the words typed so far. */
const SLASH_RE = /(?:^|\s)\/([\p{L}\p{N}]*(?: [\p{L}\p{N}]+)*)$/u

interface Match {
  /** Position of the `/`. */
  from: number
  to: number
  query: string
}

function findMatch(editor: Editor): Match | null {
  const { selection } = editor.state
  if (!selection.empty || !editor.isFocused) return null
  const $from = selection.$from
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
  const m = SLASH_RE.exec(before)
  if (!m) return null
  return { from: selection.from - m[1].length - 1, to: selection.from, query: m[1] }
}

interface Props {
  editor: Editor
  commands: SlashCommand[]
  /** The editor forwards key presses here first; returning true consumes the key. */
  keyHandler: MutableRefObject<((event: KeyboardEvent) => boolean) | null>
  mobile: boolean
}

/** Command palette that opens while typing `/…` in the note. */
export function SlashMenu({ editor, commands, keyHandler, mobile }: Props): JSX.Element | null {
  const [match, setMatch] = useState<Match | null>(null)
  const [index, setIndex] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = (): void => setMatch(findMatch(editor))
    const close = (): void => setMatch(null)
    editor.on('transaction', update)
    editor.on('focus', update)
    editor.on('blur', close)
    return () => {
      editor.off('transaction', update)
      editor.off('focus', update)
      editor.off('blur', close)
    }
  }, [editor])

  const results = useMemo(() => (match ? filterCommands(commands, match.query) : []), [commands, match])
  const open = match !== null && results.length > 0 && dismissedAt !== match.from

  useEffect(() => setIndex(0), [match?.query])
  useEffect(() => {
    if (!match) setDismissedAt(null)
  }, [match])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index, open])

  const run = (cmd: SlashCommand): void => {
    if (!match) return
    editor.chain().focus().deleteRange({ from: match.from, to: match.to }).run()
    cmd.run(editor)
  }

  keyHandler.current = (event) => {
    if (!open || !match) return false
    switch (event.key) {
      case 'ArrowDown':
        setIndex((i) => (i + 1) % results.length)
        return true
      case 'ArrowUp':
        setIndex((i) => (i - 1 + results.length) % results.length)
        return true
      case 'Enter':
      case 'Tab':
        run(results[Math.min(index, results.length - 1)])
        return true
      case 'Escape':
        setDismissedAt(match.from)
        return true
      default:
        return false
    }
  }
  useEffect(() => () => { keyHandler.current = null }, [keyHandler])

  if (!open || !match) return null

  const caret = editor.view.coordsAtPos(match.to)
  const viewportH = window.visualViewport?.height ?? window.innerHeight
  const width = Math.min(280, window.innerWidth - 16)
  const below = viewportH - caret.bottom > 260 || caret.top < 260
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(caret.left, window.innerWidth - width - 8)),
    width,
    zIndex: 60,
    ...(below ? { top: caret.bottom + 6 } : { bottom: window.innerHeight - caret.top + 6 }),
  }

  let lastGroup = ''
  return (
    <div style={style} onMouseDown={(e) => e.preventDefault()}>
      <div ref={listRef} role="listbox" aria-label="Komutlar" className="max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-2xl">
        {results.map((cmd, i) => {
          const header = cmd.group !== lastGroup
          lastGroup = cmd.group
          return (
            <div key={cmd.id}>
              {header && <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{cmd.group}</div>}
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  run(cmd)
                }}
                className={`flex w-full items-center rounded-lg px-2 text-left text-sm ${mobile ? 'min-h-[44px]' : 'min-h-[32px]'} ${i === index ? 'bg-primary/15 text-primary' : 'hover:bg-accent'}`}
              >
                {cmd.label}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
