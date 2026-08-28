import { AuthError } from "next-auth"

import { signIn } from "@/lib/auth"

// next-auth v5 signals a rejected credentials attempt two different ways
// depending on where it is called from: it either throws CredentialsSignin or
// returns a redirect URL carrying ?error=. Normalise both into a boolean so
// route handlers can branch on one thing.
export async function completeSignIn(credentials: {
  challenge: string
  otp?: string
  deviceToken?: string
}): Promise<boolean> {
  try {
    const result = await signIn("credentials", {
      ...credentials,
      redirect: false,
      redirectTo: "/console",
    })

    if (typeof result === "string" && result.includes("error=")) return false
    return true
  } catch (error) {
    if (error instanceof AuthError) return false
    throw error // NEXT_REDIRECT and genuine bugs must bubble.
  }
}
