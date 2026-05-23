import { Queue, type JobsOptions } from "bullmq"
import { bullConnection } from "@/lib/queues/connection"

export const ATTENDANCE_QUEUE_NAME = "attendance" as const

export type AbsentSmsJob = {
  type: "absent-sms"
  studentId: string
  date: string // YYYY-MM-DD
}

export type ConsecutiveAbsenceJob = {
  type: "consecutive-absence-check"
  studentId: string
}

export type TermWarningJob = {
  type: "term-warning-check"
  studentId: string
  termId: string
}

export type AttendanceJob = AbsentSmsJob | ConsecutiveAbsenceJob | TermWarningJob

let cachedQueue: Queue<AttendanceJob> | null = null

function getQueue(): Queue<AttendanceJob> {
  if (cachedQueue) return cachedQueue
  cachedQueue = new Queue<AttendanceJob>(ATTENDANCE_QUEUE_NAME, {
    connection: bullConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  })
  return cachedQueue
}

function shouldInline(): boolean {
  const v = process.env.ATTENDANCE_INLINE_DISPATCH
  return v === "true" || v === "1"
}

async function dispatchInline(job: AttendanceJob): Promise<void> {
  // Lazy import so the queue module stays light if inline mode is never used.
  const { runAttendanceJob } = await import("@/lib/queues/attendance.handlers")
  await runAttendanceJob(job)
}

/**
 * Enqueue an attendance job.
 *
 * Behaviour, chosen automatically:
 *  1. `ATTENDANCE_INLINE_DISPATCH=true` → always run handler inline.
 *     Use this in serverless deployments (Vercel etc.) where no
 *     long-running worker exists. Cost: handler latency is added to
 *     the API request that triggered it.
 *  2. Redis reachable → push to BullMQ, return immediately. Requires a
 *     separate worker process (`pnpm --filter web worker`) to dispatch.
 *  3. Redis unreachable → log + fall back to inline so the feature
 *     still works (slower, no retry, but correct).
 *
 * Returns `true` on successful enqueue OR inline completion.
 */
export async function enqueueAttendanceJob(
  job: AttendanceJob,
  options?: JobsOptions,
): Promise<boolean> {
  if (shouldInline()) {
    try {
      await dispatchInline(job)
      return true
    } catch (err) {
      console.error("[attendance/queue] inline dispatch failed", err)
      return false
    }
  }

  try {
    const queue = getQueue()
    await queue.add(job.type, job, options)
    return true
  } catch (err) {
    console.error("[attendance/queue] enqueue failed, falling back to inline", err)
    try {
      await dispatchInline(job)
      return true
    } catch (inlineErr) {
      console.error("[attendance/queue] inline fallback also failed", inlineErr)
      return false
    }
  }
}
