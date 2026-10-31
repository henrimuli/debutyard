CREATE TYPE "public"."maker_review_status" AS ENUM('pending', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."post_author_role" AS ENUM('team', 'maker');--> statement-breakpoint
CREATE TYPE "public"."post_product_role" AS ENUM('subject', 'listed', 'compared');--> statement-breakpoint
CREATE TYPE "public"."revision_reason" AS ENUM('autosave', 'manual', 'publish', 'restore');--> statement-breakpoint
ALTER TYPE "public"."post_kind" ADD VALUE 'roundup';--> statement-breakpoint
ALTER TYPE "public"."post_kind" ADD VALUE 'comparison';--> statement-breakpoint
ALTER TYPE "public"."post_kind" ADD VALUE 'alternatives';--> statement-breakpoint
CREATE TABLE "blog_author_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "keyword_metrics" (
	"keyword" text PRIMARY KEY NOT NULL,
	"avg_monthly_searches" integer,
	"competition" text,
	"competition_index" smallint,
	"low_bid_cents" integer,
	"high_bid_cents" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maker_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" "maker_review_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"requested_by" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "maker_reviews_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "post_authors" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "post_author_role" DEFAULT 'team' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "post_authors_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "post_drafts" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"fields" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"has_unpublished_changes" boolean DEFAULT false NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"seo_score" smallint,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_products" (
	"post_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"role" "post_product_role" DEFAULT 'listed' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "post_products_post_id_product_id_pk" PRIMARY KEY("post_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "post_redirects" (
	"from_slug" text PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"fields" jsonb NOT NULL,
	"reason" "revision_reason" DEFAULT 'autosave' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "content_json" jsonb;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "content_html" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "toc" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "faq" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "word_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "reading_minutes" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cover_alt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "seo_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "seo_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "focus_keyword" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "secondary_keywords" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "canonical_url" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "noindex" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "content_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "maker_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "blog_author_profiles" ADD CONSTRAINT "blog_author_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maker_reviews" ADD CONSTRAINT "maker_reviews_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maker_reviews" ADD CONSTRAINT "maker_reviews_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_authors" ADD CONSTRAINT "post_authors_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_authors" ADD CONSTRAINT "post_authors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_drafts" ADD CONSTRAINT "post_drafts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_drafts" ADD CONSTRAINT "post_drafts_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_products" ADD CONSTRAINT "post_products_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_products" ADD CONSTRAINT "post_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_redirects" ADD CONSTRAINT "post_redirects_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maker_reviews_post_idx" ON "maker_reviews" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_authors_user_idx" ON "post_authors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "post_products_product_idx" ON "post_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "post_revisions_post_idx" ON "post_revisions" USING btree ("post_id","created_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_blog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."blog_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_category_idx" ON "posts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "posts_product_idx" ON "posts" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "blog_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "blog_author_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_redirects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_authors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maker_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "keyword_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "blog_categories" ("slug", "name", "description", "sort_order") VALUES ('launch', 'Launch', 'Launching a product: where, when and how to get it in front of people.', 10), ('growth', 'Growth & SEO', 'Backlinks, directories, search and the channels that keep traffic coming.', 20), ('building', 'Building with AI', 'Shipping with agents, AI coding tools and the stack behind modern products.', 30), ('tools', 'Tools', 'Roundups and comparisons of products launched on DebutYard and beyond.', 40), ('launches', 'Launches', 'Launch stories and weekly recaps from the board.', 50) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "post_authors" ("post_id", "user_id", "role", "position") SELECT "id", "author_id", 'team', 0 FROM "posts" WHERE "author_id" IS NOT NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "posts" SET "category_id" = (SELECT "id" FROM "blog_categories" WHERE "slug" = 'launches') WHERE "kind"::text IN ('recap', 'launch') AND "category_id" IS NULL;
