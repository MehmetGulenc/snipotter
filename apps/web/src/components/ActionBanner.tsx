'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Phone, MapPin, Copy, ExternalLink, Smartphone, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import {
  buttonsFor,
  consumeAction,
  fetchUsableAction,
  hrefFor,
  listPendingActions,
  PUSH_TOKEN_KEY,
  deletePushToken,
  savePushToken,
  syncActivityToken,
  subscribeActions,
  type ActionButton,
  type DeviceAction,
} from '@/lib/actions'
import { copyText, nativeBridgeAvailable, onPushAction, openExternal, registerPush } from '@/lib/native-bridge'
import { errorText, toast } from '@/lib/feedback'

const BUTTONS: Record<ActionButton, { label: string; Icon: typeof Phone }> = {
  call: { label: 'Ara', Icon: Phone },
  map: { label: 'Haritada aç', Icon: MapPin },
  open: { label: 'Aç', Icon: ExternalLink },
  copy: { label: 'Kopyala', Icon: Copy },
}

const TITLES: Record<DeviceAction['kind'], string> = {
  phone: 'Telefon numarası',
  address: 'Adres',
  iban: 'IBAN',
  url: 'Bağlantı',
  text: 'Metin',
}

/** Dev only: ?demoAction=phone|address|iban|url shows a fake banner for screenshots. */
function demoAction(): DeviceAction | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null
  const kind = new URLSearchParams(window.location.search).get('demoAction')
  const samples: Record<string, string> = {
    phone: '+90 532 123 45 67',
    address: 'Bağdat Caddesi No: 120, Kadıköy / İstanbul',
    iban: 'TR33 0006 1005 1978 6457 8413 26',
    url: 'https://snipotter.com',
  }
  if (!kind || !samples[kind]) return null
  const now = Date.now()
  return {
    id: `demo-${kind}`,
    kind: kind as DeviceAction['kind'],
    payload: samples[kind],
    label: null,
    senderUserId: null,
    senderDevice: 'MacBook',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 600_000).toISOString(),
  }
}

/**
 * Top strip for "send to phone" records coming from a computer. Shown while
 * the app is open; push notification buttons are handled here too.
 */
export function ActionBanner(): JSX.Element | null {
  const workspace = useStore((s) => s.workspace)
  const user = useStore((s) => s.user)
  const [queue, setQueue] = useState<DeviceAction[]>([])
  const seen = useRef(new Set<string>())

  const enqueue = useCallback(
    (a: DeviceAction) => {
      if (seen.current.has(a.id) || (a.senderUserId && a.senderUserId === user?.id)) return
      seen.current.add(a.id)
      setQueue((q) => [...q, a])
    },
    [user?.id],
  )

  const finish = useCallback(async (a: DeviceAction): Promise<void> => {
    setQueue((q) => q.filter((x) => x.id !== a.id))
    if (a.id.startsWith('demo-')) return
    try {
      await consumeAction(a.id)
    } catch (e) {
      console.warn('[actions] consume failed', e)
    }
  }, [])

  const perform = useCallback(
    async (a: DeviceAction, button: ActionButton): Promise<void> => {
      try {
        const href = hrefFor(button, a.payload)
        if (href) openExternal(href)
        else {
          await copyText(a.kind === 'iban' ? a.payload.replace(/\s+/g, '') : a.payload)
          toast(a.kind === 'iban' ? 'IBAN boşluksuz kopyalandı' : 'Kopyalandı')
        }
        await finish(a)
      } catch (e) {
        toast(errorText(e), 'error', 3500)
      }
    },
    [finish],
  )

  useEffect(() => {
    const demo = demoAction()
    if (demo) enqueue(demo)
  }, [enqueue])

  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    void listPendingActions(workspace.id)
      .then((list) => {
        if (!cancelled) list.forEach(enqueue)
      })
      .catch((e) => console.warn('[actions] load failed', e))
    const unsub = subscribeActions(workspace.id, enqueue)
    return () => {
      cancelled = true
      unsub()
    }
  }, [workspace?.id, enqueue])

  // Keep the APNs token and its workspace current while notifications are on:
  // the token can change after a reinstall/restore and the device can move to
  // another workspace. Permission is already granted at this point (no prompt).
  useEffect(() => {
    if (!workspace || !nativeBridgeAvailable()) return
    const stored = window.localStorage.getItem(PUSH_TOKEN_KEY)
    if (!stored) return
    let cancelled = false
    void (async () => {
      try {
        const reg = await registerPush()
        if (!reg || cancelled) return
        await savePushToken({ workspaceId: workspace.id, token: reg.token, environment: reg.environment, deviceName: 'iPhone' })
        await syncActivityToken(workspace.id, reg.environment).catch((e) => console.warn('[push] activity token', e))
        if (reg.token !== stored) {
          await deletePushToken(stored).catch((e) => console.warn('[push] old token cleanup failed', e))
          window.localStorage.setItem(PUSH_TOKEN_KEY, reg.token)
        }
      } catch (e) {
        console.warn('[push] token refresh failed', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspace?.id])

  // Notification buttons (Ara / Haritada aç / Kopyala) from the lock screen.
  useEffect(() => {
    if (!nativeBridgeAvailable()) return
    return onPushAction(({ actionId, button }) => {
      void (async () => {
        try {
          // The notification payload is not trusted: act on the stored record only.
          const a = await fetchUsableAction(actionId)
          if (!a) {
            toast('Bu işlem artık geçerli değil', 'info')
            return
          }
          // A button that does not fit the record's kind (e.g. "Ara" on an IBAN)
          // must not act: show the strip and let the user pick.
          if (!buttonsFor(a.kind).includes(button)) {
            setQueue((q) => (q.some((x) => x.id === a.id) ? q : [a, ...q]))
            seen.current.add(a.id)
            return
          }
          seen.current.add(a.id)
          await perform(a, button)
        } catch (e) {
          toast(errorText(e), 'error', 3500)
        }
      })()
    })
  }, [perform])

  const current = queue[0]
  if (!current) return null
  const more = queue.length - 1

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-3 mb-2 shrink-0 rounded-2xl bg-primary/15 px-3.5 py-3 ring-1 ring-primary/40 backdrop-blur"
    >
      <div className="flex items-start gap-2.5">
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-primary">
            Bilgisayardan geldi · {TITLES[current.kind]}
            {more > 0 ? ` · +${more}` : ''}
          </div>
          <div className="mt-0.5 line-clamp-2 break-words text-[15px] font-medium">{current.label || current.payload}</div>
          {current.senderDevice && <div className="mt-0.5 text-xs text-muted-foreground">Cihaz: {current.senderDevice}</div>}
        </div>
        <button
          onClick={() => void finish(current)}
          aria-label="Kapat"
          className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {buttonsFor(current.kind).map((b, i) => {
          const { label, Icon } = BUTTONS[b]
          return (
            <button
              key={b}
              onClick={() => void perform(current, b)}
              className={
                i === 0
                  ? 'flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground active:opacity-80'
                  : 'flex min-h-[44px] items-center gap-1.5 rounded-full bg-white/10 px-4 text-[14px] font-medium active:bg-white/15'
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
