import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"

import { Toaster } from "@/components/ui/toaster"
import { Providers } from "@/app/providers"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" })

// Every numeric field in the console is monospaced and tabular so figures
// line up down a column. Exposed as `font-mono` / `.tabular`.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "EduCore Africa — Super Admin Console",
    template: "%s · EduCore Console",
  },
  description: "Internal platform operations console for EduCore Africa staff.",
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The console is dark-only — there is no theme toggle. `dark` is fixed on
  // <html> so the shadcn tokens in globals.css resolve to the SA palette
  // everywhere, auth screens included.
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} bg-sa-base font-sans text-body text-sa-text antialiased`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  )
}
