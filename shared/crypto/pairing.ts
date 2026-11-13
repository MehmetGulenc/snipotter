/**
 * New device by approval (migration 0016). The new device publishes an ECDH P-256
 * public key; a device that holds the workspace key taps "Onayla" and answers with
 * the key sealed for it. Both screens show the same 4-digit code, so a swapped
 * public key (a server in the middle) would be visible.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fromBase64, toBase64 } from './e2e'
import type { KeyBackend } from './workspaceKey'

const subtle = (): SubtleCrypto => globalThis.crypto.subtle
const te = new TextEncoder()
const PREFIX = 'enc:v1:'
const buf = (b: Uint8Array): BufferSource => b as unknown as BufferSource

export interface KeyRequest {
  id: string
  deviceName: string
  code: string
  createdAt: string
}

/** 4 digits both devices show; derived from the requester's public key. */
export async function verifyCode(publicKey: string): Promise<string> {
  const h = new Uint8Array(await subtle().digest('SHA-256', buf(fromBase64(publicKey))))
  const n = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0
  return String(n % 10000).padStart(4, '0')
}

async function sharedKey(priv: CryptoKey, peerPublic: string, requestId: string): Promise<CryptoKey> {
  const peer = await subtle().importKey('raw', buf(fromBase64(peerPublic)), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const bits = await subtle().deriveBits({ name: 'ECDH', public: peer }, priv, 256)
  const base = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(te.encode('snipotter-pair-v1')), info: buf(te.encode(requestId)) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

const newPair = (): Promise<CryptoKeyPair> =>
  subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as Promise<CryptoKeyPair>

const rawPublic = async (k: CryptoKey): Promise<string> => toBase64(new Uint8Array(await subtle().exportKey('raw', k)))

export interface PendingPair {
  id: string
  code: string
  /** Resolves once another device approved and the key is stored here. */
  wait(signal?: AbortSignal): Promise<void>
}

/** New device: asks the workspace's other devices for the key. */
export async function requestKey(sb: SupabaseClient, backend: KeyBackend, workspaceId: string, deviceName: string): Promise<PendingPair> {
  const pair = await newPair()
  const publicKey = await rawPublic(pair.publicKey)
  const { data, error } = await sb.rpc('request_key', { p_workspace_id: workspaceId, p_public_key: publicKey, p_device_name: deviceName })
  if (error) throw new Error(error.message)
  const id = data as string
  return {
    id,
    code: await verifyCode(publicKey),
    async wait(signal) {
      const deadline = Date.now() + 10 * 60 * 1000
      while (Date.now() < deadline) {
        if (signal?.aborted) throw new Error('İptal edildi')
        const { data: row, error: readError } = await sb.from('key_requests').select('approver_key, wrapped').eq('id', id).maybeSingle()
        if (readError) throw new Error(readError.message)
        if (!row) throw new Error('Eşleştirme isteği reddedildi ya da süresi doldu')
        const r = row as { approver_key: string | null; wrapped: string | null }
        if (r.wrapped && r.approver_key) {
          const key = await sharedKey(pair.privateKey, r.approver_key, id)
          const bytes = fromBase64(r.wrapped.slice(PREFIX.length))
          const raw = new Uint8Array(await subtle().decrypt(
            { name: 'AES-GCM', iv: buf(bytes.subarray(0, 12)), additionalData: buf(te.encode(`pair|${id}`)) }, key, buf(bytes.subarray(12)),
          ))
          if (raw.length !== 32) throw new Error('Gelen anahtar geçersiz')
          await backend.save(workspaceId, raw)
          await sb.rpc('finish_key_request', { p_id: id })
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      throw new Error('Onay 10 dakika içinde gelmedi; tekrar dene')
    },
  }
}

/** Devices waiting for approval in this workspace (never this device's own request). */
export async function pendingKeyRequests(sb: SupabaseClient, workspaceId: string, myUserId: string): Promise<KeyRequest[]> {
  const { data, error } = await sb.from('key_requests')
    .select('id, user_id, device_name, public_key, created_at, wrapped')
    .eq('workspace_id', workspaceId).is('wrapped', null)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw new Error(error.message)
  }
  const rows = ((data ?? []) as Array<{ id: string; user_id: string; device_name: string | null; public_key: string; created_at: string }>)
    .filter((r) => r.user_id !== myUserId)
  return Promise.all(rows.map(async (r) => ({ id: r.id, deviceName: r.device_name || 'Yeni cihaz', code: await verifyCode(r.public_key), createdAt: r.created_at })))
}

/** "Onayla": seals this device's workspace key for the requesting device. */
export async function approveKeyRequest(sb: SupabaseClient, backend: KeyBackend, workspaceId: string, requestId: string): Promise<void> {
  const raw = await backend.load(workspaceId)
  if (!raw) throw new Error('Bu cihazda şifre anahtarı yok')
  const { data, error } = await sb.from('key_requests').select('public_key').eq('id', requestId).single()
  if (error) throw new Error('İstek bulunamadı ya da süresi dolmuş')
  const pair = await newPair()
  const key = await sharedKey(pair.privateKey, (data as { public_key: string }).public_key, requestId)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(te.encode(`pair|${requestId}`)) }, key, buf(raw)))
  const sealed = new Uint8Array(12 + ct.length)
  sealed.set(iv)
  sealed.set(ct, 12)
  const { error: answerError } = await sb.rpc('answer_key_request', {
    p_id: requestId, p_approver_key: await rawPublic(pair.publicKey), p_wrapped: PREFIX + toBase64(sealed),
  })
  if (answerError) throw new Error(answerError.message)
}

/** "Reddet": also removes that device from the workspace. */
export async function declineKeyRequest(sb: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await sb.rpc('decline_key_request', { p_id: requestId })
  if (error) throw new Error(error.message)
}
