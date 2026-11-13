/**
 * End-to-end encryption glue for iOS and web (docs/sifreleme-tasarimi.md).
 * iOS keeps the workspace key in the shared Keychain (the Share extension and
 * Shortcuts read it too); the browser keeps it in IndexedDB.
 */
import { getSupabase } from './supabase'
import { nativeBridgeAvailable, SnipotterNative } from './native-bridge'
import { fromBase64, toBase64 } from '@shared/crypto/e2e'
import {
  activateWorkspaceKey, commitEncryption, forgetWorkspaceKey, prepareEncryption, recoverWithWords,
  type KeyBackend, type KeyStatus, type PreparedKey,
} from '@shared/crypto/workspaceKey'
import { encryptExistingData, hasPlainData } from '@shared/crypto/migrate'
import { approveKeyRequest, declineKeyRequest, pendingKeyRequests, requestKey } from '@shared/crypto/pairing'
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
    async pair() {
      const pending = await requestKey(getSupabase(), keyBackend(), workspaceId, deviceName)
      return { code: pending.code, wait: (signal) => pending.wait(signal) }
    },
    async recover(words) {
      const joined = await recoverWithWords(getSupabase(), keyBackend(), words, deviceName)
      preferredWorkspace.set(joined)
      await onJoined(joined)
    },
  }
}

/** This device's "Onayla" side: other devices of the workspace waiting for the key. */
export const pairApi = (workspaceId: string, userId: string) => ({
  list: () => pendingKeyRequests(getSupabase(), workspaceId, userId),
  approve: (id: string) => approveKeyRequest(getSupabase(), keyBackend(), workspaceId, id),
  decline: (id: string) => declineKeyRequest(getSupabase(), id),
})

/** Finishes an interrupted migration in the background (any device holding the key may do it). */
export async function resumeMigrationIfNeeded(workspaceId: string): Promise<void> {
  if (await hasPlainData(getSupabase(), workspaceId)) await encryptExistingData(getSupabase(), workspaceId)
}

/** Leaving the workspace or signing out: drops the key and the workspace preference. */
export async function forgetE2E(workspaceId: string): Promise<void> {
  await forgetWorkspaceKey(keyBackend(), workspaceId)
  if (preferredWorkspace.get() === workspaceId) {
    try { window.localStorage.removeItem(PREFERRED) } catch { /* private mode */ }
  }
}
