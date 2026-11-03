ALTER TABLE "outreach_emails" DROP COLUMN "html";--> statement-breakpoint
-- Closings no longer carry the link inside them: it goes on its own line.
UPDATE "outreach_variants" SET "closing" = regexp_replace("closing", '\{link:([^}]+)\}', '\1') WHERE "closing" LIKE '%{link:%';
