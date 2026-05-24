import { useEditor, EditorContent, Extension, InputRule } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Link from '@tiptap/extension-link'
import Typography from '@tiptap/extension-typography'
import Image from '@tiptap/extension-image'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Code, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Code2, Minus, Table2, Image as ImageIcon,
} from 'lucide-react'

// ── Math auto-complete extension ──────────────────────────────────────────────

function evalMath(expr: string): number | null {
  const clean = expr.trim()
  // Only allow digits, operators, parens, spaces, dot, ^
  if (!/^[\d\s+\-*/().,^]+$/.test(clean)) return null
  try {
    const js = clean.replace(/\^/g, '**').replace(/,/g, '.')
    // eslint-disable-next-line no-new-func
    const result = new Function(`'use strict'; return (${js})`)() as unknown
    if (typeof result !== 'number' || !isFinite(result)) return null
    // Round floating-point noise: 4 significant decimals
    return Math.round(result * 1e10) / 1e10
  } catch {
    return null
  }
}

function fmtNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n)
}

// Input rule: "100 * 4 = " → "100 * 4 = 400 "
const MathExtension = Extension.create({
  name: 'mathAutoComplete',
  addInputRules() {
    return [
      new InputRule({
        find: /([\d][\d\s+\-*/().,^]*)\s*=\s$/,
        handler: ({ state, range, match }) => {
          const result = evalMath(match[1])
          if (result === null) return null
          const { tr } = state
          tr.insertText(`${match[1]} = ${fmtNumber(result)} `, range.from, range.to)
          return tr
        },
      }),
    ]
  },
})

// ── Markdown converter ────────────────────────────────────────────────────────

export function tiptapToMarkdown(title: string | null | undefined, jsonStr: string): string {
  const lines: string[] = []
  if (title?.trim()) lines.push(`# ${title.trim()}\n`)

  let doc: JSONContent
  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed?.type !== 'doc') throw new Error()
    doc = parsed
  } catch {
    // Legacy plain text
    if (title?.trim()) lines.push('')
    lines.push(jsonStr)
    return lines.join('\n')
  }

  for (const node of doc.content ?? []) lines.push(blockToMd(node))
  return lines.join('\n')
}

function blockToMd(node: JSONContent): string {
  switch (node.type) {
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1
      return `${'#'.repeat(level)} ${inlineToMd(node.content ?? [])}\n`
    }
    case 'paragraph': {
      const text = inlineToMd(node.content ?? [])
      return text ? `${text}\n` : '\n'
    }
    case 'bulletList':
      return (node.content ?? []).map((li) => `- ${listItemText(li)}`).join('\n') + '\n'
    case 'orderedList':
      return (node.content ?? []).map((li, i) => `${i + 1}. ${listItemText(li)}`).join('\n') + '\n'
    case 'taskList':
      return (node.content ?? []).map((li) => {
        const checked = li.attrs?.checked ? 'x' : ' '
        return `- [${checked}] ${listItemText(li)}`
      }).join('\n') + '\n'
    case 'blockquote':
      return (node.content ?? []).map((n) => `> ${blockToMd(n)}`).join('')
    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? ''
      const code = (node.content ?? []).map((n) => n.text ?? '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\`\n`
    }
    case 'horizontalRule':
      return '---\n'
    default:
      return inlineToMd(node.content ?? []) + '\n'
  }
}

function listItemText(li: JSONContent): string {
  return (li.content ?? []).map((n) => inlineToMd(n.content ?? [])).join(' ')
}

function inlineToMd(nodes: JSONContent[]): string {
  return nodes
    .map((n) => {
      if (n.type !== 'text') return ''
      let text = n.text ?? ''
      for (const mark of n.marks ?? []) {
        if (mark.type === 'bold') text = `**${text}**`
        else if (mark.type === 'italic') text = `_${text}_`
        else if (mark.type === 'code') text = `\`${text}\``
        else if (mark.type === 'strike') text = `~~${text}~~`
        else if (mark.type === 'link') text = `[${text}](${(mark.attrs?.href as string) ?? ''})`
      }
      return text
    })
    .join('')
}

// ── HTML converter (for PDF export) ──────────────────────────────────────────

export function tiptapToHtml(title: string | null | undefined, jsonStr: string): string {
  const parts: string[] = []
  if (title?.trim()) parts.push(`<h1>${esc(title.trim())}</h1>`)

  let doc: JSONContent
  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed?.type !== 'doc') throw new Error()
    doc = parsed
  } catch {
    parts.push(`<p>${esc(jsonStr).replace(/\n/g, '<br>')}</p>`)
    return parts.join('\n')
  }

  for (const node of doc.content ?? []) parts.push(blockToHtml(node))
  return parts.join('\n')
}

function blockToHtml(node: JSONContent): string {
  switch (node.type) {
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1
      return `<h${level}>${inlineToHtml(node.content ?? [])}</h${level}>`
    }
    case 'paragraph': {
      const inner = inlineToHtml(node.content ?? [])
      return `<p>${inner || '&nbsp;'}</p>`
    }
    case 'bulletList':
      return `<ul>${(node.content ?? []).map((li) => `<li>${listItemHtml(li)}</li>`).join('')}</ul>`
    case 'orderedList':
      return `<ol>${(node.content ?? []).map((li) => `<li>${listItemHtml(li)}</li>`).join('')}</ol>`
    case 'taskList':
      return `<ul style="list-style:none;padding-left:0">${(node.content ?? []).map((li) => {
        const checked = li.attrs?.checked ? 'checked' : ''
        return `<li><input type="checkbox" disabled ${checked}> ${listItemHtml(li)}</li>`
      }).join('')}</ul>`
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map(blockToHtml).join('')}</blockquote>`
    case 'codeBlock': {
      const code = (node.content ?? []).map((n) => esc(n.text ?? '')).join('')
      return `<pre><code>${code}</code></pre>`
    }
    case 'horizontalRule':
      return '<hr>'
    default:
      return `<p>${inlineToHtml(node.content ?? [])}</p>`
  }
}

function listItemHtml(li: JSONContent): string {
  return (li.content ?? []).map((n) => inlineToHtml(n.content ?? [])).join(' ')
}

function inlineToHtml(nodes: JSONContent[]): string {
  return nodes
    .map((n) => {
      if (n.type !== 'text') return ''
      let text = esc(n.text ?? '')
      for (const mark of n.marks ?? []) {
        if (mark.type === 'bold') text = `<strong>${text}</strong>`
        else if (mark.type === 'italic') text = `<em>${text}</em>`
        else if (mark.type === 'code') text = `<code>${text}</code>`
        else if (mark.type === 'strike') text = `<s>${text}</s>`
        else if (mark.type === 'link') text = `<a href="${esc((mark.attrs?.href as string) ?? '')}">${text}</a>`
      }
      return text
    })
    .join('')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Convert stored content (Tiptap JSON string or legacy plain text) to Tiptap JSONContent.
export function toTiptapContent(raw: string): JSONContent | string {
  if (!raw?.trim()) return ''
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.type === 'doc') return parsed
  } catch {}
  // Legacy plain text — wrap each line in a paragraph node.
  return {
    type: 'doc',
    content: raw.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  }
}

// Extract displayable plain text from stored content (for sidebar preview, AI, char count).
export function extractText(raw: string): string {
  if (!raw?.trim()) return ''
  try {
    const doc = JSON.parse(raw)
    if (doc?.type === 'doc') return nodeText(doc).trim()
  } catch {}
  return raw
}

function nodeText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(nodeText).join(node.type === 'paragraph' ? '\n' : '')
}

interface Props {
  content: string
  noteId: string
  noteUpdatedAt: string
  onUpdate: (jsonContent: string) => void
}

export function TiptapEditor({ content, noteId, noteUpdatedAt, onUpdate }: Props) {
  const dirty = useRef(false)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Notunu yaz… (= ile matematik otomatik tamamlar)' }),
      CharacterCount,
      Link.configure({ openOnClick: true, autolink: true }),
      Typography,
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      MathExtension,
    ],
    content: toTiptapContent(content),
    onUpdate: ({ editor: ed }) => {
      dirty.current = true
      onUpdateRef.current(JSON.stringify(ed.getJSON()))
    },
    editorProps: {
      attributes: { class: 'tiptap-content focus:outline-none' },
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (!file) continue
            const reader = new FileReader()
            reader.onload = (e) => {
              const src = e.target?.result as string
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src }),
                ),
              )
            }
            reader.readAsDataURL(file)
            event.preventDefault()
            return true
          }
        }
        return false
      },
    },
  })

  // Note switched → always reset.
  useEffect(() => {
    if (!editor) return
    dirty.current = false
    editor.commands.setContent(toTiptapContent(content), { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // Remote update arrived → only sync if the user isn't mid-edit and content differs.
  useEffect(() => {
    if (!editor || dirty.current) return
    const incoming = JSON.stringify(toTiptapContent(content))
    if (JSON.stringify(editor.getJSON()) === incoming) return
    editor.commands.setContent(toTiptapContent(content), { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteUpdatedAt])

  if (!editor) return null

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <InlineBubbleMenu editor={editor} />
      {/* Formatting toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-3 py-1.5 shrink-0">
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Başlık 1"
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Başlık 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Başlık 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <Separator />

        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Madde listesi"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numaralı liste"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive('taskList')}
          title="Görev listesi"
        >
          <ListChecks className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <Separator />

        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Alıntı"
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          title="Kod bloğu"
        >
          <Code2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          active={false}
          title="Yatay çizgi"
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <Separator />

        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          active={editor.isActive('table')}
          title="Tablo ekle"
        >
          <Table2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => {
            const url = window.prompt('Resim URL\'si (ya da panoya kopyaladığın resmi yapıştır)')
            if (url) editor.chain().focus().setImage({ src: url }).run()
          }}
          active={false}
          title="Resim ekle (URL) — ya da Cmd+V ile panodan yapıştır"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="scrollbar-thin tiptap-editor-area flex-1 overflow-y-auto"
      />
    </div>
  )
}

// ── Inline bubble menu ────────────────────────────────────────────────────────

function InlineBubbleMenu({ editor }: { editor: Editor }) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  useEffect(() => {
    const update = () => {
      const { selection } = editor.state
      if (selection.empty || !editor.isFocused) {
        setVisible(false)
        return
      }
      const { from, to } = selection
      const startCoords = editor.view.coordsAtPos(from)
      const endCoords = editor.view.coordsAtPos(to)
      const editorDom = editor.view.dom.closest('.tiptap-editor-area')
      if (!editorDom) return
      const rect = editorDom.getBoundingClientRect()
      // Centre the menu horizontally over the selection, 8px above it.
      const midX = (startCoords.left + endCoords.right) / 2 - rect.left
      const top = startCoords.top - rect.top - 44
      setCoords({ top: Math.max(4, top), left: Math.max(60, midX) })
      setVisible(true)
    }

    const hide = () => setVisible(false)

    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    editor.on('blur', hide)

    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
      editor.off('blur', hide)
    }
  }, [editor])

  if (!visible) return null

  return (
    <div
      style={{ position: 'absolute', top: coords.top, left: coords.left, transform: 'translateX(-50%)', zIndex: 50 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-1 shadow-xl">
        <BubbleBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Kalın">
          <Bold className="h-3.5 w-3.5" />
        </BubbleBtn>
        <BubbleBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="İtalik">
          <Italic className="h-3.5 w-3.5" />
        </BubbleBtn>
        <BubbleBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Üstü çizili">
          <Strikethrough className="h-3.5 w-3.5" />
        </BubbleBtn>
        <BubbleBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Satır içi kod">
          <Code className="h-3.5 w-3.5" />
        </BubbleBtn>
      </div>
    </div>
  )
}

function ToolbarBtn({
  onClick, active, title, children,
}: {
  onClick: () => void
  active: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`rounded p-1.5 transition-colors ${
        active
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function BubbleBtn({
  onClick, active, title, children,
}: {
  onClick: () => void
  active: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`rounded p-1.5 transition-colors ${
        active
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function Separator() {
  return <div className="mx-1 h-4 w-px bg-border" />
}
