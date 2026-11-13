import { useEffect, useState } from 'react'
import { History, RotateCcw, Save, X, Loader2 } from 'lucide-react'
import { extractText } from './content'
import { whenLabel } from './library'
import type { NoteLibrary, NoteVersion } from './library'

const KIND_LABEL: Record<NoteVersion['kind'], string> = {
  auto: 'Otomatik',
  manual: 'Elle kaydedildi',
  restore: 'Geri yüklemeden önce',
}

interface Props {
  noteId: string
  library: NoteLibrary
  /** Current document as Tiptap JSON, saved before restoring and for "Sürümü kaydet". */
  currentContent: () => string
  onRestore: (content: string) => void
  onClose: () => void
}

/** Lists saved versions of a note; restoring keeps the current text as a version first. */
export function VersionHistory({ noteId, library, currentContent, onRestore, onClose }: Props): JSX.Element {
  const [versions, setVersions] = useState<NoteVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<NoteVersion | null>(null)
  const [busy, setBusy] = useState(false)

  const load = (): void => {
    setError(null)
    library.versions(noteId).then(setVersions).catch(() => setError('Sürümler yüklenemedi. Bağlantını kontrol et.'))
  }
  useEffect(load, [noteId, library])

  const saveNow = async (): Promise<void> => {
    setBusy(true)
    try {
      await library.saveVersion(noteId, currentContent(), 'manual')
      load()
    } catch {
      setError('Sürüm kaydedilemedi.')
    } finally {
      setBusy(false)
    }
  }

  const restore = async (v: NoteVersion): Promise<void> => {
    setBusy(true)
    try {
      await library.saveVersion(noteId, currentContent(), 'restore')
      onRestore(v.content)
      onClose()
    } catch {
      setError('Geri yüklenemedi: mevcut hâl kaydedilemediği için işlem durduruldu.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Sürüm geçmişi" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <History className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="flex-1 text-base font-semibold">Sürüm geçmişi</h2>
          <button type="button" onClick={() => void saveNow()} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-primary hover:bg-primary/10 disabled:opacity-50">
            <Save className="h-4 w-4" aria-hidden="true" /> Şimdiki hâli kaydet
          </button>
          <button type="button" onClick={onClose} aria-label="Kapat" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <div className="border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}

        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
              <button type="button" onClick={() => setSelected(null)} className="text-primary">← Tüm sürümler</button>
              <span className="flex-1 text-right">{whenLabel(selected.createdAt)} · {KIND_LABEL[selected.kind]}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-line px-4 pb-4 text-sm leading-6">
              {extractText(selected.content) || <span className="italic text-muted-foreground">Boş not</span>}
            </div>
            <div className="border-t border-border p-3">
              <button type="button" onClick={() => void restore(selected)} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Bu sürüme dön
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {versions === null && !error && (
              <div className="flex justify-center p-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" aria-label="Yükleniyor" /></div>
            )}
            {versions?.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">Henüz sürüm yok. Notu düzenleyip kapattığında otomatik bir sürüm kaydedilir.</p>
            )}
            <ul>
              {versions?.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => setSelected(v)} className="w-full border-b border-border/60 px-4 py-3 text-left hover:bg-accent">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{whenLabel(v.createdAt)}</span>
                      <span>{KIND_LABEL[v.kind]}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 whitespace-pre-line text-sm">{extractText(v.content) || 'Boş not'}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
