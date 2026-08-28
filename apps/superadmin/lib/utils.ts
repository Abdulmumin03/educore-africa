import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Compact money formatter — the console shows platform-wide NGN sums. */
export function formatCurrency(value: number | string, currency = "NGN") {
  const n = typeof value === "string" ? Number(value) : value
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0)
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG").format(value)
}
