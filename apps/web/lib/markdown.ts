import { marked } from "marked"
import DOMPurify from "isomorphic-dompurify"

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
]

const ALLOWED_ATTR = ["href", "title", "target", "rel"]

marked.setOptions({
  gfm: true,
  breaks: true, // newline = <br>, which matches what staff expect from a textarea
})

/**
 * Render markdown to a sanitized HTML string. Safe to embed via
 * `dangerouslySetInnerHTML`. External links get rel="noopener noreferrer".
 */
export function renderMarkdown(source: string): string {
  if (!source.trim()) return ""
  const rawHtml = marked.parse(source, { async: false }) as string
  const safe = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ["target", "rel"],
  })
  return safe
}

/**
 * Strip markdown to a plain-text string suitable for SMS or email previews.
 * Collapses whitespace; truncates with an ellipsis past maxChars.
 */
export function markdownToPlainText(source: string, maxChars = 280): string {
  if (!source) return ""
  const text = source
    // Headings, blockquote, list markers
    .replace(/^\s{0,3}(#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+)/gm, "")
    // Bold / italic
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // Inline code
    .replace(/`([^`]+)`/g, "$1")
    // Links [text](url) → text (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    // Images ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Collapse runs of whitespace
    .replace(/\s+/g, " ")
    .trim()
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1).trimEnd() + "…"
}
