// Plain module, not "use client": the page reads this list to dispatch, and a
// client module's exports arrive on the server as proxies.
export const CONFIG_TABS = [
  { key: "plans", label: "Plans & pricing" },
  { key: "promo", label: "Promo codes" },
  { key: "email", label: "Email templates" },
  { key: "sms", label: "SMS templates" },
  { key: "announcements", label: "Announcements" },
] as const

export type ConfigTab = (typeof CONFIG_TABS)[number]["key"]
