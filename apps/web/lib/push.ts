export type SendPushResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string }

export type PushPayload = {
  title: string
  body: string
  url?: string
}

/**
 * Web Push delivery stub. To enable: provision VAPID keys
 * (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT), register a service
 * worker in the client, persist subscriptions, and replace the body of
 * `sendPush` with a `web-push` send-per-subscription loop.
 */
export async function sendPush(userId: string, payload: PushPayload): Promise<SendPushResult> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn("[push] VAPID not configured — would have pushed:", {
      userId,
      title: payload.title,
    })
    return { ok: false, error: "Push provider not configured" }
  }
  // Provider integration goes here. Until then, fail closed with a clear error.
  return { ok: false, error: "Push provider integration pending" }
}
