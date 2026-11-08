const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { buildSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const root = path.resolve(__dirname, '../..')
const result = buildSync({
  stdin: {
    contents: `export * from './src/lib/libraryPrefs';
      export { ShortcutHints } from './src/components/QuickPaste';`,
    resolveDir: root,
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'],
  alias: { '@': path.join(root, 'src'), '@shared': path.join(root, 'shared') },
  loader: { '.svg': 'dataurl' },
})
const m = { exports: {} }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, m, m.exports)
const { loadView, loadFilter, saveView, saveFilter, resolveLibraryShortcut, isTypingTarget, ShortcutHints } = m.exports

const memStore = () => {
  const data = new Map()
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) }
}

test('view and filter preferences round-trip through storage', () => {
  const s = memStore()
  assert.equal(loadView(s), 'grid')
  assert.equal(loadFilter(s), 'all')
  saveView('list', s)
  saveFilter('image', s)
  assert.equal(loadView(s), 'list')
  assert.equal(loadFilter(s), 'image')
})

test('invalid or missing stored values fall back to defaults', () => {
  const s = memStore()
  s.setItem('snipotter.library.view', 'mosaic')
  s.setItem('snipotter.library.filter', 'videos')
  assert.equal(loadView(s), 'grid')
  assert.equal(loadFilter(s), 'all')
  assert.equal(loadView(null), 'grid')
  assert.equal(loadFilter(null), 'all')
})

test('storage write failures are swallowed', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded') } }
  assert.doesNotThrow(() => saveView('list', broken))
  assert.doesNotThrow(() => saveFilter('text', broken))
})

const ev = (key, extra = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, typing: false, ...extra })
const st = (extra = {}) => ({ hasSelection: false, hasItems: true, hasPendingDelete: false, ...extra })

test('library shortcuts map to actions only when applicable', () => {
  assert.equal(resolveLibraryShortcut(ev('Escape'), st({ hasSelection: true })), 'clear-selection')
  assert.equal(resolveLibraryShortcut(ev('Escape'), st()), null)
  assert.equal(resolveLibraryShortcut(ev('a', { metaKey: true }), st()), 'select-all')
  assert.equal(resolveLibraryShortcut(ev('A', { ctrlKey: true }), st()), 'select-all')
  assert.equal(resolveLibraryShortcut(ev('a', { metaKey: true }), st({ hasItems: false })), null)
  assert.equal(resolveLibraryShortcut(ev('a'), st()), null)
  assert.equal(resolveLibraryShortcut(ev('Backspace'), st({ hasSelection: true })), 'delete-selected')
  assert.equal(resolveLibraryShortcut(ev('Delete'), st({ hasSelection: true })), 'delete-selected')
  assert.equal(resolveLibraryShortcut(ev('Delete'), st()), null)
  assert.equal(resolveLibraryShortcut(ev('z', { metaKey: true }), st({ hasPendingDelete: true })), 'undo-delete')
  assert.equal(resolveLibraryShortcut(ev('z', { metaKey: true }), st()), null)
})

test('shortcuts never hijack text editing or alt combos', () => {
  const all = st({ hasSelection: true, hasPendingDelete: true })
  for (const e of [ev('a', { metaKey: true }), ev('Backspace'), ev('z', { metaKey: true }), ev('Escape')]) {
    assert.equal(resolveLibraryShortcut({ ...e, typing: true }, all), null)
  }
  assert.equal(resolveLibraryShortcut(ev('Backspace', { altKey: true }), all), null)
})

test('typing target detection', () => {
  assert.equal(isTypingTarget(null), false)
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true)
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true)
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(isTypingTarget({ tagName: 'BUTTON', isContentEditable: false }), false)
  assert.equal(isTypingTarget({}), false)
})

test('quick paste footer shows count and shortcut hints', () => {
  const html = renderToStaticMarkup(React.createElement(ShortcutHints, { count: 7 }))
  assert.match(html, /Klavye kısayolları/)
  assert.match(html, /7 öğe/)
  for (const label of ['yapıştır', 'sabitle', 'sil', 'kapat']) assert.match(html, new RegExp(label))
})
