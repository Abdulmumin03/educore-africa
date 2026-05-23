import type { UserRole } from "@prisma/client"

/**
 * Read-only documentation of what each UserRole can do across the system.
 * The actual authorisation gates live in individual routes — this is a
 * source of truth for the permission-matrix UI, NOT a runtime check.
 *
 * Update this file when you add new permissions or shift role authority.
 */

export type PermissionGroup =
  | "STUDENT_MANAGEMENT"
  | "FINANCE"
  | "ATTENDANCE"
  | "GRADES"
  | "COMMUNICATION"
  | "SETTINGS"
  | "AI"
  | "REPORTS"

export type Crud = "CREATE" | "READ" | "UPDATE" | "DELETE"

export type PermissionMatrix = Record<UserRole, Record<PermissionGroup, Crud[]>>

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  STUDENT_MANAGEMENT: "Student management",
  FINANCE: "Finance",
  ATTENDANCE: "Attendance",
  GRADES: "Grades",
  COMMUNICATION: "Communication",
  SETTINGS: "Settings",
  AI: "AI",
  REPORTS: "Reports",
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SUPER_ADMIN: "Network owner with access to every school in the org.",
  SCHOOL_ADMIN: "Top admin within a single school — full control except network features.",
  PRINCIPAL: "Academic & operational head — broad access, no destructive finance ops.",
  TEACHER: "Classroom-scoped reads + writes for their sections, subjects, and grades.",
  BURSAR: "Finance owner — invoices, payments, fines, reports. No academic edits.",
  COUNSELOR: "Student welfare focus — risk scores, behaviour, communication.",
  STUDENT: "Self-service: own grades, attendance, assignments, library history.",
  PARENT: "Child-scoped: see their child's data, pay fees, receive notifications.",
  LIBRARIAN: "Library catalog + circulation + analytics. No academic data.",
  HOSTEL_MASTER: "Boarders' welfare: assignments, exeat, incidents, maintenance.",
  DRIVER: "Driver app — own route GPS pings and boarding roster only.",
}

const ALL: Crud[] = ["CREATE", "READ", "UPDATE", "DELETE"]
const RW: Crud[] = ["CREATE", "READ", "UPDATE"]
const RO: Crud[] = ["READ"]
const NONE: Crud[] = []

export const ROLE_PERMISSIONS: PermissionMatrix = {
  SUPER_ADMIN: {
    STUDENT_MANAGEMENT: ALL,
    FINANCE: ALL,
    ATTENDANCE: ALL,
    GRADES: ALL,
    COMMUNICATION: ALL,
    SETTINGS: ALL,
    AI: ALL,
    REPORTS: ALL,
  },
  SCHOOL_ADMIN: {
    STUDENT_MANAGEMENT: ALL,
    FINANCE: ALL,
    ATTENDANCE: ALL,
    GRADES: ALL,
    COMMUNICATION: ALL,
    SETTINGS: ALL,
    AI: ALL,
    REPORTS: ALL,
  },
  PRINCIPAL: {
    STUDENT_MANAGEMENT: ALL,
    FINANCE: RW,
    ATTENDANCE: ALL,
    GRADES: ALL,
    COMMUNICATION: ALL,
    SETTINGS: RW,
    AI: ALL,
    REPORTS: ALL,
  },
  TEACHER: {
    STUDENT_MANAGEMENT: RO,
    FINANCE: NONE,
    ATTENDANCE: RW,
    GRADES: RW,
    COMMUNICATION: ["CREATE", "READ"],
    SETTINGS: RO,
    AI: ["READ"],
    REPORTS: RO,
  },
  BURSAR: {
    STUDENT_MANAGEMENT: RO,
    FINANCE: ALL,
    ATTENDANCE: RO,
    GRADES: RO,
    COMMUNICATION: ["CREATE", "READ"],
    SETTINGS: RO,
    AI: ["READ"],
    REPORTS: ALL,
  },
  COUNSELOR: {
    STUDENT_MANAGEMENT: RW,
    FINANCE: NONE,
    ATTENDANCE: RO,
    GRADES: RO,
    COMMUNICATION: ["CREATE", "READ"],
    SETTINGS: NONE,
    AI: ["READ"],
    REPORTS: RO,
  },
  STUDENT: {
    STUDENT_MANAGEMENT: NONE,
    FINANCE: RO,
    ATTENDANCE: RO,
    GRADES: RO,
    COMMUNICATION: ["READ"],
    SETTINGS: NONE,
    AI: NONE,
    REPORTS: NONE,
  },
  PARENT: {
    STUDENT_MANAGEMENT: NONE,
    FINANCE: ["READ", "CREATE"], // can pay invoices
    ATTENDANCE: RO,
    GRADES: RO,
    COMMUNICATION: ["READ", "CREATE"],
    SETTINGS: NONE,
    AI: NONE,
    REPORTS: NONE,
  },
  LIBRARIAN: {
    STUDENT_MANAGEMENT: RO,
    FINANCE: ["READ"], // see fines
    ATTENDANCE: NONE,
    GRADES: NONE,
    COMMUNICATION: ["CREATE", "READ"],
    SETTINGS: NONE,
    AI: NONE,
    REPORTS: ["READ"],
  },
  HOSTEL_MASTER: {
    STUDENT_MANAGEMENT: RO,
    FINANCE: NONE,
    ATTENDANCE: NONE,
    GRADES: NONE,
    COMMUNICATION: ["CREATE", "READ"],
    SETTINGS: NONE,
    AI: NONE,
    REPORTS: ["READ"],
  },
  DRIVER: {
    STUDENT_MANAGEMENT: NONE,
    FINANCE: NONE,
    ATTENDANCE: NONE,
    GRADES: NONE,
    COMMUNICATION: ["READ"],
    SETTINGS: NONE,
    AI: NONE,
    REPORTS: NONE,
  },
}

export const ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "LIBRARIAN",
  "HOSTEL_MASTER",
  "STUDENT",
  "PARENT",
  "DRIVER",
]

export const PERMISSION_GROUPS: PermissionGroup[] = [
  "STUDENT_MANAGEMENT",
  "FINANCE",
  "ATTENDANCE",
  "GRADES",
  "COMMUNICATION",
  "SETTINGS",
  "AI",
  "REPORTS",
]
