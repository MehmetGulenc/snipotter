const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { buildSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const root = path.resolve(__dirname, '../..')
const result = buildSync({
  stdin: {
    contents: `export { Library } from './src/pages/Library';
      export { Topbar } from './src/components/Topbar';
      export { Sidebar } from './src/components/Sidebar';
      export { ClipboardCard } from './src/components/ClipboardCard';
      export { copyAndPasteItem } from './src/components/QuickPaste';
      export { useStore } from './src/store/useStore';`,
    resolveDir: root,
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'],
  alias: { '@': path.join(root, 'src'), '@shared': path.join(root, 'shared') },
  loader: { '.svg': 'dataurl' },
})
const loaded = { exports: {} }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, loaded, loaded.exports)
const { Library, Topbar, Sidebar, ClipboardCard, useStore } = loaded.exports
const { copyAndPasteItem } = loaded.exports
useStore.getInitialState = useStore.getState
const render = (component, props = {}) => renderToStaticMarkup(React.createElement(component, props))

test('quick paste never pastes stale clipboard data when copy fails', async () => {
  const previous = global.window
  let pasted = false
  global.window = { snipotter: { clipboard: { copy: async () => ({ ok: false, error: 'copy failed' }) }, window: { pasteAtCursor: async () => { pasted = true } } } }
  try {
    await assert.rejects(copyAndPasteItem({}), /copy failed/)
    assert.equal(pasted, false)
    global.window.snipotter.clipboard.copy = async () => ({ ok: true, data: null })
    await copyAndPasteItem({})
    assert.equal(pasted, true)
  } finally { global.window = previous }
})

test('empty library retains filters and actionable guidance', () => {
  const html = render(Library)
  assert.match(html, /Panon henüz boş/)
  assert.match(html, /İçerik türüne göre filtrele/)
  assert.match(html, /Liste görünümü/)
  assert.match(html, /Hızlı not/)
})

test('search scope follows the page and is absent from settings', () => {
  assert.match(render(Topbar, { route: 'notes' }), /Notlarında ara/)
  assert.match(render(Topbar, { route: 'library' }), /Pano geçmişinde ara/)
  assert.doesNotMatch(render(Topbar, { route: 'settings' }), /<input/)
})

test('navigation identifies the current page', () => {
  const html = render(Sidebar, { route: 'library', onNavigate() {} })
  assert.match(html, /aria-current="page"/)
  assert.match(html, /Ana gezinme/)
})

test('sensitive card hides payload and exposes a named selection control', () => {
  const html = render(ClipboardCard, {
    item: {
      id: 'sensitive', text: 'secret-payload', contentType: 'text', pinned: false,
      createdAt: new Date().toISOString(), synced: true,
      ai: { tags: ['sensitive'], summary: '' },
    },
    onSelect() {}, onCopy() {}, onPin() {}, onPromote() {}, onDelete() {}, onReenrich() {},
  })
  assert.doesNotMatch(html, /secret-payload/)
  assert.match(html, /aria-label="Öğeyi seç"/)
  assert.match(html, /Kopyala/)
  assert.doesNotMatch(html, /opacity-0/)
})
