/**
 * Which columns are encrypted, in one place, for both apps. A codec without keys
 * (workspace not encrypted yet) passes everything through unchanged, so callers
 * can always route rows through it.
 */
import {
  decryptBytes, decryptField, decryptJson, dedupeHash, encryptBytes, encryptField, encryptJson, isEncrypted,
} from './e2e'
import type { WorkspaceKeys } from './e2e'

type Kind = 'text' | 'json'

/** Encrypted columns per table. AAD row id: the row's `id` (or `note_id` for Yjs updates). */
export const ENCRYPTED_COLUMNS = {
  clipboard_items: { text: 'text', html: 'text', ai: 'json' },
  notes: { title: 'text', content: 'text', ai: 'json', ydoc: 'text' },
  note_versions: { title: 'text', content: 'text' },
  device_actions: { payload: 'text', label: 'text' },
  notebooks: { name: 'text' },
} as const satisfies Record<string, Record<string, Kind>>

export type EncryptedTable = keyof typeof ENCRYPTED_COLUMNS

type Row = Record<string, unknown>

export class E2ECodec {
  constructor(readonly keys: WorkspaceKeys | null) {}

  get enabled(): boolean {
    return this.keys !== null
  }

  /** Encrypts the table's sensitive columns. Rows need an `id` (generate it client-side for inserts). */
  async sealRow<T extends object>(table: EncryptedTable, input: T): Promise<T> {
    if (!this.keys) return input
    const row = input as Row
    const id = String(row.id ?? '')
    if (!id) throw new Error(`Şifreleme için ${table} satır kimliği gerekli`)
    const out: Row = { ...row }
    for (const [column, kind] of Object.entries(ENCRYPTED_COLUMNS[table]) as Array<[string, Kind]>) {
      const v = out[column]
      if (v == null || v === '' || isEncrypted(v)) continue
      const ctx = { table, row: id, column }
      out[column] = kind === 'json' ? await encryptJson(this.keys, ctx, v) : await encryptField(this.keys, ctx, String(v))
    }
    return out as T
  }

  /** Decrypts what it can; plaintext (older rows) passes through. Unreadable values become null/''. */
  async openRow<T extends object>(table: EncryptedTable, input: T): Promise<T> {
    const row = input as Row
    const out: Row = { ...row }
    const id = String(row.id ?? '')
    for (const [column, kind] of Object.entries(ENCRYPTED_COLUMNS[table]) as Array<[string, Kind]>) {
      const v = out[column]
      if (!isEncrypted(v)) continue
      const ctx = { table, row: id, column }
      try {
        out[column] = kind === 'json' ? await decryptJson(this.keys, ctx, v) : await decryptField(this.keys, ctx, v)
      } catch {
        out[column] = kind === 'json' ? null : ''
        out.__unreadable = true
      }
    }
    return out as T
  }

  /** Yjs update / snapshot of a note (base64 in, sealed string out). */
  async sealNoteBlob(noteId: string, column: 'update' | 'ydoc', base64: string): Promise<string> {
    return this.keys ? encryptField(this.keys, { table: 'note_updates', row: noteId, column }, base64) : base64
  }

  async openNoteBlob(noteId: string, column: 'update' | 'ydoc', value: string): Promise<string> {
    return decryptField(this.keys, { table: 'note_updates', row: noteId, column }, value)
  }

  /** Duplicate check: keyed once encrypted, otherwise the caller's legacy hash. */
  async clipHash(text: string, legacy: () => string | Promise<string>): Promise<string> {
    return this.keys ? dedupeHash(this.keys, text) : legacy()
  }

  /** Realtime broadcasts pass through the server too: seal the whole payload. */
  async sealBroadcast(event: string, id: string, payload: Row): Promise<Row> {
    if (!this.keys) return payload
    return { sealed: await encryptField(this.keys, { table: 'broadcast', row: id, column: event }, JSON.stringify(payload)), id }
  }

  async openBroadcast(event: string, payload: Row): Promise<Row | null> {
    if (typeof payload.sealed !== 'string') return payload
    try {
      return JSON.parse(await decryptField(this.keys, { table: 'broadcast', row: String(payload.id ?? ''), column: event }, payload.sealed)) as Row
    } catch {
      return null
    }
  }

  async sealFile(path: string, bytes: Uint8Array): Promise<Uint8Array> {
    return this.keys ? encryptBytes(this.keys, { table: 'storage', row: path, column: 'bytes' }, bytes) : bytes
  }

  async openFile(path: string, bytes: Uint8Array): Promise<Uint8Array> {
    return this.keys ? decryptBytes(this.keys, { table: 'storage', row: path, column: 'bytes' }, bytes) : bytes
  }
}

/** Current (personal) workspace's codec; replaced when the workspace or its key changes. */
let current = new E2ECodec(null)
export const codec = (): E2ECodec => current
export function setCodec(next: E2ECodec): void {
  current = next
}

/** Codecs of shared spaces the user belongs to, by space id. */
const spaces = new Map<string, E2ECodec>()
export function setSpaceCodec(spaceId: string, next: E2ECodec | null): void {
  if (next) spaces.set(spaceId, next)
  else spaces.delete(spaceId)
}
export function clearSpaceCodecs(): void {
  spaces.clear()
}

/** The codec for rows of `workspaceId`: a shared space's own key, otherwise the personal one. */
export function codecFor(workspaceId: string | null | undefined): E2ECodec {
  return (workspaceId && spaces.get(workspaceId)) || current
}
