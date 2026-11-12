/** Pure, local clipboard transformations. HTML output always escapes input. */
const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function stripMarkdown(text: string): string {
  return text
    .replace(/^\s*(```|~~~)[^\n]*\n([\s\S]*?)^\s*\1\s*$/gm, '$2')
    .replace(/!\[([^\]]*)\]\([^\n)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^\n)]*\)/g, '$1')
    .replace(/^ {0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+(?:\[[ xX]\]\s*)?/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^ {0,3}(?:[-*_]\s*){3,}$/gm, '')
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w])([*_])(?=\S)([^\n]*?\S)\2(?!\w)/g, '$1$3')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\\([\\`*{}\[\]()#+.!_>|~-])/g, '$1')
    .trim()
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'))
}

export function markdownTableToSheet(text: string): { tsv: string; html: string } | null {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2 || !lines[0].includes('|')) return null
  const header = cells(lines[0])
  const divider = cells(lines[1])
  if (header.length < 2 || divider.length !== header.length || !divider.every(s => /^:?-{3,}:?$/.test(s))) return null
  const rows = [header, ...lines.slice(2).map(cells)]
  if (rows.some(row => row.length !== header.length)) return null
  const plain = rows.map(row => row.map(stripMarkdown))
  return {
    tsv: plain.map(row => row.map(s => s.replace(/[\t\r\n]/g, ' ')).join('\t')).join('\n'),
    html: '<table>' + plain.map((row, i) => '<tr>' + row.map(s => `<${i === 0 ? 'th' : 'td'}>${escapeHtml(s)}</${i === 0 ? 'th' : 'td'}>`).join('') + '</tr>').join('') + '</table>',
  }
}

export function joinBrokenLines(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const protectedLines: boolean[] = []
  let fence: { marker: string; length: number } | null = null
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)
    protectedLines.push(Boolean(fence || marker || line.includes('|') || /^(?: {4}|\t)/.test(line)))
    if (marker) {
      if (!fence) fence = { marker: marker[1][0], length: marker[1].length }
      else if (marker[1][0] === fence.marker && marker[1].length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = null
    }
  }
  let result = lines[0]
  for (let i = 1; i < lines.length; i++) {
    const previous = lines[i - 1]
    const next = lines[i]
    // Only join plausible prose continuations, preserving lists, tables and code.
    const continuation = !protectedLines[i - 1] && !protectedLines[i]
      && /[\p{L}]-?\s*$/u.test(previous) && /^\s*\p{Ll}/u.test(next)
      && !/^\s*(?:https?:\/\/|www\.)/i.test(next)
    if (continuation) {
      const hyphenated = /[\p{L}]-\s*$/u.test(previous)
      result = result.replace(hyphenated ? /-\s*$/ : /\s*$/, '') + (hyphenated ? '' : ' ') + next.trimStart()
    } else result += '\n' + next
  }
  return result
}

const TRACKING = /^(?:utm_.*|fbclid|gclid|dclid|igsh|igshid|si|msclkid|mc_cid|mc_eid|yclid|_ga|_gl|gbraid|wbraid)$/i
export function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (!/^https?:$/.test(parsed.protocol)) return url
    const keys = [...parsed.searchParams.keys()].filter(key => TRACKING.test(key))
    if (!keys.length) return url
    for (const key of keys) parsed.searchParams.delete(key)
    return parsed.toString()
  } catch { return url }
}

export function cleanUrlsInText(text: string): { text: string; changed: number } {
  let changed = 0
  const result = text.replace(/https?:\/\/[^\s<>"']+/gi, match => {
    const suffix = match.match(/[.,;!?)\]}]+$/)?.[0] ?? ''
    const url = suffix ? match.slice(0, -suffix.length) : match
    const cleaned = cleanUrl(url)
    if (cleaned !== url) changed++
    return cleaned + suffix
  })
  return { text: result, changed }
}

export function laundryOptions(text: string): Array<{ id: 'table' | 'plain' | 'paragraph' | 'links'; label: string; result: { text: string; html?: string } }> {
  const options: ReturnType<typeof laundryOptions> = []
  const table = markdownTableToSheet(text)
  if (table) options.push({ id: 'table', label: 'Tablo olarak kopyala', result: { text: table.tsv, html: table.html } })
  const plain = stripMarkdown(text)
  if (plain !== text.trim()) options.push({ id: 'plain', label: 'Düz metin kopyala', result: { text: plain } })
  const paragraph = joinBrokenLines(text)
  if (!table && paragraph !== text && paragraph !== text.replace(/\r\n?/g, '\n')) options.push({ id: 'paragraph', label: 'Satırları birleştir', result: { text: paragraph } })
  const links = cleanUrlsInText(text)
  if (links.changed) options.push({ id: 'links', label: 'Bağlantıları temizle', result: { text: links.text } })
  return options
}
