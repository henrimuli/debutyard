CREATE TABLE "featured_reruns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"ended_email_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "featured_reruns_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "run_ended_email_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "featured_reruns" ADD CONSTRAINT "featured_reruns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_reruns" ADD CONSTRAINT "featured_reruns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "featured_reruns_product_idx" ON "featured_reruns" USING btree ("product_id","ends_at");