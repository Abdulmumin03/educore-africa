"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Loader2, Send, Sparkles, Wrench } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type Role = "USER" | "ASSISTANT"
type ToolCall = { name: string; input: Record<string, unknown>; result: Record<string, unknown> }
type Message = {
  id: string
  role: Role
  content: string
  toolCalls?: ToolCall[]
  createdAt?: string
}

const EXAMPLES = [
  "How many students failed Maths in JSS 2 last term?",
  "Which teacher has the highest student pass rate this term?",
  "What is the total fees outstanding for SS 1?",
  "List students who were absent more than 10 days this term.",
]

export function AskClient() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  const history = useQuery<{ items: { id: string; title: string | null; updatedAt: string }[] }>({
    queryKey: ["ask-history"],
    queryFn: async () => {
      const res = await fetch("/api/ai/ask")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const loadConvo = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ai/ask/${id}`)
      if (!res.ok) throw new Error("Failed")
      return res.json() as Promise<{ id: string; messages: Message[] }>
    },
    onSuccess: (d) => {
      setConversationId(d.id)
      setMessages(d.messages)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const ask = useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, conversationId }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{
        conversationId: string
        message: string
        toolCalls: ToolCall[]
        model: string
      }>
    },
    onSuccess: (d) => {
      setConversationId(d.conversationId)
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "ASSISTANT",
          content: d.message,
          toolCalls: d.toolCalls,
        },
      ])
      history.refetch()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, ask.isPending])

  function submit() {
    const q = input.trim()
    if (!q) return
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "USER", content: q }])
    setInput("")
    ask.mutate(q)
  }

  function newConvo() {
    setConversationId(null)
    setMessages([])
    setInput("")
  }

  return (
    <div className="grid h-[calc(100vh-9rem)] gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="hidden flex-col lg:flex">
        <div className="flex items-center justify-between p-3">
          <p className="text-sm font-semibold">
            <Sparkles className="mr-1.5 inline h-4 w-4 text-violet-600" />
            Conversations
          </p>
          <Button size="sm" variant="outline" onClick={newConvo}>
            New
          </Button>
        </div>
        <CardContent className="flex-1 overflow-y-auto p-0">
          {history.isLoading ? (
            <div className="p-3 text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : !history.data || history.data.items.length === 0 ? (
            <p className="p-3 text-xs italic text-muted-foreground">No past chats yet.</p>
          ) : (
            <ul className="divide-y">
              {history.data.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => loadConvo.mutate(c.id)}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-xs hover:bg-muted",
                      conversationId === c.id && "bg-primary/5",
                    )}
                  >
                    <p className="line-clamp-2 font-medium">{c.title ?? "Untitled"}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(c.updatedAt).toLocaleString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="flex flex-col">
        <div className="border-b p-3">
          <p className="text-sm font-semibold">Ask EduCore</p>
          <p className="text-xs text-muted-foreground">
            Live answers from your school&apos;s data. Read-only — Ask can&apos;t modify anything.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Try one of these:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setInput(ex)
                      setTimeout(() => submit(), 0)
                    }}
                    className="rounded-md border bg-card p-3 text-left text-sm transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li key={m.id} className={cn("flex", m.role === "USER" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      m.role === "USER"
                        ? "bg-primary text-primary-foreground"
                        : "border bg-muted/40",
                    )}
                  >
                    <p className="whitespace-pre-line">{m.content}</p>
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {m.toolCalls.map((t, i) => (
                          <Badge key={i} variant="outline" className="text-[9px] font-mono">
                            <Wrench className="mr-1 h-2.5 w-2.5" />
                            {t.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
              {ask.isPending && (
                <li className="flex justify-start">
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    Thinking…
                  </div>
                </li>
              )}
            </ul>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="Ask a question about your school's data…"
              rows={2}
              className="flex-1 resize-none text-sm"
              disabled={ask.isPending}
            />
            <Button onClick={submit} disabled={ask.isPending || !input.trim()}>
              {ask.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
