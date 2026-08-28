import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { allowedSections } from "@/lib/permissions"
import { requireConsoleUser } from "@/lib/session"

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  // Every console route is gated here. Middleware only proves the cookie is
  // valid; this also confirms the session row is still live and the account
  // has not been deactivated.
  const user = await requireConsoleUser()
  const sections = allowedSections(user.role)

  // Three fixed zones: a 220px sidebar and a 56px topbar are position:fixed,
  // and main is offset by both. Scrolling happens inside main, so the chrome
  // never moves and long tables keep their header row in view.
  return (
    <div className="min-h-screen bg-sa-base">
      <Sidebar sections={sections} user={user} />
      <Topbar user={user} sections={sections} />
      <main className="ml-sidebar min-h-screen pt-topbar">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
