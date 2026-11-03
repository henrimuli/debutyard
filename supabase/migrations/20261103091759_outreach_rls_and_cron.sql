ALTER TABLE "outreach_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_prospects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_clicks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_suppressions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- The cold outreach worker, hourly at :35 and given as long as Vercel gives it.
-- Uses the site_url and cron_secret already in Vault (see spotlight_waitlist_cron).
-- It only reads the mailbox until staff turn outreach on in /admin/outreach.
-- Plain Postgres (CI, local tests) has no pg_cron or Vault, so this is a no-op there.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
    OR NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net')
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE NOTICE 'pg_cron, pg_net or Vault not available; skipping cron schedule';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'debutyard-outreach';
  PERFORM cron.schedule('debutyard-outreach', '35 * * * *', $call$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'site_url') || '/api/cron/outreach',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      timeout_milliseconds := 300000
    )
  $call$);
END
$$;
