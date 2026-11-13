/** Note content helpers shared by desktop and iOS/web. Pure: no React, no DOM. */
import type { JSONContent } from '@tiptap/core'

/** Stored content (Tiptap JSON string or legacy plain text) → Tiptap document. */
export function toTiptapContent(raw: string): JSONContent | string {
  if (!raw?.trim()) return ''
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.type === 'doc') return parsed
  } catch { /* legacy plain text */ }
  return {
    type: 'doc',
    content: raw.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  }
}

/** Plain text for previews, search and AI. Lists keep their markers, one item per line. */
export function extractText(raw: string): string {
  if (!raw?.trim()) return ''
  try {
    const doc = JSON.parse(raw)
    if (doc?.type === 'doc') return nodeText(doc).trim()
  } catch { /* legacy plain text */ }
  return raw
}

const INLINE_PARENTS = new Set(['paragraph', 'heading', 'codeBlock', 'tableCell', 'tableHeader'])

function nodeText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  const children = node.content ?? []
  if (INLINE_PARENTS.has(node.type ?? '')) return children.map(nodeText).join('')
  const start = Number(node.attrs?.start ?? 1)
  const marker = (child: JSONContent, i: number): string => {
    if (node.type === 'bulletList') return '• '
    if (node.type === 'orderedList') return `${start + i}. `
    if (node.type === 'taskList') return child.attrs?.checked ? '☑ ' : '☐ '
    return ''
  }
  const sep = node.type === 'tableRow' ? ' | ' : '\n'
  return children
    .map((child, i) => {
      const text = nodeText(child)
      return text.trim() ? marker(child, i) + text : ''
    })
    .filter(Boolean)
    .join(sep)
}

/** Leading list marker added by extractText; stripped when a line becomes a title. */
export const LIST_MARKER = /^(?:• |☐ |☑ |\d+\. )/

/** First non-empty line, without a list marker, for untitled notes. */
export function noteTitleFallback(raw: string, max = 80): string {
  const line = extractText(raw).split('\n').find((l) => l.trim()) ?? ''
  const clean = line.replace(LIST_MARKER, '')
  return clean.length > max ? clean.slice(0, max) + '…' : clean
}

// ── Markdown ──────────────────────────────────────────────────────────────────

/** Image sources in a stored note (for resolving Storage references before export). */
export function imageSources(jsonStr: string): string[] {
  const out = new Set<string>()
  const walk = (n: JSONContent): void => {
    if (n.type === 'image' && typeof n.attrs?.src === 'string') out.add(n.attrs.src)
    n.content?.forEach(walk)
  }
  const doc = parseDoc(jsonStr)
  if (doc) walk(doc)
  return [...out]
}

/** Maps stored image sources to exportable URLs; unknown ones are dropped. */
export type SrcMap = Record<string, string>

export function tiptapToMarkdown(title: string | null | undefined, jsonStr: string, srcMap: SrcMap = {}): string {
  const lines: string[] = []
  if (title?.trim()) lines.push(`# ${title.trim()}\n`)
  const doc = parseDoc(jsonStr)
  if (!doc) {
    if (title?.trim()) lines.push('')
    lines.push(jsonStr)
    return lines.join('\n')
  }
  for (const node of doc.content ?? []) lines.push(blockToMd(node, srcMap))
  return lines.join('\n')
}

function blockToMd(node: JSONContent, srcMap: SrcMap): string {
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inlineToMd(node.content ?? [])}\n`
    case 'paragraph': {
      const text = inlineToMd(node.content ?? [])
      return text ? `${text}\n` : '\n'
    }
    case 'bulletList':
      return (node.content ?? []).map((li) => `- ${listItemText(li)}`).join('\n') + '\n'
    case 'orderedList':
      return (node.content ?? []).map((li, i) => `${Number(node.attrs?.start ?? 1) + i}. ${listItemText(li)}`).join('\n') + '\n'
    case 'taskList':
      return (node.content ?? []).map((li) => `- [${li.attrs?.checked ? 'x' : ' '}] ${listItemText(li)}`).join('\n') + '\n'
    case 'blockquote':
      return (node.content ?? []).map((n) => `> ${blockToMd(n, srcMap)}`).join('')
    case 'codeBlock':
      return `\`\`\`${node.attrs?.language ?? ''}\n${(node.content ?? []).map((n) => n.text ?? '').join('')}\n\`\`\`\n`
    case 'horizontalRule':
      return '---\n'
    case 'image': {
      const src = exportSrc(String(node.attrs?.src ?? ''), srcMap)
      return src ? `![${node.attrs?.alt ?? ''}](${src})\n` : ''
    }
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
      if (n.type === 'hardBreak') return '  \n'
      if (n.type !== 'text') return ''
      let text = n.text ?? ''
      for (const mark of n.marks ?? []) {
        if (mark.type === 'bold') text = `**${text}**`
        else if (mark.type === 'italic') text = `_${text}_`
        else if (mark.type === 'code') text = `\`${text}\``
        else if (mark.type === 'strike') text = `~~${text}~~`
        else if (mark.type === 'link') text = `[${text}](${mark.attrs?.href ?? ''})`
      }
      return text
    })
    .join('')
}

// ── HTML (PDF export, sharing) ────────────────────────────────────────────────

export function tiptapToHtml(title: string | null | undefined, jsonStr: string, srcMap: SrcMap = {}): string {
  const parts: string[] = []
  if (title?.trim()) parts.push(`<h1>${esc(title.trim())}</h1>`)
  const doc = parseDoc(jsonStr)
  if (!doc) {
    parts.push(`<p>${esc(jsonStr).replace(/\n/g, '<br>')}</p>`)
    return parts.join('\n')
  }
  for (const node of doc.content ?? []) parts.push(blockToHtml(node, srcMap))
  return parts.join('\n')
}

function blockToHtml(node: JSONContent, srcMap: SrcMap): string {
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1)
      return `<h${level}>${inlineToHtml(node.content ?? [])}</h${level}>`
    }
    case 'paragraph':
      return `<p>${inlineToHtml(node.content ?? []) || '&nbsp;'}</p>`
    case 'bulletList':
      return `<ul>${(node.content ?? []).map((li) => `<li>${listItemHtml(li)}</li>`).join('')}</ul>`
    case 'orderedList':
      return `<ol>${(node.content ?? []).map((li) => `<li>${listItemHtml(li)}</li>`).join('')}</ol>`
    case 'taskList':
      return `<ul style="list-style:none;padding-left:0">${(node.content ?? [])
        .map((li) => `<li><input type="checkbox" disabled ${li.attrs?.checked ? 'checked' : ''}> ${listItemHtml(li)}</li>`)
        .join('')}</ul>`
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map((n) => blockToHtml(n, srcMap)).join('')}</blockquote>`
    case 'codeBlock':
      return `<pre><code>${(node.content ?? []).map((n) => esc(n.text ?? '')).join('')}</code></pre>`
    case 'horizontalRule':
      return '<hr>'
    case 'image': {
      const src = exportSrc(String(node.attrs?.src ?? ''), srcMap)
      return src ? `<img src="${esc(src)}" alt="${esc(String(node.attrs?.alt ?? ''))}">` : ''
    }
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
      if (n.type === 'hardBreak') return '<br>'
      if (n.type !== 'text') return ''
      let text = esc(n.text ?? '')
      for (const mark of n.marks ?? []) {
        if (mark.type === 'bold') text = `<strong>${text}</strong>`
        else if (mark.type === 'italic') text = `<em>${text}</em>`
        else if (mark.type === 'code') text = `<code>${text}</code>`
        else if (mark.type === 'strike') text = `<s>${text}</s>`
        else if (mark.type === 'link') {
          const href = String(mark.attrs?.href ?? '')
          text = /^(https?:|mailto:)/i.test(href) ? `<a href="${esc(href)}">${text}</a>` : text
        }
      }
      return text
    })
    .join('')
}

function exportSrc(src: string, srcMap: SrcMap): string | null {
  const mapped = srcMap[src] ?? src
  return /^(https:|data:image\/)/.test(mapped) ? mapped : null
}

function parseDoc(jsonStr: string): JSONContent | null {
  try {
    const parsed = JSON.parse(jsonStr)
    return parsed?.type === 'doc' ? parsed : null
  } catch {
    return null
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
