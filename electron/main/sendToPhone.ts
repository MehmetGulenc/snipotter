/**
 * Snipotter — "Telefona gönder" request validation (main process).
 * The renderer is untrusted input: kinds are whitelisted and payload length is
 * capped to match the device_actions.payload CHECK (≤ 2000 chars).
 */
import type { DeviceActionKind, IpcResult, SendToPhoneRequest } from '@shared/types'

const KINDS: ReadonlySet<DeviceActionKind> = new Set(['phone', 'address', 'iban', 'url', 'text'])
export const MAX_ACTION_PAYLOAD = 2000
const MAX_LABEL = 120

export function validateSendToPhone(input: unknown): IpcResult<SendToPhoneRequest> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Geçersiz istek.' }
  const raw = input as Record<string, unknown>
  const kind = raw.kind as DeviceActionKind
  if (typeof raw.kind !== 'string' || !KINDS.has(kind)) {
    return { ok: false, error: 'Bu kayıt telefona gönderilemez.' }
  }
  const payload = typeof raw.payload === 'string' ? raw.payload.trim() : ''
  if (!payload) return { ok: false, error: 'Gönderilecek içerik boş.' }
  if (payload.length > MAX_ACTION_PAYLOAD) {
    return { ok: false, error: `İçerik çok uzun (en fazla ${MAX_ACTION_PAYLOAD} karakter).` }
  }
  if (kind === 'url' && !/^https?:\/\/\S+$/i.test(payload)) {
    return { ok: false, error: 'Yalnız http(s) bağlantıları gönderilebilir.' }
  }
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, MAX_LABEL) : null
  const clipId = typeof raw.clipId === 'string' && raw.clipId ? raw.clipId : null
  return { ok: true, data: { kind, payload, label, clipId } }
}
