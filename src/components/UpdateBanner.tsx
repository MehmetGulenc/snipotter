import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import type { UpdaterStatus } from '@shared/types'

export function UpdateBanner(): JSX.Element | null {
  const [status, setStatus] = useState<UpdaterStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    void window.snipotter.updater.getStatus().then((r) => {
      if (r.ok) setStatus(r.data)
    })
    const off = window.snipotter.updater.onChanged((s) => {
      setStatus(s)
      // When a new update becomes available reset dismissed so it shows again.
      if (s.kind === 'available' || s.kind === 'downloaded') setDismissed(false)
    })
    return () => { off() }
  }, [])

  if (!status || dismissed) return null

  if (status.kind === 'available') {
    return (
      <div className="flex items-center gap-2 bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400 border-b border-amber-500/20">
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">
          <span className="font-semibold">Yeni sürüm hazır:</span> v{status.nextVersion}
        </span>
        <button
          onClick={() => window.snipotter.updater.downloadNow()}
          className="rounded bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-700"
        >
          İndir
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="rounded p-0.5 hover:bg-amber-500/20"
          title="Sonra hatırlat"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  if (status.kind === 'downloading') {
    return (
      <div className="flex items-center gap-2 bg-primary/8 px-4 py-2 text-xs text-primary border-b border-primary/15">
        <Download className="h-3.5 w-3.5 shrink-0 animate-bounce" />
        <div className="flex flex-1 flex-col gap-0.5">
          <span>Güncelleme indiriliyor… {status.percent}%</span>
          <div className="h-1 w-full overflow-hidden rounded-full bg-primary/20">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${status.percent}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (status.kind === 'downloaded') {
    return (
      <div className="flex items-center gap-2 bg-green-500/10 px-4 py-2 text-xs text-green-700 dark:text-green-400 border-b border-green-500/20">
        <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">
          <span className="font-semibold">v{status.nextVersion} hazır!</span> Uygulamayı yeniden başlat.
        </span>
        <button
          onClick={() => window.snipotter.updater.installAndRestart()}
          className="rounded bg-green-600 px-2 py-0.5 text-white hover:bg-green-700"
        >
          Yeniden Başlat
        </button>
        <button onClick={() => setDismissed(true)} className="rounded p-0.5 hover:bg-green-500/20">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return null
}
