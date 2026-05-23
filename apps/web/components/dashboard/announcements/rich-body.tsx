import { cn } from "@/lib/utils"

/**
 * Renders pre-sanitized HTML (from `lib/markdown.ts`). Callers must NEVER pass
 * raw user input here — the markdown render + DOMPurify happens server-side.
 */
export function RichBody({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn("rich-text", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
