import { useRef } from 'react'
import { getSchema } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import { Extension, InputRule, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { AnyExtension, NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Typography from '@tiptap/extension-typography'
import Image from '@tiptap/extension-image'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { useAssetSrc } from './assets'
import { BlockTools } from './blocks'
import { TAG_RE, noteIdFromHref, noteLinkHref } from './organize'

// ── Resizable image ───────────────────────────────────────────────────────────

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps): JSX.Element {
  const width = node.attrs.width as number | null
  const imgRef = useRef<HTMLImageElement>(null)
  const src = useAssetSrc(node.attrs.src as string)

  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = imgRef.current?.offsetWidth ?? width ?? 400
    const onMove = (ev: PointerEvent): void => {
      updateAttributes({ width: Math.max(60, Math.round(startW + (ev.clientX - startX))) })
    }
    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline-block', position: 'relative', lineHeight: 0, maxWidth: '100%' }}>
      {src ? (
        <img
          ref={imgRef}
          src={src}
          alt={(node.attrs.alt as string) ?? ''}
          draggable={false}
          data-node-view-image
          className="my-2 rounded-md"
          style={{ display: 'block', width: width != null ? `${width}px` : 'auto', maxWidth: '100%' }}
        />
      ) : (
        <span
          data-node-view-image
          aria-label="Görsel yükleniyor"
          className="my-2 block h-32 animate-pulse rounded-md bg-muted"
          style={{ width: width != null ? `${width}px` : 240, maxWidth: '100%' }}
        />
      )}
      {selected && (
        <span
          onPointerDown={startResize}
          title="Sürükle: yeniden boyutlandır"
          className="absolute bottom-2 right-0 h-5 w-5 cursor-se-resize rounded-tl bg-primary/85 touch-none"
        />
      )}
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = (el as HTMLElement).style.width
          return w ? parseInt(w, 10) : null
        },
        renderHTML: (attrs) => (attrs.width != null ? { style: `width: ${attrs.width}px` } : {}),
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

// ── "12 * 4 = " → "12 * 4 = 48" ───────────────────────────────────────────────

export function evalMath(expr: string): number | null {
  const clean = expr.trim()
  if (!/^[\d\s+\-*/().,^]+$/.test(clean)) return null
  try {
    const js = clean.replace(/\^/g, '**').replace(/,/g, '.')
    // Input is restricted to digits and arithmetic operators above.
    // eslint-disable-next-line no-new-func
    const result = new Function(`'use strict'; return (${js})`)() as unknown
    if (typeof result !== 'number' || !isFinite(result)) return null
    return Math.round(result * 1e10) / 1e10
  } catch {
    return null
  }
}

export const MathAutoComplete = Extension.create({
  name: 'mathAutoComplete',
  addInputRules() {
    return [
      new InputRule({
        find: /([\d][\d\s+\-*/().,^]*)\s*=\s$/,
        handler: ({ range, match, chain }) => {
          const result = evalMath(match[1])
          if (result === null) return null
          chain().deleteRange(range).insertContent(`${match[1]} = ${result} `).run()
        },
      }),
    ]
  },
})

// ── #tags, [[note links]] and link clicks ────────────────────────────────────

export interface NoteLinkHandlers {
  onTag?: (tag: string) => void
  onOpenNote?: (noteId: string) => void
  /** `[[` typed: resolve with the note to link, or null to leave the text as is. */
  pickNote?: () => Promise<{ id: string; title: string } | null>
}

const noteLinksKey = new PluginKey('snipotterNoteLinks')

function tagDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text || node.marks.some((m) => m.type.name === 'code' || m.type.name === 'link')) return
    for (const m of node.text.matchAll(TAG_RE)) {
      const from = pos + (m.index ?? 0) + m[1].length
      decorations.push(Decoration.inline(from, from + m[2].length + 1, {
        class: 'note-tag',
        'data-tag': m[2].toLocaleLowerCase('tr-TR'),
      }))
    }
  })
  return DecorationSet.create(doc, decorations)
}

/** Handlers are read through a getter so the editor never needs re-creating when they change. */
export function NoteLinks(handlers: () => NoteLinkHandlers): Extension {
  return Extension.create({
    name: 'snipotterNoteLinks',
    addProseMirrorPlugins() {
      const editor = this.editor
      return [
        new Plugin({
          key: noteLinksKey,
          state: {
            init: (_, state) => tagDecorations(state.doc),
            apply: (tr, old) => (tr.docChanged ? tagDecorations(tr.doc) : old),
          },
          props: {
            decorations(state) {
              return noteLinksKey.getState(state) as DecorationSet
            },
            handleClick(view, _pos, event) {
              const el = (event.target as HTMLElement | null)?.closest?.('a[href], .note-tag') as HTMLElement | null
              if (!el) return false
              if (el.classList.contains('note-tag')) {
                const tag = el.getAttribute('data-tag')
                if (tag && handlers().onTag) {
                  handlers().onTag?.(tag)
                  return true
                }
                return false
              }
              const href = el.getAttribute('href') ?? ''
              const noteId = noteIdFromHref(href)
              if (noteId) {
                handlers().onOpenNote?.(noteId)
                return true
              }
              if (/^(https?:|mailto:|tel:)/i.test(href) && (event.metaKey || event.ctrlKey || !view.editable || isTouch())) {
                window.open(href, '_blank', 'noopener')
                return true
              }
              return false
            },
            handleTextInput(view, from, to, text) {
              if (text !== '[' || !handlers().pickNote) return false
              if (view.state.doc.textBetween(Math.max(0, from - 1), from) !== '[') return false
              const start = from - 1
              void handlers().pickNote?.().then((picked) => {
                if (!picked || editor.isDestroyed) return
                editor.chain().focus()
                  .deleteRange({ from: start, to: Math.min(to + 1, editor.state.doc.content.size) })
                  .insertContentAt(start, [
                    { type: 'text', text: picked.title || 'Adsız not', marks: [{ type: 'link', attrs: { href: noteLinkHref(picked.id) } }] },
                    { type: 'text', text: ' ' },
                  ])
                  .run()
              })
              return false
            },
          },
        }),
      ]
    },
  })
}

const isTouch = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

const lowlight = createLowlight(common)

let cachedSchema: Schema | null = null

/** ProseMirror schema of the note editor, for Yjs seeding outside an editor instance. */
export function noteSchema(): Schema {
  cachedSchema ??= getSchema(noteExtensions())
  return cachedSchema
}

export interface NoteExtensionOptions {
  placeholder?: string
  /** Collaboration replaces the built-in undo history with Yjs' own. */
  collaboration?: AnyExtension[]
  links?: () => NoteLinkHandlers
}

export function noteExtensions({ placeholder, collaboration, links }: NoteExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      link: {
        // Clicks are handled by NoteLinks: note links open in-app, web links in the browser.
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto', 'tel', { scheme: 'snipotter', optionalSlashes: false }],
        isAllowedUri: (url, ctx) => Boolean(noteIdFromHref(url)) || ctx.defaultValidate(url),
      },
      ...(collaboration ? { undoRedo: false } : {}),
    }),
    CodeBlockLowlight.configure({ lowlight }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: placeholder ?? 'Notunu yaz… (= ile matematik otomatik tamamlar)' }),
    CharacterCount,
    Typography,
    ResizableImage.configure({ allowBase64: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    MathAutoComplete,
    BlockTools,
    NoteLinks(links ?? (() => ({}))),
    ...(collaboration ?? []),
  ]
}
