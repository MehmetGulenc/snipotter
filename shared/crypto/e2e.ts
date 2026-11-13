/**
 * End-to-end encryption core (see docs/sifreleme-tasarimi.md). WebCrypto only,
 * so the same code runs in iOS WKWebView, Electron, browsers and Node tests.
 *
 * Field format: "enc:v1:" + base64(iv[12] ‖ ciphertext ‖ tag[16]), AES-256-GCM,
 * with AAD binding the value to its workspace, table, row and column.
 */
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

export const ENC_PREFIX = 'enc:v1:'
const subtle = (): SubtleCrypto => globalThis.crypto.subtle
/** TS 5.7+ types Uint8Array over ArrayBufferLike; WebCrypto wants ArrayBuffer-backed views. */
const buf = (u: Uint8Array): BufferSource => u as unknown as BufferSource
const te = new TextEncoder()
const td = new TextDecoder()

export interface WorkspaceKeys {
  workspaceId: string
  enc: CryptoKey
  hash: CryptoKey
}

/** Where an encrypted value lives; changing any part makes decryption fail. */
export interface FieldContext {
  table: string
  row: string
  column: string
}

// ── key material ──────────────────────────────────────────────────────────────

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  // getRandomValues fills at most 64 KiB per call.
  for (let i = 0; i < n; i += 65536) globalThis.crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)))
  return out
}

/** New 256-bit workspace key (raw bytes; store only in device key storage). */
export function newWorkspaceKey(): Uint8Array {
  return randomBytes(32)
}

async function hkdf(ikm: Uint8Array, info: string, usage: 'enc' | 'hmac' | 'wrap', extractable = false): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', buf(ikm), 'HKDF', false, ['deriveKey'])
  const params = { name: 'HKDF', hash: 'SHA-256', salt: buf(te.encode('snipotter-e2e-v1')), info: buf(te.encode(info)) }
  if (usage === 'hmac') {
    return subtle().deriveKey(params, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, extractable, ['sign'])
  }
  return subtle().deriveKey(params, base, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'])
}

export async function deriveWorkspaceKeys(workspaceId: string, raw: Uint8Array): Promise<WorkspaceKeys> {
  if (raw.length !== 32) throw new Error('Geçersiz anahtar')
  return {
    workspaceId,
    enc: await hkdf(raw, 'content', 'enc'),
    hash: await hkdf(raw, 'dedupe', 'hmac'),
  }
}

/** Public check value: lets a device confirm it holds the right key without revealing it. */
export async function keyCheck(raw: Uint8Array): Promise<string> {
  const k = await hkdf(raw, 'key-check', 'hmac')
  return toHex(new Uint8Array(await subtle().sign('HMAC', k, buf(te.encode('snipotter')))))
}

// ── fields ────────────────────────────────────────────────────────────────────

const aad = (keys: WorkspaceKeys, ctx: FieldContext): Uint8Array =>
  te.encode(`${keys.workspaceId}|${ctx.table}|${ctx.row}|${ctx.column}`)

export const isEncrypted = (value: unknown): value is string => typeof value === 'string' && value.startsWith(ENC_PREFIX)

export async function encryptBytes(keys: WorkspaceKeys, ctx: FieldContext, plain: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(12)
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(aad(keys, ctx)) }, keys.enc, buf(plain)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return out
}

export async function decryptBytes(keys: WorkspaceKeys, ctx: FieldContext, sealed: Uint8Array): Promise<Uint8Array> {
  if (sealed.length < 12 + 16) throw new Error('Şifreli veri bozuk')
  return new Uint8Array(await subtle().decrypt(
    { name: 'AES-GCM', iv: buf(sealed.subarray(0, 12)), additionalData: buf(aad(keys, ctx)) },
    keys.enc,
    buf(sealed.subarray(12)),
  ))
}

export async function encryptField(keys: WorkspaceKeys, ctx: FieldContext, plain: string): Promise<string> {
  return ENC_PREFIX + toBase64(await encryptBytes(keys, ctx, te.encode(plain)))
}

/** Plain values pass through unchanged, so data written before encryption still reads. */
export async function decryptField(keys: WorkspaceKeys | null, ctx: FieldContext, value: string): Promise<string> {
  if (!isEncrypted(value)) return value
  if (!keys) throw new Error('Bu cihazda şifre anahtarı yok')
  return td.decode(await decryptBytes(keys, ctx, fromBase64(value.slice(ENC_PREFIX.length))))
}

/** JSON columns (e.g. `ai`) are stored as a JSON string holding the encrypted text. */
export async function encryptJson(keys: WorkspaceKeys, ctx: FieldContext, value: unknown): Promise<string | null> {
  return value == null ? null : encryptField(keys, ctx, JSON.stringify(value))
}

export async function decryptJson<T>(keys: WorkspaceKeys | null, ctx: FieldContext, value: unknown): Promise<T | null> {
  if (value == null) return null
  if (!isEncrypted(value)) return value as T
  return JSON.parse(await decryptField(keys, ctx, value)) as T
}

/** Keyed duplicate check: equal texts match, but the server cannot guess short texts from it. */
export async function dedupeHash(keys: WorkspaceKeys, text: string): Promise<string> {
  return toHex(new Uint8Array(await subtle().sign('HMAC', keys.hash, buf(te.encode(text)))))
}

// ── wrapping (recovery words, device pairing, invites) ───────────────────────

/** Encrypts the workspace key with a secret that never reaches the server. */
export async function wrapKey(raw: Uint8Array, secret: Uint8Array, purpose: 'recovery' | 'transfer'): Promise<string> {
  const k = await hkdf(secret, `wrap:${purpose}`, 'wrap')
  const iv = randomBytes(12)
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(te.encode(purpose)) }, k, buf(raw)))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return toBase64(out)
}

export async function unwrapKey(wrapped: string, secret: Uint8Array, purpose: 'recovery' | 'transfer'): Promise<Uint8Array> {
  const k = await hkdf(secret, `wrap:${purpose}`, 'wrap')
  const bytes = fromBase64(wrapped)
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: buf(bytes.subarray(0, 12)), additionalData: buf(te.encode(purpose)) }, k, buf(bytes.subarray(12))))
  } catch {
    throw new Error('Kelimeler bu çalışma alanıyla eşleşmiyor')
  }
}

/** Public lookup id derived from a secret (recovery words / transfer code). */
export async function secretId(secret: Uint8Array, purpose: 'recovery' | 'transfer'): Promise<string> {
  const k = await hkdf(secret, `id:${purpose}`, 'hmac')
  return toHex(new Uint8Array(await subtle().sign('HMAC', k, buf(te.encode('id')))))
}

// ── words ─────────────────────────────────────────────────────────────────────

/** 256-bit secret ↔ 24 words, 128-bit ↔ 12 words (BIP39 English list, with checksum). */
export function secretToWords(secret: Uint8Array): string[] {
  return entropyToMnemonic(secret, wordlist).split(' ')
}

export function wordsToSecret(input: string): Uint8Array {
  const words = normalizeWords(input)
  if (!validateMnemonic(words, wordlist)) throw new Error('Kelimeler hatalı: yazımı ve sırasını kontrol et')
  return mnemonicToEntropy(words, wordlist)
}

export function normalizeWords(input: string): string {
  return input.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).join(' ')
}

// ── encoding ──────────────────────────────────────────────────────────────────

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('Geçersiz kod')
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)))
}
