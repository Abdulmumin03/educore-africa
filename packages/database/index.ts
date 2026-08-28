export * from "@prisma/client"
export { PrismaClient } from "@prisma/client"

// Rules that both apps must agree on, kept here rather than duplicated in
// each of them. See promo.ts for why.
export {
  applyDiscount,
  redeemPromo,
  validatePromo,
  PROMO_MESSAGES,
  type PromoFailure,
  type PromoValidation,
} from "./promo"
