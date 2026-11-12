/**
 * T2 action bridge: OTP auto-copy (loop / own device / age), automatic link
 * cleanup in the clipboard monitor (no re-capture loop), "Telefona gönder"
 * validation and target detection, IBAN/Alıcı/Tutar buttons.
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { buildSync } = require('esbuild')

const root = path.resolve(__dirname, '../..')

// Fake Electron clipboard: a single in-memory pasteboard with text + html.
const board = { text: '', html: '', writes: 0 }
const emptyImage = { isEmpty: () => true, toDataURL: () => '', getSize: () => ({ width: 0, height: 0 }) }
const electronMock = {
  clipboard: {
    readText: () => board.text,
    readHTML: () => board.html,
    readImage: () => emptyImage,
    read: () => '',
    readBuffer: () => Buffer.alloc(0),
    writeText: (text) => { board.text = text; board.html = ''; board.writes++ },
    write: ({ text, html }) => { board.text = text ?? ''; board.html = html ?? ''; board.writes++ },
    writeImage: () => {},
    writeBuffer: () => {},
  },
  nativeImage: { createFromDataURL: () => emptyImage, createFromBuffer: () => emptyImage },
}

const bundle = buildSync({
  stdin: {
    contents: `export * from './electron/main/actionBridge';
      export { ClipboardMonitor } from './electron/main/clipboard';
      export { validateSendToPhone } from './electron/main/sendToPhone';
      export { phoneTarget, paymentButtons } from './src/lib/clipActions';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['electron'],
  alias: { '@shared': path.join(root, 'shared'), '@': path.join(root, 'src') },
})
const loaded = { exports: {} }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  (id) => (id === 'electron' ? electronMock : require(id)), loaded, loaded.exports,
)
const {
  decideOtpAutoCopy, OtpLedger, otpNotificationBody, planLinkCleanup, OTP_MAX_AGE_MS,
  ClipboardMonitor, validateSendToPhone, phoneTarget, paymentButtons,
} = loaded.exports

const NOW = Date.parse('2026-11-12T10:00:00.000Z')
const SELF = 'user-mac'
const PHONE = 'user-iphone'
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString()
const clip = (over = {}) => ({
  id: 'clip-1', userId: PHONE, contentType: 'text',
  text: 'Doğrulama kodunuz: 482913. Kimseyle paylaşmayın.', createdAt: iso(-5_000), ...over,
})
const ctx = (over = {}) => ({
  enabled: true, selfUserId: SELF, localInsertIds: new Set(), ledger: new OtpLedger(), now: NOW, ...over,
})

// ── OTP auto-copy ────────────────────────────────────────────────────────────

test('OTP from another device within 2 minutes is copied with the expected notification', () => {
  const d = decideOtpAutoCopy(clip(), ctx())
  assert.deepEqual(d, { copy: true, code: '482913' })
  assert.equal(otpNotificationBody(d.code), 'Kod panoda: 482913')
})

test('OTP auto-copy is skipped when the setting is off', () => {
  assert.deepEqual(decideOtpAutoCopy(clip(), ctx({ enabled: false })), { copy: false, reason: 'disabled' })
})

test('OTP from this device (created_by = own user) is never auto-copied', () => {
  assert.deepEqual(decideOtpAutoCopy(clip({ userId: SELF }), ctx()), { copy: false, reason: 'self' })
})

test('OTP record this device just inserted or re-copied is skipped even if created_by differs', () => {
  const d = decideOtpAutoCopy(clip(), ctx({ localInsertIds: new Set(['clip-1']) }))
  assert.deepEqual(d, { copy: false, reason: 'local-insert' })
})

test('OTP age window: exactly 2 minutes copies, older is stale, far future is stale', () => {
  assert.equal(decideOtpAutoCopy(clip({ createdAt: iso(-OTP_MAX_AGE_MS) }), ctx()).copy, true)
  assert.deepEqual(decideOtpAutoCopy(clip({ createdAt: iso(-OTP_MAX_AGE_MS - 1) }), ctx()), { copy: false, reason: 'stale' })
  assert.deepEqual(decideOtpAutoCopy(clip({ createdAt: iso(-10 * 60_000) }), ctx()), { copy: false, reason: 'stale' })
  assert.equal(decideOtpAutoCopy(clip({ createdAt: iso(20_000) }), ctx()).copy, true, 'small clock skew tolerated')
  assert.deepEqual(decideOtpAutoCopy(clip({ createdAt: iso(5 * 60_000) }), ctx()), { copy: false, reason: 'stale' })
  assert.deepEqual(decideOtpAutoCopy(clip({ createdAt: 'not-a-date' }), ctx()), { copy: false, reason: 'stale' })
})

test('OTP: non-text records and texts without a code are ignored', () => {
  assert.deepEqual(decideOtpAutoCopy(clip({ contentType: 'image', text: 'data:image/png;base64,AAAA' }), ctx()), { copy: false, reason: 'not-text' })
  assert.deepEqual(decideOtpAutoCopy(clip({ text: 'Toplantı yarın saat 10:30 Kadıköy' }), ctx()), { copy: false, reason: 'no-code' })
})

test('OTP loop: the same code delivered twice (broadcast + postgres_changes, or another device) is copied once', () => {
  const ledger = new OtpLedger()
  const first = decideOtpAutoCopy(clip(), ctx({ ledger }))
  assert.equal(first.copy, true)
  ledger.remember('clip-1', first.code, NOW)
  assert.deepEqual(decideOtpAutoCopy(clip(), ctx({ ledger, now: NOW + 500 })), { copy: false, reason: 'duplicate' })
  assert.deepEqual(
    decideOtpAutoCopy(clip({ id: 'clip-2', userId: 'user-ipad' }), ctx({ ledger, now: NOW + 900 })),
    { copy: false, reason: 'duplicate' },
  )
  // A different, new code still goes through.
  assert.equal(decideOtpAutoCopy(clip({ id: 'clip-3', text: 'Giriş kodu 771204' }), ctx({ ledger })).copy, true)
})

test('OTP ledger forgets codes after its window, so a later legitimate resend works', () => {
  const ledger = new OtpLedger()
  ledger.remember('clip-1', '482913', NOW)
  const later = NOW + 3 * 60_000
  const d = decideOtpAutoCopy(clip({ id: 'clip-9', createdAt: new Date(later - 1000).toISOString() }), ctx({ ledger, now: later }))
  assert.equal(d.copy, true)
  assert.equal(ledger.size, 0)
})

test('OTP write through the monitor does not create a new local record (no echo loop)', async () => {
  board.text = 'önceki'; board.html = ''
  const monitor = new ClipboardMonitor({ intervalMs: 10_000 })
  const emitted = []
  monitor.on('change', (d) => emitted.push(d))
  monitor.start()
  await monitor.copy({ contentType: 'text', text: '482913', html: null })
  await monitor.tick()
  monitor.suppressEmitUntil = 0
  await monitor.tick()
  monitor.stop()
  assert.equal(board.text, '482913')
  assert.equal(emitted.length, 0)
})

// ── Link cleanup ─────────────────────────────────────────────────────────────

const DIRTY = 'Şuna bak: https://example.com/haber?id=7&utm_source=x&fbclid=abc'
const CLEAN = 'Şuna bak: https://example.com/haber?id=7'

test('planLinkCleanup: disabled, clean, non-text and formatted rich text are left alone', () => {
  assert.equal(planLinkCleanup({ contentType: 'text', text: DIRTY }, false), null)
  assert.equal(planLinkCleanup({ contentType: 'text', text: CLEAN }, true), null)
  assert.equal(planLinkCleanup({ contentType: 'image', text: DIRTY }, true), null)
  assert.equal(planLinkCleanup({ contentType: 'rich-text', text: DIRTY }, true), null)
})

test('planLinkCleanup: text and single-link rich text are cleaned; result is idempotent', () => {
  const r = planLinkCleanup({ contentType: 'text', text: DIRTY }, true)
  assert.deepEqual(r, { text: CLEAN, changed: 1 })
  assert.equal(planLinkCleanup({ contentType: 'text', text: r.text }, true), null)
  const bar = planLinkCleanup({ contentType: 'rich-text', text: 'https://youtu.be/xyz?si=TRACK' }, true)
  assert.equal(bar.text, 'https://youtu.be/xyz')
})

test('monitor rewrites a copied tracking link once, records the clean text, and never re-captures it', async () => {
  board.text = 'başlangıç'; board.html = ''
  const monitor = new ClipboardMonitor({ intervalMs: 10_000, autoCleanLinks: true })
  const emitted = []
  const cleanedEvents = []
  monitor.on('change', (d) => emitted.push(d))
  monitor.on('links-cleaned', (e) => cleanedEvents.push(e))
  monitor.start()
  board.text = DIRTY; board.html = ''
  const writesBefore = board.writes
  await monitor.tick()
  assert.equal(board.text, CLEAN, 'OS clipboard holds the cleaned link')
  assert.equal(board.writes - writesBefore, 1)
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].text, CLEAN)
  assert.equal(emitted[0].contentType, 'text')
  assert.deepEqual(cleanedEvents, [{ changed: 1 }])
  for (let i = 0; i < 5; i++) await monitor.tick()
  assert.equal(emitted.length, 1, 'rewrite is not seen as a new copy')
  // Even after the 750 ms suppression window, the hash already matches.
  monitor.suppressEmitUntil = 0
  await monitor.tick()
  assert.equal(emitted.length, 1, 'no re-capture after suppression ends')
  assert.equal(board.writes - writesBefore, 1, 'no second rewrite')
  monitor.stop()
})

test('monitor leaves links untouched when the setting is off, and toggles at runtime', async () => {
  board.text = 'x'; board.html = ''
  const monitor = new ClipboardMonitor({ intervalMs: 10_000 })
  const emitted = []
  monitor.on('change', (d) => emitted.push(d))
  monitor.start()
  board.text = DIRTY
  await monitor.tick()
  assert.equal(board.text, DIRTY)
  assert.equal(emitted[0].text, DIRTY)
  monitor.setAutoCleanLinks(true)
  board.text = DIRTY + ' '
  await monitor.tick()
  assert.equal(board.text, CLEAN + ' ')
  monitor.stop()
})

test('Temiz kopyala table write (text + html) is not re-captured by the monitor', async () => {
  board.text = 'x'; board.html = ''
  const monitor = new ClipboardMonitor({ intervalMs: 10_000 })
  const emitted = []
  monitor.on('change', (d) => emitted.push(d))
  monitor.start()
  await monitor.copy({ contentType: 'rich-text', text: 'Ad\tPuan\nAyşe\t90', html: '<table><tr><td>Ad</td></tr></table>' })
  assert.equal(board.text, 'Ad\tPuan\nAyşe\t90')
  assert.match(board.html, /<table>/)
  await monitor.tick()
  assert.equal(emitted.length, 0)
  monitor.stop()
})

// ── Telefona gönder ──────────────────────────────────────────────────────────

test('phoneTarget picks IBAN, address, phone or link; plain text gets nothing', () => {
  assert.deepEqual(phoneTarget('Alıcı: Ayşe Yılmaz\nIBAN: TR33 0006 1005 1978 6457 8413 26'), {
    kind: 'iban', payload: 'TR330006100519786457841326', label: 'IBAN · Ayşe Yılmaz',
  })
  assert.equal(phoneTarget('Moda Mah. Bahariye Cad. No: 12 Kadıköy İstanbul').kind, 'address')
  assert.deepEqual(phoneTarget('Beni ara: 0532 123 45 67'), { kind: 'phone', payload: '+905321234567', label: 'Telefon numarası' })
  assert.deepEqual(phoneTarget('Bak: https://www.example.com.tr/urun/42).'), { kind: 'url', payload: 'https://www.example.com.tr/urun/42', label: 'example.com.tr' })
  assert.equal(phoneTarget('Akşam yemeği için makarna al'), null)
  assert.equal(phoneTarget('   '), null)
})

test('validateSendToPhone whitelists kinds, trims and caps payload, and rejects non-http links', () => {
  assert.deepEqual(validateSendToPhone({ kind: 'phone', payload: ' +905321234567 ', label: 'Telefon', clipId: 'c' }), {
    ok: true, data: { kind: 'phone', payload: '+905321234567', label: 'Telefon', clipId: 'c' },
  })
  assert.equal(validateSendToPhone({ kind: 'sql', payload: 'x' }).ok, false)
  assert.equal(validateSendToPhone({ kind: 'text', payload: '   ' }).ok, false)
  assert.equal(validateSendToPhone({ kind: 'text', payload: 'a'.repeat(2001) }).ok, false)
  assert.equal(validateSendToPhone({ kind: 'text', payload: 'a'.repeat(2000) }).ok, true)
  assert.equal(validateSendToPhone({ kind: 'url', payload: 'javascript:alert(1)' }).ok, false)
  assert.equal(validateSendToPhone(null).ok, false)
})

// ── IBAN / Alıcı / Tutar ─────────────────────────────────────────────────────

test('paymentButtons exposes IBAN (compact), recipient and amount; lone amount shows nothing', () => {
  const buttons = paymentButtons('Alıcı: Ayşe Yılmaz\nIBAN: TR33 0006 1005 1978 6457 8413 26\nTutar: 1.250,00 TL')
  assert.deepEqual(buttons.map((b) => [b.id, b.label, b.value]), [
    ['iban', 'IBAN', 'TR330006100519786457841326'],
    ['recipient', 'Alıcı', 'Ayşe Yılmaz'],
    ['amount', 'Tutar', '1.250,00'],
  ])
  assert.deepEqual(paymentButtons('Kahve 250 TL'), [])
  assert.deepEqual(paymentButtons('merhaba'), [])
})

// ── Card rendering ───────────────────────────────────────────────────────────

test('clip card shows Temiz kopyala, payment buttons and Telefona gönder only where they apply', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const ui = buildSync({
    stdin: { contents: `export { ClipboardCard } from './src/components/ClipboardCard';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': path.join(root, 'src'), '@shared': path.join(root, 'shared') },
    loader: { '.svg': 'dataurl' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', ui.outputFiles[0].text)(require, mod, mod.exports)
  const noop = () => {}
  const render = (over) => renderToStaticMarkup(React.createElement(mod.exports.ClipboardCard, {
    item: { id: 'c1', userId: 'u', contentType: 'text', text: '', hash: 'h', pinned: false, ai: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), synced: true, ...over },
    onCopy: noop, onPin: noop, onPromote: noop, onDelete: noop, onReenrich: noop,
  }))
  const payment = render({ text: 'Alıcı: Ayşe Yılmaz\nIBAN: TR33 0006 1005 1978 6457 8413 26\nTutar: 1.250,00 TL', ai: { summary: '', tags: ['sensitive'], provider: 'none' } })
  assert.match(payment, /IBAN kopyala/)
  assert.match(payment, /Alıcı kopyala/)
  assert.match(payment, /Tutar kopyala/)
  assert.match(payment, /Telefona gönder/)
  assert.doesNotMatch(payment, /TR330006100519786457841326/, 'hidden sensitive values stay out of tooltips')
  const table = render({ text: '| A | B |\n|---|---|\n| 1 | 2 |' })
  assert.match(table, /Temiz kopyala/)
  assert.doesNotMatch(table, /Telefona gönder/)
  const plain = render({ text: 'Akşam makarna al' })
  assert.doesNotMatch(plain, /data-clip-actions/)
  const image = render({ contentType: 'image', text: 'data:image/png;base64,AAAA' })
  assert.doesNotMatch(image, /data-clip-actions/)
})
