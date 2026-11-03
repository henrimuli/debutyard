CREATE TYPE "public"."outreach_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."outreach_email_status" AS ENUM('draft', 'sending', 'sent', 'failed', 'bounced', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."outreach_mode" AS ENUM('off', 'dry_run', 'live');--> statement-breakpoint
CREATE TYPE "public"."outreach_prospect_status" AS ENUM('discovered', 'qualified', 'researched', 'drafted', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."outreach_suppression_kind" AS ENUM('email', 'domain');--> statement-breakpoint
CREATE TYPE "public"."outreach_thread_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TYPE "public"."outreach_variant_status" AS ENUM('pending', 'testing', 'retired');--> statement-breakpoint
CREATE TABLE "outreach_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"user_agent" text,
	"scanner" boolean DEFAULT false NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"to_address" text NOT NULL,
	"from_address" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"html" text NOT NULL,
	"token" text NOT NULL,
	"message_id" text NOT NULL,
	"status" "outreach_email_status" DEFAULT 'draft' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"first_click_at" timestamp with time zone,
	"clicks" integer DEFAULT 0 NOT NULL,
	"replied_at" timestamp with time zone,
	"reply_class" text,
	"unsubscribed_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"order_id" uuid,
	"converted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_emails_prospect_id_unique" UNIQUE("prospect_id"),
	CONSTRAINT "outreach_emails_to_address_unique" UNIQUE("to_address"),
	CONSTRAINT "outreach_emails_token_unique" UNIQUE("token"),
	CONSTRAINT "outreach_emails_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "outreach_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"direction" "outreach_direction" NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"to_address" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"message_id" text NOT NULL,
	"in_reply_to" text,
	"references" text,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_messages_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "outreach_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"website_url" text NOT NULL,
	"directory_id" uuid,
	"source_url" text NOT NULL,
	"launch_evidence" text NOT NULL,
	"launched_at" timestamp with time zone,
	"status" "outreach_prospect_status" DEFAULT 'discovered' NOT NULL,
	"reason" text,
	"reason_detail" text,
	"classification" jsonb,
	"email" text,
	"email_source_url" text,
	"research" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_prospects_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "outreach_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"mode" "outreach_mode" DEFAULT 'off' NOT NULL,
	"daily_limit" integer DEFAULT 5 NOT NULL,
	"max_authority" integer DEFAULT 40 NOT NULL,
	"paused_reason" text,
	"imap_uid_validity" text,
	"imap_last_uid" integer DEFAULT 0 NOT NULL,
	"imap_checked_at" timestamp with time zone,
	"imap_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_sources" (
	"directory_id" uuid PRIMARY KEY NOT NULL,
	"last_crawled_at" timestamp with time zone,
	"last_found" integer DEFAULT 0 NOT NULL,
	"total_found" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "outreach_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "outreach_suppression_kind" NOT NULL,
	"value" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_suppressions_value_unique" UNIQUE("value")
);
--> statement-breakpoint
CREATE TABLE "outreach_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid,
	"contact_email" text NOT NULL,
	"contact_name" text,
	"subject" text DEFAULT '' NOT NULL,
	"reply_class" text,
	"status" "outreach_thread_status" DEFAULT 'open' NOT NULL,
	"unread" boolean DEFAULT true NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_threads_email_id_unique" UNIQUE("email_id")
);
--> statement-breakpoint
CREATE TABLE "outreach_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "outreach_variant_status" DEFAULT 'pending' NOT NULL,
	"subject_brief" text NOT NULL,
	"pitch_brief" text NOT NULL,
	"closing" text NOT NULL,
	"source" text DEFAULT 'agent' NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"retired_reason" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_clicks" ADD CONSTRAINT "outreach_clicks_email_id_outreach_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."outreach_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_prospect_id_outreach_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."outreach_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_variant_id_outreach_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."outreach_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_thread_id_outreach_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."outreach_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_prospects" ADD CONSTRAINT "outreach_prospects_directory_id_directories_id_fk" FOREIGN KEY ("directory_id") REFERENCES "public"."directories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sources" ADD CONSTRAINT "outreach_sources_directory_id_directories_id_fk" FOREIGN KEY ("directory_id") REFERENCES "public"."directories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_threads" ADD CONSTRAINT "outreach_threads_email_id_outreach_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."outreach_emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_clicks_email_idx" ON "outreach_clicks" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "outreach_emails_status_idx" ON "outreach_emails" USING btree ("status","sent_at");--> statement-breakpoint
CREATE INDEX "outreach_emails_variant_idx" ON "outreach_emails" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "outreach_messages_thread_idx" ON "outreach_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "outreach_prospects_status_idx" ON "outreach_prospects" USING btree ("status","discovered_at");--> statement-breakpoint
CREATE INDEX "outreach_threads_status_idx" ON "outreach_threads" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "outreach_threads_contact_idx" ON "outreach_threads" USING btree ("contact_email");