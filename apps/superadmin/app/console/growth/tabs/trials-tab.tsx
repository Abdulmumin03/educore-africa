import { listTrials } from "@/lib/trials"
import { TrialsTable, type TrialRow } from "../trials-table"

export async function TrialsTab() {
  const { trials } = await listTrials()

  return (
    <TrialsTable
      trials={trials as TrialRow[]}
      summary={{
        total: trials.length,
        hot: trials.filter((trial) => trial.band === "hot").length,
        expiringWeek: trials.filter(
          (trial) => trial.daysRemaining !== null && trial.daysRemaining >= 0 && trial.daysRemaining <= 7,
        ).length,
        lapsed: trials.filter((trial) => trial.daysRemaining !== null && trial.daysRemaining < 0).length,
      }}
    />
  )
}
