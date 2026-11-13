/**
 * End-to-end encryption glue for iOS and web (docs/sifreleme-tasarimi.md).
 * iOS keeps the workspace key in the shared Keychain (the Share extension and
 * Shortcuts read it too); the browser keeps it in IndexedDB.
 */
import { getSupabase } from './supabase'
import { nativeBridgeAvailable, SnipotterNative } from './native-bridge'
import { fromBase64, toBase64 } from '@shared/crypto/e2e'
import {
  activateWorkspaceKey, commitEncryption, createKeyTransfer, forgetWorkspaceKey, prepareEncryption, recoverWithWords, redeemKeyTransfer,
  type KeyBackend, type KeyStatus, type PreparedKey,
} from '@shared/crypto/workspaceKey'
import { encryptExistingData, hasPlainData } from '@shared/crypto/migrate'
import type { EncryptionActions } from '@shared/crypto/EncryptionScreens'

const keychainBackend: KeyBackend = {
  async load(workspaceId) {
    const { key } = await SnipotterNative.getWorkspaceKey({ workspaceId })
    return key ? fromBase64(key) : null
  },
  save: (workspaceId, raw) => SnipotterNative.setWorkspaceKey({ workspaceId, key: toBase64(raw) }),
  remove: (workspaceId) => SnipotterNative.deleteWorkspaceKey({ workspaceId }),
}

const DB = 'snipotter-e2e'
function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore('keys')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const req = run(open.result.transaction('keys', mode).objectStore('keys'))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }
  })
}

const browserBackend: KeyBackend = {
  load: async (workspaceId) => (await idb<Uint8Array | undefined>('readonly', (s) => s.get(workspaceId))) ?? null,
  save: async (workspaceId, raw) => void (await idb('readwrite', (s) => s.put(raw, workspaceId))),
  remove: async (workspaceId) => void (await idb('readwrite', (s) => s.delete(workspaceId))),
}

export const keyBackend = (): KeyBackend => (nativeBridgeAvailable() ? keychainBackend : browserBackend)

const PREFERRED = 'snipotter.preferredWorkspace'
export const preferredWorkspace = {
  get: (): string | null => {
    try { return window.localStorage.getItem(PREFERRED) } catch { return null }
  },
  set: (id: string): void => {
    try { window.localStorage.setItem(PREFERRED, id) } catch { /* private mode */ }
  },
}

export function activateE2E(workspaceId: string): Promise<KeyStatus> {
  return activateWorkspaceKey(getSupabase(), keyBackend(), workspaceId)
}

export function encryptionActions(workspaceId: string, deviceName: string, onJoined: (workspaceId: string) => Promise<void>): EncryptionActions {
  let prepared: PreparedKey | null = null
  return {
    async prepare() {
      prepared = prepareEncryption(workspaceId)
      return { words: prepared.words }
    },
    async commit(answers) {
      if (!prepared) throw new Error('Önce kurtarma kelimelerini oluştur')
      const words = prepared.words
      if (!answers.every((a) => words[a.index] === a.word.trim().toLowerCase())) {
        throw new Error('Kelimeler eşleşmedi; kurtarma kelimelerini tekrar kontrol et')
      }
      const ok = await commitEncryption(getSupabase(), keyBackend(), prepared)
      prepared = null
      return ok ? 'enabled' : 'lost-race'
    },
    migrate: (onProgress) => encryptExistingData(getSupabase(), workspaceId, onProgress),
    async join(words) {
      const count = words.trim().split(/\s+/).length
      const joined = count >= 24
        ? await recoverWithWords(getSupabase(), keyBackend(), words, deviceName)
        : await redeemKeyTransfer(getSupabase(), keyBackend(), words, deviceName)
      preferredWorkspace.set(joined)
      await onJoined(joined)
    },
  }
}

/** Fresh device: joins an encrypted workspace with 12 words from another device or the 24 recovery words. */
export async function joinWithWords(words: string, deviceName: string): Promise<string> {
  const count = words.trim().split(/\s+/).length
  const joined = count >= 24
    ? await recoverWithWords(getSupabase(), keyBackend(), words, deviceName)
    : await redeemKeyTransfer(getSupabase(), keyBackend(), words, deviceName)
  preferredWorkspace.set(joined)
  return joined
}

/** Leaving the workspace or signing out: drops the key and the workspace preference. */
export async function forgetE2E(workspaceId: string): Promise<void> {
  await forgetWorkspaceKey(keyBackend(), workspaceId)
  if (preferredWorkspace.get() === workspaceId) {
    try { window.localStorage.removeItem(PREFERRED) } catch { /* private mode */ }
  }
}

export const createDeviceTransfer =(workspaceId: string): Promise<{ words: string[]; expiresAt: number }> =>
  createKeyTransfer(getSupabase(), keyBackend(), workspaceId)

/** Finishes an interrupted migration in the background (any device holding the key may do it). */
export async function resumeMigrationIfNeeded(workspaceId: string): Promise<void> {
  if (await hasPlainData(getSupabase(), workspaceId)) await encryptExistingData(getSupabase(), workspaceId)
}
