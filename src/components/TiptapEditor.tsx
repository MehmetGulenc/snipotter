import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Link from '@tiptap/extension-link'
import Typography from '@tiptap/extension-typography'
import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Code, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Code2, Minus,
} from 'lucide-react'

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
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Notunu yaz…' }),
      CharacterCount,
      Link.configure({ openOnClick: true, autolink: true }),
      Typography,
    ],
    content: toTiptapContent(content),
    onUpdate: ({ editor: ed }) => {
      dirty.current = true
      onUpdateRef.current(JSON.stringify(ed.getJSON()))
    },
    editorProps: {
      attributes: { class: 'tiptap-content focus:outline-none' },
    },
  })

  // Note switched → always reset.
  useEffect(() => {
    if (!editor) return
    dirty.current = false
    editor.commands.setContent(toTiptapContent(content), false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // Remote update arrived → only sync if the user isn't mid-edit and content differs.
  useEffect(() => {
    if (!editor || dirty.current) return
    const incoming = JSON.stringify(toTiptapContent(content))
    if (JSON.stringify(editor.getJSON()) === incoming) return
    editor.commands.setContent(toTiptapContent(content), false)
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
