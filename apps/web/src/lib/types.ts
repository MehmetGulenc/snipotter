/**
 * Mirrored from /shared/types.ts so the web app stays decoupled
 * but type-compatible with the desktop schema.
 */
export type ClipboardContentType = 'text' | 'image' | 'file' | 'rich-text'

export interface SnipotterUser {
  id: string
  email: string | null
  isAnonymous?: boolean
}

export interface Workspace {
  id: string
  name: string
  createdAt: string
  isOwner: boolean
}

export interface WorkspaceMember {
  userId: string
  role: 'owner' | 'member'
  deviceName: string | null
  joinedAt: string
  isSelf: boolean
}

export interface AISummary {
  summary: string
  tags: string[]
  language?: string
  provider: 'claude-haiku' | 'gemini-flash' | 'none'
  tokensIn?: number
  tokensOut?: number
}

export interface ClipboardItem {
  id: string
  workspaceId: string
  contentType: ClipboardContentType
  text: string
  hash: string
  html?: string | null
  sourceApp?: string | null
  pinned: boolean
  ai?: AISummary | null
  createdAt: string
  updatedAt: string
}

export interface Note {
  id: string
  workspaceId: string
  title: string | null
  content: string
  pinned: boolean
  fromClipboardId?: string | null
  ai?: AISummary | null
  createdAt: string
  updatedAt: string
}
