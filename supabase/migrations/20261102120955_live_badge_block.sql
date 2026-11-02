ALTER TABLE "submission_orders" ADD COLUMN "block_key" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_orders" ADD COLUMN "block_installed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission_orders" ADD COLUMN "block_installed_url" text;--> statement-breakpoint
ALTER TABLE "submission_orders" ADD COLUMN "block_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission_orders" ADD COLUMN "intake_draft_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "badge_code" text;--> statement-breakpoint
ALTER TABLE "submission_orders" ADD CONSTRAINT "submission_orders_block_key_unique" UNIQUE("block_key");