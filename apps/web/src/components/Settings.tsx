'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { Copy, Check, Loader2, LogOut, Smartphone, KeyRound, Trash2, ChevronRight, Zap, Monitor, Layers, Bell } from 'lucide-react'
import { useStore } from '@/lib/store'
import { listMembers, createPairCode, leaveWorkspace, signOut, removeWorkspaceMember, deleteOwnAccount } from '@/lib/api'
import { isNative, isAutoCaptureEnabled, setAutoCaptureEnabled, openAppSettings } from '@/lib/mobile'
import { confirmDialog, errorText, toast } from '@/lib/feedback'
import { relativeTime, cn } from '@/lib/utils'
import type { WorkspaceMember } from '@/lib/types'
import { registerPush } from '@/lib/native-bridge'
import { PUSH_TOKEN_KEY, deletePushToken, savePushToken } from '@/lib/actions'
import { ShortcutGuide } from './ShortcutGuide'

export function Settings(): JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const user = useStore((s) => s.user)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const setUser = useStore((s) => s.setUser)

  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [autoCapture, setAutoCapture] = useState(false)
  const [pushToken, setPushToken] = useState<string | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const native = isNative()

  useEffect(() => {
    if (!workspace || !user) return
    void listMembers(workspace.id, user.id).then(setMembers).catch((e) => console.warn(e))
  }, [workspace?.id, user?.id])

  useEffect(() => {
    void isAutoCaptureEnabled().then(setAutoCapture)
  }, [])

  useEffect(() => {
    setPushToken(window.localStorage.getItem(PUSH_TOKEN_KEY))
  }, [])

  const onTogglePush = async () => {
    if (!workspace || pushBusy) return
    setPushBusy(true)
    try {
      const current = window.localStorage.getItem(PUSH_TOKEN_KEY)
      if (current) {
        await deletePushToken(current)
        window.localStorage.removeItem(PUSH_TOKEN_KEY)
        setPushToken(null)
        toast('Bildirimler kapatıldı', 'info')
        return
      }
      const reg = await registerPush()
      if (!reg) {
        toast('Bildirimler bu cihazda kullanılamıyor', 'info', 3200)
        return
      }
      await savePushToken({
        workspaceId: workspace.id,
        token: reg.token,
        environment: reg.environment,
        deviceName: 'iPhone',
      })
      window.localStorage.setItem(PUSH_TOKEN_KEY, reg.token)
      setPushToken(reg.token)
      toast('Bildirimler açıldı')
    } catch (e) {
      toast('Bildirim açılamadı: izin vermediysen iPhone Ayarları → Snipotter → Bildirimler\'den aç. ' + errorText(e), 'error', 4500)
    } finally {
      setPushBusy(false)
    }
  }

  const onToggleAutoCapture = async () => {
    const next = !autoCapture
    setAutoCapture(next)
    await setAutoCaptureEnabled(next)
    if (next) toast('Açık: uygulamayı her açtığında panodaki yeni metin kaydedilir.', 'info', 3200)
  }

  const onRemoveDevice = async (m: WorkspaceMember): Promise<void> => {
    if (!workspace || !user) return
    const ok = await confirmDialog({
      title: `"${m.deviceName || 'Bu cihaz'}" çıkarılsın mı?`,
      message: 'Bu cihaz artık pano ve notlarını göremez.',
      confirmLabel: 'Çıkar',
      destructive: true,
    })
    if (!ok) return
    setRemovingId(m.userId)
    try {
      await removeWorkspaceMember(workspace.id, m.userId)
      setMembers((prev) => prev.filter((x) => x.userId !== m.userId))
      toast('Cihaz çıkarıldı')
    } catch (e) {
      toast('Cihaz çıkarılamadı: ' + errorText(e), 'error', 3500)
    } finally {
      setRemovingId(null)
    }
  }

  const onGenerate = async () => {
    setBusy(true)
    try {
      setCode(await createPairCode())
    } catch (e) {
      toast('Kod oluşturulamadı: ' + errorText(e), 'error', 3500)
    } finally {
      setBusy(false)
    }
  }

  const onCopy = async () => {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  /** Removes this device's push token while the session is still valid (RLS only lets the owner delete it). */
  const dropPushToken = async (): Promise<void> => {
    const token = window.localStorage.getItem(PUSH_TOKEN_KEY)
    if (!token) return
    try {
      await deletePushToken(token)
    } catch (e) {
      console.warn('[push] token cleanup failed', e)
    }
    window.localStorage.removeItem(PUSH_TOKEN_KEY)
    setPushToken(null)
  }

  const onLeave = async () => {
    if (!workspace || !user) return
    const ok = await confirmDialog({
      title: 'Bu cihaz eşleşmeden çıkarılsın mı?',
      message: 'Bu cihazdan pano ve notlara erişim kalkar. Diğer cihazların etkilenmez.',
      confirmLabel: 'Çıkar',
      destructive: true,
    })
    if (!ok) return
    await dropPushToken()
    await leaveWorkspace(workspace.id, user.id)
    setWorkspace(null)
  }

  const onSignOut = async () => {
    const ok = await confirmDialog({
      title: 'Tamamen çıkış yapılsın mı?',
      message: 'Bu cihaz yeni bir anonim oturumla baştan başlar.',
      confirmLabel: 'Çıkış yap',
      destructive: true,
    })
    if (!ok) return
    await dropPushToken()
    await signOut()
    setUser(null)
    setWorkspace(null)
    location.reload()
  }

  const onDeleteAccount = async () => {
    const ok = await confirmDialog({
      title: 'Hesabın ve verilerin silinsin mi?',
      message: 'Oluşturduğun pano kayıtları ve notlar kalıcı olarak silinir. Paylaşılan alanlardaki diğer kişilerin verileri korunur. Bu işlem geri alınamaz.',
      confirmLabel: 'Sil',
      destructive: true,
    })
    if (!ok) return
    setDeletingAccount(true)
    try {
      await dropPushToken()
      await deleteOwnAccount()
      useStore.setState({ user: null, workspace: null, clipboard: [], notes: [] })
      location.reload()
    } catch (e) {
      toast('Hesap silinemedi: ' + errorText(e), 'error', 3500)
      setDeletingAccount(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-7 px-4 pb-10 pt-2 sm:px-6">
      <h1 className="px-1 text-[30px] font-bold tracking-tight">Ayarlar</h1>

      {native && (
        <Group
          title="Pano"
          footer="iPhone her okumada izin sorar. Sormaması için iPhone Ayarları → Snipotter → “Diğer Uygulamalardan Yapıştır” → İzin Ver."
        >
          <Row icon={<Zap className="h-4 w-4" />} iconBg="bg-amber-500" onClick={onToggleAutoCapture} checked={autoCapture}>
            <span className="flex-1">Açılışta otomatik kaydet</span>
            <Switch on={autoCapture} />
          </Row>
          <Row icon={<Smartphone className="h-4 w-4" />} iconBg="bg-sky-500" onClick={openAppSettings}>
            <span className="flex-1">Yapıştırma iznini ayarla</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Row>
        </Group>
      )}

      {native && (
        <Group
          title="Bilgisayardan telefona"
          footer="Bilgisayardan “Telefona gönder” dediğin telefon numarası, adres, IBAN ve bağlantılar iPhone'una bildirim olarak gelir; Ara, Haritada aç ve Kopyala düğmeleriyle tek dokunuşta kullanırsın."
        >
          <Row icon={<Bell className="h-4 w-4" />} iconBg="bg-primary" onClick={pushBusy ? undefined : onTogglePush} checked={Boolean(pushToken)}>
            <span className="flex-1">Bildirimler</span>
            {pushBusy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Switch on={Boolean(pushToken)} />}
          </Row>
        </Group>
      )}

      {native && (
        <Group
          title="Uygulamayı açmadan kaydet"
          footer="Paylaş menüsü: herhangi bir uygulamada metni seç → Paylaş → Snipotter. Arkaya dokun: Kestirmeler'de “Panoyu Al” ve “Snipotter'a kaydet” eylemleriyle bir kestirme yap, sonra Ayarlar → Erişilebilirlik → Dokunma → Arkaya Dokunma'dan ona bağla."
        >
          <Row icon={<Layers className="h-4 w-4" />} iconBg="bg-indigo-500" onClick={() => window.open('shortcuts://', '_system')}>
            <span className="flex-1">Kestirmeler'i aç</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Row>
        </Group>
      )}

      {native && (
        <Group title="Kestirme rehberi" footer="Adımlar Kestirmeler uygulamasında yapılır; Snipotter panoyu arka planda okumaz.">
          <ShortcutGuide />
        </Group>
      )}

      <Group
        title="Cihazlar"
        footer={workspace ? `${workspace.name} · ${relativeTime(workspace.createdAt)} oluşturuldu${workspace.isOwner ? ' · sahibi sensin' : ''}` : undefined}
      >
        {members.map((m) => (
          <Row
            key={m.userId}
            icon={m.deviceName?.match(/mac|windows|pc/i) ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
            iconBg="bg-zinc-600"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate">
                {m.deviceName || 'Bilinmeyen cihaz'}
                {m.isSelf && <span className="ml-2 text-xs text-primary">bu cihaz</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {m.role === 'owner' ? 'Sahip · ' : ''}
                {relativeTime(m.joinedAt)} eklendi
              </div>
            </div>
            {!m.isSelf && (
              <button
                onClick={() => void onRemoveDevice(m)}
                disabled={removingId === m.userId}
                className="-mr-1 rounded-full p-2 text-muted-foreground active:bg-white/10 disabled:opacity-50"
                aria-label="Cihazı çıkar"
              >
                {removingId === m.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            )}
          </Row>
        ))}
        {code ? (
          <div className="space-y-3 px-4 py-4">
            <p className="text-center text-xs text-muted-foreground">Diğer cihazda “Eşleştir” ekranına yaz · 10 dakika geçerli</p>
            <div className="text-center font-mono text-4xl font-bold tracking-[0.3em] text-primary">{formatPairCode(code)}</div>
            <div className="flex gap-2">
              <button onClick={onCopy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-medium active:bg-white/15">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Kopyalandı' : 'Kopyala'}
              </button>
              <button onClick={() => setCode(null)} className="flex-1 rounded-xl py-2.5 text-sm text-muted-foreground active:bg-white/10">
                Kapat
              </button>
            </div>
          </div>
        ) : (
          <Row icon={<KeyRound className="h-4 w-4" />} iconBg="bg-primary" onClick={busy ? undefined : onGenerate}>
            <span className="flex-1 text-primary">Yeni cihaz bağla</span>
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </Row>
        )}
      </Group>

      <Group>
        <Row onClick={onLeave}>
          <LogOut className="h-4 w-4 text-destructive" />
          <span className="flex-1 text-destructive">Bu cihazı eşleşmeden çıkar</span>
        </Row>
        <Row onClick={onSignOut}>
          <span className="flex-1 pl-7">Tamamen çıkış yap</span>
        </Row>
      </Group>

      <Group footer="Bu hesaba ait pano kayıtları, notlar ve cihaz eşleştirmeleri kalıcı olarak silinir.">
        <Row onClick={deletingAccount ? undefined : onDeleteAccount}>
          {deletingAccount ? <Loader2 className="h-4 w-4 animate-spin text-destructive" /> : <Trash2 className="h-4 w-4 text-destructive" />}
          <span className="flex-1 text-destructive">{deletingAccount ? 'Siliniyor…' : 'Hesabımı ve verilerimi sil'}</span>
        </Row>
      </Group>

      <footer className="pt-2 text-center text-xs text-muted-foreground">
        {/* Keep in sync with apps/web/package.json `version`. */}
        Snipotter · v0.5.3
      </footer>
    </div>
  )
}

function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }): JSX.Element {
  return (
    <section>
      {title && <h2 className="mb-1.5 px-4 text-[13px] uppercase tracking-wide text-muted-foreground">{title}</h2>}
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl bg-card">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] leading-snug text-muted-foreground">{footer}</p>}
    </section>
  )
}

function Row({
  icon,
  iconBg,
  onClick,
  checked,
  children,
}: {
  icon?: ReactNode
  iconBg?: string
  onClick?: () => void
  /** Set for a row that toggles a setting; the row is then announced as a switch. */
  checked?: boolean
  children: ReactNode
}): JSX.Element {
  const content = (
    <>
      {icon && (
        <span aria-hidden="true" className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white', iconBg)}>{icon}</span>
      )}
      {children}
    </>
  )
  const base = 'flex min-h-[44px] w-full items-center gap-3 px-4 py-2 text-left text-[16px]'
  return onClick ? (
    <button
      onClick={onClick}
      role={checked === undefined ? undefined : 'switch'}
      aria-checked={checked}
      className={cn(base, 'transition-colors duration-100 active:bg-white/[0.06]')}
    >
      {content}
    </button>
  ) : (
    <div className={base}>{content}</div>
  )
}

function Switch({ on }: { on: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors', on ? 'bg-emerald-500' : 'bg-white/15')}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-[22px]' : 'translate-x-[2px]',
        )}
      />
    </span>
  )
}

/**
 * Render a pair code in the canonical `XXX-XXX` form regardless of how the
 * server sends it (older RPCs inserted the dash, the UI used to add one too).
 */
function formatPairCode(raw: string): string {
  const clean = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  if (clean.length <= 3) return clean
  return `${clean.slice(0, 3)}-${clean.slice(3, 6)}`
}
