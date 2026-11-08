/**
 * Mac App Store build.
 *
 *   npm run build:mas       → electron-builder --mac mas --universal   (dist/mas-universal/*.pkg)
 *   npm run build:mas-dev   → electron-builder --mac mas-dev            (dist/mas-dev-<arch>/Snipotter.app)
 *
 * Extra arguments are forwarded to electron-builder (e.g. `npm run build:mas-dev -- --arm64`).
 *
 * Steps:
 *   1. Regenerate icons.
 *   2. electron-vite build with the Anthropic/Gemini keys forced empty. Vite's
 *      loadEnv lets process.env override .env, so the MAS bundle never contains
 *      the provider keys and AIService starts disabled.
 *   3. Scan out/ for any leaked key (scripts/check-no-embedded-keys.cjs) — abort if found.
 *   4. electron-builder for the mas / mas-dev target.
 *
 * Environment:
 *   MAS_PROVISIONING_PROFILE      path to the "Mac App Store" distribution .provisionprofile (mas)
 *   MAS_DEV_PROVISIONING_PROFILE  path to the "macOS App Development" .provisionprofile (mas-dev)
 *   CSC_NAME                      optional signing identity name (otherwise auto-discovered
 *                                 from the keychain: Apple Distribution / Apple Development)
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const isDev = args.includes('--dev')
const passthrough = args.filter((a) => a !== '--dev')
const target = isDev ? 'mas-dev' : 'mas'
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

if (process.platform !== 'darwin') {
  console.error('[build-mas] Mac App Store build yalnızca macOS üzerinde yapılabilir.')
  process.exit(1)
}

const env = {
  ...process.env,
  SNIPOTTER_BUILD_TARGET: 'mas',
  MAIN_VITE_ANTHROPIC_API_KEY: '',
  MAIN_VITE_GEMINI_API_KEY: '',
}

function run(cmd, cmdArgs) {
  console.log(`[build-mas] $ ${cmd} ${cmdArgs.join(' ')}`)
  execFileSync(cmd, cmdArgs, { cwd: ROOT, env, stdio: 'inherit' })
}

run(process.execPath, ['scripts/generate-icons.cjs'])
run(npx, ['electron-vite', 'build'])
run(process.execPath, ['scripts/check-no-embedded-keys.cjs', 'out'])

const profileVar = isDev ? 'MAS_DEV_PROVISIONING_PROFILE' : 'MAS_PROVISIONING_PROFILE'
const profileKey = isDev ? 'masDev' : 'mas'
const profile = process.env[profileVar]
const builderArgs = ['electron-builder', '--mac', target, '--publish', 'never']
if (!isDev && !passthrough.some((a) => /^--(x64|arm64|universal)$/.test(a))) {
  builderArgs.push('--universal')
}
if (profile) {
  const abs = path.resolve(ROOT, profile)
  if (!fs.existsSync(abs)) {
    console.error(`[build-mas] ${profileVar} bulunamadı: ${abs}`)
    process.exit(1)
  }
  builderArgs.push(`-c.${profileKey}.provisioningProfile=${abs}`)
} else {
  console.warn(
    `[build-mas] UYARI: ${profileVar} ayarlı değil. Provisioning profile olmadan imzalanan ` +
      'MAS uygulaması App Group entitlement nedeniyle açılmaz ve App Store Connect tarafından reddedilir.',
  )
}
run(npx, [...builderArgs, ...passthrough])
