/** Moving blocks up/down and sinking completed tasks. Works on ProseMirror state, no DOM. */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { ySyncPluginKey } from '@tiptap/y-tiptap'

const ITEM_TYPES = new Set(['listItem', 'taskItem'])

/**
 * Moves the list item around the cursor (or, outside lists, the top-level block)
 * one place up or down among its siblings. Null when it is already at the edge.
 */
export function moveBlock(state: EditorState, dir: -1 | 1): Transaction | null {
  const { $from } = state.selection
  if ($from.depth === 0) return null
  let depth = 1
  for (let d = $from.depth; d >= 1; d--) {
    if (ITEM_TYPES.has($from.node(d).type.name)) {
      depth = d
      break
    }
  }
  const parent = $from.node(depth - 1)
  const index = $from.index(depth - 1)
  const target = index + dir
  if (target < 0 || target >= parent.childCount) return null
  const node = $from.node(depth)
  const pos = $from.before(depth)
  const offset = state.selection.from - pos
  const insertAt = dir === -1 ? pos - parent.child(target).nodeSize : pos + parent.child(target).nodeSize
  const tr = state.tr.delete(pos, pos + node.nodeSize).insert(insertAt, node)
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + offset)))
  return tr.scrollIntoView()
}

/**
 * After a local change ticked a task, moves it below the last unticked task of
 * its list. Remote (Yjs) changes are left alone: the device that ticked the box
 * already moved it, and moving it again here would duplicate the item.
 */
export function sinkCompletedTask(transactions: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
  if (!transactions.some((tr) => tr.docChanged)) return null
  if (transactions.some((tr) => (tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin || tr.getMeta('sinkTask'))) return null
  // Structure changed (typing, paste, move): only a pure attribute flip keeps the size.
  if (oldState.doc.content.size !== newState.doc.content.size) return null

  let found: { pos: number; listPos: number } | null = null
  newState.doc.descendants((node, pos) => {
    if (found) return false
    if (node.type.name !== 'taskList') return true
    let childPos = pos + 1
    node.forEach((child) => {
      if (!found && child.type.name === 'taskItem' && child.attrs.checked) {
        const before = oldState.doc.nodeAt(childPos)
        if (before?.type.name === 'taskItem' && !before.attrs.checked) found = { pos: childPos, listPos: pos }
      }
      childPos += child.nodeSize
    })
    return true
  })
  if (!found) return null
  const { pos, listPos } = found as { pos: number; listPos: number }

  const list = newState.doc.nodeAt(listPos)
  const item = newState.doc.nodeAt(pos)
  if (!list || !item) return null
  let cursor = listPos + 1
  let afterLastUnchecked = -1
  list.forEach((child) => {
    cursor += child.nodeSize
    if (!child.attrs.checked) afterLastUnchecked = cursor
  })
  if (afterLastUnchecked <= pos + item.nodeSize) return null

  const tr = newState.tr.delete(pos, pos + item.nodeSize).insert(afterLastUnchecked - item.nodeSize, item)
  // Keep the cursor where it was instead of following the moved item.
  return tr.setMeta('sinkTask', true)
}

export const BlockTools = Extension.create({
  name: 'snipotterBlockTools',
  addKeyboardShortcuts() {
    const move = (dir: -1 | 1) => (): boolean => {
      const tr = moveBlock(this.editor.state, dir)
      if (!tr) return false
      this.editor.view.dispatch(tr)
      return true
    }
    return { 'Alt-ArrowUp': move(-1), 'Alt-ArrowDown': move(1) }
  },
  addProseMirrorPlugins() {
    return [new Plugin({ key: new PluginKey('snipotterSinkTask'), appendTransaction: sinkCompletedTask })]
  },
})
