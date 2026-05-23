"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Send, MessageSquare, Mail, Phone, Bell } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { GradingSettings, NotificationSettings } from "@/lib/school-settings"

const CHANNELS: { key: keyof NotificationSettings["channels"]; label: string; icon: typeof MessageSquare }[] = [
  { key: "sms", label: "SMS (Africa's Talking)", icon: MessageSquare },
  { key: "email", label: "Email (Resend)", icon: Mail },
  { key: "whatsapp", label: "WhatsApp Business", icon: Phone },
  { key: "push", label: "In-app push", icon: Bell },
]

const EVENTS: { key: keyof NotificationSettings["events"]; label: string; hint: string }[] = [
  { key: "paymentReceived", label: "Payment received", hint: "Send a receipt to the payer" },
  { key: "feeReminder", label: "Fee reminder", hint: "Outstanding invoice nudge" },
  { key: "attendanceAbsent", label: "Attendance absent", hint: "Notify parent on absence" },
  { key: "gradePublished", label: "Grade published", hint: "When term results are released" },
  { key: "announcement", label: "Announcement", hint: "School-wide announcements" },
]

export function NotificationsTab({
  initial,
  grading,
}: {
  initial: NotificationSettings
  grading: GradingSettings
}) {
  const router = useRouter()
  const [state, setState] = useState<NotificationSettings>(initial)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testTarget, setTestTarget] = useState("")

  function toggleChannel(key: keyof NotificationSettings["channels"]) {
    setState((s) => ({ ...s, channels: { ...s.channels, [key]: !s.channels[key] } }))
  }
  function toggleEvent(key: keyof NotificationSettings["events"]) {
    setState((s) => ({ ...s, events: { ...s.events, [key]: !s.events[key] } }))
  }

  async function save() {
    setSaving(true)
    const res = await fetch("/api/school/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grading, notifications: state }),
    })
    setSaving(false)
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Couldn't save")
      return
    }
    toast.success("Notification settings saved")
    router.refresh()
  }

  async function testSend(channel: "sms" | "email") {
    if (!testTarget.trim()) {
      toast.error(channel === "sms" ? "Enter a phone number" : "Enter an email")
      return
    }
    setTesting(channel)
    const res = await fetch("/api/school/notifications/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel, target: testTarget.trim() }),
    })
    setTesting(null)
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Test send failed")
      return
    }
    toast.success(`Test ${channel === "sms" ? "SMS" : "email"} dispatched`)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>Turn each provider on or off for the whole school.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANNELS.map(({ key, label, icon: Icon }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center justify-between rounded-md border p-3 hover:bg-muted/40"
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{label}</span>
                {key === "whatsapp" && !state.whatsapp?.configured && (
                  <Badge variant="outline" className="text-xs">
                    Credentials needed
                  </Badge>
                )}
              </span>
              <input
                type="checkbox"
                checked={state.channels[key]}
                onChange={() => toggleChannel(key)}
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event triggers</CardTitle>
          <CardDescription>Which app events should send notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {EVENTS.map(({ key, label, hint }) => (
            <label
              key={key}
              className="flex cursor-pointer items-start justify-between rounded-md border p-3 hover:bg-muted/40"
            >
              <span>
                <span className="text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
              <input type="checkbox" checked={state.events[key]} onChange={() => toggleEvent(key)} />
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Test send</CardTitle>
          <CardDescription>
            Dispatch a verification message to confirm provider credentials work.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 sm:flex sm:items-end sm:gap-3 sm:space-y-0">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="test-target">Phone or email</Label>
            <Input
              id="test-target"
              value={testTarget}
              onChange={(e) => setTestTarget(e.target.value)}
              placeholder="+2348012345678 or admin@school.edu"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => testSend("sms")}
              disabled={testing !== null}
            >
              {testing === "sms" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Test SMS
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => testSend("email")}
              disabled={testing !== null}
            >
              {testing === "email" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Test email
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save notifications
        </Button>
      </div>
    </div>
  )
}
