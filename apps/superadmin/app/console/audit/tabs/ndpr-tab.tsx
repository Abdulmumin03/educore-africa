import { NDPR_RESPONSE_DAYS, listRequests } from "@/lib/compliance"
import { NdprManager, type RequestRow, type Summary } from "../ndpr-manager"

export async function NdprTab({ canErase }: { canErase: boolean }) {
  const { requests, summary } = await listRequests()
  return (
    <NdprManager
      initial={requests as RequestRow[]}
      summary={summary as Summary}
      responseDays={NDPR_RESPONSE_DAYS}
      canErase={canErase}
    />
  )
}
