// Mac App Store build: AI controls, Finder file capture and the in-app updater
// must be hidden (App Review 2.1 "broken feature"), and QuickPaste must tell the
// user to paste with ⌘V. Each case renders once as MAS and once as the regular
// build to prove the condition really toggles.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { buildSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const root = path.resolve(__dirname, '../..')
const result = buildSync({
  stdin: {
    contents: `export { Settings } from './src/pages/Settings';
      export { Topbar } from './src/components/Topbar';
      export { ClipboardCard } from './src/components/ClipboardCard';
      export { NoteEditor } from './src/components/NoteCard';
      export { ShortcutHints } from './src/components/QuickPaste';
      export { useStore } from './src/store/useStore';
      export { DEFAULT_SETTINGS } from './shared/types';`,
    resolveDir: root,
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'],
  alias: { '@': path.join(root, 'src'), '@shared': path.join(root, 'shared') },
  loader: { '.svg': 'dataurl' },
})
const loaded = { exports: {} }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, loaded, loaded.exports)
const { Settings, Topbar, ClipboardCard, NoteEditor, ShortcutHints, useStore, DEFAULT_SETTINGS } = loaded.exports
// SSR renders zustand's server snapshot (the store's initial state object), so
// Settings is seeded by patching that object for the duration of the test.
const initialState = useStore.getInitialState()

const noop = () => {}
const updaterStub = { getStatus: async () => ({ ok: false }), onChanged: () => noop }

/** Render with window.snipotter.runtime.isMas set to `mas`. */
function renderAs(mas, component, props = {}) {
  const previous = global.window
  global.window = { snipotter: { runtime: { isMas: mas }, updater: updaterStub } }
  try {
    return renderToStaticMarkup(React.createElement(component, props))
  } finally {
    if (previous === undefined) delete global.window
    else global.window = previous
  }
}

const textItem = {
  id: 'c1', text: 'hello world', contentType: 'text', pinned: false,
  createdAt: new Date().toISOString(), synced: true,
}
const cardProps = { item: textItem, onSelect: noop, onCopy: noop, onPin: noop, onPromote: noop, onDelete: noop, onReenrich: noop }

test('runtime module is importable without window', () => {
  assert.equal(typeof global.window, 'undefined')
  assert.ok(ClipboardCard)
})

test('clipboard card hides the AI re-enrich button in MAS only', () => {
  assert.match(renderAs(false, ClipboardCard, cardProps), /AI ile yeniden işle/)
  assert.doesNotMatch(renderAs(true, ClipboardCard, cardProps), /AI ile yeniden işle/)
})

test('note editor hides the AI re-enrich button in MAS only', () => {
  const note = { id: 'n1', title: 'Not', content: 'içerik', pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  const props = { note, onUpdate: noop, onLocalContent: noop, onDelete: noop, onPin: noop, onReenrich: noop }
  assert.match(renderAs(false, NoteEditor, props), /AI ile yeniden işle/)
  assert.doesNotMatch(renderAs(true, NoteEditor, props), /AI ile yeniden işle/)
})

test('topbar hides the AI status badge in MAS only', () => {
  assert.match(renderAs(false, Topbar, { route: 'library' }), /AI yardımcısı/)
  assert.doesNotMatch(renderAs(true, Topbar, { route: 'library' }), /AI yardımcısı/)
})

test('quick paste hint asks for ⌘V in MAS instead of promising auto-paste', () => {
  const regular = renderAs(false, ShortcutHints, { count: 3 })
  const mas = renderAs(true, ShortcutHints, { count: 3 })
  assert.match(regular, /yapıştır/)
  assert.doesNotMatch(regular, /⌘V/)
  assert.match(mas, /kopyala, sonra ⌘V/)
})

test('settings hide AI, file capture and in-app updater in MAS only', () => {
  const previous = { settings: initialState.settings, aiStatus: initialState.aiStatus }
  Object.assign(initialState, { settings: { ...DEFAULT_SETTINGS }, aiStatus: null })
  try {
    const regular = renderAs(false, Settings)
    const mas = renderAs(true, Settings)

    assert.match(regular, /AI ile otomatik etiketle/)
    assert.match(regular, /Birincil AI sağlayıcı/)
    assert.match(regular, /Dosya kopyalamayı yakala/)
    assert.match(regular, /Güncellemeleri kontrol et/)

    assert.doesNotMatch(mas, /AI ile otomatik etiketle/)
    assert.doesNotMatch(mas, /Birincil AI sağlayıcı/)
    assert.doesNotMatch(mas, /Dosya kopyalamayı yakala/)
    assert.doesNotMatch(mas, /Güncellemeleri kontrol et/)
    assert.match(mas, /Mac App Store üzerinden/)
  } finally {
    Object.assign(initialState, previous)
  }
})
