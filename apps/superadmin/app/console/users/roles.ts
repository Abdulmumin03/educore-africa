import type { UserRole } from "@prisma/client"

// Kept out of lib/users.ts: that module imports prisma, and the search bar is
// a client component — importing it there would drag the database client into
// the browser bundle.
export const USER_ROLE_ORDER: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "STUDENT",
  "PARENT",
  "LIBRARIAN",
  "HOSTEL_MASTER",
  "DRIVER",
]

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "Super admin",
  SCHOOL_ADMIN: "School admin",
  PRINCIPAL: "Principal",
  TEACHER: "Teacher",
  BURSAR: "Bursar",
  COUNSELOR: "Counselor",
  STUDENT: "Student",
  PARENT: "Parent",
  LIBRARIAN: "Librarian",
  HOSTEL_MASTER: "Hostel master",
  DRIVER: "Driver",
}
