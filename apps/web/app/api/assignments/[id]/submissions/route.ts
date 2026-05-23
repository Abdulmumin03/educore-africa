import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

/**
 * GET /api/assignments/[id]/submissions
 *
 * - Teacher (assignment owner) or admin → all submissions + expected students
 *   (so the UI can show "missing" rows for students who haven't submitted).
 * - Student → just their own submission record (or null).
 * - Anyone else → 403.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const a = await prisma.assignment.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: {
      id: true,
      title: true,
      dueDate: true,
      maxScore: true,
      allowLate: true,
      sectionIds: true,
      teacher: { select: { id: true, userId: true } },
    },
  })
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(session.user.role)
  const isOwner = a.teacher.userId === session.user.id
  const isStudent = session.user.role === "STUDENT"

  if (isStudent) {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!student) return NextResponse.json({ error: "Not a student" }, { status: 403 })
    const sub = await prisma.assignmentSubmission.findFirst({
      where: { assignmentId: a.id, studentId: student.id, deletedAt: null },
      select: {
        id: true,
        submittedAt: true,
        fileUrl: true,
        attachments: true,
        textContent: true,
        score: true,
        feedback: true,
        gradedAt: true,
      },
    })
    return NextResponse.json({
      mine: sub
        ? {
            id: sub.id,
            submittedAt: sub.submittedAt.toISOString(),
            fileUrl: sub.fileUrl,
            attachments: sub.attachments ?? null,
            textContent: sub.textContent,
            score: sub.score,
            feedback: sub.feedback,
            gradedAt: sub.gradedAt?.toISOString() ?? null,
          }
        : null,
    })
  }

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Expected students = active enrollments in the assignment's sectionIds.
  const enrollments = a.sectionIds.length
    ? await prisma.enrollment.findMany({
        where: {
          sectionId: { in: a.sectionIds },
          isActive: true,
          deletedAt: null,
        },
        select: {
          student: {
            select: {
              id: true,
              admissionNumber: true,
              user: { select: { firstName: true, lastName: true, avatarUrl: true } },
            },
          },
          section: { select: { id: true, name: true, class: { select: { name: true } } } },
        },
      })
    : []

  // De-dup by student.id in case a student appears in multiple enrollments (rare).
  const studentMap = new Map<
    string,
    {
      id: string
      admissionNumber: string
      firstName: string
      lastName: string
      avatarUrl: string | null
      sectionId: string
      sectionName: string
      className: string
    }
  >()
  for (const e of enrollments) {
    if (studentMap.has(e.student.id)) continue
    studentMap.set(e.student.id, {
      id: e.student.id,
      admissionNumber: e.student.admissionNumber,
      firstName: e.student.user.firstName,
      lastName: e.student.user.lastName,
      avatarUrl: e.student.user.avatarUrl,
      sectionId: e.section.id,
      sectionName: e.section.name,
      className: e.section.class.name,
    })
  }

  const submissions = await prisma.assignmentSubmission.findMany({
    where: { assignmentId: a.id, deletedAt: null },
    select: {
      id: true,
      studentId: true,
      submittedAt: true,
      fileUrl: true,
      attachments: true,
      textContent: true,
      score: true,
      feedback: true,
      gradedAt: true,
    },
  })
  const subByStudent = new Map(submissions.map((s) => [s.studentId, s]))

  const rows = Array.from(studentMap.values())
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
    .map((s) => {
      const sub = subByStudent.get(s.id)
      return {
        student: s,
        submission: sub
          ? {
              id: sub.id,
              submittedAt: sub.submittedAt.toISOString(),
              fileUrl: sub.fileUrl,
              attachments: sub.attachments ?? null,
              textContent: sub.textContent,
              score: sub.score,
              feedback: sub.feedback,
              gradedAt: sub.gradedAt?.toISOString() ?? null,
            }
          : null,
      }
    })

  return NextResponse.json({
    assignment: {
      id: a.id,
      title: a.title,
      dueDate: a.dueDate.toISOString(),
      maxScore: a.maxScore,
      allowLate: a.allowLate,
    },
    rows,
    totals: {
      expected: rows.length,
      submitted: submissions.length,
      graded: submissions.filter((s) => s.gradedAt).length,
    },
  })
}
