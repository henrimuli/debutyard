ALTER TABLE "coupons" ADD COLUMN "first_purchase_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The Founder Kit's coupon: 15% off a first paid debut. The exit-intent popup hands it out.
INSERT INTO "coupons" ("code", "percent_off", "applies_to_skus", "first_purchase_only")
VALUES ('FOUNDERKIT15', 15, ARRAY['launch_fast_track', 'launch_pro', 'launch_premium', 'launch_spotlight'], true)
ON CONFLICT ("code") DO NOTHING;
