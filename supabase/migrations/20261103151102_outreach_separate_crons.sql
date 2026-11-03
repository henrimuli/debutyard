-- Outreach's work on separate schedules: replies stay hourly at :35 on the job that already exists.
-- Research runs every three hours, and writing and sending hourly, spreading sends over the sending hours.
-- Uses the site_url and cron_secret already in Vault (see spotlight_waitlist_cron).
-- Both do nothing until staff turn outreach on in /admin/outreach.
-- Plain Postgres (CI, local tests) has no pg_cron or Vault, so this is a no-op there.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
    OR NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net')
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE NOTICE 'pg_cron, pg_net or Vault not available; skipping cron schedule';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('debutyard-outreach-research', 'debutyard-outreach-send');
  PERFORM cron.schedule('debutyard-outreach-research', '15 */3 * * *', $call$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'site_url') || '/api/cron/outreach-research',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      timeout_milliseconds := 300000
    )
  $call$);
  PERFORM cron.schedule('debutyard-outreach-send', '5 * * * *', $call$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'site_url') || '/api/cron/outreach-send',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      timeout_milliseconds := 300000
    )
  $call$);
END
$$;
