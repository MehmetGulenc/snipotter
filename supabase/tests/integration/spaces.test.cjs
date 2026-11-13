// Shared spaces through PostgREST (run via run.sh). Two people, each with an encrypted personal workspace.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { PostgrestClient } = require('@supabase/postgrest-js')
const jiti = require('jiti')(__filename, { interopDefault: true })
const root = path.join(__dirname, '../../..')
const codecMod = jiti(path.join(root, 'shared/crypto/codec.ts'))
const wk = jiti(path.join(root, 'shared/crypto/workspaceKey.ts'))
const sp = jiti(path.join(root, 'shared/crypto/spaces.ts'))

const sql = (q) => execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=localtest', process.env.DB_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-qAt', '-U', 'postgres', '-d', 'postgres'], { input: q }).toString().trim()
function jwt(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`
  return `${body}.${crypto.createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url')}`
}
const client = (sub) => {
  const pg = new PostgrestClient('http://127.0.0.1:54321', { headers: { Authorization: `Bearer ${jwt(sub)}` } })
  return { from: (t) => pg.from(t), rpc: (fn, args) => pg.rpc(fn, args) }
}
const mem = () => { const m = new Map(); return { load: async (w) => m.get(w) ?? null, save: async (w, k) => void m.set(w, k), remove: async (w) => void m.delete(w) } }

const U1 = '00000000-0000-0000-0000-0000000005a1', U2 = '00000000-0000-0000-0000-0000000005b1', U3 = '00000000-0000-0000-0000-0000000005c1'
const P1 = '50000000-0000-0000-0000-000000000001', P2 = '50000000-0000-0000-0000-000000000002', P3 = '50000000-0000-0000-0000-000000000003'
sql(`insert into auth.users (id) values ('${U1}'), ('${U2}'), ('${U3}');
insert into public.workspaces (id) values ('${P1}'), ('${P2}'), ('${P3}');
insert into public.workspace_members (workspace_id, user_id) values ('${P1}', '${U1}'), ('${P2}', '${U2}'), ('${P3}', '${U3}');`)

/** Encrypts a personal workspace and returns its codec (activate() swaps the global one). */
async function person(sub, ws) {
  const sb = client(sub)
  const keys = mem()
  assert.ok(await wk.commitEncryption(sb, keys, wk.prepareEncryption(ws)))
  return { sb, ws, activate: async () => { await wk.activateWorkspaceKey(sb, keys, ws); return codecMod.codec() } }
}

test('create, invite by link, join, share a note, remove', async () => {
  const p1 = await person(U1, P1)
  const p2 = await person(U2, P2)

  let c1 = await p1.activate()
  const space = await sp.createSpace(p1.sb, P1, c1, 'Ev', 'Ahmet')
  assert.equal(space.name, 'Ev')
  assert.match(sql(`select name from public.workspaces where id = '${space.id}'`), /^enc:v1:/)

  const invite = await sp.createInvite(p1.sb, P1, c1, space.id)
  assert.equal(invite.words.length, 12)
  assert.ok(invite.link.startsWith('https://snipotter.com/katil#'))
  assert.equal(sql(`select count(*) from public.space_invites where wrapped like '%${invite.words[0]}%'`), '0')

  // P1 writes a note sealed with the space key.
  const note = await codecMod.codecFor(space.id).sealRow('notes', { id: crypto.randomUUID(), workspace_id: space.id, content: 'süt, ekmek' })
  const ins = await p1.sb.from('notes').insert(note)
  assert.equal(ins.error, null)

  const c2 = await p2.activate()
  codecMod.clearSpaceCodecs()
  const joined = await sp.joinSpace(p2.sb, P2, c2, invite.link, 'Ayşe')
  assert.equal(joined.id, space.id)
  assert.equal(joined.name, 'Ev')
  await assert.rejects(sp.joinSpace(p2.sb, P2, c2, invite.words.join(' '), 'Ayşe'), /geçersiz/)

  // A fresh device of P2 only needs its personal key.
  codecMod.clearSpaceCodecs()
  const spaces = await sp.loadSpaces(p2.sb, P2, c2)
  assert.deepEqual(spaces.map((s) => s.name), ['Ev'])
  const { data } = await p2.sb.from('notes').select('*').eq('workspace_id', space.id)
  assert.equal((await codecMod.codecFor(space.id).openRow('notes', data[0])).content, 'süt, ekmek')

  const members = await sp.listMembers(p2.sb, P2, codecMod.codecFor(space.id), space.id)
  assert.deepEqual(members.map((m) => [m.name, m.isOwner, m.isMe]), [['Ahmet', true, false], ['Ayşe', false, true]])
  await assert.rejects(sp.removeMember(p2.sb, P2, space.id, P1), /kuran/)

  await sp.renameSpace(p2.sb, codecMod.codecFor(space.id), space.id, 'Evimiz')
  c1 = await p1.activate()
  codecMod.clearSpaceCodecs()
  assert.equal((await sp.loadSpaces(p1.sb, P1, c1))[0].name, 'Evimiz')

  // An outsider with the words after use gets nothing.
  const p3 = await person(U3, P3)
  const c3 = await p3.activate()
  await assert.rejects(sp.joinSpace(p3.sb, P3, c3, invite.link, 'X'), /geçersiz/)
  assert.equal((await p3.sb.from('notes').select('id').eq('workspace_id', space.id)).data.length, 0)

  await sp.removeMember(p1.sb, P1, space.id, P2)
  assert.equal((await p2.sb.from('notes').select('id').eq('workspace_id', space.id)).data.length, 0)
  assert.deepEqual(await sp.loadSpaces(p2.sb, P2, c2), [])
})

test('invite input accepts the link, dashed or spaced words', () => {
  const w = 'abandon ability able about above absent absorb abstract absurd abuse access accident'
  assert.equal(sp.inviteWords(`https://snipotter.com/katil#${w.replace(/ /g, '-')}`), w)
  assert.equal(sp.inviteWords(`  ${w.toUpperCase()} `), w)
  assert.ok(sp.looksLikeInvite(w))
  assert.ok(!sp.looksLikeInvite('abandon ability'))
})
