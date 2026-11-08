/**
 * Kütüphane sayfası için küçük, saf yardımcılar: kalıcı görünüm/filtre
 * tercihleri ve klavye kısayolu eşlemesi. DOM'a bağımlı değiller; bu sayede
 * node testlerinde doğrudan çalıştırılabiliyorlar.
 */

export const LIBRARY_FILTERS = ['all', 'pinned', 'text', 'image', 'file'] as const
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number]
export type LibraryView = 'grid' | 'list'

const VIEW_KEY = 'snipotter.library.view'
const FILTER_KEY = 'snipotter.library.filter'

type KV = Pick<Storage, 'getItem' | 'setItem'>

function storage(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Erişim engellenmiş olabilir (ör. gizli mod / sandbox).
    return null
  }
}

export function loadView(store: KV | null = storage()): LibraryView {
  const v = store?.getItem(VIEW_KEY)
  return v === 'list' ? 'list' : 'grid'
}

export function loadFilter(store: KV | null = storage()): LibraryFilter {
  const v = store?.getItem(FILTER_KEY)
  return (LIBRARY_FILTERS as readonly string[]).includes(v ?? '') ? (v as LibraryFilter) : 'all'
}

export function saveView(view: LibraryView, store: KV | null = storage()): void {
  try { store?.setItem(VIEW_KEY, view) } catch { /* kota/erişim hatası: tercih kaydedilmez */ }
}

export function saveFilter(filter: LibraryFilter, store: KV | null = storage()): void {
  try { store?.setItem(FILTER_KEY, filter) } catch { /* kota/erişim hatası: tercih kaydedilmez */ }
}

export type LibraryShortcut = 'clear-selection' | 'select-all' | 'delete-selected' | 'undo-delete' | null

interface ShortcutEvent {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  /** Odak bir metin alanında mı (input, textarea, contentEditable)? */
  typing: boolean
}

interface ShortcutState {
  hasSelection: boolean
  hasItems: boolean
  hasPendingDelete: boolean
}

/** Klavye olayını Kütüphane eylemine çevirir; eşleşme yoksa null döner. */
export function resolveLibraryShortcut(e: ShortcutEvent, s: ShortcutState): LibraryShortcut {
  // Metin yazarken kısayollar düzenlemeyi (⌘A, ⌫, ⌘Z) ezmemeli.
  if (e.typing || e.altKey) return null
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  if (!mod && key === 'escape' && s.hasSelection) return 'clear-selection'
  if (mod && key === 'a' && s.hasItems) return 'select-all'
  if (mod && key === 'z' && s.hasPendingDelete) return 'undo-delete'
  if ((key === 'delete' || key === 'backspace') && s.hasSelection) return 'delete-selected'
  return null
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false
  const el = target as HTMLElement
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true
}
