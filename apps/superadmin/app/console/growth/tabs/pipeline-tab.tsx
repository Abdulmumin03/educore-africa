import { prisma } from "@/lib/db"
import { listLeads, pipelineSummary } from "@/lib/leads"
import { LeadBoard, type Column, type Summary } from "../lead-board"

export async function PipelineTab() {
  const [board, summary, owners] = await Promise.all([
    listLeads(),
    pipelineSummary(),
    prisma.superAdminUser.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <LeadBoard
      columns={board.columns as Column[]}
      summary={summary as Summary}
      owners={owners}
    />
  )
}
