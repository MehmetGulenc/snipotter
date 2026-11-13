import type { NoteVersion, TrashedNote } from '../types'

export type { NoteVersion, TrashedNote }

/** Version history and trash, implemented per platform (Supabase directly or via IPC). */
export interface NoteLibrary {
  versions(noteId: string): Promise<NoteVersion[]>
  saveVersion(noteId: string, content: string, kind: 'manual' | 'restore'): Promise<void>
  trashList(): Promise<TrashedNote[]>
  restore(ids: string[]): Promise<void>
  purge(ids: string[]): Promise<void>
}

const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' })

/** "3 dakika önce", "dün", "12 Kas 14:05". */
export function whenLabel(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return 'az önce'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 7 * 86_400) return rtf.format(Math.round(diff / 86_400), 'day')
  return new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Days left before a trashed note is removed for good (30-day retention). */
export function daysLeft(deletedAt: string, now = Date.now()): number {
  return Math.max(0, 30 - Math.floor((now - new Date(deletedAt).getTime()) / 86_400_000))
}
