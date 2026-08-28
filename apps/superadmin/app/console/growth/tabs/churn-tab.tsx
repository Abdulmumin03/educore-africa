import { latestScores } from "@/lib/churn-risk"
import { ChurnTable, type ChurnRow } from "../churn-table"

export async function ChurnTab({ canRun }: { canRun: boolean }) {
  const { scores, byLevel, mrrAtRisk, computedAt } = await latestScores()

  return (
    <ChurnTable
      initial={scores as ChurnRow[]}
      byLevel={byLevel}
      mrrAtRisk={mrrAtRisk}
      computedAt={computedAt}
      canRun={canRun}
    />
  )
}
