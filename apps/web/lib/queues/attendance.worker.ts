import { Worker, type Job } from "bullmq"
import { bullConnection } from "@/lib/queues/connection"
import {
  ATTENDANCE_QUEUE_NAME,
  type AttendanceJob,
} from "@/lib/queues/attendance.queue"
import { runAttendanceJob } from "@/lib/queues/attendance.handlers"

export function startAttendanceWorker(): Worker<AttendanceJob> {
  const worker = new Worker<AttendanceJob>(
    ATTENDANCE_QUEUE_NAME,
    async (job: Job<AttendanceJob>) => runAttendanceJob(job.data),
    { connection: bullConnection, concurrency: 5 },
  )

  worker.on("ready", () => console.log("[attendance/worker] ready"))
  worker.on("completed", (job) =>
    console.log(`[attendance/worker] completed ${job.id} (${job.name})`),
  )
  worker.on("failed", (job, err) =>
    console.error(`[attendance/worker] failed ${job?.id}: ${err.message}`),
  )

  return worker
}
