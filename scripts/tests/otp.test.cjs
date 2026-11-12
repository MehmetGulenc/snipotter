const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../../shared/otp.ts'), 'utf8')
const loaded = { exports: {} }
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(loaded.exports)

const { detectOtp } = loaded.exports
for (const [text, expected] of [
 ['Doğrulama kodunuz: 482 913. Kimseyle paylaşmayın.', '482913'],
 ['Giriş kodu: 482-913', '482913'], ['739120', '739120'], [' 1234 ', '1234'],
 ['Onay şifresi 99887766', '99887766'], ['Your verification code: 8234', '8234'],
 ['OTP: 9384', '9384'], ['PIN 8291', '8291'], ['kod 2026', null],
 ['2026 yılında toplantı', null], ['Sipariş 482913', null], ['123', null],
 ['123456789', null], ['Kod +905321234567', null], ['Kod '+ 'x'.repeat(301)+' 482913', null],
 ['', null], ['Kod gelmedi', null], ['tek kullanımlık 456789', '456789'],
]) test(`OTP ${JSON.stringify(text).slice(0, 70)}`, () => assert.equal(detectOtp(text), expected))
