import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const api = ts.transpileModule(read('src/lib/api.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const loadApi = (rpcError) => {
  const calls = []
  const client = {
    rpc: async (...args) => { calls.push(['rpc', ...args]); return { error: rpcError } },
    auth: { signOut: async (...args) => { calls.push(['signOut', ...args]); return { error: null } } },
  }
  const exports = {}
  vm.runInNewContext(api, {
    exports,
    require: (name) => {
      assert.equal(name, './supabase')
      return { getSupabase: () => client }
    },
    window: { localStorage: { removeItem: (key) => calls.push(['removeItem', key]) } },
  })
  return { exports, calls }
}

const success = loadApi(null)
await success.exports.deleteOwnAccount()
assert.deepEqual(success.calls.map((c) => c[0]), ['rpc', 'signOut', 'removeItem'])
assert.deepEqual(success.calls[0], ['rpc', 'delete_own_account'])
assert.equal(success.calls[1][1].scope, 'local')
assert.equal(success.calls[2][1], 'snipotter.web.session')
console.log('PASS account deletion: parameterless RPC; clear session only after success')

const failure = new Error('RPC unavailable or permission denied')
const denied = loadApi(failure)
await assert.rejects(() => denied.exports.deleteOwnAccount(), (error) => error === failure)
assert.deepEqual(denied.calls, [['rpc', 'delete_own_account']])
console.log('PASS account deletion: failure preserves session and propagates error')

const sql = read('../../supabase/migrations/0008_delete_own_account.sql')
assert.match(sql, /function public\.delete_own_account\(\)/)
assert.match(sql, /security definer/)
assert.match(sql, /set search_path = ''/)
assert.match(sql, /caller uuid := auth\.uid\(\)/)
assert.match(sql, /if caller is null then[\s\S]*errcode = '42501'/)
assert.match(sql, /delete from auth\.users where id = caller;/)
assert.match(sql, /revoke all on function public\.delete_own_account\(\) from public, anon, authenticated;/)
assert.match(sql, /grant execute on function public\.delete_own_account\(\) to authenticated;/)
assert.match(sql, /delete from public\.notes where created_by = caller;/)
assert.match(sql, /delete from public\.clipboard_items where created_by = caller;/)
assert.doesNotMatch(sql, /delete from public\.workspaces/)
console.log('PASS SQL static authorization contract (not a database execution test)')

const mobile = read('src/lib/mobile.ts')
assert.equal((mobile.match(/Clipboard\.read\(/g) || []).length, 1)
assert.match(mobile, /export async function saveClipboardFromUserAction[\s\S]*Clipboard\.read\(/)
// Launch/resume reads happen only while the user has switched automatic saving on (off by default).
assert.match(mobile, /if \(running \|\| !\(await isAutoCaptureEnabled\(\)\)\) return/)
assert.match(mobile, /return value === '1'/)
const library = read('src/components/Library.tsx')
assert.match(library, /onClick=\{onSaveClipboard\}/)
const settings = read('src/components/Settings.tsx')
assert.match(settings, /onClick=\{[^}]*onDeleteAccount\}/)
assert.match(settings, /confirmDialog\(\{\s*title: 'Hesabın/)
console.log('PASS clipboard: read on an explicit tap, or on launch/resume only when the user opted in')
