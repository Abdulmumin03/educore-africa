/**
 * Long-running worker process for BullMQ queues.
 *
 * Local dev:    pnpm --filter web worker
 * Production:   deploy this script as a separate service alongside the Next.js app.
 *
 * Reads the same DATABASE_URL + REDIS_URL the web process uses.
 */
import "dotenv/config"
import { startAttendanceWorker } from "@/lib/queues/attendance.worker"

const worker = startAttendanceWorker()

async function shutdown(signal: NodeJS.Signals) {
  console.log(`\n[worker] caught ${signal}, draining…`)
  try {
    await worker.close()
  } finally {
    process.exit(0)
  }
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
console.log("[worker] booted — waiting for jobs")
