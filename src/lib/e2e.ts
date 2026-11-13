import type { EncryptionActions } from '@shared/crypto/EncryptionScreens'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }
async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p
  if (!r.ok) throw new Error(r.error)
  return r.data
}

/** The main process holds the key and does the work; the renderer only drives the screens. */
export const desktopEncryptionActions: EncryptionActions = {
  prepare: () => unwrap(window.snipotter.e2e.prepare()),
  commit: (answers) => unwrap(window.snipotter.e2e.commit(answers)),
  async migrate(onProgress) {
    const off = window.snipotter.e2e.onProgress(onProgress)
    try {
      await unwrap(window.snipotter.e2e.migrate())
    } finally {
      off()
    }
  },
  async pair() {
    const { id, code } = await unwrap(window.snipotter.e2e.pairStart())
    return {
      code,
      async wait(signal) {
        const cancel = () => void window.snipotter.e2e.pairCancel()
        signal.addEventListener('abort', cancel)
        try {
          await unwrap(window.snipotter.e2e.pairWait(id))
        } finally {
          signal.removeEventListener('abort', cancel)
        }
      },
    }
  },
  async recover(words) {
    await unwrap(window.snipotter.e2e.join(words))
  },
}

export const pairApi = {
  list: () => unwrap(window.snipotter.e2e.pairRequests()),
  approve: (id: string) => unwrap(window.snipotter.e2e.pairApprove(id)),
  decline: (id: string) => unwrap(window.snipotter.e2e.pairDecline(id)),
}
