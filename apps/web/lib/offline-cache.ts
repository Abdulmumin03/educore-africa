/**
 * Tiny IndexedDB cache for offline resource downloads.
 *
 * - One database (`educore-offline`) with a single object store `resources`.
 * - Each entry: { id, blob, contentType, name, sizeBytes, savedAt, lastAccessedAt }.
 * - Per-user cap CAP_BYTES — when exceeded, LRU eviction by `lastAccessedAt`.
 * - All methods return a no-op result on the server (so they're safe to call
 *   from RSC or during prerender).
 */

const DB_NAME = "educore-offline"
const STORE = "resources"
const VERSION = 1

export const CAP_BYTES = 200 * 1024 * 1024 // 200 MB

export type CacheEntry = {
  id: string
  blob: Blob
  contentType: string
  name: string
  sizeBytes: number
  savedAt: number
  lastAccessedAt: number
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
        const os = db.createObjectStore(STORE, { keyPath: "id" })
        os.createIndex("lastAccessedAt", "lastAccessedAt", { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"))
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

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"))
  })
}

export async function listOffline(): Promise<CacheEntry[]> {
  if (!isClient()) return []
  return tx<CacheEntry[]>("readonly", async (store) => {
    const req = store.getAll()
    const all = await reqAsPromise<CacheEntry[]>(req)
    return all.sort((a, b) => b.savedAt - a.savedAt)
  })
}

export async function getOffline(id: string): Promise<CacheEntry | null> {
  if (!isClient()) return null
  const entry = await tx<CacheEntry | undefined>("readwrite", async (store) => {
    const e = await reqAsPromise<CacheEntry | undefined>(store.get(id))
    if (e) {
      e.lastAccessedAt = Date.now()
      store.put(e)
    }
    return e
  })
  return entry ?? null
}

export async function removeOffline(id: string): Promise<void> {
  if (!isClient()) return
  await tx("readwrite", (store) => {
    store.delete(id)
  })
}

export async function totalBytes(): Promise<number> {
  if (!isClient()) return 0
  return tx<number>("readonly", async (store) => {
    const all = await reqAsPromise<CacheEntry[]>(store.getAll())
    return all.reduce((s, e) => s + (e.sizeBytes ?? 0), 0)
  })
}

/**
 * Download a URL (same-origin or CORS-enabled) and persist the resulting Blob
 * in IndexedDB. Enforces the 200 MB cap by LRU-evicting the oldest entries.
 */
export async function saveOffline(input: {
  id: string
  url: string
  name: string
}): Promise<{ ok: true; sizeBytes: number } | { ok: false; error: string }> {
  if (!isClient()) return { ok: false, error: "Not in a browser" }

  // Already cached? Refresh accessed timestamp and return.
  const existing = await tx<CacheEntry | undefined>("readonly", (store) =>
    reqAsPromise<CacheEntry | undefined>(store.get(input.id)),
  )
  if (existing) return { ok: true, sizeBytes: existing.sizeBytes }

  let blob: Blob
  let contentType: string
  try {
    const res = await fetch(input.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    blob = await res.blob()
    contentType = res.headers.get("content-type") ?? blob.type ?? "application/octet-stream"
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Download failed" }
  }

  const sizeBytes = blob.size
  if (sizeBytes > CAP_BYTES) {
    return { ok: false, error: "File exceeds the 200 MB cap." }
  }

  await ensureCapacity(sizeBytes)

  const now = Date.now()
  await tx("readwrite", (store) => {
    const entry: CacheEntry = {
      id: input.id,
      blob,
      contentType,
      name: input.name,
      sizeBytes,
      savedAt: now,
      lastAccessedAt: now,
    }
    store.put(entry)
  })
  return { ok: true, sizeBytes }
}

/**
 * Drop entries whose `lastAccessedAt` is older than `days` days. Returns
 * the number of entries removed. Useful as a periodic background sweep so
 * stale files don't sit indefinitely consuming the user's storage quota.
 */
export async function pruneOlderThan(days: number): Promise<number> {
  if (!isClient()) return 0
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return tx<number>("readwrite", (store) => {
    const idx = store.index("lastAccessedAt")
    const range = IDBKeyRange.upperBound(cutoff, true)
    const cursor = idx.openCursor(range)
    return new Promise<number>((resolve, reject) => {
      let removed = 0
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) {
          resolve(removed)
          return
        }
        c.delete()
        removed += 1
        c.continue()
      }
      cursor.onerror = () => reject(cursor.error ?? new Error("Prune failed"))
    })
  })
}

async function ensureCapacity(incomingBytes: number): Promise<void> {
  const current = await totalBytes()
  if (current + incomingBytes <= CAP_BYTES) return

  // Evict by ascending lastAccessedAt until we fit.
  await tx("readwrite", async (store) => {
    const idx = store.index("lastAccessedAt")
    const cursor = idx.openCursor()
    return new Promise<void>((resolve, reject) => {
      let freed = 0
      const needed = current + incomingBytes - CAP_BYTES
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) {
          resolve()
          return
        }
        const v = c.value as CacheEntry
        freed += v.sizeBytes ?? 0
        c.delete()
        if (freed >= needed) {
          resolve()
          return
        }
        c.continue()
      }
      cursor.onerror = () => reject(cursor.error ?? new Error("Eviction failed"))
    })
  })
}
