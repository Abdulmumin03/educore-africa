import { listPromoCodes } from "@/lib/promo"
import { PromoManager, type PromoRow } from "../promo-manager"

export async function PromoTab() {
  const codes = (await listPromoCodes()) as PromoRow[]
  return <PromoManager initial={codes} />
}
