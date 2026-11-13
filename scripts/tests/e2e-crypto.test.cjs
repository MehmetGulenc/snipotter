// node --test scripts/tests/e2e-crypto.test.cjs — end-to-end encryption core (shared/crypto/e2e.ts)
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const jiti = require('jiti')(__filename, { interopDefault: true })
const e = jiti(path.join(__dirname, '../../shared/crypto/e2e.ts'))

const WS = '10000000-0000-0000-0000-000000000001'
const ctx = { table: 'notes', row: '20000000-0000-0000-0000-000000000001', column: 'content' }

test('fields round-trip and every encryption is different', async () => {
  const keys = await e.deriveWorkspaceKeys(WS, e.newWorkspaceKey())
  const a = await e.encryptField(keys, ctx, 'Gizli not: şifre 1234 🙂')
  const b = await e.encryptField(keys, ctx, 'Gizli not: şifre 1234 🙂')
  assert.ok(a.startsWith('enc:v1:'))
  assert.notEqual(a, b)
  assert.doesNotMatch(a, /Gizli|1234/)
  assert.equal(await e.decryptField(keys, ctx, a), 'Gizli not: şifre 1234 🙂')
})

test('a value cannot be decrypted in another row, column, workspace or with another key', async () => {
  const raw = e.newWorkspaceKey()
  const keys = await e.deriveWorkspaceKeys(WS, raw)
  const sealed = await e.encryptField(keys, ctx, 'x')
  await assert.rejects(e.decryptField(keys, { ...ctx, row: 'baska' }, sealed))
  await assert.rejects(e.decryptField(keys, { ...ctx, column: 'title' }, sealed))
  await assert.rejects(e.decryptField(await e.deriveWorkspaceKeys('baska-alan', raw), ctx, sealed))
  await assert.rejects(e.decryptField(await e.deriveWorkspaceKeys(WS, e.newWorkspaceKey()), ctx, sealed))
  const tampered = sealed.slice(0, -4) + (sealed.endsWith('AAAA') ? 'BBBB' : 'AAAA')
  await assert.rejects(e.decryptField(keys, ctx, tampered))
})

test('plain legacy values pass through; encrypted ones need a key', async () => {
  const keys = await e.deriveWorkspaceKeys(WS, e.newWorkspaceKey())
  assert.equal(await e.decryptField(null, ctx, 'eski düz metin'), 'eski düz metin')
  await assert.rejects(e.decryptField(null, ctx, await e.encryptField(keys, ctx, 'x')), /anahtar/)
})

test('JSON columns', async () => {
  const keys = await e.deriveWorkspaceKeys(WS, e.newWorkspaceKey())
  const c = { ...ctx, column: 'ai' }
  const v = { summary: 'özet', tags: ['iş'] }
  assert.deepEqual(await e.decryptJson(keys, c, await e.encryptJson(keys, c, v)), v)
  assert.equal(await e.encryptJson(keys, c, null), null)
  assert.deepEqual(await e.decryptJson(keys, c, v), v)
})

test('dedupe hash is keyed: same text same hash, different key different hash, not plain SHA', async () => {
  const k1 = await e.deriveWorkspaceKeys(WS, e.newWorkspaceKey())
  const k2 = await e.deriveWorkspaceKeys(WS, e.newWorkspaceKey())
  const h = await e.dedupeHash(k1, '482913')
  assert.equal(h, await e.dedupeHash(k1, '482913'))
  assert.notEqual(h, await e.dedupeHash(k2, '482913'))
  assert.notEqual(h, require('node:crypto').createHash('sha256').update('482913').digest('hex'))
})

test('recovery: 24 words ↔ secret, wrapped key opens only with the right words', async () => {
  const raw = e.newWorkspaceKey()
  const recovery = e.randomBytes(32)
  const words = e.secretToWords(recovery)
  assert.equal(words.length, 24)
  const typed = ' ' + words.join('  ').toUpperCase() + '. '
  assert.deepEqual(e.wordsToSecret(typed), recovery)
  const wrapped = await e.wrapKey(raw, recovery, 'recovery')
  assert.deepEqual(await e.unwrapKey(wrapped, e.wordsToSecret(words.join(' ')), 'recovery'), raw)
  await assert.rejects(e.unwrapKey(wrapped, e.randomBytes(32), 'recovery'), /eşleşmiyor/)
  await assert.rejects(e.unwrapKey(wrapped, recovery, 'transfer'))
  const swapped = [...words]; [swapped[0], swapped[1]] = [swapped[1], swapped[0]]
  assert.throws(() => e.wordsToSecret(swapped.join(' ')), /hatalı/)
})

test('device transfer: 12 words, lookup id differs per purpose and reveals nothing', async () => {
  const s = e.randomBytes(16)
  assert.equal(e.secretToWords(s).length, 12)
  const id = await e.secretId(s, 'transfer')
  assert.match(id, /^[0-9a-f]{64}$/)
  assert.notEqual(id, await e.secretId(s, 'recovery'))
  assert.equal(id, await e.secretId(e.wordsToSecret(e.secretToWords(s).join(' ')), 'transfer'))
})

test('key check matches only the same key', async () => {
  const raw = e.newWorkspaceKey()
  assert.equal(await e.keyCheck(raw), await e.keyCheck(Uint8Array.from(raw)))
  assert.notEqual(await e.keyCheck(raw), await e.keyCheck(e.newWorkspaceKey()))
})

test('binary (images) round-trip', async () => {
  const keys = await e.deriveWorkspaceKeys(WS, e.newWorkspaceKey())
  const img = e.randomBytes(300_000)
  const c = { table: 'storage', row: 'ws/note/a.jpg', column: 'bytes' }
  assert.deepEqual(await e.decryptBytes(keys, c, await e.encryptBytes(keys, c, img)), img)
})

const { E2ECodec } = jiti(path.join(__dirname, '../../shared/crypto/codec.ts'))

test('codec: no key passes rows through; with key seals only sensitive columns, opens them back', async () => {
  const plain = new E2ECodec(null)
  const row = { id: 'c1', workspace_id: WS, content_type: 'text', text: 'IBAN TR12', html: null, ai: { tags: ['para'] }, hash: 'h' }
  assert.deepEqual(await plain.sealRow('clipboard_items', row), row)
  const c = new E2ECodec(await e.deriveWorkspaceKeys(WS, e.newWorkspaceKey()))
  const sealed = await c.sealRow('clipboard_items', row)
  assert.ok(sealed.text.startsWith('enc:v1:'))
  assert.ok(sealed.ai.startsWith('enc:v1:'))
  assert.equal(sealed.html, null)
  assert.equal(sealed.content_type, 'text')
  assert.deepEqual(await c.openRow('clipboard_items', sealed), row)
  await assert.rejects(c.sealRow('notes', { content: 'x' }), /kimliği/)
})

test('codec: unreadable rows are flagged instead of crashing; broadcasts and blobs round-trip', async () => {
  const c = new E2ECodec(await e.deriveWorkspaceKeys(WS, e.newWorkspaceKey()))
  const other = new E2ECodec(await e.deriveWorkspaceKeys(WS, e.newWorkspaceKey()))
  const sealed = await c.sealRow('notes', { id: 'n1', title: 'Başlık', content: '{"type":"doc"}' })
  const bad = await other.openRow('notes', sealed)
  assert.equal(bad.__unreadable, true)
  assert.equal(bad.content, '')
  const b = await c.sealBroadcast('clip:upsert', 'c1', { item: { text: 'gizli' } })
  assert.doesNotMatch(JSON.stringify(b), /gizli/)
  assert.deepEqual(await c.openBroadcast('clip:upsert', b), { item: { text: 'gizli' } })
  assert.equal(await other.openBroadcast('clip:upsert', b), null)
  assert.equal(await c.openNoteBlob('n1', 'update', await c.sealNoteBlob('n1', 'update', 'AAE=')), 'AAE=')
  assert.equal(await c.openNoteBlob('n1', 'update', 'AAE='), 'AAE=')
  assert.notEqual(await c.clipHash('482913', () => 'legacy'), 'legacy')
  assert.equal(await new E2ECodec(null).clipHash('482913', () => 'legacy'), 'legacy')
})
