import Link from "next/link"

const cols = [
  {
    title: "Product",
    links: [
      ["Features", "#pillars"],
      ["AI Intelligence", "#ai"],
      ["Multi-curriculum", "#curriculum"],
      ["Pricing", "#pricing"],
    ],
  },
  {
    title: "Modules",
    links: [
      ["Admissions", "#pillars"],
      ["Finance & Fees", "#pillars"],
      ["Communication", "#pillars"],
      ["Transport & GPS", "#pillars"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "#"],
      ["Contact", "/onboard"],
      ["Privacy", "#"],
      ["Terms", "#"],
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-navy/10 bg-cream py-14">
      <div className="container">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-base font-extrabold text-white">
                E
              </span>
              <span className="text-base font-semibold tracking-tight text-navy">
                EduCore <span className="text-amber-600">Africa</span>
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm text-navy/65">
              AI-powered, multi-tenant school management for the African K-12 market.
              From admissions to alumni — one platform, sixteen modules, zero
              spreadsheets.
            </p>
            <p className="mt-5 text-xs uppercase tracking-[0.2em] text-amber-700">
              Made for Africa · Built with Claude
            </p>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-navy/50">
                {c.title}
              </div>
              <ul className="mt-4 space-y-2.5">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="text-sm text-navy/75 transition-colors hover:text-navy"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-navy/10 pt-6 text-xs text-navy/55 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} EduCore Africa. All rights reserved.</p>
          <p>Lagos · Nairobi · Accra · Kampala</p>
        </div>
      </div>
    </footer>
  )
}
