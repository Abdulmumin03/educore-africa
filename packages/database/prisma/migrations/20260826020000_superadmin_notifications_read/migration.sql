-- SA-03: notification read watermark.
--
-- The console's notification feed is derived live from schools, payments,
-- tickets and security events rather than stored as rows, so read state is a
-- single timestamp per admin: anything newer than it is unread.

ALTER TABLE "super_admin_users" ADD COLUMN "notifications_read_at" TIMESTAMP(3);
