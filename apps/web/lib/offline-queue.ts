/**
 * Tiny IndexedDB-backed write queue. When the user is offline, callers push
 * an "intended request" (URL + method + JSON body + a stable key) and we
 * replay it the next time the browser tells us we're online.
 *
 * Designed for low-risk, idempotent writes (mark-attendance, mark-boarded).
 * Don't queue ops that depend on server-generated IDs returned in the
 * response — there's no continuation hook for that.
 */

const DB_NAME = "educore-queue"
const STORE = "writes"
const VERSION = 1

export type QueuedWrite = {
  /** Stable client-side identifier (e.g. `attendance:<sectionId>:<date>`).
   *  Re-enqueuing with the same key replaces the prior entry instead of
   *  appending a duplicate. */
  key: string
  url: string
  method: "POST" | "PUT" | "PATCH" | "DELETE"
  body: unknown
  /** Human-readable label for the UI (e.g. "Attendance — JSS 1 Arm A · Tue 5 Mar"). */
  label: string
  enqueuedAt: number
  attempts: number
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "key" })
        os.createIndex("enqueuedAt", "enqueuedAt", { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"))
  })
}

function reqAsPromise<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"))
  })
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const store = t.objectStore(STORE)
        let result: T
        Promise.resolve(run(store))
          .then((r) => {
            result = r
          })
          .catch(reject)
        t.oncomplete = () => resolve(result)
        t.onerror = () => reject(t.error ?? new Error("IndexedDB tx failed"))
        t.onabort = () => reject(t.error ?? new Error("IndexedDB tx aborted"))
      }),
  )
}

export async function enqueue(
  input: Omit<QueuedWrite, "enqueuedAt" | "attempts">,
): Promise<void> {
  if (!isClient()) return
  const entry: QueuedWrite = { ...input, enqueuedAt: Date.now(), attempts: 0 }
  await tx("readwrite", (store) => {
    store.put(entry)
  })
}

export async function listQueue(): Promise<QueuedWrite[]> {
  if (!isClient()) return []
  return tx<QueuedWrite[]>("readonly", async (store) => {
    const all = await reqAsPromise<QueuedWrite[]>(store.getAll())
    return all.sort((a, b) => a.enqueuedAt - b.enqueuedAt)
  })
}

export async function removeFromQueue(key: string): Promise<void> {
  if (!isClient()) return
  await tx("readwrite", (store) => {
    store.delete(key)
  })
}

export async function clearQueue(): Promise<void> {
  if (!isClient()) return
  await tx("readwrite", (store) => {
    store.clear()
  })
}

export type SyncResult = {
  attempted: number
  succeeded: number
  failed: number
  errors: { key: string; status?: number; message: string }[]
}

/**
 * Flush the queue. Stops on the first network failure (keeps the rest queued
 * for the next attempt). HTTP 4xx/5xx is counted as a "failed" item but the
 * loop continues — those entries are likely poison and will be retried later
 * with bumped attempts.
 */
export async function flushQueue(): Promise<SyncResult> {
  const result: SyncResult = { attempted: 0, succeeded: 0, failed: 0, errors: [] }
  if (!isClient() || !navigator.onLine) return result

  const items = await listQueue()
  for (const item of items) {
    result.attempted += 1
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item.body),
      })
      if (res.ok) {
        await removeFromQueue(item.key)
        result.succeeded += 1
      } else {
        result.failed += 1
        result.errors.push({ key: item.key, status: res.status, message: res.statusText })
        await tx("readwrite", (store) => {
          store.put({ ...item, attempts: item.attempts + 1 })
        })
      }
    } catch (err) {
      // Network error → stop; leave the item queued, increment attempts.
      result.failed += 1
      result.errors.push({
        key: item.key,
        message: err instanceof Error ? err.message : "Network error",
      })
      await tx("readwrite", (store) => {
        store.put({ ...item, attempts: item.attempts + 1 })
      })
      break
    }
  }
  return result
}
