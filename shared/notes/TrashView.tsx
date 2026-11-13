import { useEffect, useState } from 'react'
import { RotateCcw, Trash2, Loader2 } from 'lucide-react'
import { noteTitleFallback, extractText } from './content'
import { daysLeft, whenLabel } from './library'
import type { NoteLibrary, TrashedNote } from './library'

interface Props {
  library: NoteLibrary
  /** Platform confirm dialog for permanent deletion. */
  confirm: (title: string, message: string) => Promise<boolean>
  onRestored?: (ids: string[]) => void
  variant: 'desktop' | 'mobile'
}

export function TrashView({ library, confirm, onRestored, variant }: Props): JSX.Element {
  const [items, setItems] = useState<TrashedNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = (): void => {
    setError(null)
    library.trashList().then(setItems).catch(() => setError('Çöp kutusu yüklenemedi. Bağlantını kontrol et.'))
  }
  useEffect(load, [library])

  const restore = async (ids: string[]): Promise<void> => {
    setBusyId(ids.length === 1 ? ids[0] : 'all')
    try {
      await library.restore(ids)
      setItems((prev) => prev?.filter((n) => !ids.includes(n.id)) ?? null)
      onRestored?.(ids)
    } catch {
      setError('Geri yüklenemedi.')
    } finally {
      setBusyId(null)
    }
  }

  const purge = async (ids: string[]): Promise<void> => {
    const many = ids.length > 1
    const ok = await confirm(
      many ? 'Çöp kutusu boşaltılsın mı?' : 'Not kalıcı olarak silinsin mi?',
      many ? `${ids.length} not ve sürüm geçmişleri kalıcı olarak silinecek. Bu geri alınamaz.` : 'Not ve sürüm geçmişi kalıcı olarak silinecek. Bu geri alınamaz.',
    )
    if (!ok) return
    setBusyId(many ? 'all' : ids[0])
    try {
      await library.purge(ids)
      setItems((prev) => prev?.filter((n) => !ids.includes(n.id)) ?? null)
    } catch {
      setError('Silinemedi.')
    } finally {
      setBusyId(null)
    }
  }

  const mobile = variant === 'mobile'
  const btn = mobile ? 'h-11 px-3' : 'h-8 px-2.5'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="text-xs text-muted-foreground">Silinen notlar 30 gün burada kalır, sonra kalıcı olarak silinir.</p>
        {items && items.length > 0 && (
          <button type="button" onClick={() => void purge(items.map((n) => n.id))} disabled={busyId !== null} className={`shrink-0 rounded-lg text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50 ${btn}`}>
            Boşalt
          </button>
        )}
      </div>
      {error && <div className="mx-4 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {items === null && !error && (
          <div className="flex justify-center p-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" aria-label="Yükleniyor" /></div>
        )}
        {items?.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Çöp kutusu boş.</p>}
        {items?.map((n) => (
          <div key={n.id} className="mb-2 rounded-xl border border-border bg-card px-3 py-3">
            <div className="truncate text-sm font-medium">{n.title?.trim() || noteTitleFallback(n.content) || 'Boş not'}</div>
            <div className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{extractText(n.content)}</div>
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <span className="flex-1">{whenLabel(n.deletedAt)} silindi · {daysLeft(n.deletedAt)} gün kaldı</span>
              <button type="button" onClick={() => void restore([n.id])} disabled={busyId !== null} className={`flex items-center gap-1 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-50 ${btn}`}>
                {busyId === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Geri yükle
              </button>
              <button type="button" onClick={() => void purge([n.id])} disabled={busyId !== null} aria-label="Kalıcı sil" title="Kalıcı sil" className={`flex items-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50 ${btn}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
