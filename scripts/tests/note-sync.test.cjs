// node --test scripts/tests/note-sync.test.cjs — Yjs note sync (shared/notes/sync.ts) against an in-memory server.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const jiti = require('jiti')(__filename, { interopDefault: true })
const Y = require('yjs')
const { getSchema } = require('@tiptap/core')
const StarterKit = require('@tiptap/starter-kit').default
const TaskList = require('@tiptap/extension-task-list').default
const TaskItem = require('@tiptap/extension-task-item').default

const { NoteSync, NOTE_FRAGMENT, sha256, toBase64, fromBase64 } = jiti(path.join(__dirname, '../../shared/notes/sync.ts'))
const { extractText } = jiti(path.join(__dirname, '../../shared/notes/content.ts'))

const schema = getSchema([StarterKit, TaskList, TaskItem])
const TIMERS = { flushMs: 5, contentMs: 10, pollMs: 60_000, resyncMs: 60_000, versionMs: 60_000 }
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms))

/** In-memory stand-in for notes + note_updates + broadcast. */
function createServer(content = '') {
  const s = { ydoc: null, seq: 0, content, contentSha: null, updates: [], nextId: 1, subs: new Set(), versions: [] }
  return s
}

function transport(server, client) {
  const t = {
    online: true,
    guard() { if (!t.online) throw new Error('offline') },
    async load() { t.guard(); return { ydoc: server.ydoc, seq: server.seq, content: server.content, contentSha: server.contentSha, updates: server.updates.map((u) => ({ ...u })) } },
    async updatesAfter(_id, after) { t.guard(); return server.updates.filter((u) => u.id > after) },
    async push(_id, update) {
      t.guard()
      server.updates.push({ id: server.nextId++, update })
      for (const sub of server.subs) if (sub.client !== client) sub.cb(update)
    },
    subscribe(_id, cb) { const sub = { client, cb }; server.subs.add(sub); return () => server.subs.delete(sub) },
    async saveContent(_id, content, sha) { t.guard(); server.content = content; server.contentSha = sha },
    async compact(_id, ydoc, seq, content, sha) {
      t.guard()
      if (server.seq >= seq) return false
      Object.assign(server, { ydoc, seq, content, contentSha: sha })
      server.updates = server.updates.filter((u) => u.id > seq)
      return true
    },
    async saveVersion(_id, content, kind) { t.guard(); server.versions.push({ content, kind }) },
  }
  return t
}

function client(server, name, opts = {}) {
  const tr = transport(server, name)
  const sync = new NoteSync('note-1', tr, schema, { timers: TIMERS, ...opts })
  return { sync, tr }
}

function addParagraph(doc, text, at) {
  const fragment = doc.getXmlFragment(NOTE_FRAGMENT)
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText(text)])
  fragment.insert(at ?? fragment.length, [p])
}

const text = (sync) => extractText(sync.contentString())
const legacyDoc = (...lines) => JSON.stringify({ type: 'doc', content: lines.map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] })) })

test('concurrent edits on two devices merge into one document', async () => {
  const server = createServer()
  const a = client(server, 'a')
  const b = client(server, 'b')
  await a.sync.start()
  await b.sync.start()
  addParagraph(a.sync.doc, 'Mac: süt')
  addParagraph(b.sync.doc, 'iPhone: ekmek')
  await wait()
  for (const c of [a, b]) {
    assert.match(text(c.sync), /Mac: süt/)
    assert.match(text(c.sync), /iPhone: ekmek/)
  }
  assert.equal(text(a.sync), text(b.sync))
  await a.sync.stop(); await b.sync.stop()
})

test('edits made offline reach the server and the other device after reconnecting', async () => {
  const server = createServer()
  const a = client(server, 'a')
  const b = client(server, 'b')
  await a.sync.start()
  await b.sync.start()
  a.tr.online = false
  addParagraph(a.sync.doc, 'uçakta yazıldı')
  await wait()
  assert.equal(a.sync.status, 'offline')
  assert.doesNotMatch(text(b.sync), /uçakta/)
  a.tr.online = true
  await a.sync.resume()
  await b.sync.resume()
  assert.match(text(b.sync), /uçakta yazıldı/)
  assert.equal(a.sync.status, 'synced')
  await a.sync.stop(); await b.sync.stop()
})

test('a legacy note opened on two devices at once is not duplicated', async () => {
  const server = createServer(legacyDoc('kereviz', 'pırasa'))
  const a = client(server, 'a')
  const b = client(server, 'b')
  await Promise.all([a.sync.start(), b.sync.start()])
  await wait()
  await a.sync.resume(); await b.sync.resume()
  assert.equal(text(a.sync), 'kereviz\npırasa')
  assert.equal(text(b.sync), 'kereviz\npırasa')
  const fresh = client(server, 'c')
  await fresh.sync.start()
  assert.equal(text(fresh.sync), 'kereviz\npırasa')
  await a.sync.stop(); await b.sync.stop(); await fresh.sync.stop()
})

test('notes.content mirrors the document and carries its sha', async () => {
  const server = createServer()
  const a = client(server, 'a')
  await a.sync.start()
  addParagraph(a.sync.doc, 'arama için düz metin')
  await wait()
  assert.equal(extractText(server.content), 'arama için düz metin')
  assert.equal(server.contentSha, await sha256(server.content))
  await a.sync.stop()
})

test('an edit by an old app version (content only) replaces the document once on every device', async () => {
  const server = createServer()
  const a = client(server, 'a')
  const b = client(server, 'b')
  await a.sync.start(); await b.sync.start()
  addParagraph(a.sync.doc, 'eski metin')
  await wait()
  // Legacy client writes content directly and leaves the sha untouched.
  server.content = legacyDoc('masaüstü 0.8.0 ile düzenlendi')
  await Promise.all([a.sync.resume(), b.sync.resume()])
  await wait()
  await a.sync.resume(); await b.sync.resume()
  assert.equal(text(a.sync), 'masaüstü 0.8.0 ile düzenlendi')
  assert.equal(text(b.sync), 'masaüstü 0.8.0 ile düzenlendi')
  assert.equal(server.contentSha, await sha256(server.content))
  await a.sync.stop(); await b.sync.stop()
})

test('a device holding a stale view does not wipe text typed after another device re-seeded', async () => {
  const server = createServer()
  const a = client(server, 'a')
  const b = client(server, 'b')
  await a.sync.start(); await b.sync.start()
  addParagraph(a.sync.doc, 'eski')
  await wait()
  server.content = legacyDoc('eski sürümden')
  const stale = await b.tr.load()
  await a.sync.resume()
  await wait()
  addParagraph(a.sync.doc, 'sonradan yazıldı')
  await wait()
  const realLoad = b.tr.load
  let calls = 0
  b.tr.load = async (...args) => (calls++ === 0 ? stale : realLoad(...args))
  await b.sync.resume()
  await wait()
  assert.match(text(b.sync), /sonradan yazıldı/)
  assert.match(text(a.sync), /sonradan yazıldı/)
  await a.sync.stop(); await b.sync.stop()
})

test('compaction folds updates into the snapshot without losing content', async () => {
  const server = createServer()
  const a = client(server, 'a', { compactAfter: 5 })
  await a.sync.start()
  for (let i = 0; i < 8; i++) { addParagraph(a.sync.doc, `satır ${i}`); await wait(10) }
  await wait()
  await a.sync.resume()
  assert.ok(server.ydoc, 'snapshot written')
  assert.ok(server.updates.length < 8)
  const fresh = client(server, 'c')
  await fresh.sync.start()
  assert.equal(text(fresh.sync), Array.from({ length: 8 }, (_, i) => `satır ${i}`).join('\n'))
  await a.sync.stop(); await fresh.sync.stop()
})

test('closing a changed note records one automatic version; an untouched one records none', async () => {
  const server = createServer()
  const a = client(server, 'a')
  await a.sync.start()
  addParagraph(a.sync.doc, 'sürüm')
  await wait()
  await a.sync.stop()
  assert.equal(server.versions.length, 1)
  const b = client(server, 'b')
  await b.sync.start()
  await b.sync.stop()
  assert.equal(server.versions.length, 1)
})

test('base64 helpers round-trip large updates', () => {
  const bytes = new Uint8Array(200_000).map((_, i) => i % 251)
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes)
})
