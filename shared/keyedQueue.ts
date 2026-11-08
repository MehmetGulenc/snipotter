/** Serialize writes to the same record without blocking other records. */
export function createKeyedQueue() {
  const pending = new Map<string, Promise<unknown>>()
  return function enqueue<T>(key: string, write: () => Promise<T>): Promise<T> {
    const previous = pending.get(key) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(write)
    pending.set(key, result)
    const cleanup = () => {
      if (pending.get(key) === result) pending.delete(key)
    }
    void result.then(cleanup, cleanup)
    return result
  }
}
