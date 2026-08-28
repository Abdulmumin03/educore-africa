import { listAnnouncements } from "@/lib/announcements"
import { AnnouncementsManager, type AnnouncementRow } from "../announcements-manager"

export async function AnnouncementsTab() {
  const announcements = (await listAnnouncements()) as unknown as AnnouncementRow[]
  return <AnnouncementsManager initial={announcements} />
}
