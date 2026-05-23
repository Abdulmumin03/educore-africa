/**
 * Extract a YouTube video ID from any of the common URL shapes:
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/embed/ID
 *   https://www.youtube.com/shorts/ID
 * Returns null when the input is not a recognisable YouTube URL.
 */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, "")
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0]
      return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v")
      if (v && /^[A-Za-z0-9_-]{6,}$/.test(v)) return v
      const seg = u.pathname.split("/").filter(Boolean)
      if ((seg[0] === "embed" || seg[0] === "shorts") && seg[1]) {
        return /^[A-Za-z0-9_-]{6,}$/.test(seg[1]) ? seg[1] : null
      }
    }
    return null
  } catch {
    return null
  }
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}`
}

export function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`
}
