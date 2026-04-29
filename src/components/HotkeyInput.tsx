/**
 * Snipotter — Hotkey recorder
 *
 * Click to start recording, then press any combination. As soon as a non-modifier
 * key fires while at least one modifier is held, we validate it against
 * `globalShortcut.register` (via main process), then save and re-register.
 *
 * - Esc cancels recording without saving
 * - Click outside cancels
 * - Renders Mac symbol pills (⌘ ⇧ ⌥ ⌃) instead of raw "CommandOrControl+Shift+V"
 * - Surfaces save state: idle / recording / saving / saved / error
 */
import { useEffect, useRef, useState } from 'react'
import { Pencil, X, Check, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'recording' | 'saving' | 'saved' | 'error'

interface HotkeyInputProps {
  value: string
  onChange: (next: string) => Promise<void> | void
  placeholder?: string
  className?: string
}

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'OS'])

export function HotkeyInput({
  value,
  onChange,
  placeholder = 'Tıkla ve kısayol bas',
  className,
}: HotkeyInputProps): JSX.Element {
  const [status, setStatus] = useState<Status>('idle')
  const [held, setHeld] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isRecording = status === 'recording'

  // Tell main to pause global shortcuts while recording.
  useEffect(() => {
    if (!isRecording) return
    void window.snipotter.hotkeys.recordStart()
    return () => {
      void window.snipotter.hotkeys.recordEnd()
    }
  }, [isRecording])

  // Block paste/cut/copy & input events that macOS may dispatch alongside
  // certain shortcuts (e.g. Cmd+V triggers a paste event even though we
  // preventDefault on keydown). Without this, pasted clipboard text was
  // getting concatenated into the accelerator string.
  useEffect(() => {
    if (!isRecording) return
    const block = (e: Event): void => {
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('paste', block, true)
    document.addEventListener('cut', block, true)
    document.addEventListener('copy', block, true)
    document.addEventListener('beforeinput', block, true)
    return () => {
      document.removeEventListener('paste', block, true)
      document.removeEventListener('cut', block, true)
      document.removeEventListener('copy', block, true)
      document.removeEventListener('beforeinput', block, true)
    }
  }, [isRecording])

  // Click outside cancels.
  useEffect(() => {
    if (!isRecording) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        cancelRecording()
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [isRecording])

  // Capture keys while recording.
  useEffect(() => {
    if (!isRecording) return

    const onKeyDown = async (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        cancelRecording()
        return
      }

      const parts = collectModifiers(e)
      const main = normalizeKey(e)

      if (!main || MODIFIER_KEYS.has(e.key)) {
        // Just a modifier — show real-time chips, wait for the trigger key.
        setHeld(parts)
        return
      }

      parts.push(main)
      setHeld(parts)

      if (parts.length < 2) {
        // Single-key bind — Electron requires modifier + key.
        setErrorMsg('En az bir modifier tuşu (⌘/⇧/⌥/⌃) gerekli.')
        setStatus('error')
        setTimeout(() => resetToIdle(), 1800)
        return
      }

      const accel = parts.join('+')

      // Defensive: if any part contains non-ASCII (which can leak through if
      // a paste/IME slips past our blockers), reject before persisting.
      // Electron's globalShortcut.register is ASCII-only and throws otherwise.
      if (!/^[\x20-\x7E]+$/.test(accel)) {
        setErrorMsg('Geçersiz karakter algılandı. Tekrar dene.')
        setStatus('error')
        setTimeout(() => resetToIdle(), 1800)
        return
      }

      setStatus('saving')
      try {
        const valid = await window.snipotter.hotkeys.validate(accel)
        if (!valid.ok || !valid.data) {
          setErrorMsg('Bu kısayol başka bir uygulama tarafından kullanılıyor olabilir.')
          setStatus('error')
          setTimeout(() => resetToIdle(), 2400)
          return
        }
        await onChange(accel)
        setStatus('saved')
        setTimeout(() => resetToIdle(), 1400)
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err))
        setStatus('error')
        setTimeout(() => resetToIdle(), 2400)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isRecording, onChange])

  function startRecording(): void {
    if (status === 'recording' || status === 'saving') return
    setHeld([])
    setErrorMsg(null)
    setStatus('recording')
  }

  function cancelRecording(): void {
    setHeld([])
    setStatus('idle')
  }

  function resetToIdle(): void {
    setHeld([])
    setErrorMsg(null)
    setStatus('idle')
  }

  async function clear(e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    setStatus('saving')
    try {
      await onChange('')
      setStatus('saved')
      setTimeout(() => resetToIdle(), 1200)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setStatus('error')
      setTimeout(() => resetToIdle(), 2200)
    }
  }

  // Display chips: while recording, prefer held; otherwise saved value
  const displayParts = isRecording && held.length > 0 ? held : value ? value.split('+') : []

  return (
    <div ref={containerRef} className={cn('flex flex-col items-end gap-1', className)}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={startRecording}
          className={cn(
            'group flex h-9 min-w-[180px] items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors',
            status === 'idle' && 'border-input bg-transparent hover:bg-accent',
            status === 'recording' && 'border-primary bg-primary/10 ring-2 ring-primary/30',
            status === 'saving' && 'border-input bg-accent/40',
            status === 'saved' && 'border-emerald-500/60 bg-emerald-500/10',
            status === 'error' && 'border-destructive/60 bg-destructive/10',
          )}
        >
          <span className="flex items-center gap-1">
            {displayParts.length > 0 ? (
              displayParts.map((p, i) => <KeyChip key={`${p}-${i}`} accel={p} />)
            ) : (
              <span className="text-xs text-muted-foreground">
                {isRecording ? 'Tuşlara bas…' : placeholder}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center text-muted-foreground">
            {status === 'recording' && (
              <span className="text-[10px] uppercase tracking-wide">⎋ iptal</span>
            )}
            {status === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {status === 'saved' && <Check className="h-3.5 w-3.5 text-emerald-500" />}
            {status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
            {status === 'idle' && (
              <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </span>
        </button>

        {value && status === 'idle' && (
          <button
            type="button"
            onClick={clear}
            title="Kısayolu temizle"
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {errorMsg && status === 'error' && (
        <div className="text-[11px] text-destructive">{errorMsg}</div>
      )}
      {status === 'saved' && (
        <div className="text-[11px] text-emerald-500">Kaydedildi</div>
      )}
    </div>
  )
}

// =====================================================================
// Helpers
// =====================================================================

function collectModifiers(e: KeyboardEvent): string[] {
  const parts: string[] = []
  // On Mac the Cmd key is `metaKey`; we map both Cmd and Ctrl onto
  // `CommandOrControl` so the same accelerator works cross-platform.
  if (e.metaKey || (e.ctrlKey && isMac())) parts.push('CommandOrControl')
  else if (e.ctrlKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  return parts
}

function normalizeKey(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const k = e.key

  if (k.length === 1) {
    // Letters: uppercase. Digits/symbols: as-is.
    if (/[a-z]/.test(k)) return k.toUpperCase()
    return k
  }

  const map: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    ' ': 'Space',
    Tab: 'Tab',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
    F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
    F13: 'F13', F14: 'F14', F15: 'F15', F16: 'F16',
    F17: 'F17', F18: 'F18', F19: 'F19', F20: 'F20',
  }
  return map[k] ?? null
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent)
}

function symbolFor(part: string): string {
  if (!isMac()) return part
  switch (part) {
    case 'CommandOrControl':
    case 'CmdOrCtrl':
    case 'Command':
    case 'Cmd':
    case 'Meta':
      return '⌘'
    case 'Control':
    case 'Ctrl':
      return '⌃'
    case 'Alt':
    case 'Option':
      return '⌥'
    case 'Shift':
      return '⇧'
    case 'Return':
    case 'Enter':
      return '↩'
    case 'Escape':
      return '⎋'
    case 'Tab':
      return '⇥'
    case 'Backspace':
      return '⌫'
    case 'Delete':
      return '⌦'
    case 'Up':
      return '↑'
    case 'Down':
      return '↓'
    case 'Left':
      return '←'
    case 'Right':
      return '→'
    case 'Space':
      return '␣'
    default:
      return part
  }
}

function KeyChip({ accel }: { accel: string }): JSX.Element {
  const sym = symbolFor(accel)
  return (
    <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border bg-background/60 px-1.5 font-mono text-xs font-medium text-foreground shadow-sm">
      {sym}
    </kbd>
  )
}
