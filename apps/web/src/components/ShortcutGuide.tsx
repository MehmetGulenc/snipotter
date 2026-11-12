'use client'
import { useState } from 'react'
import { MessageSquare, Save, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const GUIDES = [
  {
    id: 'message',
    icon: MessageSquare,
    title: "Mesaj geldiğinde",
    summary: 'Gelen doğrulama kodları otomatik kaydedilsin.',
    steps: [
      'Kestirmeler uygulamasını aç → Otomasyon sekmesi → + → “Mesaj”.',
      'Mesaj içeriği: “kod” yaz (istersen “şifre” ve “doğrulama” için ayrı otomasyon ekle).',
      '“Hemen Çalıştır” seç, “Çalıştırınca Bildir” kapalı olsun.',
      'Eylem ekle: “Kestirme Girdisi” → “Snipotter’a kaydet”.',
      'Kod, Snipotter’da büyük yazıyla görünür ve bilgisayarının panosuna da gelir.',
    ],
  },
  {
    id: 'save',
    icon: Save,
    title: 'Snipotter’a kaydet',
    summary: 'Panodaki ya da seçtiğin metni tek dokunuşla kaydet.',
    steps: [
      'Kestirmeler → + ile yeni kestirme oluştur.',
      '“Panoyu Al” eylemini ekle, ardından “Snipotter’a kaydet” eylemini ekle.',
      'Kestirmeyi Ana Ekrana ekle ya da Ayarlar → Erişilebilirlik → Dokunma → Arkaya Dokunma’dan ona bağla.',
      'Snipotter arka planda panoyu okumaz; kayıt yalnızca sen kestirmeyi çalıştırınca olur.',
    ],
  },
] as const

/** Step-by-step Shortcuts setup, collapsible. Used in Settings. */
export function ShortcutGuide(): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="divide-y divide-white/[0.06]">
      {GUIDES.map((g) => {
        const isOpen = open === g.id
        const Icon = g.icon
        return (
          <div key={g.id}>
            <button
              onClick={() => setOpen(isOpen ? null : g.id)}
              aria-expanded={isOpen}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left active:bg-white/[0.06]"
            >
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-white">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px]">{g.title}</span>
                <span className="block text-xs text-muted-foreground">{g.summary}</span>
              </span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <ol className="space-y-2 px-4 pb-4 pl-[3.25rem] pr-4 text-[14px] leading-snug text-foreground/90">
                {g.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )
      })}
    </div>
  )
}
