// Prints launch arguments for the simulator Dynamic Island check (AppDelegate, DEBUG only):
// a throwaway personal key, a space key sealed with it, and sealed names, exactly as the server sends them.
// Usage: node scripts/dev/island-demo.cjs "Ev" "Market listesi" "Ayşe"
const path = require('node:path')
const jiti = require('jiti')(__filename, { interopDefault: true })
const e = jiti(path.join(__dirname, '../../shared/crypto/e2e.ts'))
;(async () => {
  const [space = 'Ev', title = 'Market listesi', author = 'Ayşe'] = process.argv.slice(2)
  const personId = crypto.randomUUID(), spaceId = crypto.randomUUID(), noteId = crypto.randomUUID(), authorId = crypto.randomUUID()
  const personalRaw = e.newWorkspaceKey(), spaceRaw = e.newWorkspaceKey()
  const pk = await e.deriveWorkspaceKeys(personId, personalRaw)
  const sk = await e.deriveWorkspaceKeys(spaceId, spaceRaw)
  const args = [
    personId, e.toBase64(personalRaw), spaceId,
    await e.encryptField(pk, { table: 'space_members', row: spaceId, column: 'key' }, e.toBase64(spaceRaw)),
    await e.encryptField(sk, { table: 'workspaces', row: spaceId, column: 'name' }, space),
    noteId,
    await e.encryptField(sk, { table: 'notes', row: noteId, column: 'title' }, title),
    await e.encryptField(sk, { table: 'space_members', row: authorId, column: 'display_name' }, author),
    authorId,
  ]
  console.log(args.join(' '))
})()
