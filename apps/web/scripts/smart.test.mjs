// node --test scripts/smart.test.mjs — on-device clip recognition (src/lib/smart.ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/smart.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = { exports: {} }
const otpSource = readFileSync(new URL('../../../shared/otp.ts', import.meta.url), 'utf8')
const otpModule = { exports: {} }
new Function('exports', ts.transpileModule(otpSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(otpModule.exports)
new Function('module', 'exports', 'require', js)(mod, mod.exports, (id) => {
  assert.equal(id, '@shared/otp')
  return otpModule.exports
})
const { analyze, validIban, detectEvent, otpExpired } = mod.exports

const kinds = (text, now) => analyze(text, now).actions.map((a) => a.kind)
// Thursday 12 Nov 2026, 10:00 local time
const NOW = new Date(2026, 10, 12, 10, 0)

test('Turkish IBAN with spaces is validated and the bank named', () => {
  const info = analyze('Kira için: TR81 0006 2000 0000 0123 4567 89 Ahmet Y.')
  const iban = info.actions.find((a) => a.kind === 'iban')
  assert.equal(iban.value, 'TR810006200000000123456789')
  assert.equal(iban.detail, 'Garanti BBVA')
  assert.equal(validIban('TR810006200000000123456788'), false)
})

test('mobile numbers get call and WhatsApp, landlines only call', () => {
  const mobile = analyze('Kurye: 0532 123 45 67').actions
  assert.deepEqual(mobile.map((a) => a.label), ['Ara', 'WhatsApp'])
  assert.equal(mobile[0].href, 'tel:+905321234567')
  assert.equal(mobile[1].href, 'https://wa.me/905321234567')
  assert.deepEqual(analyze('Ofis: 0212 555 44 33').actions.map((a) => a.label), ['Ara'])
})

test('one-time codes are recognised and never mistaken for phone numbers', () => {
  assert.equal(analyze('Doğrulama kodunuz: 482 913. Kimseyle paylaşmayın.').otp, '482913')
  assert.equal(analyze('739120').otp, '739120')
  assert.equal(analyze('2026 yılında 3 toplantı').otp, undefined)
  assert.ok(!kinds('Giriş kodu 5821').includes('phone'))
})

test('one-time codes expire after ten minutes', () => {
  const now = Date.now()
  assert.equal(otpExpired(new Date(now - 9 * 60 * 1000).toISOString(), now), false)
  assert.equal(otpExpired(new Date(now - 11 * 60 * 1000).toISOString(), now), true)
})

test('links, e-mail and parcel tracking numbers', () => {
  const link = analyze('Bak: https://www.snipotter.com/yenilikler').actions[0]
  assert.equal(link.detail, 'snipotter.com')
  assert.ok(kinds('yaz: destek@snipotter.com').includes('email'))
  const ups = analyze('1Z999AA10123456784').actions[0]
  assert.equal(ups.detail, 'UPS')
  assert.equal(analyze('PTT gönderi: RR123456789TR').actions.find((a) => a.kind === 'tracking').detail, 'PTT')
  assert.ok(kinds('Kargo takip no: 4821 7730 5519').includes('tracking'))
})

test('Wi-Fi details are hidden and the password extracted', () => {
  const qr = analyze('WIFI:T:WPA;S:Kafe_Misafir;P:cay1234;;')
  assert.equal(qr.sensitive, true)
  assert.equal(qr.actions[0].value, 'cay1234')
  assert.equal(analyze('Wi-Fi: Kafe_Misafir şifre: masa12').actions[0].value, 'masa12')
})

test('addresses need at least two address hints', () => {
  assert.ok(kinds('Bağdat Cad. No: 12 Kadıköy').includes('address'))
  assert.ok(!kinds('Caddede yürüdük').includes('address'))
})

test('Turkish dates become calendar events with a clean title', () => {
  const named = detectEvent('14 Mayıs 16:00 · Yeditepe diş', NOW)
  assert.equal(new Date(named.start).toISOString(), new Date(2027, 4, 14, 16, 0).toISOString())
  assert.equal(named.title, 'Yeditepe diş')

  const weekday = detectEvent('Toplantı notu: Perşembe 14:00 — tasarım incelemesi', NOW)
  assert.equal(new Date(weekday.start).getDate(), 12)
  assert.equal(new Date(weekday.start).getHours(), 14)

  const pastToday = detectEvent('Perşembe 09:00 kahvaltı', NOW)
  assert.equal(new Date(pastToday.start).getDate(), 19)

  const tomorrow = detectEvent('yarın 10:30 dişçi', NOW)
  assert.equal(new Date(tomorrow.start).getDate(), 13)
  assert.equal(detectEvent('Perşembe günü görüşürüz', NOW), null)
  assert.equal(new Date(detectEvent('Teslim 20.11.2026', NOW).start).getHours(), 9)
})

test('plain notes get no actions', () => {
  assert.deepEqual(kinds('Alışveriş: süt, yumurta, kahve'), [])
})
