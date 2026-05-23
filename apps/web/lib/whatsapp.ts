/**
 * WhatsApp Business integration via Meta Cloud API.
 *
 * Requires:
 *   WHATSAPP_PHONE_ID     — phone-number ID from the Meta dev console
 *   WHATSAPP_PROVIDER_TOKEN — permanent access token
 *
 * Templates must be pre-approved in WhatsApp Business Manager before use in
 * production. The names below correspond to templates schools should create.
 * Until configured, all calls log-and-fail-soft so the rest of the app keeps
 * working.
 */

export type WhatsAppTemplateName =
  | "fee_reminder"
  | "absence_alert"
  | "result_ready"
  | "announcement"

type TemplateSpec = {
  /** Number of body parameters this template expects, in order. */
  paramCount: number
  /** Human-readable description used in admin UIs and logs. */
  description: string
  /** Plain-text fallback used in dev / when the template is unapproved. */
  preview: (params: string[]) => string
}

export const WHATSAPP_TEMPLATES: Record<WhatsAppTemplateName, TemplateSpec> = {
  fee_reminder: {
    paramCount: 5,
    description: "Outstanding fees reminder with payment link.",
    preview: ([parent, student, amount, term, link]) =>
      `Hello ${parent}, ${student}'s school fees of ₦${amount} for ${term} are due. Pay: ${link}`,
  },
  absence_alert: {
    paramCount: 2,
    description: "Same-day absence notification to parent.",
    preview: ([student, date]) =>
      `Your child ${student} was absent today ${date}. Please contact the school if this is unexpected.`,
  },
  result_ready: {
    paramCount: 2,
    description: "Notifies parent that termly results are published.",
    preview: ([term, link]) => `Results for ${term} are ready. View: ${link}`,
  },
  announcement: {
    paramCount: 2,
    description: "School-wide announcement (title + body).",
    preview: ([title, body]) => `*${title}*\n${body}`,
  },
}

const API_VERSION = "v18.0"
const META_BASE = `https://graph.facebook.com/${API_VERSION}`
const DEFAULT_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en"

export type SendWhatsAppResult =
  | { ok: true; data: unknown; messageId?: string }
  | { ok: false; error: string }

function normalisePhone(toE164: string): string {
  // Meta wants international format WITHOUT the leading +.
  return toE164.startsWith("+") ? toE164.slice(1) : toE164
}

function providerConfigured(): boolean {
  return !!process.env.WHATSAPP_PHONE_ID && !!process.env.WHATSAPP_PROVIDER_TOKEN
}

async function postToMeta(body: Record<string, unknown>): Promise<SendWhatsAppResult> {
  const phoneId = process.env.WHATSAPP_PHONE_ID!
  const token = process.env.WHATSAPP_PROVIDER_TOKEN!
  try {
    const res = await fetch(`${META_BASE}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[]
      error?: { message?: string }
    }
    if (!res.ok) {
      const error = data.error?.message ?? `HTTP ${res.status}`
      console.error("[whatsapp] Meta API error", error, data)
      return { ok: false, error }
    }
    return { ok: true, data, messageId: data.messages?.[0]?.id }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown WhatsApp failure"
    console.error("[whatsapp] request failed", error)
    return { ok: false, error }
  }
}

/**
 * Send a template message. Templates must be pre-approved in Meta Business
 * Manager; the names map 1:1 to the keys of WHATSAPP_TEMPLATES above.
 */
export async function sendWhatsAppMessage(
  toE164: string,
  templateName: WhatsAppTemplateName,
  params: string[],
): Promise<SendWhatsAppResult> {
  const spec = WHATSAPP_TEMPLATES[templateName]
  if (!spec) return { ok: false, error: `Unknown template: ${templateName}` }
  if (params.length !== spec.paramCount) {
    return {
      ok: false,
      error: `Template ${templateName} expects ${spec.paramCount} params, got ${params.length}`,
    }
  }
  if (!providerConfigured()) {
    console.warn("[whatsapp] provider not configured — would have sent template:", {
      to: toE164,
      templateName,
      preview: spec.preview(params).slice(0, 120),
    })
    return { ok: false, error: "WhatsApp provider not configured" }
  }
  return postToMeta({
    messaging_product: "whatsapp",
    to: normalisePhone(toE164),
    type: "template",
    template: {
      name: templateName,
      language: { code: DEFAULT_LANGUAGE },
      components: [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text", text })),
        },
      ],
    },
  })
}

/**
 * Free-form text. Per Meta policy this only works inside the 24h customer
 * service window opened by a user message. Kept for backwards compatibility
 * with the announcement dispatcher; new code should prefer templates.
 */
export async function sendWhatsApp(
  toE164: string,
  message: string,
): Promise<SendWhatsAppResult> {
  if (!providerConfigured()) {
    console.warn("[whatsapp] provider not configured — would have sent text:", {
      to: toE164,
      preview: message.slice(0, 120),
    })
    return { ok: false, error: "WhatsApp provider not configured" }
  }
  return postToMeta({
    messaging_product: "whatsapp",
    to: normalisePhone(toE164),
    type: "text",
    text: { body: message.slice(0, 4096) },
  })
}
