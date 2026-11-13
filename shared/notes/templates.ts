/** Note templates and editor commands (slash menu). Pure data + Tiptap chains. */
import type { Editor, JSONContent } from '@tiptap/core'

const p = (text = ''): JSONContent => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' })
const h = (level: 1 | 2 | 3, text: string): JSONContent => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
const tasks = (...items: string[]): JSONContent => ({
  type: 'taskList',
  content: items.map((t) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(t)] })),
})
const bullets = (...items: string[]): JSONContent => ({
  type: 'bulletList',
  content: items.map((t) => ({ type: 'listItem', content: [p(t)] })),
})

export const longDate = (d = new Date()): string =>
  d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export interface NoteTemplate {
  id: string
  label: string
  keywords: string
  build: () => JSONContent[]
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'meeting',
    label: 'Toplantı notu',
    keywords: 'toplanti meeting gundem karar',
    build: () => [
      h(2, `Toplantı · ${longDate()}`),
      p('Katılımcılar: '),
      h(3, 'Gündem'),
      bullets('', ''),
      h(3, 'Kararlar'),
      bullets(''),
      h(3, 'Yapılacaklar'),
      tasks('', ''),
    ],
  },
  {
    id: 'shopping',
    label: 'Alışveriş listesi',
    keywords: 'alisveris market liste shopping',
    build: () => [h(2, 'Alışveriş'), tasks('', '', '')],
  },
  {
    id: 'journal',
    label: 'Günlük',
    keywords: 'gunluk journal bugun',
    build: () => [
      h(2, longDate()),
      h(3, 'Bugün neler oldu?'),
      p(),
      h(3, 'Minnettar olduklarım'),
      bullets('', '', ''),
      h(3, 'Yarın için'),
      tasks(''),
    ],
  },
  {
    id: 'project',
    label: 'Proje planı',
    keywords: 'proje plan hedef project',
    build: () => [
      h(2, 'Proje'),
      p('Amaç: '),
      p('Son tarih: '),
      h(3, 'Adımlar'),
      tasks('', '', ''),
      h(3, 'Notlar'),
      p(),
    ],
  },
]

export interface SlashCommand {
  id: string
  label: string
  /** Extra words matched by the filter (ASCII-folded Turkish). */
  keywords: string
  group: 'Biçim' | 'Ekle' | 'Şablon'
  run: (editor: Editor) => void
}

export interface SlashContext {
  pickImage: () => void
  linkNote: () => void
}

export function slashCommands(ctx: SlashContext): SlashCommand[] {
  return [
    { id: 'p', label: 'Metin', keywords: 'paragraf text duz', group: 'Biçim', run: (e) => e.chain().focus().setParagraph().run() },
    { id: 'h1', label: 'Başlık 1', keywords: 'baslik heading buyuk h1', group: 'Biçim', run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
    { id: 'h2', label: 'Başlık 2', keywords: 'baslik heading orta h2', group: 'Biçim', run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
    { id: 'h3', label: 'Başlık 3', keywords: 'baslik heading kucuk h3', group: 'Biçim', run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
    { id: 'ul', label: 'Madde listesi', keywords: 'liste bullet madde', group: 'Biçim', run: (e) => e.chain().focus().toggleBulletList().run() },
    { id: 'ol', label: 'Numaralı liste', keywords: 'liste numara ordered sirali', group: 'Biçim', run: (e) => e.chain().focus().toggleOrderedList().run() },
    { id: 'todo', label: 'Yapılacaklar', keywords: 'gorev todo checkbox kutu yapilacak', group: 'Biçim', run: (e) => e.chain().focus().toggleTaskList().run() },
    { id: 'quote', label: 'Alıntı', keywords: 'alinti quote', group: 'Biçim', run: (e) => e.chain().focus().toggleBlockquote().run() },
    { id: 'code', label: 'Kod bloğu', keywords: 'kod code program', group: 'Biçim', run: (e) => e.chain().focus().toggleCodeBlock().run() },
    { id: 'table', label: 'Tablo', keywords: 'tablo table', group: 'Ekle', run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'hr', label: 'Ayırıcı çizgi', keywords: 'ayirici cizgi divider', group: 'Ekle', run: (e) => e.chain().focus().setHorizontalRule().run() },
    { id: 'image', label: 'Fotoğraf', keywords: 'fotograf resim gorsel image', group: 'Ekle', run: () => ctx.pickImage() },
    { id: 'link', label: 'Not bağlantısı', keywords: 'baglanti link not', group: 'Ekle', run: () => ctx.linkNote() },
    { id: 'date', label: 'Bugünün tarihi', keywords: 'tarih bugun date', group: 'Ekle', run: (e) => e.chain().focus().insertContent(longDate() + ' ').run() },
    ...NOTE_TEMPLATES.map((t): SlashCommand => ({
      id: `tpl-${t.id}`,
      label: t.label,
      keywords: `sablon ${t.keywords}`,
      group: 'Şablon',
      run: (e) => e.chain().focus().insertContent(t.build()).run(),
    })),
  ]
}

const fold = (s: string): string =>
  s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')

/** Commands whose label or keywords contain every typed word. */
export function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return commands
  return commands.filter((c) => {
    const hay = fold(`${c.label} ${c.keywords}`)
    return words.every((w) => hay.includes(w))
  })
}
