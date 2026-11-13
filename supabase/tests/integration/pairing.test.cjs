// Device pairing by approval (migration 0016) through PostgREST (run via run.sh).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { PostgrestClient } = require('@supabase/postgrest-js')
const jiti = require('jiti')(__filename, { interopDefault: true })
const root = path.join(__dirname, '../../..')
const wk = jiti(path.join(root, 'shared/crypto/workspaceKey.ts'))
const pr = jiti(path.join(root, 'shared/crypto/pairing.ts'))

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
const mem = () => { const m = new Map(); return { m, load: async (w) => m.get(w) ?? null, save: async (w, k) => void m.set(w, k), remove: async (w) => void m.delete(w) } }

const OLD = '00000000-0000-0000-0000-0000000006a1', NEW = '00000000-0000-0000-0000-0000000006a2'
const EVIL = '00000000-0000-0000-0000-0000000006a3', OUT = '00000000-0000-0000-0000-0000000006b1'
const WS = '60000000-0000-0000-0000-000000000001', WS2 = '60000000-0000-0000-0000-000000000002'
sql(`insert into auth.users (id) values ('${OLD}'), ('${NEW}'), ('${EVIL}'), ('${OUT}');
insert into public.workspaces (id) values ('${WS}'), ('${WS2}');
insert into public.workspace_members (workspace_id, user_id) values ('${WS}', '${OLD}'), ('${WS}', '${NEW}'), ('${WS}', '${EVIL}'), ('${WS2}', '${OUT}');`)

test('code + approve: the key reaches the new device, sealed end to end', async () => {
  const oldKeys = mem()
  assert.ok(await wk.commitEncryption(client(OLD), oldKeys, wk.prepareEncryption(WS)))
  const newKeys = mem()
  assert.equal(await wk.activateWorkspaceKey(client(NEW), newKeys, WS), 'needs-key')

  const pending = await pr.requestKey(client(NEW), newKeys, WS, 'iPhone')
  assert.match(pending.code, /^\d{4}$/)
  const waiting = pending.wait()

  const list = await pr.pendingKeyRequests(client(OLD), WS, OLD)
  assert.equal(list.length, 1)
  assert.equal(list[0].deviceName, 'iPhone')
  assert.equal(list[0].code, pending.code, 'both screens show the same code')
  assert.equal((await pr.pendingKeyRequests(client(NEW), WS, NEW)).length, 0, 'own request is not offered for approval')
  assert.equal((await pr.pendingKeyRequests(client(OUT), WS, OUT)).length, 0, 'outsiders see nothing')

  // The requester cannot answer itself.
  await assert.rejects(pr.approveKeyRequest(client(NEW), mem(), WS, pending.id))
  await pr.approveKeyRequest(client(OLD), oldKeys, WS, pending.id)
  await waiting
  assert.deepEqual([...newKeys.m.get(WS)], [...oldKeys.m.get(WS)])
  assert.equal(await wk.activateWorkspaceKey(client(NEW), newKeys, WS), 'ready')
  assert.equal(sql(`select count(*) from public.key_requests`), '0', 'request removed after use')
  assert.doesNotMatch(sql(`select coalesce(string_agg(wrapped, ''), '') from public.key_requests`), /[A-Za-z0-9+/]{40}==?$/)
})

test('decline removes the requesting device from the workspace', async () => {
  const pending = await pr.requestKey(client(EVIL), mem(), WS, 'Bilinmeyen')
  await pr.declineKeyRequest(client(OLD), pending.id)
  await assert.rejects(pending.wait(), /reddedildi/)
  assert.equal(sql(`select count(*) from public.workspace_members where user_id = '${EVIL}'`), '0')
})
