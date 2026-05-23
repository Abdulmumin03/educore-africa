import { NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { presignUpload, S3_BUCKET } from "@/lib/s3"

export const runtime = "nodejs"

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
const MESSAGE_TYPES = [...IMAGE_TYPES, "application/pdf"]
const IMAGE_MAX = 2 * 1024 * 1024 // 2 MB for branding uploads
const MESSAGE_MAX = 10 * 1024 * 1024 // 10 MB for chat attachments

const SCOPE_RULES = {
  onboarding: { types: IMAGE_TYPES, max: IMAGE_MAX },
  school: { types: IMAGE_TYPES, max: IMAGE_MAX },
  documents: { types: MESSAGE_TYPES, max: MESSAGE_MAX },
  messages: { types: MESSAGE_TYPES, max: MESSAGE_MAX },
  announcements: { types: MESSAGE_TYPES, max: MESSAGE_MAX },
} as const

const bodySchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string(),
  size: z.number().int().positive(),
  scope: z
    .enum(["onboarding", "school", "documents", "messages", "announcements"])
    .default("onboarding"),
})

export async function POST(req: Request) {
  if (!process.env.AWS_ACCESS_KEY_ID || !S3_BUCKET) {
    return NextResponse.json({ error: "Uploads not configured" }, { status: 503 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 })
  }
  const { filename, contentType, size, scope } = parsed.data

  const rules = SCOPE_RULES[scope]
  if (!rules.types.includes(contentType)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 })
  }
  if (size > rules.max) {
    return NextResponse.json(
      { error: `File exceeds ${Math.round(rules.max / 1024 / 1024)} MB limit` },
      { status: 413 },
    )
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin"
  const key = `${scope}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`
  const uploadUrl = await presignUpload(key, contentType)
  const publicUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`

  return NextResponse.json({ ok: true, uploadUrl, publicUrl, key })
}
