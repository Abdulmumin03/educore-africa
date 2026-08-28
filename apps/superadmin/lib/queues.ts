import { Queue } from "bullmq"

import { redis } from "@/lib/redis"

// Background job monitor.
//
// The platform runs exactly ONE BullMQ queue today — `attendance`, driven by
// apps/web's worker. The four other queues the console was specced to show
// (notifications, ai_scoring, report_generation, email_delivery) have no
// producer and no worker anywhere in the codebase: notifications are written
// synchronously, AI scoring runs inline, reports render on request and email
// goes straight out through Resend.
//
// Rather than print four rows of zeroes that read as "idle", they are listed
// as PLANNED with the reason. A zero and "this does not exist" look the same
// on a queue board and mean opposite things.

export type QueueState = "live" | "planned"

export type QueueDef = {
  name: string
  label: string
  state: QueueState
  /** Why it is not live yet. Only set for planned queues. */
  note?: string
}

export const QUEUES: QueueDef[] = [
  { name: "attendance", label: "Attendance SMS", state: "live" },
  {
    name: "notifications",
    label: "Notifications",
    state: "planned",
    note: "Notifications are written synchronously by the school app — no queue exists.",
  },
  {
    name: "ai_scoring",
    label: "AI scoring",
    state: "planned",
    note: "Risk scoring runs inline in the request that asks for it.",
  },
  {
    name: "report_generation",
    label: "Report generation",
    state: "planned",
    note: "Report cards render on request; nothing is enqueued.",
  },
  {
    name: "email_delivery",
    label: "Email delivery",
    state: "planned",
    note: "Email is handed straight to Resend by the sending route.",
  },
]

export type QueueSnapshot = {
  name: string
  label: string
  state: QueueState
  note?: string
  pending: number | null
  active: number | null
  failed: number | null
  delayed: number | null
  /** Completed in the last 24 hours, where BullMQ still retains them. */
  completed24h: number | null
  workers: number | null
  paused: boolean
}

const clients = new Map<string, Queue>()

function queueFor(name: string): Queue {
  const existing = clients.get(name)
  if (existing) return existing
  // Reuse the console's ioredis connection settings rather than opening a
  // second pool per queue.
  const queue = new Queue(name, {
    connection: {
      host: redis.options.host,
      port: redis.options.port,
      password: redis.options.password,
      username: redis.options.username,
      db: redis.options.db,
      tls: redis.options.tls,
      // BullMQ requires this; ioredis defaults to 20 and BullMQ refuses.
      maxRetriesPerRequest: null,
    },
  })
  clients.set(name, queue)
  return queue
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function queueSnapshots(): Promise<{
  queues: QueueSnapshot[]
  connected: boolean
}> {
  const snapshots: QueueSnapshot[] = []
  let connected = true

  for (const def of QUEUES) {
    if (def.state === "planned") {
      snapshots.push({
        ...def,
        pending: null,
        active: null,
        failed: null,
        delayed: null,
        completed24h: null,
        workers: null,
        paused: false,
      })
      continue
    }

    try {
      const queue = queueFor(def.name)
      const [counts, workers, paused, completed] = await Promise.all([
        queue.getJobCounts("wait", "active", "failed", "delayed"),
        queue.getWorkers(),
        queue.isPaused(),
        // BullMQ keeps completed jobs only as long as removeOnComplete allows,
        // so this is "retained and finished in 24h", not lifetime throughput.
        queue.getJobs(["completed"], 0, 999),
      ])

      const cutoff = Date.now() - DAY_MS
      snapshots.push({
        ...def,
        pending: counts.wait ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        completed24h: completed.filter((job) => (job.finishedOn ?? 0) >= cutoff).length,
        workers: workers.length,
        paused,
      })
    } catch {
      connected = false
      snapshots.push({
        ...def,
        pending: null,
        active: null,
        failed: null,
        delayed: null,
        completed24h: null,
        workers: null,
        paused: false,
      })
    }
  }

  return { queues: snapshots, connected }
}

export type FailedJob = {
  id: string
  name: string
  attempts: number
  failedReason: string
  stacktrace: string | null
  data: unknown
  failedAt: string | null
}

export async function failedJobs(name: string, limit = 25): Promise<FailedJob[]> {
  const def = QUEUES.find((entry) => entry.name === name)
  if (!def || def.state !== "live") return []

  try {
    const jobs = await queueFor(name).getJobs(["failed"], 0, limit - 1)
    return jobs.map((job) => ({
      id: String(job.id),
      name: job.name,
      attempts: job.attemptsMade,
      failedReason: job.failedReason ?? "Unknown",
      stacktrace: job.stacktrace?.[0]?.slice(0, 2000) ?? null,
      data: job.data,
      failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    }))
  } catch {
    return []
  }
}

/**
 * Re-queue failed jobs.
 *
 * Returns what actually happened rather than a bare ok: a retry that silently
 * moved nothing is indistinguishable from a working one otherwise.
 */
export async function retryFailed(
  name: string,
  jobId?: string,
): Promise<{ retried: number; skipped: number; error?: string }> {
  const def = QUEUES.find((entry) => entry.name === name)
  if (!def) return { retried: 0, skipped: 0, error: "No such queue." }
  if (def.state !== "live") {
    return { retried: 0, skipped: 0, error: `${def.label} has no worker — ${def.note}` }
  }

  try {
    const queue = queueFor(name)
    const jobs = jobId
      ? [await queue.getJob(jobId)].filter(Boolean)
      : await queue.getJobs(["failed"], 0, 99)

    let retried = 0
    let skipped = 0
    for (const job of jobs) {
      if (!job) continue
      try {
        await job.retry()
        retried += 1
      } catch {
        skipped += 1
      }
    }
    return { retried, skipped }
  } catch (error) {
    return {
      retried: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : "Could not reach the queue.",
    }
  }
}
