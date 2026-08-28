import { redirect } from "next/navigation"

// The console lives under /console; / is just the front door.
export default function RootPage() {
  redirect("/console")
}
