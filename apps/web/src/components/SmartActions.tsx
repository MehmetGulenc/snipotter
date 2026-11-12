'use client'
import { Phone, MessageCircle, Mail, ExternalLink, Landmark, Package, Wifi, MapPin, CalendarPlus, KeyRound } from 'lucide-react'
import type { SmartAction, SmartKind } from '@/lib/smart'
import { addToCalendar, copyText, nativeBridgeAvailable, openExternal } from '@/lib/native-bridge'
import { errorText, toast } from '@/lib/feedback'

const ICONS: Record<SmartKind, typeof Phone> = {
  otp: KeyRound,
  iban: Landmark,
  phone: Phone,
  email: Mail,
  url: ExternalLink,
  tracking: Package,
  wifi: Wifi,
  address: MapPin,
  event: CalendarPlus,
}

/** Action chips for what a clip turned out to be (call, map, calendar…). */
export function SmartActions({ actions }: { actions: SmartAction[] }): JSX.Element | null {
  const usable = actions.filter((a) => a.kind !== 'event' || nativeBridgeAvailable())
  if (usable.length === 0) return null
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {usable.map((a) => {
        const Icon = a.label === 'WhatsApp' ? MessageCircle : ICONS[a.kind]
        return (
          <button
            key={`${a.kind}-${a.label}-${a.value}`}
            onClick={(e) => {
              e.stopPropagation()
              void run(a)
            }}
            className="flex min-h-[36px] max-w-full items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-[13px] font-medium text-primary transition-colors duration-100 active:bg-primary/25"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{a.label}</span>
            {a.detail && <span className="truncate font-normal text-primary/70">· {a.detail}</span>}
          </button>
        )
      })}
    </div>
  )
}

async function run(a: SmartAction): Promise<void> {
  try {
    if (a.kind === 'event' && a.start) {
      const saved = await addToCalendar(a.title ?? 'Snipotter', a.start, a.value)
      if (saved) toast('Takvime eklendi')
      return
    }
    if (a.href) {
      openExternal(a.href)
      return
    }
    await copyText(a.value)
    toast(a.kind === 'iban' ? 'IBAN boşluksuz kopyalandı' : 'Kopyalandı')
  } catch (e) {
    toast(errorText(e), 'error', 3500)
  }
}
