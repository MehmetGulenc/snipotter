// node --test scripts/tests/note-blocks.test.cjs — block moving, task sinking, slash filter
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const jiti = require('jiti')(__filename, { interopDefault: true })
const { getSchema } = require('@tiptap/core')
const { EditorState, TextSelection } = require('@tiptap/pm/state')
const StarterKit = require('@tiptap/starter-kit').default
const TaskList = require('@tiptap/extension-task-list').default
const TaskItem = require('@tiptap/extension-task-item').default
const { ySyncPluginKey } = require('@tiptap/y-tiptap')
const { moveBlock, sinkCompletedTask } = jiti(path.join(__dirname, '../../shared/notes/blocks.ts'))
const { slashCommands, filterCommands, NOTE_TEMPLATES } = jiti(path.join(__dirname, '../../shared/notes/templates.ts'))

const schema = getSchema([StarterKit, TaskList, TaskItem])
const p = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
const task = (t, checked = false) => ({ type: 'taskItem', attrs: { checked }, content: [p(t)] })
const stateOf = (content, find) => {
  const doc = schema.nodeFromJSON({ type: 'doc', content })
  let at = 1
  doc.descendants((n, pos) => { if (n.isText && n.text === find) at = pos + 1 })
  return EditorState.create({ doc, selection: TextSelection.create(doc, at) })
}
const texts = (doc) => { const out = []; doc.descendants((n) => { if (n.isText) out.push(n.text) }); return out }

test('top-level block moves down and up, cursor stays in it, edges refuse', () => {
  const s = stateOf([p('a'), p('b'), p('c')], 'a')
  const down = s.apply(moveBlock(s, 1))
  assert.deepEqual(texts(down.doc), ['b', 'a', 'c'])
  assert.equal(down.selection.$from.parent.textContent, 'a')
  assert.deepEqual(texts(down.apply(moveBlock(down, -1)).doc), ['a', 'b', 'c'])
  assert.equal(moveBlock(s, -1), null)
})

test('inside a list only the item moves, within its list', () => {
  const s = stateOf([p('üst'), { type: 'bulletList', content: ['bir', 'iki'].map((t) => ({ type: 'listItem', content: [p(t)] })) }], 'iki')
  assert.deepEqual(texts(s.apply(moveBlock(s, -1)).doc), ['üst', 'iki', 'bir'])
  assert.equal(moveBlock(s, 1), null)
})

const tick = (s, text) => {
  let pos = -1
  s.doc.descendants((n, at) => { if (n.type.name === 'taskItem' && n.textContent === text) pos = at })
  return s.tr.setNodeMarkup(pos, undefined, { checked: true })
}

test('ticking a task sinks it below the unticked ones; the last one stays', () => {
  const s = stateOf([{ type: 'taskList', content: [task('süt'), task('ekmek'), task('çay', true)] }], 'süt')
  const tr = tick(s, 'süt')
  const next = s.apply(tr)
  const sink = sinkCompletedTask([tr], s, next)
  assert.deepEqual(texts(next.apply(sink).doc), ['ekmek', 'süt', 'çay'])
  const tr2 = tick(s, 'ekmek')
  assert.equal(sinkCompletedTask([tr2], s, s.apply(tr2)), null)
})

test('remote ticks and ordinary typing never trigger a move', () => {
  const s = stateOf([{ type: 'taskList', content: [task('süt'), task('ekmek')] }], 'süt')
  const remote = tick(s, 'süt').setMeta(ySyncPluginKey, { isChangeOrigin: true })
  assert.equal(sinkCompletedTask([remote], s, s.apply(remote)), null)
  const typing = s.tr.insertText('x')
  assert.equal(sinkCompletedTask([typing], s, s.apply(typing)), null)
})

test('slash filter: Turkish folding, every word must match, templates build valid content', () => {
  const cmds = slashCommands({ pickImage() {}, linkNote() {} })
  assert.deepEqual(filterCommands(cmds, 'BAŞLIK 2').map((c) => c.id), ['h2'])
  assert.ok(filterCommands(cmds, 'sablon').length === NOTE_TEMPLATES.length)
  assert.deepEqual(filterCommands(cmds, 'yokboyle'), [])
  for (const t of NOTE_TEMPLATES) schema.nodeFromJSON({ type: 'doc', content: t.build() }).check()
})
