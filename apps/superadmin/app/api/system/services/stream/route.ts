import { serviceStatus } from "@/lib/services"
import { requireApiSession, requireApiRole } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

// Server-Sent Events for the status board.
//
// The probe itself still runs at most once a minute (lib/services caches it),
// so a dozen open tabs on a 30-second stream do NOT mean a dozen calls a
// minute to Paystack — the stream re-reads the shared snapshot.

const PUSH_MS = 30_000
// A dev server never notices a client has gone; without this the connection
// is held open forever.
const MAX_LIFETIME_MS = 15 * 60_000

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      send("status", await serviceStatus())

      const timer = setInterval(async () => {
        if (closed) return
        try {
          send("status", await serviceStatus())
        } catch {
          send("error", { message: "Probe failed" })
        }
      }, PUSH_MS)

      const deadline = setTimeout(() => {
        closed = true
        clearInterval(timer)
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      }, MAX_LIFETIME_MS)

      request.signal.addEventListener("abort", () => {
        closed = true
        clearInterval(timer)
        clearTimeout(deadline)
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx buffers SSE into uselessness without this.
      "X-Accel-Buffering": "no",
    },
  })
}

export const runtime = "nodejs"
