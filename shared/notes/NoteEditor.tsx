import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Code, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Code2, Minus, Table2, Image as ImageIcon,
  Undo2, Redo2, ArrowUp, ArrowDown, GripVertical, KeyboardOff,
} from 'lucide-react'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { moveBlock } from './blocks'
import Collaboration from '@tiptap/extension-collaboration'
import type * as Y from 'yjs'
import { noteExtensions } from './extensions'
import type { NoteLinkHandlers } from './extensions'
import { toTiptapContent } from './content'
import { NOTE_FRAGMENT } from './sync'
import { NoteAssetsContext, blobToDataUrl, dataUrlToBlob, shrinkImageBlob } from './assets'
import type { NoteAssets } from './assets'
import { SlashMenu } from './SlashMenu'
import { slashCommands } from './templates'
import { noteLinkHref } from './organize'

export type NoteEditorVariant = 'desktop' | 'mobile'

export interface NoteEditorProps {
  noteId: string
  content: string
  updatedAt: string
  /** Every change as Tiptap JSON (local previews; legacy mode also saves it). */
  onUpdate: (jsonContent: string) => void
  variant: NoteEditorVariant
  /** Bound Yjs document: content/updatedAt are then ignored and edits merge conflict-free. */
  ydoc?: Y.Doc
  /** Image storage. Without it (or when an upload fails) images are embedded as scaled-down JPEG. */
  assets?: NoteAssets
  /** Receives the editor once created (and null on unmount), e.g. to restore a version. */
  onReady?: (editor: Editor | null) => void
  /** #tag clicked, note link clicked, `[[` typed. */
  links?: NoteLinkHandlers
}

export function NoteEditor({ noteId, content, updatedAt, onUpdate, variant, ydoc, assets, onReady, links }: NoteEditorProps): JSX.Element | null {
  const linksRef = useRef<NoteLinkHandlers>(links ?? {})
  linksRef.current = links ?? {}
  const dirty = useRef(false)
  const slashKey = useRef<((event: KeyboardEvent) => boolean) | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const imageToSrcRef = useRef<(file: Blob) => Promise<string>>(async () => '')
  imageToSrcRef.current = async (file: Blob): Promise<string> => {
    const small = await shrinkImageBlob(file)
    if (assets) {
      try {
        return await assets.upload(small, noteId)
      } catch (err) {
        console.warn('[notes] image upload failed, embedding instead', err)
      }
    }
    return blobToDataUrl(small)
  }

  const editor = useEditor({
    extensions: noteExtensions({
      links: () => linksRef.current,
      ...(ydoc ? { collaboration: [Collaboration.configure({ document: ydoc, field: NOTE_FRAGMENT })] } : {}),
    }),
    ...(ydoc ? {} : { content: toTiptapContent(content) }),
    // Toolbar active states and undo/redo availability follow every transaction.
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: ed }) => {
      dirty.current = true
      onUpdateRef.current(JSON.stringify(ed.getJSON()))
    },
    editorProps: {
      attributes: { class: 'tiptap-content focus:outline-none' },
      handleKeyDown: (_view, event) => slashKey.current?.(event) ?? false,
      handlePaste(view, event) {
        const files = imageFiles(event.clipboardData?.items)
        if (files.length === 0) return false
        event.preventDefault()
        for (const file of files) {
          void imageToSrcRef.current(file).then((src) => {
            view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src, width: null })))
          }).catch((err) => console.warn('[notes] image paste failed', err))
        }
        return true
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (files.length === 0) return false
        event.preventDefault()
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
        for (const file of files) {
          void imageToSrcRef.current(file).then((src) => {
            view.dispatch(view.state.tr.insert(Math.min(at, view.state.doc.content.size), view.state.schema.nodes.image.create({ src, width: null })))
          }).catch((err) => console.warn('[notes] image drop failed', err))
        }
        return true
      },
    },
  }, [ydoc])

  // Legacy mode only (Yjs carries remote changes itself): another note opened → reset.
  useEffect(() => {
    if (!editor || ydoc) return
    dirty.current = false
    editor.commands.setContent(toTiptapContent(content), { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // Legacy mode only: remote change → apply while the user is not mid-edit.
  useEffect(() => {
    if (!editor || ydoc) return
    const incoming = JSON.stringify(toTiptapContent(content))
    if (JSON.stringify(editor.getJSON()) === incoming) {
      dirty.current = false
      return
    }
    if (dirty.current) return
    editor.commands.setContent(toTiptapContent(content), { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatedAt, content])

  editorRef.current = editor
  const commands = useMemo(() => slashCommands({
    pickImage: () => imageInput.current?.click(),
    linkNote: () => {
      void linksRef.current.pickNote?.().then((picked) => {
        if (!picked || !editorRef.current || editorRef.current.isDestroyed) return
        editorRef.current.chain().focus().insertContent([
          { type: 'text', text: picked.title || 'Adsız not', marks: [{ type: 'link', attrs: { href: noteLinkHref(picked.id) } }] },
          { type: 'text', text: ' ' },
        ]).run()
      })
    },
  }), [])

  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  useEffect(() => {
    onReadyRef.current?.(editor)
    return () => onReadyRef.current?.(null)
  }, [editor])

  useEffect(() => {
    if (!editor || !ydoc || !assets) return
    const t = setTimeout(() => void moveInlineImages(editor, assets, noteId), 1500)
    return () => clearTimeout(t)
  }, [editor, ydoc, assets, noteId])

  // iOS: the keyboard covers the bottom of the layout viewport; dock the toolbar on top of it.
  const [keyboardInset, setKeyboardInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (variant !== 'mobile' || !vv) return
    const update = (): void => {
      const inset = Math.round(window.innerHeight - vv.height - vv.offsetTop)
      setKeyboardInset(inset > 120 ? inset : 0)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [variant])

  if (!editor) return null

  const mobile = variant === 'mobile'
  const docked = mobile && keyboardInset > 0 && editor.isFocused
  const move = (dir: -1 | 1): void => {
    const tr = moveBlock(editor.state, dir)
    if (tr) editor.view.dispatch(tr)
    editor.view.focus()
  }
  const icon = mobile ? 'h-5 w-5' : 'h-3.5 w-3.5'
  const chain = () => editor.chain().focus()

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <InlineBubbleMenu editor={editor} />
      <SlashMenu editor={editor} commands={commands} keyHandler={slashKey} mobile={mobile} />
      <div
        role="toolbar"
        aria-label="Biçimlendirme"
        style={docked ? { position: 'fixed', left: 0, right: 0, bottom: keyboardInset, zIndex: 40 } : undefined}
        className={mobile
          ? `flex shrink-0 items-center gap-0.5 overflow-x-auto px-2 py-1 [scrollbar-width:none] ${docked ? 'border-t border-white/10 bg-card' : 'border-b border-white/[0.06]'}`
          : 'flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-3 py-1.5'}
      >
        {docked && (
          <ToolbarBtn mobile onClick={() => editor.commands.blur()} title="Klavyeyi kapat">
            <KeyboardOff className={icon} />
          </ToolbarBtn>
        )}
        <ToolbarBtn mobile={mobile} onClick={() => chain().undo().run()} disabled={!editor.can().undo()} title="Geri al (⌘Z)">
          <Undo2 className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => chain().redo().run()} disabled={!editor.can().redo()} title="Yinele (⇧⌘Z)">
          <Redo2 className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => move(-1)} disabled={!moveBlock(editor.state, -1)} title="Yukarı taşı (⌥↑)">
          <ArrowUp className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => move(1)} disabled={!moveBlock(editor.state, 1)} title="Aşağı taşı (⌥↓)">
          <ArrowDown className={icon} />
        </ToolbarBtn>
        <Separator mobile={mobile} />
        <ToolbarBtn mobile={mobile} onClick={() => chain().toggleTaskList().run()} active={editor.isActive('taskList')} title="Yapılacaklar listesi">
          <ListChecks className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => chain().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Madde listesi">
          <List className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => chain().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numaralı liste">
          <ListOrdered className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => imageInput.current?.click()} title="Fotoğraf ekle">
          <ImageIcon className={icon} />
        </ToolbarBtn>
        <Separator mobile={mobile} />
        <ToolbarBtn mobile={mobile} onClick={() => chain().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Başlık 1">
          <Heading1 className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => chain().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Başlık 2">
          <Heading2 className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => chain().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Başlık 3">
          <Heading3 className={icon} />
        </ToolbarBtn>
        <Separator mobile={mobile} />
        <ToolbarBtn mobile={mobile} onClick={() => chain().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Alıntı">
          <Quote className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => chain().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Kod bloğu">
          <Code2 className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} active={editor.isActive('table')} title="Tablo ekle">
          <Table2 className={icon} />
        </ToolbarBtn>
        <ToolbarBtn mobile={mobile} onClick={() => chain().setHorizontalRule().run()} title="Ayırıcı çizgi">
          <Minus className={icon} />
        </ToolbarBtn>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const src = await imageToSrcRef.current(file)
              editor.chain().focus().setImage({ src }).run()
            } catch (err) {
              console.warn('[notes] image insert failed', err)
            }
          }}
        />
      </div>
      <NoteAssetsContext.Provider value={assets ?? null}>
        {!mobile && (
          <DragHandle editor={editor} nested>
            <div className="flex h-6 w-5 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent active:cursor-grabbing" title="Sürükleyerek taşı">
              <GripVertical className="h-4 w-4" />
            </div>
          </DragHandle>
        )}
        <EditorContent
          editor={editor}
          className="scrollbar-thin tiptap-editor-area flex-1 overflow-y-auto"
          style={docked ? { paddingBottom: keyboardInset + 56 } : undefined}
        />
      </NoteAssetsContext.Provider>
    </div>
  )
}

// ── Selection bubble menu ─────────────────────────────────────────────────────

function InlineBubbleMenu({ editor }: { editor: Editor }): JSX.Element | null {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  useEffect(() => {
    const update = (): void => {
      const { selection } = editor.state
      if (selection.empty || !editor.isFocused) {
        setVisible(false)
        return
      }
      const start = editor.view.coordsAtPos(selection.from)
      const end = editor.view.coordsAtPos(selection.to)
      const area = editor.view.dom.closest('.tiptap-editor-area')
      if (!area) return
      const rect = area.getBoundingClientRect()
      setCoords({
        top: Math.max(4, start.top - rect.top - 44),
        left: Math.max(60, (start.left + end.right) / 2 - rect.left),
      })
      setVisible(true)
    }
    const hide = (): void => setVisible(false)
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

function ToolbarBtn({ mobile, onClick, active = false, disabled = false, title, children }: {
  mobile: boolean
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}): JSX.Element {
  const size = mobile ? 'h-11 w-11 rounded-lg' : 'rounded p-1.5'
  const tone = active
    ? 'bg-primary/20 text-primary'
    : mobile
      ? 'text-muted-foreground active:bg-white/10 hover:text-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        if (!disabled) onClick()
      }}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      className={`flex shrink-0 items-center justify-center transition-colors duration-100 disabled:opacity-35 ${size} ${tone}`}
    >
      {children}
    </button>
  )
}

function BubbleBtn({ onClick, active, title, children }: { onClick: () => void; active: boolean; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      title={title}
      className={`rounded p-1.5 transition-colors ${active ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
    >
      {children}
    </button>
  )
}

function Separator({ mobile }: { mobile: boolean }): JSX.Element {
  return <div className={mobile ? 'mx-1 h-5 w-px shrink-0 bg-white/10' : 'mx-1 h-4 w-px bg-border'} aria-hidden="true" />
}

function imageFiles(items: DataTransferItemList | undefined): File[] {
  return Array.from(items ?? [])
    .filter((item) => item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null)
}

/**
 * Moves images embedded as data: URLs (older notes, offline inserts) to Storage
 * and swaps in the reference. Runs once per open note while sync is active.
 */
async function moveInlineImages(editor: Editor, assets: NoteAssets, noteId: string): Promise<void> {
  const inline: string[] = []
  editor.state.doc.descendants((node) => {
    const src = node.type.name === 'image' ? String(node.attrs.src ?? '') : ''
    if (src.startsWith('data:image/') && !inline.includes(src)) inline.push(src)
  })
  for (const src of inline) {
    if (editor.isDestroyed) return
    let ref: string
    try {
      ref = await assets.upload(await dataUrlToBlob(src), noteId)
    } catch {
      return // offline: try again next time the note opens
    }
    if (editor.isDestroyed) return
    const tr = editor.state.tr
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image' && node.attrs.src === src) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: ref })
    })
    if (tr.docChanged) editor.view.dispatch(tr)
  }
}
