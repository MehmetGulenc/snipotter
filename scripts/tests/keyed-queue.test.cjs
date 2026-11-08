const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../../shared/keyedQueue.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const loaded = { exports: {} }
new Function('exports', compiled.outputText)(loaded.exports)
const { createKeyedQueue } = loaded.exports

test('same-note writes wait and retain submission order', async () => {
  const enqueue = createKeyedQueue()
  const events = []
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const first = enqueue('note', async () => {
    events.push('first-start')
    await gate
    events.push('first-end')
  })
  const second = enqueue('note', async () => { events.push('second') })
  await new Promise(setImmediate)
  assert.deepEqual(events, ['first-start'])
  release()
  await Promise.all([first, second])
  assert.deepEqual(events, ['first-start', 'first-end', 'second'])
})

test('a failed write does not block later writes', async () => {
  const enqueue = createKeyedQueue()
  const first = enqueue('note', async () => { throw new Error('offline') })
  const second = enqueue('note', async () => 'saved')
  await assert.rejects(first, /offline/)
  assert.equal(await second, 'saved')
})

test('different notes can save independently', async () => {
  const enqueue = createKeyedQueue()
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const first = enqueue('a', () => gate)
  assert.equal(await enqueue('b', async () => 'saved'), 'saved')
  release()
  await first
})
