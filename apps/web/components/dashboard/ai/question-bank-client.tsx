"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { FileDown, Loader2, Save, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type SubjectOpt = { id: string; name: string; code: string }

type Question = {
  question: string
  options?: { label: string; text: string }[]
  answer: string
  explanation?: string
}

type GenerateResponse = {
  questions: Question[]
  model: string
  input: {
    subject: string
    classLevel: string
    topic: string
    difficulty: "EASY" | "MEDIUM" | "HARD"
    type: "MCQ" | "THEORY" | "FILL_IN_BLANK" | "TRUE_FALSE"
    count: number
  }
}

const CLASS_LEVELS = [
  "Nursery 1",
  "Nursery 2",
  "Primary 1",
  "Primary 2",
  "Primary 3",
  "Primary 4",
  "Primary 5",
  "Primary 6",
  "JSS 1",
  "JSS 2",
  "JSS 3",
  "SS 1",
  "SS 2",
  "SS 3",
]

export function QuestionBankClient({ subjects }: { subjects: SubjectOpt[] }) {
  const [subject, setSubject] = useState(subjects[0]?.name ?? "")
  const [subjectId, setSubjectId] = useState<string | undefined>(subjects[0]?.id)
  const [classLevel, setClassLevel] = useState("JSS 2")
  const [topic, setTopic] = useState("")
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM")
  const [type, setType] = useState<"MCQ" | "THEORY" | "FILL_IN_BLANK" | "TRUE_FALSE">("MCQ")
  const [count, setCount] = useState(10)

  const [generated, setGenerated] = useState<Question[]>([])
  const [model, setModel] = useState<string | null>(null)

  const generate = useMutation({
    mutationFn: async () => {
      if (!topic.trim()) throw new Error("Pick a topic first")
      const res = await fetch("/api/ai/questions/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, classLevel, topic, difficulty, type, count }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<GenerateResponse>
    },
    onSuccess: (d) => {
      setGenerated(d.questions)
      setModel(d.model)
      toast.success(`Generated ${d.questions.length} question${d.questions.length === 1 ? "" : "s"}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/questions/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId,
          subjectName: subject,
          classLevel,
          topic,
          difficulty,
          type,
          model,
          questions: generated,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ saved: number }>
    },
    onSuccess: (d) => toast.success(`Saved ${d.saved} to question bank`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  async function exportDocx() {
    const res = await fetch("/api/ai/questions/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `${subject} — ${topic}`,
        subject,
        classLevel,
        topic,
        difficulty,
        questions: generated,
      }),
    })
    if (!res.ok) {
      toast.error("Export failed")
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${subject}-${topic}.docx`.replace(/[^a-z0-9-_ ]/gi, "")
    a.click()
    URL.revokeObjectURL(url)
  }

  function update(i: number, patch: Partial<Question>) {
    setGenerated((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  }
  function remove(i: number) {
    setGenerated((prev) => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <Sparkles className="mr-1.5 inline h-5 w-5 text-violet-600" />
          AI question bank
        </h1>
        <p className="text-sm text-muted-foreground">
          Generate WAEC/NECO-style questions. Review, edit, then save to the bank or export as Word.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Generate</CardTitle>
          <CardDescription>Pick subject + topic + difficulty + count.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="Subject">
            <Select
              value={subjectId ?? "__custom__"}
              onValueChange={(v) => {
                if (v === "__custom__") {
                  setSubjectId(undefined)
                } else {
                  setSubjectId(v)
                  const s = subjects.find((x) => x.id === v)
                  if (s) setSubject(s.name)
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
                <SelectItem value="__custom__">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {!subjectId && (
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Custom subject name"
                className="mt-1"
              />
            )}
          </Field>
          <Field label="Class level">
            <Select value={classLevel} onValueChange={setClassLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLASS_LEVELS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Topic">
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Quadratic equations" />
          </Field>
          <Field label="Question type">
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MCQ">Multiple choice</SelectItem>
                <SelectItem value="THEORY">Theory / essay</SelectItem>
                <SelectItem value="FILL_IN_BLANK">Fill in the blank</SelectItem>
                <SelectItem value="TRUE_FALSE">True / false</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Difficulty">
            <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EASY">Easy</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HARD">Hard</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Count (5–50)">
            <Input type="number" min={5} max={50} value={count} onChange={(e) => setCount(Number(e.target.value) || 10)} />
          </Field>
        </CardContent>
        <CardContent className="flex items-center justify-end gap-2 border-t">
          <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Generate
          </Button>
        </CardContent>
      </Card>

      {generated.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="outline">
              {generated.length} question{generated.length === 1 ? "" : "s"} · {model ?? "—"}
            </Badge>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportDocx}>
                <FileDown className="mr-1.5 h-4 w-4" />
                Export .docx
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save to bank
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {generated.map((q, i) => (
              <Card key={i}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline">{i + 1}</Badge>
                    <Textarea
                      value={q.question}
                      onChange={(e) => update(i, { question: e.target.value })}
                      rows={2}
                      className="flex-1 text-sm"
                    />
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {q.options && q.options.length > 0 && (
                    <div className="grid gap-1 pl-8 text-sm sm:grid-cols-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{opt.label}</Badge>
                          <Input
                            value={opt.text}
                            onChange={(e) => {
                              const next = [...(q.options ?? [])]
                              next[oi] = { ...next[oi], text: e.target.value }
                              update(i, { options: next })
                            }}
                            className="h-8 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-2 pl-8 sm:grid-cols-2">
                    <Field label="Answer">
                      <Input
                        value={q.answer}
                        onChange={(e) => update(i, { answer: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </Field>
                    <Field label="Explanation">
                      <Input
                        value={q.explanation ?? ""}
                        onChange={(e) => update(i, { explanation: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </Field>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
