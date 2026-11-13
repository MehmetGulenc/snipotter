import { create } from 'zustand'

/**
 * In-app replacements for window.alert / window.confirm. The native WKWebView
 * dialogs show English "OK/Cancel" buttons and look foreign on iOS; these are
 * rendered by <FeedbackHost /> in the app's own style and language.
 */

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  text: string
  kind: ToastKind
}

interface FeedbackState {
  confirm: PendingConfirm | null
  toasts: Toast[]
}

export const useFeedback = create<FeedbackState>(() => ({ confirm: null, toasts: [] }))

let nextToastId = 1

/** Resolves true when the user confirms, false when they cancel. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // A newer question replaces an unanswered one; the old one counts as cancelled.
    useFeedback.getState().confirm?.resolve(false)
    useFeedback.setState({ confirm: { ...options, resolve } })
  })
}

export function answerConfirm(ok: boolean): void {
  const pending = useFeedback.getState().confirm
  if (!pending) return
  useFeedback.setState({ confirm: null })
  pending.resolve(ok)
}

export function toast(text: string, kind: ToastKind = 'success', durationMs = 2200): void {
  const id = nextToastId++
  useFeedback.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, kind }] }))
  setTimeout(() => {
    useFeedback.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }, durationMs)
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message
  // Supabase (PostgrestError) and Capacitor rejections are plain objects.
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') return (e as { message: string }).message
  return String(e)
}
