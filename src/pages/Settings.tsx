import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { HotkeyInput } from '@/components/HotkeyInput'
import {
  Copy,
  KeyRound,
  LogOut,
  Loader2,
  Check,
  Smartphone,
  Download,
  RefreshCcw,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import type { AppSettings, WorkspaceMember, UpdaterStatus } from '@shared/types'

function Field({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <label className="flex items-start justify-between gap-6 border-b border-border py-4 last:border-b-0">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </label>
  )
}

export function Settings(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const aiStatus = useStore((s) => s.aiStatus)

  if (!settings) {
    return <div className="p-8 text-sm text-muted-foreground">Ayarlar yükleniyor…</div>
  }

  const update = async (partial: Partial<AppSettings>) => {
    await window.snipotter.settings.update(partial)
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl space-y-2">
        <h2 className="text-xl font-semibold">Ayarlar</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Snipotter'ı zevkine göre ayarla.
        </p>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pano
          </h3>
          <Field
            label="Pano izleme aktif"
            description="Kapatırsan yeni kopyalananlar kaydedilmez."
          >
            <input
              type="checkbox"
              checked={settings.clipboardEnabled}
              onChange={(e) => update({ clipboardEnabled: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </Field>
          <Field
            label="Hassas içerikleri gizle"
            description="API key, JWT, şifre gibi içerikler maskelenir."
          >
            <input
              type="checkbox"
              checked={settings.redactSensitive}
              onChange={(e) => update({ redactSensitive: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </Field>
        </section>

        <section className="pt-6">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI
          </h3>
          <Field
            label="AI ile otomatik etiketle"
            description="Her yeni içerik için Claude Haiku / Gemini Flash ile etiket + özet üretir."
          >
            <input
              type="checkbox"
              checked={settings.aiAutoEnrich}
              onChange={(e) => update({ aiAutoEnrich: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </Field>
          <Field
            label="Birincil AI sağlayıcı"
            description={
              aiStatus
                ? `Mevcut: Claude ${aiStatus.providers['claude-haiku'] ? '✓' : '✗'} · Gemini ${aiStatus.providers['gemini-flash'] ? '✓' : '✗'}`
                : 'AI sağlayıcı durumu kontrol ediliyor…'
            }
          >
            <select
              value={settings.aiPrimaryProvider}
              onChange={(e) =>
                update({ aiPrimaryProvider: e.target.value as AppSettings['aiPrimaryProvider'] })
              }
              className="rounded-md border border-input bg-transparent px-2 py-1 text-sm"
            >
              <option value="claude-haiku">Claude Haiku</option>
              <option value="gemini-flash">Gemini Flash</option>
            </select>
          </Field>
        </section>

        <section className="pt-6">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kısayollar
          </h3>
          <Field
            label="Hızlı yapıştır"
            description="Maccy benzeri popup; son kopyaları arar, ↑↓ Enter ile seçersin."
          >
            <HotkeyInput
              value={settings.quickPasteHotkey}
              onChange={(next) => update({ quickPasteHotkey: next })}
            />
          </Field>
          <Field
            label="Kütüphane kısayolu"
            description="Ana pencereyi her yerden açar. Tıkla ve istediğin tuşlara bas."
          >
            <HotkeyInput
              value={settings.globalHotkey}
              onChange={(next) => update({ globalHotkey: next })}
            />
          </Field>
          <Field
            label="Hızlı not kısayolu"
            description="Mini not penceresini açar. Tıkla ve istediğin tuşlara bas."
          >
            <HotkeyInput
              value={settings.quickNoteHotkey}
              onChange={(next) => update({ quickNoteHotkey: next })}
            />
          </Field>
        </section>

        <section className="pt-6">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Geçmiş
          </h3>
          <Field
            label="Pano geçmiş limiti"
            description="Aşan eski içerikler temizlenir (sabitler korunur)."
          >
            <Input
              type="number"
              min={50}
              max={5000}
              value={settings.clipboardHistoryLimit}
              onChange={(e) =>
                update({ clipboardHistoryLimit: Number(e.target.value || 500) })
              }
              className="w-24"
            />
          </Field>
        </section>

        <DevicesSection />
        <UpdateSection />
      </div>
    </div>
  )
}

function UpdateSection(): JSX.Element {
  const [status, setStatus] = useState<UpdaterStatus | null>(null)

  useEffect(() => {
    void window.snipotter.updater.getStatus().then((r) => {
      if (r.ok) setStatus(r.data)
    })
    const off = window.snipotter.updater.onChanged((s) => setStatus(s))
    return () => {
      off()
    }
  }, [])

  const checkNow = async (): Promise<void> => {
    setStatus({ kind: 'checking', currentVersion: status?.currentVersion ?? '?' })
    const r = await window.snipotter.updater.checkNow()
    if (r.ok) setStatus(r.data)
  }

  const restartNow = async (): Promise<void> => {
    await window.snipotter.updater.installAndRestart()
  }

  const cur = status?.currentVersion ?? '—'
  const isBusy = status?.kind === 'checking' || status?.kind === 'downloading'

  return (
    <section className="pt-6">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Güncellemeler
      </h3>

      <div className="rounded-lg border border-border bg-card/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              Snipotter <span className="font-mono text-xs text-muted-foreground">v{cur}</span>
            </div>
            <UpdateStatusLine status={status} />
          </div>

          {status?.kind === 'downloaded' ? (
            <Button onClick={restartNow} className="shrink-0">
              <Download className="mr-2 h-4 w-4" />
              Yeniden başlat & güncelle
            </Button>
          ) : (
            <Button
              onClick={checkNow}
              disabled={isBusy}
              variant="outline"
              className="shrink-0"
            >
              {isBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              {isBusy ? 'Kontrol ediliyor' : 'Güncellemeleri kontrol et'}
            </Button>
          )}
        </div>

        {status?.kind === 'downloading' && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${status.percent}%` }}
            />
          </div>
        )}
      </div>
    </section>
  )
}

function UpdateStatusLine({ status }: { status: UpdaterStatus | null }): JSX.Element {
  if (!status) {
    return <div className="text-xs text-muted-foreground">Durum yükleniyor…</div>
  }
  switch (status.kind) {
    case 'idle':
      return (
        <div className="text-xs text-muted-foreground">
          Otomatik kontrol açık · Açılıştan sonra ve her 6 saatte bir aranır
        </div>
      )
    case 'checking':
      return <div className="text-xs text-muted-foreground">Sunucu kontrol ediliyor…</div>
    case 'not-available':
      return (
        <div className="text-xs text-emerald-500">
          En güncel sürümdesin · Son kontrol:{' '}
          {new Date(status.checkedAt).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )
    case 'available':
      return (
        <div className="text-xs">
          <span className="text-primary">v{status.nextVersion}</span> hazır · indiriliyor…
          {status.releaseNotes && (
            <pre className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
              {status.releaseNotes}
            </pre>
          )}
        </div>
      )
    case 'downloading':
      return (
        <div className="text-xs text-muted-foreground">
          v{status.nextVersion} indiriliyor · {status.percent}% ·{' '}
          {(status.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s
        </div>
      )
    case 'downloaded':
      return (
        <div className="text-xs text-emerald-500">
          v{status.nextVersion} indirildi · Kurulum için yeniden başlat
        </div>
      )
    case 'error':
      return (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {status.message}
        </div>
      )
  }
}

function DevicesSection(): JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [code, setCode] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const refresh = async () => {
    const r = await window.snipotter.workspace.listMembers()
    if (r.ok) setMembers(r.data)
  }

  useEffect(() => {
    void refresh()
  }, [workspace?.id])

  // 10-min countdown
  useEffect(() => {
    if (!code) return
    setSecondsLeft(600)
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t)
          setCode(null)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [code])

  const generate = async () => {
    setBusy(true)
    const r = await window.snipotter.workspace.createPairCode()
    setBusy(false)
    if (r.ok) setCode(r.data.code)
  }

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const leave = async () => {
    if (!confirm('Bu cihazı eşleşmeden çıkar? İçeriklere artık erişemezsin.')) return
    await window.snipotter.workspace.leave()
    setWorkspace(null)
  }

  if (!workspace) return <></>

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <section className="pt-6">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Cihazlar
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Workspace: <span className="font-mono">{workspace.id.slice(0, 8)}</span> ·{' '}
        {workspace.isOwner ? 'Sahip' : 'Üye'}
      </p>

      <div className="mb-4 space-y-2 rounded-lg border border-border bg-card/30 p-3">
        {members.length === 0 && (
          <div className="text-xs text-muted-foreground">Cihazlar yükleniyor…</div>
        )}
        {members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm">
                {m.deviceName || 'Bilinmeyen cihaz'}
                {m.isSelf && (
                  <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                    Bu cihaz
                  </span>
                )}
                {m.role === 'owner' && (
                  <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-500">
                    Sahip
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Katıldı: {new Date(m.joinedAt).toLocaleDateString('tr-TR')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!code ? (
        <Button onClick={generate} disabled={busy} variant="outline" className="w-full">
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="mr-2 h-4 w-4" />
          )}
          Yeni cihaz ekle
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="text-center">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Diğer cihazda gir
            </div>
            <div className="font-mono text-3xl font-bold tracking-[0.4em] text-primary">
              {code}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {mm}:{ss} sonra geçersiz olur · tek kullanımlık
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={copy} variant="outline" className="flex-1">
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </Button>
            <Button onClick={() => setCode(null)} variant="ghost">
              Kapat
            </Button>
          </div>
        </div>
      )}

      <div className="pt-4">
        <Button onClick={leave} variant="ghost" className="text-destructive hover:bg-destructive/10">
          <LogOut className="mr-2 h-4 w-4" />
          Bu cihazı çıkar
        </Button>
      </div>
    </section>
  )
}
