const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../../shared/laundry.ts'), 'utf8')
const loaded = { exports: {} }
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(loaded.exports)

const { markdownTableToSheet: table, stripMarkdown, joinBrokenLines, cleanUrl, cleanUrlsInText, laundryOptions } = loaded.exports
const cases = [
 ['Türkçe tablo', () => assert.equal(table('| Ad | Şehir |\n| --- | --- |\n| İpek | İzmir |').tsv, 'Ad\tŞehir\nİpek\tİzmir')],
 ['hizalı tablo', () => assert.equal(table('Ad | Tutar\n:--- | ---:\nÇay | 20').tsv, 'Ad\tTutar\nÇay\t20')],
 ['HTML güvenliği', () => assert.match(table('Ad | Not\n--- | ---\n<script> | & "').html, /&lt;script&gt;.*&amp; &quot;/)],
 ['kaçışlı boru', () => assert.equal(table('Ad | Not\n--- | ---\nA | x\\|y').tsv, 'Ad\tNot\nA\tx|y')],
 ['bozuk tablo', () => assert.equal(table('A | B\n--- | ---\nA | B | C'), null)],
 ['ayraç zorunlu', () => assert.equal(table('A | B\nC | D'), null)],
 ['tek sütun değil', () => assert.equal(table('A\n---'), null)],
 ['başlık ve vurgu', () => assert.equal(stripMarkdown('# Merhaba\n**İpek** ve *çay*'), 'Merhaba\nİpek ve çay')],
 ['bağlantı ve resim', () => assert.equal(stripMarkdown('[Site](https://a.test) ![Kedi](cat.png)'), 'Site Kedi')],
 ['kod çiti', () => assert.equal(stripMarkdown('```ts\nconst çay = 1\n```'), 'const çay = 1')],
 ['liste ve alıntı', () => assert.equal(stripMarkdown('> Not\n- [x] Çay\n1. Süt'), 'Not\nÇay\nSüt')],
 ['alt çizgi korunur', () => assert.equal(stripMarkdown('dosya_adi ve 2 * 3'), 'dosya_adi ve 2 * 3')],
 ['PDF satır', () => assert.equal(joinBrokenLines('Bu bir\nsatırdır.\n\nYeni paragraf.'), 'Bu bir satırdır.\n\nYeni paragraf.')],
 ['PDF hece', () => assert.equal(joinBrokenLines('dönü-\nşüm'), 'dönüşüm')],
 ['liste korunur', () => assert.equal(joinBrokenLines('Başlık\n- Bir\n- İki'), 'Başlık\n- Bir\n- İki')],
 ['CRLF', () => assert.equal(joinBrokenLines('Bir\r\niki'), 'Bir iki')],
 ['izleme temizliği', () => assert.equal(cleanUrl('https://a.test/p?id=3&utm_source=x&fbclid=y#b'), 'https://a.test/p?id=3#b')],
 ['tüm izleme anahtarları', () => assert.equal(cleanUrl('https://a.test/?UTM_MEDIUM=x&gclid=x&igsh=x&si=x&msclkid=x'), 'https://a.test/')],
 ['tekrarlı anahtar', () => assert.equal(cleanUrl('https://a.test/?utm_source=a&utm_source=b&q=çay'), 'https://a.test/?q=%C3%A7ay')],
 ['temiz URL aynen', () => assert.equal(cleanUrl('https://a.test?q=a%20b'), 'https://a.test?q=a%20b')],
 ['geçersiz URL', () => assert.equal(cleanUrl('merhaba'), 'merhaba')],
 ['özel şema korunur', () => assert.equal(cleanUrl('mailto:a@b.test?utm_source=x'), 'mailto:a@b.test?utm_source=x')],
 ['metin ve noktalama', () => assert.deepEqual(cleanUrlsInText('Bak https://a.test/?si=x. Sonra https://b.test/?q=1&gclid=x!'), { text: 'Bak https://a.test/. Sonra https://b.test/?q=1!', changed: 2 })],
 ['boş seçenek', () => assert.deepEqual(laundryOptions('Çay ve kahve'), [])],
 ['uygulanabilir seçenek', () => assert.deepEqual(laundryOptions('**Çay**').map(x => x.id), ['plain'])],
 ['tablo zengin çıktı', () => assert.ok(laundryOptions('A|B\n---|---\n1|2').find(x => x.id === 'table').result.html.includes('<table>'))],
]
for (const [name, run] of cases) test(name, run)

for (const text of [
 '| Ürün | Adet |\n|---|---|\n| Kalem | 2 |',
 'Ürün | Adet\n---|---\nKalem | 2',
 '```txt\nbir satır\nikinci satır\n```',
 '~~~\nbir satır\nikinci satır\n~~~',
 '    bir satır\n    ikinci satır',
]) test(`yapısal metin korunur ${JSON.stringify(text)}`, () => {
 assert.equal(joinBrokenLines(text), text)
 assert.ok(!laundryOptions(text).some(x => x.id === 'paragraph'))
})
for (const text of ['Fiyat 1.250 TL\nhttps://example.com', 'Bir cümle.\nyeni cümle', 'Ali\nVeli', 'bir\r\n\r\niki']) {
 test(`PDF olmayan satırlar ${JSON.stringify(text)}`, () => assert.ok(!laundryOptions(text).some(x => x.id === 'paragraph')))
}
test('PDF devamı için seçenek sunulur', () => assert.ok(laundryOptions('Bu bir\nkırık satır').some(x => x.id === 'paragraph')))
test('kodun dışındaki PDF satırları birleşir', () => assert.equal(joinBrokenLines('```\na\nb\n```\n\nBu bir\nkırık satır'), '```\na\nb\n```\n\nBu bir kırık satır'))
test('hece bölünmesi kod içinde korunur', () => assert.equal(joinBrokenLines('```\ndönü-\nşüm\n```'), '```\ndönü-\nşüm\n```'))
