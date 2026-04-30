import { useEffect, useState } from 'react'
import { Apple, Check, Download, Loader2, X } from 'lucide-react'

const RELEASES_URL = 'https://github.com/MehmetGulenc/snipotter/releases/latest'
const RELEASES_API = 'https://api.github.com/repos/MehmetGulenc/snipotter/releases/latest'
const APP_URL = 'https://app.snipotter.com'

type Platform = 'mac' | 'win' | 'linux' | 'mobile' | 'unknown'
type DownloadTarget = 'mac-arm64' | 'mac-x64' | 'win' | 'linux'

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

/**
 * Pick the right asset for a given target out of a GitHub release's asset list.
 * electron-builder's default naming gives us:
 *   - Snipotter-<v>-arm64.dmg / Snipotter-<v>.dmg
 *   - Snipotter-Setup-<v>.exe (NSIS installer; we prefer this over the
 *     portable .exe so users get a Start-menu entry and uninstaller)
 *   - Snipotter-<v>.AppImage (most distros) / .deb (Debian/Ubuntu)
 * If we can't find a match (e.g. the release is mid-publish and only some
 * assets are uploaded) we return null and the caller falls back to the
 * Releases page.
 */
function pickAsset(target: DownloadTarget, assets: ReleaseAsset[]): ReleaseAsset | null {
  switch (target) {
    case 'mac-arm64':
      return assets.find((a) => /arm64.*\.dmg$/i.test(a.name)) ?? null
    case 'mac-x64':
      return (
        assets.find((a) => /\.dmg$/i.test(a.name) && !/arm64/i.test(a.name)) ?? null
      )
    case 'win':
      // Setup-style installer first; portable .exe is a fallback.
      return (
        assets.find((a) => /setup.*\.exe$/i.test(a.name)) ??
        assets.find((a) => /\.exe$/i.test(a.name)) ??
        null
      )
    case 'linux':
      return (
        assets.find((a) => /\.appimage$/i.test(a.name)) ??
        assets.find((a) => /\.deb$/i.test(a.name)) ??
        null
      )
  }
}

/**
 * Detect the user's OS family from the user agent. We deliberately do *not*
 * try to detect macOS arch (arm64 vs x64) here: Apple's WebKit reports
 * 'Intel Mac OS X 10_15_7' on every recent Mac including M-series silicon, so
 * any UA-based guess is wrong about half the time. Instead, the Mac path
 * always shows a small picker.
 */
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  // Mobile checks first — iPad on iOS 13+ reports as Mac, so we guard with
  // touch-points to keep iPads in the mobile bucket where 'install as PWA' is
  // the right answer.
  const isIpadOS = /Mac/i.test(ua) && navigator.maxTouchPoints > 1
  if (/iPhone|iPod|Android/i.test(ua) || isIpadOS) return 'mobile'
  if (/Mac/i.test(ua)) return 'mac'
  if (/Win/i.test(ua)) return 'win'
  if (/Linux|X11/i.test(ua)) return 'linux'
  return 'unknown'
}

async function triggerDownload(target: DownloadTarget): Promise<void> {
  // Anonymous GitHub API is rate-limited (60 req/h/IP) but a single call per
  // click is well within budget; we don't bother caching across page loads
  // because the asset URL changes on every release.
  const r = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error(`GitHub API ${r.status}`)
  const data = (await r.json()) as { assets: ReleaseAsset[] }
  const asset = pickAsset(target, data.assets ?? [])
  if (!asset) throw new Error('Bu sürüm için uygun dosya bulunamadı.')
  // Navigation (vs <a download>) so the browser shows its native download UI
  // and the user can see progress. The asset is on github.com so cross-origin
  // download attribute would be ignored anyway.
  window.location.href = asset.browser_download_url
}

/**
 * Smart "download for desktop" CTA. Replaces the dumb link to the GitHub
 * Releases page (which dropped users on a wall of files they had to pick
 * through). Now: detect the platform, hit the GitHub API, hand the user
 * exactly the right binary in one click. Mac arch is asked via a small
 * picker because the UA can't tell us. Mobile gets a friendly "no app, use
 * the web" panel since we don't ship for iOS/Android.
 */
export function SmartDownloadButton(): JSX.Element {
  const [platform, setPlatform] = useState<Platform>('unknown')
  const [showMacPicker, setShowMacPicker] = useState(false)
  const [showMobileHint, setShowMobileHint] = useState(false)
  const [busy, setBusy] = useState<DownloadTarget | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setPlatform(detectPlatform())
  }, [])

  const start = async (t: DownloadTarget): Promise<void> => {
    setBusy(t)
    setErr(null)
    try {
      await triggerDownload(t)
      // Close picker after kick-off; the browser handles progress from here.
      setShowMacPicker(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const onClick = (): void => {
    setErr(null)
    if (platform === 'mobile') {
      setShowMobileHint(true)
      return
    }
    if (platform === 'mac' || platform === 'unknown') {
      // 'unknown' falls through to the Mac picker on purpose — desktop users
      // on exotic browsers can pick manually rather than ending up on the
      // releases page.
      setShowMacPicker(true)
      return
    }
    if (platform === 'win') void start('win')
    else if (platform === 'linux') void start('linux')
  }

  // Label adapts to the detected OS so the CTA reads naturally.
  const label =
    platform === 'mobile'
      ? 'Telefonda nasıl kullanılır?'
      : platform === 'win'
        ? 'Windows için indir'
        : platform === 'linux'
          ? 'Linux için indir'
          : 'Masaüstü için indir'

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:opacity-70"
        disabled={busy !== null}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {label}
      </button>

      {showMacPicker && (
        <Modal onClose={() => setShowMacPicker(false)} title="Mac modelini seç">
          <p className="text-sm text-muted-foreground">
            Mac'in işlemcisini tarayıcıdan tespit edemiyoruz. Doğru sürümü
            indirmek için modelini seç:
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <MacChoice
              label="Apple Silicon"
              hint="M1 / M2 / M3 / M4"
              busy={busy === 'mac-arm64'}
              onClick={() => void start('mac-arm64')}
            />
            <MacChoice
              label="Intel"
              hint="2020 öncesi Mac'ler"
              busy={busy === 'mac-x64'}
              onClick={() => void start('mac-x64')}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Bilmiyor musun? Apple menüsü (sol üst) → "Bu Mac Hakkında" →
            "Çip" satırı: <strong>Apple M*</strong> ise Apple Silicon,
            <strong> Intel Core</strong> ise Intel.
          </p>
          {err && <ErrorRow text={err} />}
        </Modal>
      )}

      {showMobileHint && (
        <Modal onClose={() => setShowMobileHint(false)} title="Telefonda Snipotter">
          <p className="text-sm text-muted-foreground">
            Telefon için ayrı bir uygulama yok — bunun yerine{' '}
            <strong>app.snipotter.com</strong> adresini ana ekranına ekle.
            Tam ekran açılır, bildirimler dahil her şey çalışır.
          </p>
          <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
            <li>
              <strong>iPhone (Safari):</strong> Paylaş → "Ana Ekrana Ekle".
            </li>
            <li>
              <strong>Android (Chrome):</strong> Menü (⋮) → "Uygulamayı yükle"
              veya "Ana ekrana ekle".
            </li>
          </ol>
          <a
            href={APP_URL}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <Check className="h-4 w-4" />
            Web uygulamasını şimdi aç
          </a>
        </Modal>
      )}
    </>
  )
}

function MacChoice({
  label,
  hint,
  busy,
  onClick,
}: {
  label: string
  hint: string
  busy: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-3 rounded-lg border border-border bg-card/40 p-4 text-left transition hover:border-primary/50 hover:bg-card disabled:opacity-70"
    >
      <Apple className="h-5 w-5 text-foreground" />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {busy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
    </button>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}): JSX.Element {
  // Lock body scroll while the modal is open so the page underneath doesn't
  // bounce on iOS when the user taps a choice.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
        <div className="mt-4 text-center text-[11px] text-muted-foreground">
          Sorun mu çıktı?{' '}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            Tüm dosyaları GitHub'da gör
          </a>
        </div>
      </div>
    </div>
  )
}

function ErrorRow({ text }: { text: string }): JSX.Element {
  return (
    <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {text}
    </div>
  )
}
