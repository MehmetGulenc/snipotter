/**
 * Shared spaces (docs/ortak-alan-tasarimi.md), used by desktop (main process) and
 * iOS/web. A "person" is the personal workspace; its key seals each space key.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  decryptField, deriveWorkspaceKeys, encryptField, fromBase64, keyCheck, newWorkspaceKey, randomBytes, secretId,
  secretToWords, toBase64, unwrapKey, wordsToSecret, wrapKey, type WorkspaceKeys,
} from './e2e'
import { E2ECodec, setSpaceCodec } from './codec'

export interface Space {
  id: string
  name: string
  isOwner: boolean
  joinedAt: string
}

export interface SpaceMember {
  personId: string
  name: string
  isOwner: boolean
  isMe: boolean
  joinedAt: string
}

export interface SpaceInvite {
  words: string[]
  link: string
  expiresAt: number
}

export const INVITE_BASE = 'https://snipotter.com/katil'
const INVITE_DAYS = 7

/** Where the space key and names are sealed (AAD). */
const keyCtx = (spaceId: string) => ({ table: 'space_members', row: spaceId, column: 'key' })
const nameCtx = (spaceId: string) => ({ table: 'workspaces', row: spaceId, column: 'name' })
const memberCtx = (personId: string) => ({ table: 'space_members', row: personId, column: 'display_name' })

function personalKeys(personal: E2ECodec): WorkspaceKeys {
  if (!personal.keys) throw new Error('Ortak alan için önce bu cihazda şifrelemenin açık olması gerekir')
  return personal.keys
}

const fail = (error: { message: string } | null, fallback?: string): void => {
  if (error) throw new Error(fallback && /Not allowed/.test(error.message) ? fallback : error.message)
}

async function openName(keys: WorkspaceKeys, ctx: { table: string; row: string; column: string }, value: string | null, fallback: string): Promise<string> {
  if (!value) return fallback
  try {
    return await decryptField(keys, ctx, value)
  } catch {
    return fallback
  }
}

/** Spaces of this person, with their codecs registered (codecFor(space.id) works afterwards). */
export async function loadSpaces(sb: SupabaseClient, personId: string, personal: E2ECodec): Promise<Space[]> {
  if (!personal.keys) return []
  const { data, error } = await sb.from('space_members').select('space_id, role, wrapped_key, joined_at').eq('person_id', personId)
  if (error) {
    // Server without migration 0015.
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw new Error(error.message)
  }
  const rows = (data ?? []) as Array<{ space_id: string; role: string; wrapped_key: string; joined_at: string }>
  if (rows.length === 0) return []
  const { data: names } = await sb.from('workspaces').select('id, name').in('id', rows.map((r) => r.space_id))
  const nameOf = new Map(((names ?? []) as Array<{ id: string; name: string }>).map((n) => [n.id, n.name]))
  const out: Space[] = []
  for (const r of rows) {
    try {
      const raw = fromBase64(await decryptField(personal.keys, keyCtx(r.space_id), r.wrapped_key))
      const keys = await deriveWorkspaceKeys(r.space_id, raw)
      setSpaceCodec(r.space_id, new E2ECodec(keys))
      out.push({
        id: r.space_id,
        name: await openName(keys, nameCtx(r.space_id), nameOf.get(r.space_id) ?? null, 'Ortak alan'),
        isOwner: r.role === 'owner',
        joinedAt: r.joined_at,
      })
    } catch {
      // A key sealed with an older personal key: skip rather than break the app.
      setSpaceCodec(r.space_id, null)
    }
  }
  return out.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
}

export async function createSpace(sb: SupabaseClient, personId: string, personal: E2ECodec, name: string, myName: string): Promise<Space> {
  const pk = personalKeys(personal)
  const clean = name.trim()
  if (!clean) throw new Error('Alan adı boş olamaz')
  const id = globalThis.crypto.randomUUID()
  const raw = newWorkspaceKey()
  const keys = await deriveWorkspaceKeys(id, raw)
  const { error } = await sb.rpc('create_space', {
    p_person: personId,
    p_space: id,
    p_name: await encryptField(keys, nameCtx(id), clean),
    p_key_check: await keyCheck(raw),
    p_wrapped_key: await encryptField(pk, keyCtx(id), toBase64(raw)),
    p_display_name: myName.trim() ? await encryptField(keys, memberCtx(personId), myName.trim()) : null,
  })
  fail(error)
  setSpaceCodec(id, new E2ECodec(keys))
  return { id, name: clean, isOwner: true, joinedAt: new Date().toISOString() }
}

/** Raw space key, recovered from this person's sealed copy. */
async function spaceKey(sb: SupabaseClient, personId: string, personal: E2ECodec, spaceId: string): Promise<Uint8Array> {
  const { data, error } = await sb.from('space_members').select('wrapped_key').eq('space_id', spaceId).eq('person_id', personId).single()
  if (error) throw new Error(error.message)
  return fromBase64(await decryptField(personalKeys(personal), keyCtx(spaceId), (data as { wrapped_key: string }).wrapped_key))
}

/** One-time invite valid for 7 days: a link (the secret sits after #, never sent to a server) and the same 12 words. */
export async function createInvite(sb: SupabaseClient, personId: string, personal: E2ECodec, spaceId: string): Promise<SpaceInvite> {
  const raw = await spaceKey(sb, personId, personal, spaceId)
  const secret = randomBytes(16)
  const { error } = await sb.rpc('create_space_invite', {
    p_space: spaceId,
    p_person: personId,
    p_invite_id: await secretId(secret, 'invite'),
    p_wrapped: await wrapKey(raw, secret, 'invite'),
  })
  fail(error)
  const words = secretToWords(secret)
  return { words, link: `${INVITE_BASE}#${words.join('-')}`, expiresAt: Date.now() + INVITE_DAYS * 24 * 3600 * 1000 }
}

/** Accepts the invite link or its 12 words. */
export function inviteWords(input: string): string {
  const text = input.trim()
  const hash = text.indexOf('#')
  const part = hash >= 0 ? text.slice(hash + 1) : text
  return decodeURIComponent(part).replace(/[-_+,]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function looksLikeInvite(input: string): boolean {
  const words = inviteWords(input).split(' ').filter(Boolean)
  return words.length === 12
}

export async function joinSpace(sb: SupabaseClient, personId: string, personal: E2ECodec, input: string, myName: string): Promise<Space> {
  const pk = personalKeys(personal)
  let secret: Uint8Array
  try {
    secret = wordsToSecret(inviteWords(input))
  } catch {
    throw new Error('Davet bağlantısı ya da 12 kelime okunamadı')
  }
  if (secret.length !== 16) throw new Error('Davet için 12 kelime gerekli')
  const inviteId = await secretId(secret, 'invite')
  const { data, error } = await sb.rpc('peek_space_invite', { p_invite_id: inviteId })
  if (error) throw new Error(/geçersiz|süresi/i.test(error.message) ? 'Davet geçersiz ya da süresi dolmuş' : error.message)
  const row = (Array.isArray(data) ? data[0] : data) as { space_id: string; wrapped: string; name: string }
  const raw = await unwrapKey(row.wrapped, secret, 'invite')
  const keys = await deriveWorkspaceKeys(row.space_id, raw)
  const { error: joinError } = await sb.rpc('join_space', {
    p_invite_id: inviteId,
    p_person: personId,
    p_wrapped_key: await encryptField(pk, keyCtx(row.space_id), toBase64(raw)),
    p_display_name: myName.trim() ? await encryptField(keys, memberCtx(personId), myName.trim()) : null,
  })
  if (joinError) throw new Error(/geçersiz|süresi/i.test(joinError.message) ? 'Davet geçersiz ya da süresi dolmuş' : joinError.message)
  // The key must match what the space was created with.
  const { data: check } = await sb.from('workspace_keys').select('key_check').eq('workspace_id', row.space_id).maybeSingle()
  if (check && (check as { key_check: string }).key_check !== (await keyCheck(raw))) {
    throw new Error('Davetteki anahtar bu alanla eşleşmedi')
  }
  setSpaceCodec(row.space_id, new E2ECodec(keys))
  return { id: row.space_id, name: await openName(keys, nameCtx(row.space_id), row.name, 'Ortak alan'), isOwner: false, joinedAt: new Date().toISOString() }
}

export async function listMembers(sb: SupabaseClient, personId: string, keys: E2ECodec, spaceId: string): Promise<SpaceMember[]> {
  const { data, error } = await sb.from('space_members').select('person_id, role, display_name, joined_at').eq('space_id', spaceId).order('joined_at')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ person_id: string; role: string; display_name: string | null; joined_at: string }>
  return Promise.all(rows.map(async (r, i) => ({
    personId: r.person_id,
    name: keys.keys ? await openName(keys.keys, memberCtx(r.person_id), r.display_name, `Kişi ${i + 1}`) : `Kişi ${i + 1}`,
    isOwner: r.role === 'owner',
    isMe: r.person_id === personId,
    joinedAt: r.joined_at,
  })))
}

export async function renameSpace(sb: SupabaseClient, keys: E2ECodec, spaceId: string, name: string): Promise<void> {
  if (!keys.keys) throw new Error('Alan anahtarı yok')
  const clean = name.trim()
  if (!clean) throw new Error('Alan adı boş olamaz')
  const { error } = await sb.rpc('rename_space', { p_space: spaceId, p_name: await encryptField(keys.keys, nameCtx(spaceId), clean) })
  fail(error)
}

export async function setMyName(sb: SupabaseClient, personId: string, keys: E2ECodec, spaceId: string, name: string): Promise<void> {
  if (!keys.keys) throw new Error('Alan anahtarı yok')
  const clean = name.trim()
  const { error } = await sb.rpc('set_space_display_name', {
    p_space: spaceId,
    p_person: personId,
    p_display_name: clean ? await encryptField(keys.keys, memberCtx(personId), clean) : null,
  })
  fail(error)
}

/** Removes a person (owner only) or, with target = self, leaves the space. */
export async function removeMember(sb: SupabaseClient, personId: string, spaceId: string, targetPersonId: string): Promise<void> {
  const { error } = await sb.rpc('remove_space_member', { p_space: spaceId, p_actor: personId, p_target: targetPersonId })
  fail(error)
  if (targetPersonId === personId) setSpaceCodec(spaceId, null)
}
