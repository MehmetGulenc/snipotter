/**
 * Fails (exit 1) if the compiled bundle in out/ contains an Anthropic or
 * Gemini API key. Used as a gate by scripts/build-mas.cjs so a Mac App Store
 * build can never ship with provider keys baked into the asar.
 *
 * Checks two things:
 *   1. Well-known key shapes (sk-ant-…, AIza…), so keys are caught even when
 *      they come from the shell environment rather than .env.
 *   2. The literal values of MAIN_VITE_ANTHROPIC_API_KEY / MAIN_VITE_GEMINI_API_KEY
 *      from .env and the current environment, so a key with an unusual shape
 *      is still caught.
 *
 * Usage: node scripts/check-no-embedded-keys.cjs [dir=out]
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const target = path.resolve(ROOT, process.argv[2] || 'out')
const KEY_NAMES = ['MAIN_VITE_ANTHROPIC_API_KEY', 'MAIN_VITE_GEMINI_API_KEY']
const PATTERNS = [
  { name: 'Anthropic key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
]

function readDotEnvValues() {
  const values = []
  for (const file of ['.env', '.env.production', '.env.local', '.env.production.local']) {
    const p = path.join(ROOT, file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m || !KEY_NAMES.includes(m[1])) continue
      const v = m[2].replace(/^['"]|['"]$/g, '').trim()
      if (v) values.push(v)
    }
  }
  return values
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else if (entry.isFile()) yield p
  }
}

if (!fs.existsSync(target)) {
  console.error(`[check-keys] ${path.relative(ROOT, target)} yok — önce build çalıştırın.`)
  process.exit(1)
}

const literals = [
  ...readDotEnvValues(),
  ...KEY_NAMES.map((k) => process.env[k]).filter((v) => typeof v === 'string' && v.length > 0),
].filter((v) => v.length >= 16)

const hits = []
let scanned = 0
for (const file of walk(target)) {
  const content = fs.readFileSync(file, 'latin1')
  scanned++
  for (const { name, re } of PATTERNS) {
    if (re.test(content)) hits.push(`${path.relative(ROOT, file)}: ${name} kalıbı`)
  }
  for (const value of literals) {
    if (content.includes(value)) hits.push(`${path.relative(ROOT, file)}: .env/ortamdaki API anahtarı değeri`)
  }
}

if (hits.length > 0) {
  console.error('[check-keys] HATA: derlenmiş pakette AI API anahtarı bulundu:')
  for (const h of [...new Set(hits)]) console.error('  - ' + h)
  process.exit(1)
}
console.log(
  `[check-keys] OK — ${scanned} dosya tarandı (${path.relative(ROOT, target)}), gömülü Anthropic/Gemini anahtarı yok` +
    ` (${literals.length} bilinen değer + ${PATTERNS.length} kalıp kontrol edildi).`,
)
