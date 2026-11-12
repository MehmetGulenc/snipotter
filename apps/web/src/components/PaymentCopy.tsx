'use client'
import { useMemo, useState } from 'react'
import { Landmark, User, Banknote, Check } from 'lucide-react'
import { extractPayment } from '@shared/payment'
import { copyText } from '@/lib/native-bridge'
import { errorText, toast } from '@/lib/feedback'

type Field = 'iban' | 'recipient' | 'amount'

/** Extracts the payment details (IBAN, recipient, amount) of a clip, or null. */
export function usePayment(text: string): ReturnType<typeof extractPayment> {
  return useMemo(() => {
    try {
      const p = extractPayment(text.slice(0, 2000))
      return p && (p.iban || p.recipient || p.amount) ? p : null
    } catch {
      return null
    }
  }, [text])
}

/** Three copy buttons for bank transfer details, one field per tap. */
export function PaymentCopy({ text }: { text: string }): JSX.Element | null {
  const payment = usePayment(text)
  const [done, setDone] = useState<Field | null>(null)
  if (!payment) return null

  const items: Array<{ field: Field; label: string; value: string; shown: string; Icon: typeof Landmark }> = []
  if (payment.iban) {
    items.push({ field: 'iban', label: 'IBAN', value: payment.iban, shown: payment.ibanFormatted ?? payment.iban, Icon: Landmark })
  }
  if (payment.recipient) {
    items.push({ field: 'recipient', label: 'Alıcı', value: payment.recipient, shown: payment.recipient, Icon: User })
  }
  if (payment.amount !== undefined && payment.amount !== null && String(payment.amount) !== '') {
    const amount = String(payment.amount)
    items.push({
      field: 'amount',
      label: 'Tutar',
      value: amount,
      shown: payment.currency ? `${amount} ${payment.currency}` : amount,
      Icon: Banknote,
    })
  }

  const copy = async (e: React.MouseEvent, i: (typeof items)[number]): Promise<void> => {
    e.stopPropagation()
    try {
      await copyText(i.value)
      setDone(i.field)
      toast(i.field === 'iban' ? 'IBAN boşluksuz kopyalandı' : `${i.label} kopyalandı`)
      setTimeout(() => setDone((d) => (d === i.field ? null : d)), 1200)
    } catch (err) {
      toast(errorText(err), 'error', 3500)
    }
  }

  return (
    <div className="mt-2.5 flex flex-wrap gap-2" aria-label="Ödeme bilgileri">
      {items.map((i) => (
        <button
          key={i.field}
          onClick={(e) => void copy(e, i)}
          className="flex min-h-[44px] max-w-full items-center gap-1.5 rounded-full bg-primary/15 px-3.5 text-[13px] font-medium text-primary transition-colors duration-100 active:bg-primary/25"
        >
          {done === i.field ? <Check className="h-3.5 w-3.5 shrink-0" /> : <i.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <span>{i.label}</span>
          <span className="truncate font-normal text-primary/70">· {i.shown}</span>
        </button>
      ))}
    </div>
  )
}
