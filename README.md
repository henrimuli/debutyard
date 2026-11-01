# DebutYard

> Launch. Network. Grow.

DebutYard is a launch directory for SaaS and startup products. It has:

- weekly debuts with community applause and Debut of the Week/Month/Year winners
- a free tier where your listing link is dofollow while our badge stays on your site
- paid launch tiers and featured placements
- a done-for-you service that submits your product to other directories, with a live tracking dashboard and ongoing link monitoring

The research, pricing and roadmap are in [docs/PLAN.md](docs/PLAN.md).

## Status

**Phases 0 (foundations), 1 (launch board), 2 (monetization + agent surface), 3 (directories, tracker, submission service) and 4 (Link Monitor, subscriptions, affiliates, free tools) are done.** Phase 5 hasn't started. The UI uses an evergreen-and-black palette (tokens in `src/app/globals.css`, raw values for SVGs/OG images in `src/config/brand.ts`).

| Area               | What's there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch board       | Weekly debuts (Mon–Sun UTC), a ranked board on the homepage, past weeks, categories, builder profiles, product pages (week rank, applause-per-day chart, same-week and similar products, discussion)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Submitting         | `/submit`: fill details from the product's URL (tagline, descriptions, pricing and X/GitHub links built in code from the homepage plus its features and pricing pages, no AI; the homepage OG image as the first screenshot, or a worker screenshot when there is none), up to 3 screenshots, logo upload to R2, up to 3 categories, then a plan: free (queue, max 2 waiting per maker) or Fast Track / Pro / Premium / Spotlight through Paystack or PayPal                                                                                                                                                                            |
| Moderation         | `/admin` review queue (paid listings first). Approving schedules the listing; rejecting a paid listing refunds it automatically (money-back guarantee)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Applause           | One clap per account per product; a second click takes it back. New accounts (<72h) and repeat claps from the same network count less. Rate limits. Substantive comments add a little to the score. Rules published at `/how-ranking-works`                                                                                                                                                                                                                                                                                                                                                                                             |
| Winners            | A daily cron closes finished weeks: top 3 (with an in-week score) get awards, a permanent followed link and an email                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Badges             | Light/dark SVG badges (`/badge/{slug}`, winner variant, optional live applause count, `?applause=1`). Verification by fetching the site (HTML) or a DNS TXT record. Weekly re-check, 7-day grace period, then nofollow                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Featured           | Fast Track (7 days), Pro (14 days), Premium and Spotlight (30 days) appear in the homepage featured rail, counted from when the listing goes live. Spotlight is the hero during its debut week, capped at 3 per week. Manual perks (newsletter, social posts, launch post, Spotlight's directory bundle) arrive as a to-do email to `ADMIN_EMAIL`                                                                                                                                                                                                                                                                                       |
| Maker dashboard    | Status, debut week and queue position, badge snippet and one-click check, views, clicks, applause and comments                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Boards             | Monthly and yearly boards (`/month/2026-10`, `/year/2026`) rank every debut of the period on its own debut-week score; the top 3 get Debut of the Month/Year awards when the period ends.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Featured slots     | `/advertise`: book the leaderboard slot (between #3 and #4), homepage rail, top sponsor, a category banner or the newsletter sponsor. Capped per week, an unpaid booking holds for an hour, payment activates it. Impressions and clicks on the dashboard; CPC guarantee (over $1/click at the end → another week free, up to 4) and a results email. Admin inventory at `/admin/ads`                                                                                                                                                                                                                                                   |
| Newsletter         | Double opt-in signup (footer, home, blog). After each week closes the cron sends the Monday digest (winners, new debuts with paid tiers first, sponsor) in Resend batches, once. One-click unsubscribe. Stats, unique opens and clicks per issue (Resend webhook) and a preview at `/admin/newsletter`                                                                                                                                                                                                                                                                                                                                  |
| Blog               | `/blog` with RSS. Markdown editor at `/admin/blog` (raw HTML escaped). After each week closes the cron drafts a recap and emails you to finish and publish it                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Readiness check    | `/tools/launch-readiness`: scores a URL on HTTPS, reachability, title, description, social image, icon, noindex, duplicates and the badge, with fixes, a suggested listing and the next weeks with room                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| API & MCP          | Personal tokens at `/dashboard/api`. REST at `/api/v1` (OpenAPI at `/api/v1/openapi.json`). MCP at `/mcp` with OAuth connect (dynamic client registration, PKCE, approval at `/connect`; each connected app gets its own revocable token), or `/api/mcp` with a pasted token or anonymously. Tools: `search_products`, `get_product`, `list_categories`, `list_launch_directories`, `check_launch_readiness`, `check_dofollow`, `check_dr`, `submit_product` (drafts only), `get_my_launches`, `get_my_links`. Docs at `/docs`                                                                                                          |
| Directories        | `/directories`: 100 launch directories seeded (name, URL, niche, pricing, stated link type, badge and "needs the maker" flags), filterable. Authority Score is empty until measured: the daily job fills it from the provider, or edit it at `/admin/directories` or import a CSV. Acceptance rate, days to live and the link type we actually observed update daily from outcomes                                                                                                                                                                                                                                                      |
| DIY tracker        | `/dashboard/tracker`: per product, every directory with a status. Marking one live with its URL fetches the listing and verifies the link (loads, links to the product, rel, anchor)                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Submission service | `/submission-service`: buy without an account (or "boost" an existing listing; Spotlight opens its bundled Starter order). The buyer gets a private link: intake form (product kit, badge preference, account permission), then a live dashboard with CSV, print-to-PDF and a shareable read-only report (`/r/…`). Targets are niche-matched and skip guided, nofollow and (unless allowed) badge directories. Ops console at `/admin/submissions`: kanban, per-directory instructions, status/URL/notes per row, bulk updates, automatic replacement of rejections, delivery email. Daily digests tell clients about new live listings |
| Ops tooling        | Per-order inboxes (`{key}@INBOUND_EMAIL_DOMAIN`, received by Resend) shown on the admin order page with likely confirmation links. Directory logins stored encrypted (AES-256-GCM) and handed over on the private order page after delivery. Badge block: badge directories are held until the client's site shows the badge, then swapped for badge-free ones after 7 days. Evidence screenshots (`workers/screenshot`) when a listing goes live or changes                                                                                                                                                                            |
| Link Monitor       | `/dashboard/links`: every live listing (tracker, orders) plus any URL you add, re-checked daily for 14 days then weekly; one alert email per owner per run when a link turns nofollow, disappears or recovers. Weekly Google index check (SERP API), Authority Score snapshots with before/after charts, and a monthly directory audit that retires dead directories                                                                                                                                                                                                                                                                    |
| Subscriptions      | Maker Pro and Maker Unlimited on Paystack and PayPal, with entitlements, dunning emails and `/dashboard/billing`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Affiliates         | **Paused** (see `src/lib/affiliates/PAUSED.md`). `/dashboard/affiliate`: a `?via=` link (60-day cookie), commission on paid orders, approved after the 30-day refund window, adjusted on refunds. Payouts tracked at `/admin/affiliates`                                                                                                                                                                                                                                                                                                                                                                                                |
| Free tools         | `/tools/dofollow-checker` and `/tools/dr-checker` (the Authority Score checker, when a provider key is set), also over REST and MCP, 15 runs an hour per caller                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Launch wall        | `/launch-wall`: makers who opt in show their verified live listings; also on builder profiles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| SEO                | Sitemap, robots, JSON-LD per product, generated Open Graph images, `llms.txt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Foundations        | Next.js 16 (Cache Components), Supabase Postgres + Drizzle (RLS on every table), Better Auth magic link + Google/GitHub, Paystack + PayPal behind one `PaymentProvider`, R2, Resend, CI                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Admin access:** the admin area starts at `/admin/dashboard` (what needs attention, revenue, orders, scheduled jobs and setup status). `ADMIN_EMAIL` is always the owner, checked on every request, so it works for accounts created before the variable was set. Add teammates by email at `/admin/users` (stored in `admin_users`; roles are recorded for permissions to come, and every role has full access for now). Signed-out visitors to `/admin` are sent to sign-in; signed-in non-staff get a 404.

**What can be bought today:**

- paid debuts, during submission;
- featured slots, from the `/advertise` calendar;
- the three directory-submission packages ($99 / $179 / $299), from `/submission-service`: the buyer gets a private intake link and you run the order from `/admin/submissions`.

- plans (Maker Pro, Maker Unlimited), from `/dashboard/billing`, once `pnpm payments:sync-plans` has created them on each provider. Subscribers manage them at `/dashboard/billing`.

## Local development

Requirements: Node 20.9+ (22 recommended), pnpm 10, and a Postgres database (a free Supabase project, or local Postgres).

```bash
pnpm install
cp .env.example .env.local   # fill in at least DATABASE_URL, DIRECT_DATABASE_URL, BETTER_AUTH_SECRET
pnpm db:migrate              # apply migrations
pnpm dev                     # http://localhost:3000
```

Without `RESEND_API_KEY`, sign-in links and order emails are printed to the terminal in development. In production, sending fails loudly instead.

### Scripts

| Command                                      | Does                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`               | Next.js                                                                                                   |
| `pnpm lint`, `pnpm typecheck`, `pnpm format` | Code quality                                                                                              |
| `pnpm test`                                  | Unit tests. Set `TEST_DATABASE_URL` to also run the Postgres integration tests (that database gets wiped) |
| `pnpm db:generate`                           | Create a migration after editing `src/db/schema/*`                                                        |
| `pnpm db:migrate`                            | Apply pending migrations with the Supabase CLI (`supabase db push`, uses `DIRECT_DATABASE_URL`)           |
| `pnpm db:status`                             | Show which migrations are applied (`supabase migration list`)                                             |
| `pnpm db:studio`                             | Browse the database                                                                                       |
| `pnpm payments:sync-plans`                   | Create the subscription plans on Paystack/PayPal and store their ids                                      |
| `pnpm db:seed`                               | Fill a local database with sample makers, products, applause and comments (refuses to run in production)  |

## Setting up the services

### Supabase (database)

1. Create a project. Pick the region closest to your Vercel region, e.g. `eu-central-1` for Frankfurt.
2. Go to **Project Settings → Database → Connection string**:
   - `DATABASE_URL` = **Transaction pooler** (port 6543). The app turns off prepared statements for it.
   - `DIRECT_DATABASE_URL` = **Session pooler** or direct connection (port 5432), used for migrations.
3. Run `pnpm db:migrate`. The Supabase CLI applies `supabase/migrations/` and records each one in `supabase_migrations.schema_migrations`, so `pnpm db:status` and the dashboard show the history. Every table gets row-level security with no policies. That blocks Supabase's public Data API, and the app is unaffected because it connects as the `postgres` role. A test fails if a new table misses RLS.

### Paystack (primary payments)

1. Create the business account and complete verification. Then **Settings → Preferences**: turn on **international payments** and **USD**. Settlement needs a USD account at a Kenyan bank.
2. **Settings → API Keys & Webhooks**: copy the secret key into `PAYSTACK_SECRET_KEY`. Use `sk_test_…` until you go live.
3. Webhook URL: `https://debutyard.com/api/webhooks/paystack`.
4. Before selling subscriptions, confirm with Paystack that recurring plans can be priced in **USD** on a Kenyan account (PLAN.md §7.5).

### PayPal (second checkout button)

1. Go to [developer.paypal.com](https://developer.paypal.com) → **Apps & Credentials** and create an app (sandbox first). Copy its client ID and secret.
2. Add a webhook to `https://debutyard.com/api/webhooks/paypal` with these events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, and the `BILLING.SUBSCRIPTION.*` events. Copy its id into `PAYPAL_WEBHOOK_ID`.
3. Set `PAYPAL_ENV=live` with live credentials when you go live.

After either provider is configured, run `pnpm payments:sync-plans` once per environment.

### Cloudflare R2 (file storage)

1. Create a bucket (e.g. `debutyard`) and connect a custom domain (e.g. `cdn.debutyard.com`) as `R2_PUBLIC_URL`.
2. Create an API token with **Object Read & Write** on that bucket and set the `R2_*` variables.
3. Add a CORS policy (bucket → **Settings** → **CORS Policy**). Browsers upload logos, profile pictures and screenshots straight to R2 with presigned URLs, so without it every upload fails with "couldn't reach file storage":

   ```json
   [
     {
       "AllowedOrigins": ["https://debutyard.com", "https://www.debutyard.com", "http://localhost:3000"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

### Resend (email)

Verify `debutyard.com` in Resend, then set `RESEND_API_KEY`, `EMAIL_FROM` and `ADMIN_EMAIL`.

Add one webhook to `https://debutyard.com/api/webhooks/resend` and copy its signing secret (`whsec_…`) into `RESEND_WEBHOOK_SECRET`. Subscribe it to:

- `email.received`, for per-order submission inboxes. Turn on receiving for the inbox domain (e.g. `submit.debutyard.com`: add the MX record Resend shows) and set `INBOUND_EMAIL_DOMAIN` to it. Every address on the domain is accepted; the app matches the part before the `@` to an order and ignores the rest.
- `email.opened` and `email.clicked`, for newsletter stats (also turn on open and click tracking for the sending domain).

### Optional services

- **Gemini API** (`GEMINI_API_KEY`, free tier): optional, reserved for upcoming AI features. Listing prefill doesn't use it.
- **Authority Score provider** (`DR_API_KEY`, plus `DR_PROVIDER` to switch from the default, DataForSEO): Authority Score snapshots and the checker. DataForSEO's key is your API `login:password`; `DR_PROVIDER=ahrefs` with an API v3 key uses Ahrefs Domain Rating instead.
- **SERP API** (`SERP_PROVIDER`, `SERP_API_KEY`): the weekly index check.
- **Screenshot worker** (`WORKER_URL`, `WORKER_SECRET`): deploy `workers/screenshot` (see its README).
- **Order inboxes** (`INBOUND_EMAIL_DOMAIN`) and `CREDENTIALS_KEY`: see Resend above.

### Vercel (hosting)

1. Import the GitHub repo. The framework preset is Next.js and needs no build settings.
2. Add every variable from `.env.example` under **Settings → Environment Variables** (Production and Preview), with `NEXT_PUBLIC_SITE_URL=https://debutyard.com`.
3. Add the domain. Pages like `/pricing` are prerendered, so **redeploy after changing payment keys**.
4. `vercel.json` schedules one daily job, `/api/cron/daily`, at 00:10 UTC, so each week closes just after Monday 00:00. The Hobby plan allows this. Vercel sends `CRON_SECRET` automatically. Its tasks, in order (each idempotent, failures isolated):
   - `weeks`, `periods`: close finished weeks, months and years and award winners
   - `newsletter`, `recap`: send the Monday digest, draft the weekly recap post
   - `payments`, `subscriptions`: reconcile pending orders, sync subscription status (dunning)
   - `ads`: settle featured slots (CPC guarantee)
   - `submission digests`, `badge blocks`: client status emails; detect client badges and swap held directories
   - `directory stats`, `badges`: directory acceptance/observed link type; badge re-checks
   - `links`, `indexed`: Link Monitor checks (batched); weekly Google index check
   - `directory audit`, `dr`: monthly directory liveness audit; Authority Score snapshots (one request per tracked domain, weekly) and directory scores (one DataForSEO bulk request for every directory, monthly)
   - `affiliates`: paused, along with the whole affiliate program (see `src/lib/affiliates/PAUSED.md`)
5. Supabase Cron (pg_cron + pg_net) runs the sub-daily jobs that Vercel Hobby rejects, set up by the `spotlight_waitlist_cron` migration:
   - `/api/cron/hourly` at :05 every hour re-runs `payments`, `ads` and the Spotlight waitlist.
   - `/api/cron/waitlist` every 5 minutes emails the Spotlight waitlist when a spot opens.

   The jobs read the site URL and `CRON_SECRET` from Supabase Vault. Add both once per project in the SQL editor: `select vault.create_secret('https://debutyard.com', 'site_url');` and `select vault.create_secret('<CRON_SECRET>', 'cron_secret');`. Check runs under Integrations → Cron in the dashboard, or with `select * from cron.job_run_details order by start_time desc limit 20;`.

## How payments flow

1. `POST /api/checkout` prices the SKU (`src/lib/payments/skus.ts`), applies any coupon, creates a `pending` order and returns the provider's checkout URL.
2. After paying, the buyer lands on `/checkout/return`. That page confirms with the provider server-side, and captures the order for PayPal. Fulfilment never runs on the redirect alone.
3. Webhooks (`/api/webhooks/{paystack,paypal}`) are signature-checked and stored in `payment_events`, so a re-delivered event is processed once. Payment events are re-verified with the provider before anything changes.
4. Paid orders run the fulfilment handler for their kind (`src/lib/payments/handlers.ts`). A claim on `fulfilled_at` keeps the return page and the webhook from both fulfilling, and a failed handler is retried by the next webhook or the nightly reconcile job.
5. `refundOrder()` handles full and partial refunds (money-back guarantee).

## Project layout

```
src/
  app/                 routes (pages, API routes, webhooks, cron)
  components/          UI primitives and site chrome
  config/site.ts       name, support email, legal entity
  db/                  Drizzle client and schema
  lib/auth.ts          Better Auth server config (auth-client.ts for the browser)
  lib/payments/        SKUs, pricing, providers, service, fulfilment
  lib/board/           ranking, rollover (weeks, months, years)
  lib/ads/             featured slot placements, booking, stats, CPC guarantee
  lib/newsletter/      subscribers and the weekly digest
  lib/blog/            posts, safe markdown, recap drafts
  lib/readiness/       launch-readiness checks
  lib/api/             tokens, shared operations, MCP server, OAuth connect
  lib/directories/     directory DB, CSV import, backlink checks, DIY tracker
  lib/submissions/     packages, target selection, orders, ops actions, inboxes, badge blocks
  lib/links/           Link Monitor, launch wall, index check
  lib/billing/         subscription plans and entitlements
  lib/metrics/         Authority Score providers and snapshots
  lib/affiliates/      referrals and commissions
  lib/tools/           free dofollow and Authority Score checkers
  lib/admin/           admin dashboard data, admin users, setup checklist
  lib/cron.ts          shared cron runner (daily and hourly routes), logs each run to cron_runs
  lib/storage.ts       Cloudflare R2
  env.ts               environment validation
workers/               off-Vercel workers: screenshots (Playwright container)
supabase/migrations/   SQL migrations (generated by Drizzle, applied by the Supabase CLI)
scripts/               one-off scripts (plan sync)
tests/                 integration tests
docs/PLAN.md           research and roadmap
```

## Before going live

- Register the business, get the KRA PIN, open the USD bank account, and finish Paystack verification and the PayPal Business account.
- Set `legalName` in `src/config/site.ts` to the registered business name, and have the policy pages reviewed (they're sound drafts, not legal advice).
- Ask an accountant how VAT applies to exported digital services and advertising.
- Make a real low-value purchase with each provider and refund it.
