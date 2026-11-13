/**
 * Encrypts everything a workspace stored before encryption was switched on.
 * Idempotent and resumable: each pass seals what is still plain, so any device
 * holding the key can run it again after an interruption.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import * as Y from 'yjs'
import { codec } from './codec'
import { isEncrypted, toBase64, fromBase64 } from './e2e'

export interface MigrationProgress {
  step: string
  done: number
}

const PAGE = 100
const plainFilter = (column: string): string => `${column}.not.like.enc:v1:%`

type Report = (p: MigrationProgress) => void

export async function encryptExistingData(sb: SupabaseClient, workspaceId: string, report: Report = () => undefined): Promise<void> {
  if (!codec().enabled) throw new Error('Şifre anahtarı yüklenmedi')
  await sealClips(sb, workspaceId, report)
  await sealNotebooks(sb, workspaceId, report)
  await sealNotes(sb, workspaceId, report)
  await sealVersions(sb, workspaceId, report)
  await sealTrash(sb, workspaceId, report)
  const { error } = await sb.rpc('purge_spent_device_actions', { p_workspace_id: workspaceId })
  if (error) throw error
  await sealImages(sb, workspaceId, report)
  report({ step: 'Tamamlandı', done: 0 })
}

/** True when nothing plain is left (cheap check for app start). */
export async function hasPlainData(sb: SupabaseClient, workspaceId: string): Promise<boolean> {
  const checks = await Promise.all([
    sb.from('clipboard_items').select('id', { head: true, count: 'exact' }).eq('workspace_id', workspaceId).or(`${plainFilter('text')}`),
    sb.from('notes').select('id', { head: true, count: 'exact' }).eq('workspace_id', workspaceId).neq('content', '').or(plainFilter('content')),
    sb.from('note_updates').select('id', { head: true, count: 'exact' }).eq('workspace_id', workspaceId).or(plainFilter('update')),
  ])
  for (const c of checks) if (c.error) throw c.error
  return checks.some((c) => (c.count ?? 0) > 0)
}

async function sealClips(sb: SupabaseClient, ws: string, report: Report): Promise<void> {
  let done = 0
  for (;;) {
    const { data, error } = await sb.from('clipboard_items').select('id, content_type, text, html, ai')
      .eq('workspace_id', ws).or(plainFilter('text')).limit(PAGE)
    if (error) throw error
    if (!data?.length) return
    for (const r of data as Array<{ id: string; content_type: string; text: string; html: string | null; ai: unknown }>) {
      const isText = r.content_type === 'text' || r.content_type === 'rich-text'
      const sealed = await codec().sealRow('clipboard_items', { id: r.id, text: r.text, html: r.html, ai: r.ai })
      const hash = await codec().clipHash(isText ? r.text.trim() : r.text, () => '')
      const { error: upError } = await sb.from('clipboard_items')
        .update({ text: sealed.text, html: sealed.html, ai: sealed.ai, hash }).eq('id', r.id)
      if (upError) throw upError
      report({ step: 'Pano', done: ++done })
    }
  }
}

async function sealNotebooks(sb: SupabaseClient, ws: string, report: Report): Promise<void> {
  const { data, error } = await sb.from('notebooks').select('id, name').eq('workspace_id', ws).or(plainFilter('name'))
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return
    throw error
  }
  let done = 0
  for (const r of (data ?? []) as Array<{ id: string; name: string }>) {
    const { error: upError } = await sb.from('notebooks').update({ name: (await codec().sealRow('notebooks', r)).name }).eq('id', r.id)
    if (upError) throw upError
    report({ step: 'Defterler', done: ++done })
  }
}

async function plainUpdates(sb: SupabaseClient, noteId: string): Promise<Array<{ id: number; update: string }>> {
  const out: Array<{ id: number; update: string }> = []
  let cursor = 0
  for (;;) {
    const { data, error } = await sb.from('note_updates').select('id, update').eq('note_id', noteId).gt('id', cursor).order('id').limit(1000)
    if (error) throw error
    const rows = (data ?? []) as Array<{ id: number; update: string }>
    out.push(...rows)
    if (rows.length < 1000) return out
    cursor = rows[rows.length - 1].id
  }
}

async function sealNotes(sb: SupabaseClient, ws: string, report: Report): Promise<void> {
  const { data, error } = await sb.from('notes').select('id, title, content, ai, ydoc, ydoc_seq, ydoc_content_sha').eq('workspace_id', ws)
  if (error) throw error
  let done = 0
  for (const n of (data ?? []) as Array<{ id: string; title: string | null; content: string; ai: unknown; ydoc: string | null; ydoc_seq: number; ydoc_content_sha: string | null }>) {
    const updates = await plainUpdates(sb, n.id)
    const plainUpdatesOnly = updates.filter((u) => !isEncrypted(u.update))
    const needsRow = [n.title, n.content, n.ydoc].some((v) => v && !isEncrypted(v)) || (n.ai != null && !isEncrypted(n.ai))
    if (!needsRow && plainUpdatesOnly.length === 0) continue

    // Fold the snapshot and every update into one sealed snapshot, then drop the plain updates.
    const parts: Uint8Array[] = []
    if (n.ydoc) parts.push(fromBase64(await codec().openNoteBlob(n.id, 'ydoc', n.ydoc)))
    for (const u of updates) parts.push(fromBase64(await codec().openNoteBlob(n.id, 'update', u.update)))
    const merged = parts.length ? toBase64(Y.mergeUpdates(parts)) : null
    const sealed = await codec().sealRow('notes', { id: n.id, title: n.title, content: n.content, ai: n.ai })
    const ydoc = merged ? await codec().sealNoteBlob(n.id, 'ydoc', merged) : null
    const { error: upError } = await sb.from('notes')
      .update({ title: sealed.title, content: sealed.content, ai: sealed.ai, ydoc }).eq('id', n.id)
    if (upError) throw upError
    const maxId = Math.max(0, ...updates.map((u) => u.id))
    if (maxId > Number(n.ydoc_seq ?? 0) && ydoc) {
      const { error: cError } = await sb.rpc('compact_note', {
        p_note_id: n.id, p_ydoc: ydoc, p_seq: maxId, p_content: sealed.content, p_content_sha: n.ydoc_content_sha ?? '',
      })
      if (cError) throw cError
    }
    report({ step: 'Notlar', done: ++done })
  }
}

async function sealVersions(sb: SupabaseClient, ws: string, report: Report): Promise<void> {
  let done = 0
  for (;;) {
    const { data, error } = await sb.from('note_versions').select('id, title, content').eq('workspace_id', ws).or(plainFilter('content')).limit(PAGE)
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return
      throw error
    }
    if (!data?.length) return
    for (const v of data as Array<{ id: string; title: string | null; content: string }>) {
      const sealed = await codec().sealRow('note_versions', v)
      const { error: rError } = await sb.rpc('reseal_note_version', { p_id: v.id, p_title: sealed.title, p_content: sealed.content })
      if (rError) throw rError
      report({ step: 'Sürüm geçmişi', done: ++done })
    }
  }
}

async function sealTrash(sb: SupabaseClient, ws: string, report: Report): Promise<void> {
  const { data, error } = await sb.from('notes_trash').select('id, note, updates').eq('workspace_id', ws)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return
    throw error
  }
  let done = 0
  for (const t of (data ?? []) as Array<{ id: string; note: Record<string, unknown>; updates: Array<{ update: string }> }>) {
    const title = t.note.title as string | null
    const content = (t.note.content as string) ?? ''
    const ydoc = t.note.ydoc as string | null
    if ([title, content, ydoc].every((v) => !v || isEncrypted(v)) && t.updates.every((u) => isEncrypted(u.update))) continue
    const sealed = await codec().sealRow('notes', { id: t.id, title, content })
    const { error: rError } = await sb.rpc('reseal_trashed_note', {
      p_id: t.id,
      p_title: sealed.title,
      p_content: sealed.content,
      p_ydoc: ydoc ? (isEncrypted(ydoc) ? ydoc : await codec().sealNoteBlob(t.id, 'ydoc', ydoc)) : null,
      p_updates: await Promise.all(t.updates.map(async (u) => ({
        ...u, update: isEncrypted(u.update) ? u.update : await codec().sealNoteBlob(t.id, 'update', u.update),
      }))),
    })
    if (rError) throw rError
    report({ step: 'Çöp kutusu', done: ++done })
  }
}

/** Re-uploads images stored in plain form; already sealed ones are recognised and skipped. */
async function sealImages(sb: SupabaseClient, ws: string, report: Report): Promise<void> {
  const bucket = sb.storage.from('note-assets')
  const { data: folders, error } = await bucket.list(ws, { limit: 1000 })
  if (error) return
  let done = 0
  for (const folder of folders ?? []) {
    const { data: files } = await bucket.list(`${ws}/${folder.name}`, { limit: 1000 })
    for (const f of files ?? []) {
      const path = `${ws}/${folder.name}/${f.name}`
      const { data: blob, error: dError } = await bucket.download(path)
      if (dError || !blob) continue
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const alreadySealed = await codec().openFile(path, bytes).then(() => true, () => false)
      if (alreadySealed) continue
      const sealed = await codec().sealFile(path, bytes)
      const type = blob.type || 'image/jpeg'
      const { error: rmError } = await bucket.remove([path])
      if (rmError) throw rmError
      const { error: upError } = await bucket.upload(path, new Blob([sealed as BlobPart], { type }), { contentType: type, upsert: false })
      if (upError) {
        // Never leave the note without its image: put the original back before giving up.
        await bucket.upload(path, new Blob([bytes as BlobPart], { type }), { contentType: type, upsert: false })
        throw upError
      }
      report({ step: 'Görseller', done: ++done })
    }
  }
}
