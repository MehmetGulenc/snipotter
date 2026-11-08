const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../../electron/main/supabase.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } })
const loaded = { exports: {} }
new Function('require', 'exports', compiled.outputText)((id) => id === './store' ? { authStorage: {} } : require(id), loaded.exports)
const { SupabaseService } = loaded.exports

function setup() {
  const service = new SupabaseService({})
  const row = { id: 'old', workspace_id: 'workspace', content_type: 'text', text: '', pinned: true, created_at: '2026-01-01', updated_at: '2026-01-01' }
  let update
  const filters = []
  const query = {
    update(value) { update = value; return query },
    eq(key, value) { filters.push([key, value]); return query },
    select() { return query },
    async single() { return { data: { ...row, ...update }, error: null } },
  }
  service.client = { from: () => query }
  service.workspaceId = 'workspace'
  return { service, getUpdate: () => update, filters }
}

test('recopy repairs a legacy text record into a file and preserves its pin and identity', async () => {
  const { service, getUpdate, filters } = setup()
  const text = 'data:application/pdf;name=report.pdf;base64,JVBERi0xLjc='
  const result = await service.touchClipboard('old', { contentType: 'file', text, html: null, ai: null })
  assert.equal(result.contentType, 'file')
  assert.equal(result.text, text)
  assert.equal(result.id, 'old')
  assert.equal(result.pinned, true)
  assert.equal(result.synced, true)
  assert.equal(getUpdate().ai, null)
  assert.equal('pinned' in getUpdate(), false)
  assert.deepEqual(filters, [['id', 'old'], ['workspace_id', 'workspace']])
})

test('ordinary copy keeps the existing content and only refreshes its date', async () => {
  const { service, getUpdate } = setup()
  const result = await service.touchClipboard('old')
  assert.equal(result.contentType, 'text')
  assert.deepEqual(Object.keys(getUpdate()), ['created_at'])
})
