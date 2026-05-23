import { redirect } from "next/navigation"

// Schools register via the onboarding wizard.
export default function RegisterRedirect() {
  redirect("/onboard")
}
