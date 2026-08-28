import type { Metadata } from "next"
import Link from "next/link"
import { BookOpen, KeyRound, ShieldCheck, Terminal } from "lucide-react"

import { PageHeader } from "@/components/shared/page-header"

export const metadata: Metadata = { title: "Help" }

const ENTRIES = [
  {
    icon: KeyRound,
    title: "Signing in",
    body: "Password, then a 6-digit code from your authenticator. Five failed attempts lock the account for 15 minutes. Lost your phone? Use a backup code.",
    href: "/console/settings/security/totp",
    link: "Two-factor settings",
  },
  {
    icon: ShieldCheck,
    title: "Why you might be blocked",
    body: "The console only accepts connections from the office network and the VPN. Off-network attempts are refused and recorded, so connect through the VPN first.",
    href: "/console/audit",
    link: "Audit log",
  },
  {
    icon: Terminal,
    title: "Keyboard",
    body: "⌘K (Ctrl+K on Windows) opens the command palette — search any school or user by name or email, or jump straight to a page.",
    href: "/console",
    link: "Command Centre",
  },
]

export default function DocsPage() {
  return (
    <>
      <PageHeader
        title="Help"
        description="How the console works. Anything missing, ask in #educore-platform."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ENTRIES.map((entry) => (
          <div key={entry.title} className="rounded-lg border border-sa-border bg-sa-surface p-4">
            <entry.icon className="h-5 w-5 text-sa-blue" aria-hidden="true" />
            <h2 className="mt-2.5 text-h3">{entry.title}</h2>
            <p className="mt-1 text-body text-sa-muted">{entry.body}</p>
            <Link href={entry.href} className="mt-2.5 inline-block text-caption text-sa-blue">
              {entry.link} →
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-lg border border-sa-border bg-sa-surface p-4">
        <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-sa-dim" aria-hidden="true" />
        <p className="text-body text-sa-muted">
          Engineering runbooks live in the repo under <code className="tabular">docs/</code>. This
          page covers only what console users need day to day.
        </p>
      </div>
    </>
  )
}
