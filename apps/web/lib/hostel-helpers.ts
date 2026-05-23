import type { UserRole, Gender, HostelGenderType } from "@prisma/client"

export const HOSTEL_WRITE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "HOSTEL_MASTER",
]

export const HOSTEL_ADMIN_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
]

/** Generate a 6-digit OTP for pickup confirmation. */
export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/**
 * Check whether a student of a given gender can be placed in a hostel of a
 * given gender type. MIXED hostels accept any gender; otherwise must match.
 */
export function genderMatches(
  studentGender: Gender | null,
  hostelGender: HostelGenderType,
): boolean {
  if (hostelGender === "MIXED") return true
  if (!studentGender) return false
  return studentGender === hostelGender
}
