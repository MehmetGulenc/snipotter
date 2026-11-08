const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../../shared/macFileClipboard.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const loaded = { exports: {} }
new Function('require', 'exports', compiled.outputText)(require, loaded.exports)
const { createMacFileReader, resolveMacFileUrl } = loaded.exports
const empty = () => Buffer.alloc(0)

function mockMonitor({ fileUrl = '', text = '', execError = null, exposeWrittenUrl = true } = {}) {
  let writtenPath = ''
  const bundle = require('esbuild').buildSync({
    entryPoints: [path.join(__dirname, '../../electron/main/clipboard.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['electron'], alias: { '@shared': path.join(__dirname, '../../shared') },
  })
  const electron = { clipboard: {
    readText: () => text, readHTML: () => '', readImage: () => ({ isEmpty: () => true }),
    read: (format) => format === 'public.file-url' ? (writtenPath && exposeWrittenUrl ? pathToFileURL(writtenPath).href : fileUrl) : '', readBuffer: empty,
  }, nativeImage: {} }
  const child = { ...require('node:child_process'), execFile(_cmd, args, ...rest) {
    const callback = rest.at(-1)
    if (execError) return void queueMicrotask(() => callback(execError))
    writtenPath = args.at(-1)
    queueMicrotask(() => callback(null, '', ''))
  } }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    (id) => id === 'electron' ? electron : id === 'node:child_process' ? child : require(id), module, module.exports,
  )
  return { monitor: new module.exports.ClipboardMonitor({ fileCopyEnabled: true }), writtenPath: () => writtenPath }
}

test('failed Finder reference resolution retains the available text draft', async () => {
  const { monitor } = mockMonitor({ fileUrl: 'file:///.file/id=broken', text: 'fallback filename.pdf', execError: new Error('resolver failed') })
  let captured
  monitor.on('change', (draft) => { captured = draft })
  await monitor.tick()
  assert.equal(captured.contentType, 'text')
  assert.equal(captured.text, 'fallback filename.pdf')
})

test('file copy contains remote path traversal and isolates same-name files', async () => {
  const fixture = mockMonitor()
  const payload = { contentType: 'file', text: 'data:application/pdf;name=..%2F..%2Fescape.pdf;base64,JVBERi0xLjc=' }
  const created = []
  try {
    await fixture.monitor.copy(payload)
    const first = fixture.writtenPath()
    created.push(path.dirname(first))
    assert.equal(path.basename(first), 'escape.pdf')
    assert.match(path.basename(path.dirname(first)), /^snipotter-/)
    assert.equal(path.dirname(path.dirname(first)), require('node:os').tmpdir())
    assert.equal(fs.readFileSync(first, 'utf8'), '%PDF-1.7')
    await fixture.monitor.copy(payload)
    created.push(path.dirname(fixture.writtenPath()))
    assert.notEqual(fixture.writtenPath(), first)
  } finally {
    for (const dir of created) fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('file copy rejects success when the native file URL is absent', async () => {
  const fixture = mockMonitor({ exposeWrittenUrl: false })
  try {
    await assert.rejects(fixture.monitor.copy({ contentType: 'file', text: 'data:application/pdf;name=test.pdf;base64,JVBERi0xLjc=' }), /Dosya pano biçimi doğrulanamadı/)
  } finally {
    if (fixture.writtenPath()) fs.rmSync(path.dirname(fixture.writtenPath()), { recursive: true, force: true })
  }
})

test('native file URL is read without plist conversion', () => {
  const read = createMacFileReader({ read: () => 'file:///tmp/report.pdf\0', readBuffer: empty }, () => { throw Error('unexpected') })
  assert.equal(read(), 'file:///tmp/report.pdf')
})

test('URI list skips comments and reads the first file', () => {
  const read = createMacFileReader({ read: (format) => format === 'text/uri-list' ? '# files\nfile:///tmp/a.pdf\r\nfile:///tmp/b.pdf' : '', readBuffer: empty }, () => [])
  assert.equal(read(), 'file:///tmp/a.pdf')
})

test('legacy file list preserves special characters and caches unchanged data', () => {
  let conversions = 0
  const read = createMacFileReader({ read: () => '', readBuffer: (format) => format === 'NSFilenamesPboardType' ? Buffer.from('plist') : empty() }, () => { conversions++; return ['/tmp/rapor & bütçe #1.pdf'] })
  assert.equal(read(), pathToFileURL('/tmp/rapor & bütçe #1.pdf').href)
  read()
  assert.equal(conversions, 1)
})

test('macOS plutil decodes an actual binary Finder file list', { skip: process.platform !== 'darwin' }, () => {
  const xml = '<?xml version="1.0"?><plist version="1.0"><array><string>/tmp/rapor &amp; bütçe.pdf</string></array></plist>'
  const binary = execFileSync('/usr/bin/plutil', ['-convert', 'binary1', '-o', '-', '-'], { input: xml })
  assert.equal(binary.subarray(0, 6).toString(), 'bplist')
  const read = createMacFileReader({ read: () => '', readBuffer: (format) => format === 'NSFilenamesPboardType' ? binary : empty() }, (data) => JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: data, encoding: 'utf8' })))
  assert.equal(read(), pathToFileURL('/tmp/rapor & bütçe.pdf').href)
})

test('unsupported or unreadable clipboard returns no file', () => {
  assert.equal(createMacFileReader({ read() { throw Error('unavailable') }, readBuffer() { throw Error('unavailable') } }, () => [])(), '')
})

test('normal file URLs retain special characters without native resolution', async () => {
  const file = '/tmp/rapor & bütçe #1.pdf'
  assert.deepEqual(await resolveMacFileUrl(pathToFileURL(file).href), { path: file, url: pathToFileURL(file).href })
})

test('Finder reference resolves to a readable 1.6 MB PDF', { skip: process.platform !== 'darwin' }, async () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'snipotter-reference-'))
  const file = path.join(dir, 'rapor & bütçe #1.pdf')
  try {
    const bytes = Buffer.alloc(1600000, 65)
    bytes.write('%PDF-1.7\n')
    fs.writeFileSync(file, bytes)
    const reference = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e',
      'ObjC.import("Foundation"); function run(args) { return ObjC.unwrap($.NSURL.fileURLWithPath(args[0]).fileReferenceURL.absoluteString); }', file,
    ], { encoding: 'utf8', timeout: 5000 }).trim()
    assert.match(reference, /\/\.file\/id=/)
    const resolved = await resolveMacFileUrl(reference)
    assert.equal(fs.realpathSync(resolved.path), fs.realpathSync(file))
    assert.deepEqual(fs.readFileSync(resolved.path), bytes)
    assert.doesNotMatch(resolved.url, /\/\.file\/id=/)
    // Exercise the actual monitor with Finder's native reference representation.
    const bundle = require('esbuild').buildSync({
      entryPoints: [path.join(__dirname, '../../electron/main/clipboard.ts')],
      bundle: true, platform: 'node', format: 'cjs', write: false,
      external: ['electron'], alias: { '@shared': path.join(__dirname, '../../shared') },
    })
    const monitorModule = { exports: {} }
    const electron = { clipboard: {
      readText: () => '', readHTML: () => '', readImage: () => ({ isEmpty: () => true }),
      read: (format) => format === 'public.file-url' ? reference : '', readBuffer: empty,
    }, nativeImage: {} }
    new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
      (id) => id === 'electron' ? electron : require(id), monitorModule, monitorModule.exports,
    )
    const monitor = new monitorModule.exports.ClipboardMonitor({ fileCopyEnabled: true })
    let captured
    monitor.on('error', (error) => { throw error })
    monitor.on('change', (draft) => { captured = draft })
    monitor.start()
    try {
      await monitor.tick()
    } finally {
      monitor.stop()
    }
    assert.equal(captured?.contentType, 'file')
    assert.match(captured.text, /^data:application\/pdf;name=/)
    assert.deepEqual(Buffer.from(captured.text.split(',')[1], 'base64'), bytes)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
