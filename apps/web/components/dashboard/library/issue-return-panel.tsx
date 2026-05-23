"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  ArrowLeftRight,
  Book,
  Check,
  Loader2,
  Search,
  User,
} from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { LibraryBook } from "@/components/dashboard/library/library-manager"

type Action = "issue" | "return"

type StudentRow = {
  id: string
  admissionNumber: string
  firstName: string
  lastName: string
  avatarUrl: string | null
}

type Loan = {
  id: string
  borrowedAt: string
  dueDate: string
  returnedAt: string | null
  fine: number | null
  overdue: boolean
  book: { id: string; title: string; author: string | null; coverUrl: string | null }
  student: { id: string; admissionNumber: string; firstName: string; lastName: string }
}

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export function IssueReturnPanel({
  books,
  finePerDay,
}: {
  books: LibraryBook[]
  finePerDay: number
}) {
  const qc = useQueryClient()
  const [action, setAction] = useState<Action>("issue")
  const [student, setStudent] = useState<StudentRow | null>(null)
  const [book, setBook] = useState<LibraryBook | null>(null)

  const submit = useMutation({
    mutationFn: async () => {
      if (!student || !book) throw new Error("Pick a student and a book")
      const res = await fetch("/api/library/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, bookId: book.id, studentId: student.id }),
      })
      const b = (await res.json().catch(() => ({}))) as {
        error?: string
        fine?: number
        dueDate?: string
      }
      if (!res.ok) throw new Error(b.error ?? "Failed")
      return b
    },
    onSuccess: (b) => {
      if (action === "issue") {
        toast.success(
          `Issued — due ${b.dueDate ? dayjs(b.dueDate).format("D MMM YYYY") : "in 14 days"}`,
        )
      } else {
        toast.success(
          b.fine && b.fine > 0
            ? `Returned with ₦${b.fine.toLocaleString()} fine`
            : "Returned, no fine",
        )
      }
      setBook(null)
      qc.invalidateQueries({ queryKey: ["library-books"] })
      qc.invalidateQueries({ queryKey: ["student-loans"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-4">
          <Tabs value={action} onValueChange={(v) => setAction(v as Action)}>
            <TabsList>
              <TabsTrigger value="issue">Issue</TabsTrigger>
              <TabsTrigger value="return">Return</TabsTrigger>
            </TabsList>
          </Tabs>

          <StudentPicker
            value={student}
            onChange={(s) => {
              setStudent(s)
              setBook(null)
            }}
          />

          {action === "issue" && (
            <BookPicker books={books.filter((b) => b.availableCopies > 0)} value={book} onChange={setBook} />
          )}

          {action === "return" && student && (
            <ActiveLoansPicker student={student} value={book} onChange={setBook} />
          )}

          <Button
            className="w-full"
            disabled={!student || !book || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeftRight className="mr-1.5 h-4 w-4" />
            )}
            Confirm {action}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="mb-2 text-sm font-semibold">
            {student ? `${student.firstName}'s active loans` : "Pick a student to see their loans"}
          </h3>
          {student ? (
            <StudentLoanList studentId={student.id} finePerDay={finePerDay} />
          ) : (
            <p className="text-xs text-muted-foreground">Use the search above.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StudentPicker({
  value,
  onChange,
}: {
  value: StudentRow | null
  onChange: (s: StudentRow | null) => void
}) {
  const [q, setQ] = useState("")
  const results = useQuery<{ items: StudentRow[] }>({
    queryKey: ["library-student-search", q],
    queryFn: async () => {
      const res = await fetch(`/api/students?search=${encodeURIComponent(q)}&limit=10`)
      if (!res.ok) throw new Error("Failed")
      const data = (await res.json()) as {
        items: Array<{
          id: string
          admissionNumber: string
          user: { firstName: string; lastName: string; avatarUrl: string | null }
        }>
      }
      return {
        items: data.items.map((s) => ({
          id: s.id,
          admissionNumber: s.admissionNumber,
          firstName: s.user.firstName,
          lastName: s.user.lastName,
          avatarUrl: s.user.avatarUrl,
        })),
      }
    },
    enabled: q.trim().length >= 1 && !value,
  })

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
        <Avatar className="h-8 w-8">
          {value.avatarUrl ? <AvatarImage src={value.avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-[10px]">
            {initials(value.firstName, value.lastName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {value.firstName} {value.lastName}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {value.admissionNumber}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Student (search by name or admission #)</Label>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Start typing…"
          className="pl-8"
        />
      </div>
      {q.length >= 1 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border">
          {results.isLoading ? (
            <li className="p-2 text-xs text-muted-foreground">Searching…</li>
          ) : (results.data?.items ?? []).length === 0 ? (
            <li className="p-2 text-xs text-muted-foreground">No matches</li>
          ) : (
            results.data!.items.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onChange(s)
                    setQ("")
                  }}
                >
                  <Avatar className="h-6 w-6">
                    {s.avatarUrl ? <AvatarImage src={s.avatarUrl} alt="" /> : null}
                    <AvatarFallback className="text-[10px]">
                      {initials(s.firstName, s.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">
                    {s.firstName} {s.lastName}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {s.admissionNumber}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

function BookPicker({
  books,
  value,
  onChange,
}: {
  books: LibraryBook[]
  value: LibraryBook | null
  onChange: (b: LibraryBook) => void
}) {
  const [q, setQ] = useState("")
  const filtered = q.trim()
    ? books.filter((b) =>
        `${b.title} ${b.author ?? ""} ${b.isbn ?? ""}`.toLowerCase().includes(q.toLowerCase()),
      )
    : books.slice(0, 20)

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Book to issue ({books.length} available)</Label>
      <div className="relative">
        <Book className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, author, ISBN…"
          className="pl-8"
        />
      </div>
      <ul className="max-h-44 overflow-y-auto rounded-md border">
        {filtered.length === 0 ? (
          <li className="p-2 text-xs text-muted-foreground">No matches</li>
        ) : (
          filtered.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onChange(b)}
                className={cn(
                  "flex w-full items-start gap-2 border-b px-2 py-1.5 text-left text-sm hover:bg-muted",
                  value?.id === b.id && "bg-primary/10",
                )}
              >
                <Book className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.title}</p>
                  {b.author && (
                    <p className="truncate text-[11px] text-muted-foreground">{b.author}</p>
                  )}
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {b.availableCopies}/{b.totalCopies}
                </Badge>
                {value?.id === b.id && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

function ActiveLoansPicker({
  student,
  value,
  onChange,
}: {
  student: StudentRow
  value: LibraryBook | null
  onChange: (b: LibraryBook) => void
}) {
  const list = useQuery<{ items: Loan[] }>({
    queryKey: ["student-loans-active", student.id],
    queryFn: async () => {
      const res = await fetch(`/api/library/transactions?studentId=${student.id}&status=active`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Book to return</Label>
      {list.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (list.data?.items ?? []).length === 0 ? (
        <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
          {student.firstName} has no active loans.
        </p>
      ) : (
        <ul className="max-h-44 overflow-y-auto rounded-md border">
          {list.data!.items.map((t) => {
            const book = t.book as LibraryBook
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...book,
                      coverUrl: t.book.coverUrl,
                      author: t.book.author,
                      isbn: null,
                      category: null,
                      subject: null,
                      publisher: null,
                      year: null,
                      description: null,
                      totalCopies: 0,
                      availableCopies: 0,
                    })
                  }
                  className={cn(
                    "flex w-full items-start justify-between gap-2 border-b px-2 py-1.5 text-left text-sm hover:bg-muted",
                    value?.id === t.book.id && "bg-primary/10",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.book.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Due {dayjs(t.dueDate).format("D MMM YYYY")}
                    </p>
                  </div>
                  {t.overdue && (
                    <Badge variant="outline" className="shrink-0 text-[10px] text-destructive">
                      Overdue
                    </Badge>
                  )}
                  {value?.id === t.book.id && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function StudentLoanList({
  studentId,
  finePerDay,
}: {
  studentId: string
  finePerDay: number
}) {
  const list = useQuery<{ items: Loan[] }>({
    queryKey: ["student-loans", studentId],
    queryFn: async () => {
      const res = await fetch(`/api/library/transactions?studentId=${studentId}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  if (list.isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>
  const items = list.data?.items ?? []
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">No loans yet.</p>
  }

  return (
    <ul className="space-y-2">
      {items.slice(0, 10).map((t) => (
        <li key={t.id} className="flex items-start gap-2 rounded-md border p-2 text-xs">
          <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{t.book.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {t.returnedAt
                ? `Returned ${dayjs(t.returnedAt).format("D MMM YYYY")}`
                : `Due ${dayjs(t.dueDate).format("D MMM YYYY")}`}
              {t.fine ? ` · ₦${Number(t.fine).toLocaleString()} fine` : ""}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {t.returnedAt ? "Returned" : t.overdue ? "Overdue" : "Active"}
          </Badge>
        </li>
      ))}
      {finePerDay /* reference param to silence unused */ ? null : null}
    </ul>
  )
}
