import { handleUssdTurn } from "@/lib/ussd"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/ussd — Africa's Talking USSD webhook.
 *
 * AT sends an application/x-www-form-urlencoded body with:
 *   sessionId, phoneNumber, networkCode, serviceCode, text
 *
 * `text` is the full `*`-delimited input chain so the state machine can be
 * reconstructed from the request alone. Redis caches the resolved school
 * across turns to skip the DB lookup on each step.
 *
 * Response: plain text starting with `CON ` (continue) or `END ` (terminate).
 */
export async function POST(req: Request) {
  let form: URLSearchParams
  try {
    const body = await req.text()
    form = new URLSearchParams(body)
  } catch (err) {
    console.error("[ussd] failed to parse body", err)
    return new Response("END Invalid request.", { headers: { "content-type": "text/plain" } })
  }

  const sessionId = form.get("sessionId") ?? ""
  const phoneNumber = form.get("phoneNumber") ?? ""
  const serviceCode = form.get("serviceCode") ?? ""
  const text = form.get("text") ?? ""

  if (!sessionId || !serviceCode) {
    return new Response("END Invalid request.", { headers: { "content-type": "text/plain" } })
  }

  const reply = await handleUssdTurn({ sessionId, phoneNumber, serviceCode, text })
  return new Response(reply, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}

/**
 * GET is exposed only for AT's webhook verification step. Returns a noop
 * "CON" so a manual test in the AT dashboard simulator picks up the endpoint.
 */
export async function GET() {
  return new Response("CON USSD endpoint OK. POST with sessionId, serviceCode, text.", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}
