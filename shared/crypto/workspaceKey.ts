/**
 * Workspace key life cycle (docs/sifreleme-tasarimi.md), shared by desktop (main
 * process) and iOS/web. Platform code supplies the Supabase client and where the
 * raw key is kept on this device.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deriveWorkspaceKeys, keyCheck, newWorkspaceKey, randomBytes, secretId, secretToWords, unwrapKey, wordsToSecret, wrapKey,
} from './e2e'
import { E2ECodec, setCodec } from './codec'

/** Device-local key storage (Keychain, Electron safeStorage, IndexedDB). */
export interface KeyBackend {
  load(workspaceId: string): Promise<Uint8Array | null>
  save(workspaceId: string, raw: Uint8Array): Promise<void>
  remove(workspaceId: string): Promise<void>
}

export type KeyStatus =
  /** Server predates migration 0014: keep working unencrypted. */
  | 'unsupported'
  /** Workspace not encrypted yet: this version must turn it on. */
  | 'plain'
  /** Encrypted and this device holds the right key. */
  | 'ready'
  /** Encrypted, but this device has no key: pair it or use the recovery words. */
  | 'needs-key'

/** Loads this device's key for the workspace, checks it against the server and installs the codec. */
export async function activateWorkspaceKey(sb: SupabaseClient, backend: KeyBackend, workspaceId: string): Promise<KeyStatus> {
  const { data: ws, error } = await sb.from('workspaces').select('encryption').eq('id', workspaceId).maybeSingle()
  if (error) {
    // Server without migration 0014: nothing to do yet.
    if (/encryption/.test(error.message)) {
      setCodec(new E2ECodec(null))
      return 'unsupported'
    }
    throw error
  }
  if (!ws?.encryption) {
    setCodec(new E2ECodec(null))
    return 'plain'
  }
  const raw = await backend.load(workspaceId)
  const { data: key } = await sb.from('workspace_keys').select('key_check').eq('workspace_id', workspaceId).maybeSingle()
  if (!raw || !key || (await keyCheck(raw)) !== key.key_check) {
    setCodec(new E2ECodec(null))
    return 'needs-key'
  }
  setCodec(new E2ECodec(await deriveWorkspaceKeys(workspaceId, raw)))
  return 'ready'
}

/** Leaving the workspace or signing out: the key must not outlive this device's access. */
export async function forgetWorkspaceKey(backend: KeyBackend, workspaceId: string): Promise<void> {
  setCodec(new E2ECodec(null))
  await backend.remove(workspaceId)
}

export interface PreparedKey {
  workspaceId: string
  raw: Uint8Array
  recovery: Uint8Array
  /** Shown to the user, who must confirm them before `commitEncryption`. */
  words: string[]
}

export function prepareEncryption(workspaceId: string): PreparedKey {
  const recovery = randomBytes(32)
  return { workspaceId, raw: newWorkspaceKey(), recovery, words: secretToWords(recovery) }
}

/** Indices of words to ask back, so the user proves they wrote them down. */
export function confirmationIndices(count = 3, total = 24): number[] {
  const picks = new Set<number>()
  while (picks.size < count) picks.add(randomBytes(1)[0] % total)
  return [...picks].sort((a, b) => a - b)
}

/**
 * Stores the key on this device, then turns encryption on. Returns false when
 * another device won the race; this device must then pair with that one.
 */
export async function commitEncryption(sb: SupabaseClient, backend: KeyBackend, prepared: PreparedKey): Promise<boolean> {
  const { workspaceId, raw, recovery } = prepared
  // Key first: if the app dies after the server switch, the key must already be here.
  await backend.save(workspaceId, raw)
  const { data, error } = await sb.rpc('enable_encryption', {
    p_workspace_id: workspaceId,
    p_key_check: await keyCheck(raw),
    p_wrapped_recovery: await wrapKey(raw, recovery, 'recovery'),
    p_recovery_id: await secretId(recovery, 'recovery'),
  })
  // A lost response may hide a success: keep the key, activateWorkspaceKey() verifies it later.
  if (error) throw error
  if (data !== true) {
    await backend.remove(workspaceId)
    return false
  }
  setCodec(new E2ECodec(await deriveWorkspaceKeys(workspaceId, raw)))
  return true
}

/** One-time 12 words that hand the key to another device (or an invited person) for 10 minutes. */
export async function createKeyTransfer(sb: SupabaseClient, backend: KeyBackend, workspaceId: string): Promise<{ words: string[]; expiresAt: number }> {
  const raw = await backend.load(workspaceId)
  if (!raw) throw new Error('Bu cihazda şifre anahtarı yok')
  const secret = randomBytes(16)
  const { error } = await sb.rpc('offer_key_transfer', {
    p_workspace_id: workspaceId,
    p_transfer_id: await secretId(secret, 'transfer'),
    p_wrapped: await wrapKey(raw, secret, 'transfer'),
  })
  if (error) throw error
  return { words: secretToWords(secret), expiresAt: Date.now() + 10 * 60 * 1000 }
}

/** New device: joins the workspace behind the 12 words and stores its key. */
export async function redeemKeyTransfer(sb: SupabaseClient, backend: KeyBackend, words: string, deviceName: string): Promise<string> {
  const secret = wordsToSecret(words)
  if (secret.length !== 16) throw new Error('Eşleştirme için 12 kelime gerekli')
  const { data, error } = await sb.rpc('redeem_key_transfer', { p_transfer_id: await secretId(secret, 'transfer'), p_device_name: deviceName })
  if (error) throw new Error(/geçersiz|süresi/i.test(error.message) ? 'Kelimeler geçersiz ya da süresi dolmuş' : error.message)
  const row = (Array.isArray(data) ? data[0] : data) as { workspace_id: string; wrapped: string }
  const raw = await unwrapKey(row.wrapped, secret, 'transfer')
  await backend.save(row.workspace_id, raw)
  return row.workspace_id
}

/** All devices lost: the 24 recovery words find the workspace and restore its key. */
export async function recoverWithWords(sb: SupabaseClient, backend: KeyBackend, words: string, deviceName: string): Promise<string> {
  const recovery = wordsToSecret(words)
  if (recovery.length !== 32) throw new Error('Kurtarma için 24 kelime gerekli')
  const { data, error } = await sb.rpc('recover_workspace', { p_recovery_id: await secretId(recovery, 'recovery'), p_device_name: deviceName })
  if (error) throw new Error(/eşleşmedi/i.test(error.message) ? 'Kurtarma kelimeleri hiçbir çalışma alanıyla eşleşmedi' : error.message)
  const row = (Array.isArray(data) ? data[0] : data) as { workspace_id: string; wrapped_recovery: string }
  const raw = await unwrapKey(row.wrapped_recovery, recovery, 'recovery')
  await backend.save(row.workspace_id, raw)
  return row.workspace_id
}
