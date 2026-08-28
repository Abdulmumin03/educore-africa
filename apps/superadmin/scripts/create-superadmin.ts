/**
 * Create (or update) a console account.
 *
 *   pnpm --filter superadmin admin:create -- \
 *     --email you@educoreafrica.com --name "Your Name" \
 *     --password "…" --role SUPER_ADMIN
 *
 * Prints the TOTP enrolment URI when --totp is passed. Re-running with the
 * same email resets the password rather than erroring.
 */
import { PrismaClient, type SuperAdminRole } from "@prisma/client"
import bcrypt from "bcryptjs"

import { generateTotpSecret, totpUri } from "../lib/totp"

const prisma = new PrismaClient()

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(`--${flag}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main() {
  const email = arg("email")?.toLowerCase()
  const name = arg("name")
  const password = arg("password")
  const role = (arg("role") ?? "SUPER_ADMIN") as SuperAdminRole
  const withTotp = process.argv.includes("--totp")

  if (!email || !name || !password) {
    console.error("Usage: --email <email> --name <name> --password <password> [--role ROLE] [--totp]")
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const totpSecret = withTotp ? generateTotpSecret() : null

  const user = await prisma.superAdminUser.upsert({
    where: { email },
    create: {
      email,
      name,
      role,
      passwordHash,
      totpSecret,
      totpEnabled: withTotp,
    },
    update: {
      name,
      role,
      passwordHash,
      isActive: true,
      ...(withTotp ? { totpSecret, totpEnabled: true } : {}),
    },
  })

  console.log(`\n  ${user.email} — ${user.role}`)
  if (withTotp && totpSecret) {
    console.log(`  TOTP secret: ${totpSecret}`)
    console.log(`  Enrol with:  ${totpUri(email, totpSecret)}\n`)
  } else {
    console.log("  TOTP is off for this account. Re-run with --totp to enable it.\n")
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
