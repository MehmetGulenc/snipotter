import type { SpacesApi } from '@shared/spaces/SpacesUI'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }
async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p
  if (!r.ok) throw new Error(r.error)
  return r.data
}

const s = () => window.snipotter.spaces

/** The main process holds the keys; the renderer only drives the screens. */
const NAME = 'snipotter.spaceName'
/** Name shown to the other members; asked once, then remembered. */
export const savedSpaceName = (): string => { try { return window.localStorage.getItem(NAME) ?? '' } catch { return '' } }
const remember = (name: string): void => { try { if (name.trim()) window.localStorage.setItem(NAME, name.trim()) } catch { /* ignore */ } }

export const desktopSpacesApi: SpacesApi = {
  create: (name, myName) => { remember(myName); return unwrap(s().create(name, myName || savedSpaceName())) },
  join: (input, myName) => { remember(myName); return unwrap(s().join(input, myName || savedSpaceName())) },
  preview: (input) => unwrap(s().preview(input)),
  invite: (id) => unwrap(s().invite(id)),
  members: (id) => unwrap(s().members(id)),
  rename: (id, name) => unwrap(s().rename(id, name)),
  remove: (id, target) => unwrap(s().remove(id, target)),
  open: async (id) => { await unwrap(s().open(id)) },
  // Written without becoming a history entry: an invite is a secret.
  copy: async (text) => { await unwrap(window.snipotter.clipboard.writeText(text)) },
}
