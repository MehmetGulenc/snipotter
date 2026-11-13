// node --test scripts/tests/note-organize.test.cjs — tags, links, notebooks, search (shared/notes/organize.ts)
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const jiti = require('jiti')(__filename, { interopDefault: true })
const o = jiti(path.join(__dirname, '../../shared/notes/organize.ts'))

const doc = (...paras) => JSON.stringify({ type: 'doc', content: paras.map((p) => ({ type: 'paragraph', content: Array.isArray(p) ? p : [{ type: 'text', text: p }] })) })
const link = (text, id) => ({ type: 'text', text, marks: [{ type: 'link', attrs: { href: o.noteLinkHref(id) } }] })
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

test('tags: Turkish letters, lower-cased with Turkish rules, deduplicated, no URL fragments or headings', () => {
  assert.deepEqual(o.noteTags(doc('Bugün #Alışveriş ve #İŞ-planı', 'yine #alışveriş, (#proje_x)'), 'Başlık #Toplantı'), ['toplantı', 'alışveriş', 'iş-planı', 'proje_x'])
  assert.deepEqual(o.noteTags(doc('https://site.test/#bolum ve #1 ve a#b')), [])
})

test('tag counts across notes, most used first', () => {
  const counts = o.tagCounts([{ content: doc('#iş #ev') }, { content: doc('#iş') }])
  assert.deepEqual(counts, [{ tag: 'iş', count: 2 }, { tag: 'ev', count: 1 }])
})

test('note links survive as link marks and produce backlinks', () => {
  assert.equal(o.noteIdFromHref(o.noteLinkHref(A)), A)
  assert.equal(o.noteIdFromHref('https://snipotter.com/note/' + A), null)
  const notes = [
    { id: A, content: doc('hedef') },
    { id: B, content: doc(['bkz. ', link('Hedef not', A)]) },
  ]
  assert.deepEqual(o.linkedNoteIds(notes[1].content), [A])
  assert.deepEqual(o.backlinks(notes, A).map((n) => n.id), [B])
  assert.deepEqual(o.backlinks(notes, B), [])
})

test('notebook tree: nesting, ordering, orphans as roots, cycles cut', () => {
  const nb = [
    { id: 'c', parentId: 'a', name: 'Toplantılar', sort: 0 },
    { id: 'a', parentId: null, name: 'İş', sort: 1 },
    { id: 'b', parentId: null, name: 'Ev', sort: 0 },
    { id: 'o', parentId: 'missing', name: 'Yetim', sort: 2 },
    { id: 'x', parentId: 'y', name: 'X', sort: 0 },
    { id: 'y', parentId: 'x', name: 'Y', sort: 0 },
  ]
  const tree = o.notebookTree(nb)
  assert.deepEqual(tree.map((n) => n.notebook.id), ['b', 'a', 'o'])
  assert.deepEqual(tree[1].children.map((n) => [n.notebook.id, n.depth]), [['c', 1]])
  assert.deepEqual([...o.notebookAndDescendants(nb, 'a')].sort(), ['a', 'c'])
  assert.equal(o.notebookPath(nb, 'c'), 'İş › Toplantılar')
})

test('search: every word must match, accents and case ignored, title outranks body, #tag filters', () => {
  const notes = [
    { id: 1, title: 'Şirket toplantısı', content: doc('bütçe konuşuldu #iş'), updatedAt: '2026-01-01' },
    { id: 2, title: 'Alışveriş', content: doc('toplantı sonrası süt al'), updatedAt: '2026-02-01' },
    { id: 3, title: 'Tatil', content: doc('deniz'), updatedAt: '2026-03-01' },
  ]
  assert.deepEqual(o.searchNotes(notes, 'TOPLANTI').map((h) => h.note.id), [1, 2])
  assert.deepEqual(o.searchNotes(notes, 'sirket butce').map((h) => h.note.id), [1])
  assert.deepEqual(o.searchNotes(notes, '#iş').map((h) => h.note.id), [1])
  assert.deepEqual(o.searchNotes(notes, 'toplantı #iş').map((h) => h.note.id), [1])
  assert.deepEqual(o.searchNotes(notes, 'yok'), [])
  const hit = o.searchNotes(notes, 'süt')[0]
  assert.equal(hit.snippet.slice(...hit.ranges[0]), 'süt')
})

test('search excerpt starts near the first match in long notes', () => {
  const long = 'giriş '.repeat(80) + 'ANAHTAR kelime burada'
  const { snippet, ranges } = o.excerpt(long, ['anahtar'])
  assert.ok(snippet.startsWith('…'))
  assert.equal(snippet.slice(...ranges[0]), 'ANAHTAR')
})
