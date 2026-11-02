ALTER TABLE "submission_messages" ADD COLUMN "read_at" timestamp with time zone;
-- Mail from before there was a read state: the team has seen it, so it shouldn't all arrive as unread.
UPDATE "submission_messages" SET "read_at" = "received_at";
