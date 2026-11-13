// Run through supabase/tests/integration/run.sh (local Postgres + PostgREST).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { PostgrestClient } = require('@supabase/postgrest-js')
const Y = require('yjs')
const jiti = require('jiti')(__filename, { interopDefault: true })
const root = path.join(__dirname, '../../..')
const e = jiti(path.join(root, 'shared/crypto/e2e.ts'))
const codecMod = jiti(path.join(root, 'shared/crypto/codec.ts'))
const wk = jiti(path.join(root, 'shared/crypto/workspaceKey.ts'))
const mig = jiti(path.join(root, 'shared/crypto/migrate.ts'))

const WS = '10000000-0000-0000-0000-000000000001'
const NOTE = '20000000-0000-0000-0000-000000000001'
const TRASHED = '20000000-0000-0000-0000-000000000002'
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'

const sql = (q) => execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=localtest', process.env.DB_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-qAt', '-U', 'postgres', '-d', 'postgres'], { input: q }).toString().trim()

function jwt(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`
  return `${body}.${crypto.createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url')}`
}

/** Just enough of SupabaseClient for the shared code (no Storage service locally). */
function client(sub) {
  const pg = new PostgrestClient('http://127.0.0.1:54321', { headers: { Authorization: `Bearer ${jwt(sub)}` } })
  return {
    from: (t) => pg.from(t),
    rpc: (fn, args) => pg.rpc(fn, args),
    storage: { from: () => ({ list: async () => ({ data: null, error: { message: 'no storage locally' } }) }) },
  }
}

function memoryBackend() {
  const keys = new Map()
  return { keys, load: async (w) => keys.get(w) ?? null, save: async (w, k) => void keys.set(w, k), remove: async (w) => void keys.delete(w) }
}

// Plain data written by the app before encryption, including real Yjs updates.
const doc = new Y.Doc()
const frag = doc.getXmlFragment('default')
const updates = []
doc.on('update', (u) => updates.push(Buffer.from(u).toString('base64')))
const p1 = new Y.XmlElement('paragraph'); p1.insert(0, [new Y.XmlText('Banka şifresi: 4821')]); frag.push([p1])
const p2 = new Y.XmlElement('paragraph'); p2.insert(0, [new Y.XmlText('ikinci satır')]); frag.push([p2])
const esc = (s) => s.replace(/'/g, "''")

sql(`
insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}');
insert into public.workspaces (id) values ('${WS}');
insert into public.workspace_members (workspace_id, user_id) values ('${WS}', '${A}');
insert into public.clipboard_items (workspace_id, created_by, content_type, text, hash, ai)
  values ('${WS}', '${A}', 'text', 'TR33 0006 1005 1978 6457 8413 26', 'sha1-legacy', '{"tags":["iban"]}');
insert into public.notebooks (workspace_id, name) values ('${WS}', 'Sağlık');
insert into public.notes (id, workspace_id, title, content) values
  ('${NOTE}', '${WS}', 'Gizli başlık', '${esc(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Banka şifresi: 4821' }] }] }))}'),
  ('${TRASHED}', '${WS}', 'Çöpteki', 'çöpteki içerik');
insert into public.note_updates (note_id, workspace_id, created_by, "update") values
  ${updates.map((u) => `('${NOTE}', '${WS}', '${A}', '${u}')`).join(',')};
insert into public.note_versions (note_id, workspace_id, kind, title, content) values ('${NOTE}', '${WS}', 'manual', 'eski başlık', 'eski içerik');
insert into public.device_actions (workspace_id, sender_user_id, sender_device, kind, payload, consumed_at)
  values ('${WS}', '${A}', 'Mac', 'iban', 'TR33 0006 1005', now());
`)
sql(`select set_config('request.jwt.claims', '{"sub":"${A}","role":"authenticated"}', false); select public.trash_notes(array['${TRASHED}']::uuid[]);`)

const a = client(A)
const aKeys = memoryBackend()
let prepared

test('turning encryption on: words first, then the switch; a second device loses the race', async () => {
  assert.equal(await wk.activateWorkspaceKey(a, aKeys, WS), 'plain')
  prepared = wk.prepareEncryption(WS)
  assert.equal(prepared.words.length, 24)
  assert.equal(await wk.commitEncryption(a, aKeys, prepared), true)
  assert.ok(codecMod.codec().enabled)
  const loser = memoryBackend()
  assert.equal(await wk.commitEncryption(a, loser, wk.prepareEncryption(WS)), false)
  assert.equal(loser.keys.size, 0, 'losing device drops its key')
  assert.equal(await wk.activateWorkspaceKey(a, aKeys, WS), 'ready')
})

test('existing data is encrypted; nothing readable is left in the database', async () => {
  assert.equal(await mig.hasPlainData(a, WS), true)
  await mig.encryptExistingData(a, WS)
  const dump = sql(`select coalesce(string_agg(x, ' '), '') from (
    select text || coalesce(ai::text,'') as x from clipboard_items union all
    select coalesce(title,'') || content || coalesce(ydoc,'') from notes union all
    select "update" from note_updates union all
    select coalesce(title,'') || content from note_versions union all
    select note::text || updates::text from notes_trash union all
    select name from notebooks union all
    select payload from device_actions) s`)
  for (const secret of ['TR33', 'Banka', '4821', 'Gizli', 'Sağlık', 'eski içerik', 'çöpteki', 'iban']) {
    assert.ok(!dump.includes(secret), `"${secret}" still readable`)
  }
  assert.equal(sql(`select count(*) from note_updates where note_id = '${NOTE}' and "update" not like 'enc:v1:%'`), '0')
  assert.equal(await mig.hasPlainData(a, WS), false)
  await mig.encryptExistingData(a, WS) // idempotent second run
})

test('everything opens again with the key', async () => {
  const c = codecMod.codec()
  const { data: clips } = await a.from('clipboard_items').select('*')
  const clip = await c.openRow('clipboard_items', clips[0])
  assert.equal(clip.text, 'TR33 0006 1005 1978 6457 8413 26')
  assert.deepEqual(clip.ai, { tags: ['iban'] })
  assert.equal(clips[0].hash, await c.clipHash('TR33 0006 1005 1978 6457 8413 26', () => ''))
  const { data: notes } = await a.from('notes').select('*').eq('id', NOTE)
  const note = await c.openRow('notes', notes[0])
  assert.equal(note.title, 'Gizli başlık')
  assert.match(note.content, /Banka şifresi/)
  const restored = new Y.Doc()
  Y.applyUpdate(restored, Buffer.from(await c.openNoteBlob(NOTE, 'ydoc', notes[0].ydoc), 'base64'))
  assert.equal(restored.getXmlFragment('default').toString(), frag.toString())
  const { data: books } = await a.from('notebooks').select('*')
  assert.equal((await c.openRow('notebooks', books[0])).name, 'Sağlık')
})

test('an old app version writing plaintext is refused', async () => {
  const { error } = await a.from('clipboard_items').insert({ workspace_id: WS, created_by: A, content_type: 'text', text: 'eski sürüm', hash: 'x' })
  assert.ok(error, 'plaintext insert must fail')
})

test('second device joins with 12 words and reads the data', async () => {
  const { words } = await wk.createKeyTransfer(a, aKeys, WS)
  assert.equal(words.length, 12)
  const b = client(B)
  const bKeys = memoryBackend()
  assert.equal(await wk.redeemKeyTransfer(b, bKeys, words.join(' '), 'iPhone'), WS)
  assert.equal(await wk.activateWorkspaceKey(b, bKeys, WS), 'ready')
  const { data } = await b.from('clipboard_items').select('*')
  assert.equal((await codecMod.codec().openRow('clipboard_items', data[0])).text, 'TR33 0006 1005 1978 6457 8413 26')
  await assert.rejects(wk.redeemKeyTransfer(client(C), memoryBackend(), words.join(' '), 'x'), /geçersiz|süresi/)
})

test('all devices lost: the 24 recovery words bring a fresh device back', async () => {
  const c = client(C)
  const cKeys = memoryBackend()
  assert.equal(await wk.recoverWithWords(c, cKeys, prepared.words.join(' '), 'Yeni Mac'), WS)
  assert.deepEqual(cKeys.keys.get(WS), aKeys.keys.get(WS))
  assert.equal(await wk.activateWorkspaceKey(c, cKeys, WS), 'ready')
  const wrong = [...prepared.words]; [wrong[3], wrong[4]] = [wrong[4], wrong[3]]
  await assert.rejects(wk.recoverWithWords(c, memoryBackend(), wrong.join(' '), 'x'), /hatalı/)
})
