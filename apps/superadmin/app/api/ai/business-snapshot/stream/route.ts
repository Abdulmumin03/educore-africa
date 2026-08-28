import { RISK_MODEL, isAIConfigured, streamComplete } from "@/lib/ai"
import {
  SNAPSHOT_CACHE_KEY,
  SNAPSHOT_CACHE_TTL_SECONDS,
  SNAPSHOT_SYSTEM,
  buildSnapshotPrompt,
  gatherSnapshotFacts,
  heuristicSummary,
  snapshotBody,
} from "@/lib/business-snapshot"
import { redis } from "@/lib/redis"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 120

/**
 * The weekly snapshot, streamed.
 *
 * A cold generation with high effort takes the better part of a minute, and a
 * spinner for that long reads as a hang. Events:
 *
 *   delta  { text }   — a fragment to append
 *   done   { …body }  — the finished snapshot, the same shape the JSON route
 *                       returns, so the client can replace its accumulated
 *                       text with the authoritative version and read `source`
 *   error  { message }
 *
 * The heuristic path streams too, in sentence-sized pieces, so the component
 * has one code path rather than two.
 */
export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const facts = await gatherSnapshotFacts()

        let text = ""
        let source: "model" | "heuristic" = "heuristic"

        if (isAIConfigured()) {
          try {
            for await (const chunk of streamComplete({
              system: SNAPSHOT_SYSTEM,
              prompt: buildSnapshotPrompt(facts.payload),
              model: RISK_MODEL,
              maxTokens: 1200,
              effort: "medium",
            })) {
              text += chunk
              send("delta", { text: chunk })
            }
            if (text.trim()) source = "model"
          } catch (error) {
            console.error("[ai] snapshot stream failed", error)
            // Whatever arrived before the failure is discarded rather than
            // presented as a finished summary.
            text = ""
            send("delta", { text: "", reset: true })
          }
        }

        if (!text.trim()) {
          text = heuristicSummary(facts)
          source = "heuristic"
          // Chunked so the fallback reads the same way the model does.
          for (const piece of text.match(/[^.]+\.\s*/g) ?? [text]) {
            send("delta", { text: piece })
          }
        }

        const body = snapshotBody(facts, text.trim(), source, RISK_MODEL)

        try {
          await redis.set(SNAPSHOT_CACHE_KEY, JSON.stringify(body), "EX", SNAPSHOT_CACHE_TTL_SECONDS)
        } catch {
          // Non-fatal — the snapshot is still returned, just not cached.
        }

        send("done", body)
      } catch (error) {
        console.error("[ai] snapshot stream aborted", error)
        send("error", { message: "The snapshot could not be generated." })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Nginx and Cloudflare both buffer by default, which would hold every
      // token until the response closed and defeat the point of streaming.
      "X-Accel-Buffering": "no",
    },
  })
}
