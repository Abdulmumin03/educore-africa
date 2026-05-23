import Link from "next/link"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="px-4 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          EduCore Africa
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-4 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} EduCore Africa
      </footer>
    </div>
  )
}
