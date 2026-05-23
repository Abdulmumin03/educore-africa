/**
 * Stable token format for student QR codes. Decoded by /api/attendance/qr-checkin.
 * The plain studentId is also accepted to keep the format flexible.
 */
export function studentQrPayload(studentId: string): string {
  return `educore:student:${studentId}`
}
