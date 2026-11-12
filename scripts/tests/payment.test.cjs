const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../../shared/payment.ts'), 'utf8')
const loaded = { exports: {} }
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(loaded.exports)

const { removeInvisible, extractPayment: payment } = loaded.exports
const iban = 'TR810006200000000123456789'
const cases = [
 ['görünmez karakterler', () => assert.equal(removeInvisible('İ\u200bpe\u200fk\ufeff'), 'İpek')],
 ['boşluk korunur', () => assert.equal(removeInvisible('İpek Yılmaz\nÇay'), 'İpek Yılmaz\nÇay')],
 ['Türk IBAN', () => assert.deepEqual(payment('TR81 0006 2000 0000 0123 4567 89'), { iban, ibanFormatted: 'TR81 0006 2000 0000 0123 4567 89' })],
 ['küçük harf IBAN', () => assert.equal(payment(iban.toLowerCase()).iban, iban)],
 ['görünmez IBAN', () => assert.equal(payment('TR81\u200b0006200000000123456789').iban, iban)],
 ['mod97 hatası', () => assert.equal(payment('TR810006200000000123456788'), null)],
 ['kısa IBAN', () => assert.equal(payment('TR8100062000000001234567'), null)],
 ['Alman IBAN', () => assert.equal(payment('DE89 3704 0044 0532 0130 00').iban, 'DE89370400440532013000')],
 ['İngiliz IBAN', () => assert.equal(payment('GB82 WEST 1234 5698 7654 32').iban, 'GB82WEST12345698765432')],
 ['alıcı', () => assert.equal(payment('Alıcı: İpek Şahin').recipient, 'İpek Şahin')],
 ['hesap sahibi', () => assert.equal(payment('Hesap sahibi: Çağrı Öztürk\nNot: kira').recipient, 'Çağrı Öztürk')],
 ['aynı satır alanları', () => assert.equal(payment('Alıcı: İpek Yılmaz Tutar: 1.250,50 TL').recipient, 'İpek Yılmaz')],
 ['Türkçe tutar', () => assert.deepEqual(payment('Tutar: 1.250,50 TL'), { amount: '1.250,50', currency: 'TRY' })],
 ['lira simgesi', () => assert.deepEqual(payment('₺250,50'), { amount: '250,50', currency: 'TRY' })],
 ['avro', () => assert.deepEqual(payment('Tutar: €12,50'), { amount: '12,50', currency: 'EUR' })],
 ['dolar', () => assert.deepEqual(payment('$12.50'), { amount: '12.50', currency: 'USD' })],
 ['yalnız tutar', () => assert.deepEqual(payment('Tutar: 150'), { amount: '150' })],
 ['sıradan sayı değil', () => assert.equal(payment('Bugün 150 kişi geldi'), null)],
 ['birleşik ödeme', () => { const p = payment(`Alıcı: İpek Yılmaz\nIBAN: ${iban}\nTutar: 2.000,00 TRY`); assert.equal(p.iban, iban); assert.equal(p.recipient, 'İpek Yılmaz'); assert.equal(p.amount, '2.000,00') }],
 ['uzun IBAN reddi', () => assert.equal(payment(iban + '1'), null)],
 ['bitişik harf reddi', () => assert.equal(payment(iban + 'A'), null)],
 ['sonrasında alıcı adı', () => assert.equal(payment(iban + ' İpek Yılmaz').iban, iban)],
 ['boş metin', () => assert.equal(payment(''), null)],
]
for (const [name, run] of cases) test(name, run)

const reviewIban = 'TR33 0006 1005 1978 6457 8413 26'
for (const [text, expected] of [
 [`Ahmet Yılmaz\n${reviewIban}\n500 TL`, 'Ahmet Yılmaz'],
 [`IBAN: ${reviewIban} Ahmet Yılmaz`, 'Ahmet Yılmaz'],
 [`Hesap adı: Mehmet Kaya, IBAN ${reviewIban}`, 'Mehmet Kaya'],
 [`Ahmet Yılmaz adına ${reviewIban} hesabına`, 'Ahmet Yılmaz'],
 [`IBAN: ${reviewIban}\nÇağrı Öztürk`, 'Çağrı Öztürk'],
 [`Merhaba\n${reviewIban}`, undefined],
 [`Selam arkadaşlar\n${reviewIban}`, undefined],
 [`Garanti BBVA\n${reviewIban}`, undefined],
 [`Türkiye İş Bankası\n${reviewIban}`, undefined],
 [`Ahmet Yılmaz 123\n${reviewIban}`, undefined],
 [`Ahmet\n${reviewIban}`, undefined],
 [`Bir İki Üç Dört Beş Altı\n${reviewIban}`, undefined],
 [`IBAN: ${reviewIban}\n500 TL`, undefined],
 [`Merhaba Ahmet\n${reviewIban}`, undefined],
]) test(`alıcı bağlamı ${JSON.stringify(text)}`, () => assert.equal(payment(text)?.recipient, expected))
for (const label of ['hesap adı', 'hesap adi', 'ad-soyad', 'isim', 'unvan', 'name']) {
 test(`alıcı etiketi ${label}`, () => assert.equal(payment(`${label}: Mehmet Kaya, IBAN ${reviewIban}`).recipient, 'Mehmet Kaya'))
}
for (const text of ['Alıcı: Merhaba', 'İsim: 123 Mehmet', 'Name: Garanti BBVA', 'Alıcı: Bir İki Üç Dört Beş Altı']) {
 test(`geçersiz etiketli alıcı ${text}`, () => assert.equal(payment(text)?.recipient, undefined))
}
