CREATE TABLE "outreach_mailboxes" (
	"address" text PRIMARY KEY NOT NULL,
	"imap_uid_validity" text,
	"imap_last_uid" integer DEFAULT 0 NOT NULL,
	"imap_checked_at" timestamp with time zone,
	"imap_error" text,
	"send_error" text,
	"send_error_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "outreach_settings" ADD COLUMN "health_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outreach_threads" ADD COLUMN "mailbox" text;--> statement-breakpoint
ALTER TABLE "outreach_mailboxes" ENABLE ROW LEVEL SECURITY;
