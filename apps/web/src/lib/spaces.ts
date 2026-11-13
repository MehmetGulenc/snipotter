/**
 * Shared spaces on iOS/web (docs/ortak-alan-tasarimi.md). The personal workspace
 * is the "person"; its key unlocks each space key.
 */
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import { getSupabase } from './supabase'
import { setNotesWorkspace } from './api'
import { useStore } from './store'
import { nativeBridgeAvailable } from './native-bridge'
import { clearSpaceCodecs, codec, codecFor } from '@shared/crypto/codec'
import {
  createInvite, createSpace, joinSpace, listMembers, loadSpaces, previewInvite, removeMember, renameSpace, type Space,
} from '@shared/crypto/spaces'
import type { SpacesApi } from '@shared/spaces/SpacesUI'

const ACTIVE = 'snipotter.activeSpace'
const NAME = 'snipotter.spaceName'
const read = (k: string): string | null => { try { return window.localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null): void => {
  try { if (v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k) } catch { /* private mode */ }
}

/** Name shown to the other members; remembered after the first time. */
export const savedDisplayName = (): string => read(NAME) ?? ''

function apply(personId: string, spaces: Space[], wanted: string | null): void {
  const activeId = wanted && spaces.some((s) => s.id === wanted) ? wanted : null
  write(ACTIVE, activeId)
  setNotesWorkspace(activeId ?? personId)
  useStore.getState().setSpaceState({ spaces, activeId })
}

/** Loads spaces and their keys once this device can read its personal workspace. */
export async function refreshSpaces(personId: string): Promise<void> {
  try {
    const spaces = await loadSpaces(getSupabase(), personId, codec())
    apply(personId, spaces, useStore.getState().activeSpaceId ?? read(ACTIVE))
  } catch (err) {
    console.warn('[spaces] load failed', err)
  }
}

export function openSpace(personId: string, id: string | null): void {
  apply(personId, useStore.getState().spaces, id)
}

export function forgetSpaces(): void {
  clearSpaceCodecs()
  write(ACTIVE, null)
  useStore.getState().setSpaceState({ spaces: [], activeId: null })
}

export function webSpacesApi(personId: string): SpacesApi {
  const sb = getSupabase()
  const remember = (name: string): void => { if (name.trim()) write(NAME, name.trim()) }
  return {
    async create(name, myName) {
      remember(myName)
      const space = await createSpace(sb, personId, codec(), name, myName || savedDisplayName())
      await refreshSpaces(personId)
      openSpace(personId, space.id)
      return space
    },
    async join(input, myName) {
      remember(myName)
      const space = await joinSpace(sb, personId, codec(), input, myName || savedDisplayName())
      await refreshSpaces(personId)
      openSpace(personId, space.id)
      return space
    },
    preview: (input) => previewInvite(sb, input),
    invite: (id) => createInvite(sb, personId, codec(), id),
    members: (id) => listMembers(sb, personId, codecFor(id), id),
    async rename(id, name) {
      await renameSpace(sb, codecFor(id), id, name)
      await refreshSpaces(personId)
    },
    async remove(id, target) {
      await removeMember(sb, personId, id, target ?? personId)
      await refreshSpaces(personId)
    },
    open: async (id) => openSpace(personId, id),
    async copy(text) {
      if (nativeBridgeAvailable()) await Clipboard.write({ string: text })
      else await navigator.clipboard.writeText(text)
    },
    share: nativeBridgeAvailable() ? async (text) => { await Share.share({ text, dialogTitle: 'Daveti gönder' }) } : undefined,
  }
}
