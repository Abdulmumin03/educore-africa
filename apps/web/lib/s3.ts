import { S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"

export const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export const S3_BUCKET = process.env.S3_BUCKET!

export async function presignUpload(key: string, contentType: string, expiresIn = 900) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn },
  )
}

export async function presignDownload(key: string, expiresIn = 900) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn })
}
