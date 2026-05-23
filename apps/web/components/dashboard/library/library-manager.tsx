"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  BookOpen,
  Clock,
  Library as LibraryIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AddBookDialog } from "@/components/dashboard/library/add-book-dialog"
import { IssueReturnPanel } from "@/components/dashboard/library/issue-return-panel"
import { ImportBooksDialog } from "@/components/dashboard/library/import-dialog"

type SubjectOpt = { id: string; name: string; code: string }

export type LibraryBook = {
  id: string
  title: string
  author: string | null
  isbn: string | null
  category: string | null
  subject: { id: string; name: string; code: string } | null
  publisher: string | null
  year: number | null
  description: string | null
  coverUrl: string | null
  totalCopies: number
  availableCopies: number
}

type Tab = "catalog" | "issue" | "overdue" | "analytics"

export function LibraryManager({
  canWrite,
  canSeeFines,
  subjects,
  finePerDay,
}: {
  canWrite: boolean
  canSeeFines: boolean
  subjects: SubjectOpt[]
  finePerDay: number
}) {
  const [tab, setTab] = useState<Tab>("catalog")
  const [q, setQ] = useState("")
  const [composeOpen, setComposeOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<LibraryBook | null>(null)
  const qc = useQueryClient()

  const list = useQuery<{ items: LibraryBook[]; categories: string[] }>({
    queryKey: ["library-books", q],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (q.trim()) p.set("q", q.trim())
      const res = await fetch(`/api/library/books?${p}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: tab === "catalog" || tab === "issue",
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/library/books/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Delete failed")
      }
    },
    onSuccess: () => {
      toast.success("Book removed")
      qc.invalidateQueries({ queryKey: ["library-books"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = list.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            Catalog, loans, returns, and analytics. Late fines: ₦{finePerDay.toLocaleString()} / day.
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" />
              Import CSV
            </Button>
            <Button size="sm" onClick={() => setComposeOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add book
            </Button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          {canWrite && <TabsTrigger value="issue">Issue / Return</TabsTrigger>}
          {canSeeFines && <TabsTrigger value="overdue">Overdue & Fines</TabsTrigger>}
          {canWrite && <TabsTrigger value="analytics">Analytics</TabsTrigger>}
        </TabsList>
      </Tabs>

      {tab === "catalog" && (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, author, ISBN…"
              className="pl-8"
            />
          </div>
          {list.isLoading ? (
            <LoadingCard />
          ) : items.length === 0 ? (
            <EmptyCard
              title="No books in the catalog yet"
              cta={canWrite ? "Add your first book" : null}
              onCta={() => setComposeOpen(true)}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((b) => (
                <li key={b.id}>
                  <BookCard
                    item={b}
                    canEdit={canWrite}
                    onEdit={() => setEditing(b)}
                    onDelete={() => {
                      if (typeof window !== "undefined" && !window.confirm(`Delete "${b.title}"?`)) return
                      remove.mutate(b.id)
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "issue" && canWrite && (
        <IssueReturnPanel books={items} finePerDay={finePerDay} />
      )}

      {tab === "overdue" && canSeeFines && <OverdueTab finePerDay={finePerDay} />}

      {tab === "analytics" && canWrite && <AnalyticsTab />}

      {composeOpen && (
        <AddBookDialog
          mode="create"
          subjects={subjects}
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          onSaved={() => {
            setComposeOpen(false)
            qc.invalidateQueries({ queryKey: ["library-books"] })
          }}
        />
      )}
      {editing && (
        <AddBookDialog
          mode="edit"
          subjects={subjects}
          initial={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            qc.invalidateQueries({ queryKey: ["library-books"] })
          }}
        />
      )}
      {importOpen && (
        <ImportBooksDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false)
            qc.invalidateQueries({ queryKey: ["library-books"] })
          }}
        />
      )}
    </div>
  )
}

function BookCard({
  item,
  canEdit,
  onEdit,
  onDelete,
}: {
  item: LibraryBook
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const ratio =
    item.totalCopies > 0
      ? Math.round((item.availableCopies / item.totalCopies) * 100)
      : 0
  const status =
    item.availableCopies === 0
      ? { label: "All on loan", variant: "outline" as const }
      : item.availableCopies < item.totalCopies
        ? {
            label: `${item.availableCopies}/${item.totalCopies} available`,
            variant: "secondary" as const,
          }
        : { label: `${item.availableCopies} available`, variant: "default" as const }

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="aspect-[3/4] overflow-hidden rounded-md bg-muted">
          {item.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.coverUrl}
              alt={item.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <BookOpen className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
        </div>
        <div>
          <h3 className="line-clamp-2 text-sm font-semibold">{item.title}</h3>
          {item.author && (
            <p className="truncate text-xs text-muted-foreground">{item.author}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={status.variant} className="text-[10px]">
            {status.label}
          </Badge>
          {item.category && (
            <Badge variant="outline" className="text-[10px]">
              {item.category}
            </Badge>
          )}
          {item.subject && (
            <Badge variant="outline" className="text-[10px]">
              {item.subject.code}
            </Badge>
          )}
        </div>
        <div className="h-1 overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${ratio}%` }}
          />
        </div>
        {canEdit && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label="Delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OverdueTab({ finePerDay }: { finePerDay: number }) {
  const list = useQuery<{
    finePerDay: number
    items: {
      id: string
      borrowedAt: string
      dueDate: string
      daysOverdue: number
      projectedFine: number
      book: { id: string; title: string; author: string | null }
      student: {
        id: string
        admissionNumber: string
        firstName: string
        lastName: string
      }
    }[]
  }>({
    queryKey: ["library-overdue"],
    queryFn: async () => {
      const res = await fetch("/api/library/overdue")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  if (list.isLoading) return <LoadingCard />
  const items = list.data?.items ?? []
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
          <Clock className="h-8 w-8 text-emerald-600" />
          <p className="text-sm font-medium">No overdue books — nice.</p>
        </CardContent>
      </Card>
    )
  }

  const totalFines = items.reduce((s, i) => s + i.projectedFine, 0)

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex items-center justify-between p-3 text-sm">
          <span className="text-muted-foreground">
            {items.length} overdue · ₦{finePerDay}/day rate
          </span>
          <span className="font-semibold">
            Outstanding: ₦{totalFines.toLocaleString()}
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Student</th>
                <th className="p-3">Book</th>
                <th className="p-3">Due</th>
                <th className="p-3 text-right">Days late</th>
                <th className="p-3 text-right">Fine</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b last:border-b-0">
                  <td className="p-3">
                    <div className="font-medium">
                      {i.student.firstName} {i.student.lastName}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {i.student.admissionNumber}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{i.book.title}</div>
                    {i.book.author && (
                      <div className="text-[11px] text-muted-foreground">{i.book.author}</div>
                    )}
                  </td>
                  <td className="p-3 text-xs">{dayjs(i.dueDate).format("D MMM YYYY")}</td>
                  <td className="p-3 text-right">{i.daysOverdue}</td>
                  <td className="p-3 text-right font-semibold">
                    ₦{i.projectedFine.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function AnalyticsTab() {
  const a = useQuery<{
    overview: {
      totalBooks: number
      totalCopies: number
      activeLoans: number
      overdueLoans: number
    }
    mostBorrowed: { id: string; title: string; author: string | null; borrowCount: number }[]
    leastBorrowed: { id: string; title: string; author: string | null; borrowCount: number }[]
    topReaders: { id: string; admissionNumber: string; name: string; borrowCount: number }[]
    needsReplacement: {
      id: string
      title: string
      author: string | null
      borrowCount: number
      totalCopies: number
    }[]
  }>({
    queryKey: ["library-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/library/analytics")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  if (a.isLoading) return <LoadingCard />
  if (!a.data) return null

  const { overview, mostBorrowed, leastBorrowed, topReaders, needsReplacement } = a.data

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Titles" value={overview.totalBooks.toLocaleString()} />
        <StatCard label="Copies" value={overview.totalCopies.toLocaleString()} />
        <StatCard label="On loan" value={overview.activeLoans.toLocaleString()} />
        <StatCard
          label="Overdue"
          value={overview.overdueLoans.toLocaleString()}
          variant={overview.overdueLoans > 0 ? "warning" : undefined}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <RankCard title="Most borrowed" items={mostBorrowed} unit="borrows" />
        <RankCard title="Top readers" items={topReaders.map((r) => ({ id: r.id, title: r.name, author: r.admissionNumber, borrowCount: r.borrowCount }))} unit="borrows" />
        <RankCard title="Needs replacement" items={needsReplacement} unit="borrows" emptyHint="No high-demand low-stock books." />
        <RankCard title="Never borrowed" items={leastBorrowed} unit="" emptyHint="Every book has been borrowed at least once." />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  variant,
}: {
  label: string
  value: string
  variant?: "warning"
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p
          className={
            variant === "warning"
              ? "text-2xl font-bold text-amber-600"
              : "text-2xl font-bold"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function RankCard({
  title,
  items,
  unit,
  emptyHint,
}: {
  title: string
  items: { id: string; title: string; author: string | null; borrowCount: number }[]
  unit: string
  emptyHint?: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyHint ?? "No data yet."}</p>
        ) : (
          <ul className="space-y-1">
            {items.map((b, i) => (
              <li key={b.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-muted-foreground">{i + 1}.</span> {b.title}
                  {b.author && (
                    <span className="text-[11px] text-muted-foreground"> · {b.author}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {b.borrowCount.toLocaleString()}
                  {unit ? ` ${unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </CardContent>
    </Card>
  )
}

function EmptyCard({
  title,
  cta,
  onCta,
}: {
  title: string
  cta: string | null
  onCta: () => void
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
        <LibraryIcon className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">{title}</p>
        {cta && (
          <Button size="sm" className="mt-2" onClick={onCta}>
            {cta}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// Re-export named types for the dialogs to use.
export type { SubjectOpt }
