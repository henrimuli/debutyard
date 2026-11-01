# DebutYard: handoff for the next agent

Last updated Oct 26, 2026, after Phase 3 merged (`master` @ PR #5). Phases 0–3 are done. This file lists **everything still to build (Phase 4 plus deferred items from Phases 1–3)** and the owner's non-code tasks. Phase 5 is out of scope for now.

Read this whole file, then `README.md` (setup, layout, payments flow) and `docs/PLAN.md` §4 (tracker, service, Link Monitor), §5.4 (subscriptions) and §7 (data model, jobs). Then start with **Workstream A**.

---

## 1. How this codebase works (read before coding)

- **Stack:** Next.js 16.4 (App Router, **Cache Components** on), React 19, TypeScript, Tailwind 4, Drizzle ORM + postgres-js on Supabase Postgres, Better Auth (magic link, Google, GitHub), Paystack + PayPal behind `src/lib/payments/` (`PaymentProvider`), Resend (`src/lib/email.ts`), Cloudflare R2 (`src/lib/storage.ts`), Vitest. Hosted on Vercel.
- **`AGENTS.md`: this is not the Next.js you know.** Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code. Rules that bit us:
  - Uncached data reads must sit inside `<Suspense>`, after `await params`, `await searchParams` or `await connection()`.
  - Don't call `new Date()` or `Date.now()` before that point. Compute "now"-dependent things in SQL (`now()`) or after `connection()`.
  - Page files may only export Next's page exports, so put helpers in `src/lib`.
  - Route types are generated: `PageProps<"/path">`, `RouteContext<"/path">`, `LayoutProps`. Run `pnpm typecheck`, which regenerates them, after adding routes.
  - Lint forbids `setState` in effects and `Date.now()` in render (react-hooks purity rules).
- **Data layer:**
  - Schema: `src/db/schema/*.ts`, exported from `src/db/schema/index.ts`.
  - `db()` in `src/db/index.ts` is a lazy singleton, with `casing: "snake_case"`.
  - In raw `sql`, bind dates as ISO strings with `::timestamptz` and use `sql.join` for lists.
- **Migrations live in `supabase/migrations/`** (the owner switched to the Supabase CLI). For a schema change:
  1. `pnpm drizzle-kit generate --name <name>`.
  2. Append `ALTER TABLE "<t>" ENABLE ROW LEVEL SECURITY;` for every new table. A test fails if any table lacks RLS.
  3. Data or seed SQL goes in `pnpm drizzle-kit generate --custom --name <name>`.
  4. `pnpm db:migrate` runs `supabase db push`. Tests apply migrations with Drizzle's migrator from the same folder.
- **Services are plain server modules** (`import "server-only"`) in `src/lib/<area>/`, with pure helpers split out and unit-tested (e.g. `backlink.ts`, `packages.ts`, `placements.ts`). Server actions live next to their pages (`actions.ts`), check auth with `getCurrentUser()` / `isStaff()`, validate with zod and return `{ ok, error }`. Admin pages call `requireStaff()`.
- **Payments:**
  - SKUs: `src/lib/payments/skus.ts`.
  - Checkout: `startCheckout` and `startSubscription` in `src/lib/payments/service.ts`.
  - Fulfilment: `registerFulfillment(kind, handler)` in `src/lib/payments/handlers.ts`.
  - Webhooks are idempotent (`payment_events`). Paid orders are reconciled by the daily cron.
  - **Subscriptions** are wired at the provider level (`startSubscription`, `cancelSubscription`, `applySubscriptionUpdate`, `scripts/sync-plans.ts`, `subscriptions` and `provider_plans` tables), but **nothing grants plan features yet** and `isPurchasable()` still blocks recurring SKUs.
- **Cron:** Vercel Hobby allows one daily job, so everything runs from `src/app/api/cron/daily/route.ts` (auth: `Bearer CRON_SECRET`). Each task is independent and idempotent, and failures are caught per task. Keep each run well under Vercel's function time limit: process in bounded batches (e.g. 200 links a run, oldest-checked first) and let the next day continue.
- **Link checking:**
  - `inspectBacklink(html, pageUrl, targetDomain)` in `src/lib/directories/backlink.ts` is pure and returns verdict, rel and anchor.
  - `verifySubmission()` in `src/lib/directories/verify.ts` fetches with `safeFetchText` (`src/lib/net.ts`, SSRF-safe, size and time limits) and writes `link_checks` plus summary columns on `submissions`.
  - Reuse both for Link Monitor; don't write a second fetcher.
- **Email:** `sendEmail` and `sendBatch` in `src/lib/email.ts`. Without `RESEND_API_KEY` in dev they log instead of sending. `src/lib/notifications.ts` has the `compose()` helper style.
- **Tests:**
  - `pnpm test`. Integration tests run when `TEST_DATABASE_URL` points at a throwaway Postgres; they wipe it.
  - Patterns to copy: `tests/directories.integration.test.ts` and `tests/board.integration.test.ts`. They mock `@/lib/email` and `@/lib/net` (`safeFetchText`) and use a `FakeProvider` for payments.
  - Test files run serially (`fileParallelism: false`).
- **CI** (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `typecheck`, a drizzle drift check, `test` (with Postgres) and `build`. Run them all locally before pushing.
- **Style:** match the surrounding code (short doc comments on exported functions, zod for input, no new UI libraries; primitives are in `src/components/ui/`). Copy is plain, direct British/US-neutral English, with no hype.

### Local setup

```bash
pnpm install
cp .env.example .env.local        # set DATABASE_URL / DIRECT_DATABASE_URL to a local Postgres, ADMIN_EMAIL, BETTER_AUTH_SECRET, CRON_SECRET
pnpm db:migrate                   # or apply with drizzle's migrator if the Supabase CLI isn't set up
pnpm db:seed                      # 10 demo products across three weeks
pnpm dev
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/debutyard_test pnpm test
```

Sign in with the magic link printed in the dev server log. The account whose email equals `ADMIN_EMAIL` becomes admin.

---

## 2. Phase 4: Link Monitor and subscriptions (build this)

Suggested order: **A → B → C → D → E → F**. Do one branch and one PR per workstream (or two or three small ones together). Each PR needs tests and a short README update.

### A. Tracked links and Link Monitor (PLAN §4.4): the core of Phase 4

**Goal:** every live backlink (from the DIY tracker, from done-for-you orders, or any URL the user adds) is re-checked on a schedule, and the owner is alerted when something changes.

- **Schema:**
  - `tracked_links(id, owner_user_id, submission_id NULL unique, url, target_domain, expected_anchor NULL, source[tracker|order|manual], last_verdict, last_rel, last_status_code, last_checked_at, next_check_at, active, created_at)`.
  - Make `link_checks` usable for tracked links: add a nullable `tracked_link_id` and make `submission_id` nullable. Keep existing rows.
- **Auto-create:** when a submission becomes `live` (tracker `updateTracker` and ops `updateOrderSubmission`), upsert a tracked link. For order links the owner is the order's `user_id`; if there is none, alerts go to the order's contact email.
- **Monitor job:** a `links` task in the daily cron.
  - Check links where `next_check_at <= now()`, batched (≈200 a run, concurrency ≈5).
  - Schedule: daily for the first 14 days after going live, then weekly.
  - Compare with the previous verdict. A change to nofollow, missing or unreachable is an **alert**, and a recovery is good news.
  - Keep the submission's `link_*` columns in sync when the link came from a submission.
  - Mark a link `dead` only after 2 consecutive failed checks, so one blip doesn't trigger it.
- **Alerts:** one email per owner per run, summarising the changes ("3 links flipped to nofollow, 1 listing removed"), with links to the dashboard.
- **UI:** `/dashboard/links`.
  - Table of tracked links: URL, target, verdict, last checked, history sparkline or list.
  - "Add a link" form (URL plus your domain), re-check, remove, CSV export.
  - Show plan usage ("37 / 100 links").
- **Limits:**
  - Free accounts: links from their own tracker and orders are monitored.
  - Manual links: only up to a small free allowance (e.g. 10), or the plan limit (Maker Pro 100, Maker Unlimited unlimited).
  - Submission orders include monitoring for **3 / 6 / 12 months** (Starter / Growth / Scale; see `src/lib/submissions/packages.ts`). Store `monitor_until` on the order or its links. When it ends, email an upsell to the Link Monitor plan and stop checking.
- **API and MCP:** add `get_my_links` (read-only) to `src/lib/api/mcp.ts` and `GET /api/v1/me/links`.
- **Done when:** integration tests cover auto-create from tracker and order, the schedule (daily, then weekly), change detection and alert emails, plan limits and the end of included monitoring.

### B. Subscriptions and entitlements (PLAN §5.4)

- **Make plans purchasable:** let `isPurchasable()` allow the recurring SKUs. `/pricing` already renders them with `BuyButton`, and the checkout API calls `startSubscription`. Run `scripts/sync-plans.ts` to create provider plans; document it in the README.
- **Entitlements module** `src/lib/billing/entitlements.ts`: `planFor(userId)` → active SKUs, and `can(user, feature)` / `limit(user, "links")`. Status `active` or `non_renewing` counts until `current_period_end`.
- **Plan features:**
  - **Maker Pro** (monthly or yearly):
    - 100 monitored links
    - one free Fast Track per quarter: issue a single-use 100% coupon on activation and each quarter, or check a quarterly credit in the submit flow
    - DR tracking (C)
    - a "Pro" badge on their builder profile and listings
    - booking featured slots 4 extra weeks ahead: `BOOKING_HORIZON_WEEKS` in `src/lib/ads/placements.ts` becomes per-user
    - **no vote multiplier, ever**
- **Billing page** `/dashboard/billing`: current plan, renewal date, cancel (calls `cancelSubscription`), invoices or receipts if the providers expose them.
- **Sync and dunning:** add a daily `subscriptions.sync` job.
  - Re-fetch status from Paystack and PayPal for subscriptions not updated in 24h.
  - On `past_due`, email the user (day 0, day 3, day 7). Then drop the entitlements but keep the data.
  - Email on renewal failure and on cancellation.
- **Done when:** integration tests with a `FakeProvider` cover purchase → active → entitlement visible, past_due → dunning → expiry, cancel → `non_renewing` until period end, and Always Featured showing in the rail.

### C. DR snapshots and before/after charts

- **Table:** `domain_metrics(id, domain, dr, referring_domains, measured_at)`.
- **Provider:** `src/lib/metrics/` with a provider interface. Implementations: DataForSEO, the Ahrefs API, or Open PageRank (free, for a rough score), chosen by env (`DR_PROVIDER`, `DR_API_KEY`). With no key, the feature hides itself.
- **Jobs:** weekly snapshots for Maker Pro users' product domains and for domains with an active or delivered submission order. Take a baseline at intake. Also backfill `directories.dr` for directories with no DR.
- **Charts:** a simple SVG line chart (no chart library) on the order dashboard (`/orders/[token]`: "DR 7 → 19 since intake") and on the Pro dashboard. Add a DR alert email when it drops by 5 or more.

### D. Affiliate program (PLAN §5.5)

- **Tables:** `affiliates(user_id, code unique, payout_email, rate_pct default 30, status)` and `affiliate_referrals(id, affiliate_id, order_id unique, commission_cents, status[pending|approved|paid|void], approved_at, paid_at)`.
- **Tracking:**
  - `?via=<code>` (or `/r/a/<code>`) sets a 60-day first-party cookie.
  - `startCheckout` records the code in order metadata.
  - On fulfilment of a **submission package** (and optionally paid debuts), create a pending referral at 30% of the amount paid.
  - A full refund voids it.
- **Approval job:** daily `affiliates.approve` marks referrals older than 30 days as approved.
- **UI:**
  - `/dashboard/affiliate`: join, get a link, see clicks/orders/earnings.
  - `/admin/affiliates`: approve or mark paid. Payouts are manual via PayPal at first.
- **Rules:** no self-referral (buyer email or user equals the affiliate). Add terms text to `/terms`.

### E. Free tools (lead magnets)

- **`/tools/dofollow-checker`:** paste a listing URL and your domain, and report reachability, link found, rel and anchor using `inspectBacklink` + `safeFetchText`. Rate limit like the readiness check (reuse the `readiness_checks` pattern: hashed IP and a 15/hour limit).
- **`/tools/dr-checker`:** wraps C's provider, cached per domain for 7 days. Hide it if no provider is configured.
- **Exposure:** both go in the footer and `llms.txt`, and as MCP tools (`check_dofollow`, `check_dr`).

### F. Launch wall

- **Opt-in:** a public profile showing a maker's verified live links. Add a toggle on `/dashboard/links`.
- **Pages:**
  - `/launch-wall` lists opted-in makers with counts of verified dofollow links.
  - `/builders/[handle]` shows the links section.
- **Rule:** only machine-verified links (verdict `dofollow`/`nofollow` from our checks) appear, never self-reported ones.

---

## 3. Deferred items from Phases 1–3 (also to do)

These are smaller and mostly independent. Pick them up after A and B, or interleave.

1. **Evidence screenshots** (Phase 3): capture a screenshot when a listing goes live and on each monitor change.
   - Needs Playwright, which doesn't run on Vercel functions. Build a tiny worker (`worker/` folder, deploy to Railway or Fly) with `POST /screenshot {url}` → PNG to R2, authenticated with a shared secret (`WORKER_URL`, `WORKER_SECRET`).
   - Call it from `verifySubmission` and Link Monitor and store the result in `submissions.evidence_url`.
   - Ops can still paste a URL by hand.
2. **Per-order submission inboxes:** `{order-short-id}@submit.debutyard.com`.
   - Inbound via Cloudflare Email Routing → Worker → `POST /api/inbound` (signed), or Resend inbound.
   - Store messages in `submission_messages(order_id, from, subject, text, html, received_at)`.
   - Show them on `/admin/submissions/[id]`, with verification links clickable.
   - Use this address when creating directory accounts.
3. **Directory account credentials per order:** encrypted at rest (AES-GCM, key in env), entered by ops per submission, and handed over in the delivery report (only on the private `/orders/[token]` page, never on `/r/…`).
4. **Badge block for clients who allow badges** (PLAN §4.2a):
   - After intake with `badge_preference = allow`, generate one static HTML block containing the badge snippets of up to 5 badge-gated target directories, and email it to the client.
   - Check the client's site for it with the existing badge/backlink checker.
   - Hold badge-gated submissions until it's found. After 7 days without it, replace those directories automatically (reuse `addReplacement` in `src/lib/submissions/service.ts`).
   - Directory badge snippets need a new `badge_snippet` column on `directories`, editable in the admin editor.
5. **Indexed check:** Google index status per live link via a SERP API (e.g. DataForSEO or SerpApi; key in env). Store `indexed` on the tracked link or submission and show it on the dashboards ("41 indexed"). Run it weekly, not daily, because of cost.
6. **MCP browser-approval connect flow** (Phase 2 follow-up): `/connect` OAuth-style device or approval flow so agents connect without pasting a token. Implement the MCP authorization spec (OAuth 2.1 with PKCE and dynamic client registration) on top of the existing `api_tokens`. Keep pasted tokens working.
7. **Monthly directory audit** (`directories.audit`):
   - Monthly, fetch each active directory's homepage. Mark it inactive after repeated failures (the admin sees a flag).
   - Re-derive `link_type_observed` from recent link checks.
   - The daily `refreshDirectoryStats()` already does outcome stats; this adds liveness.
8. **AI-written prefill** (Phase 1, optional): use the Claude API (`claude-sonnet-5-5` or newer; see the `claude-api` docs) to draft tagline and descriptions in the three lengths (60/160/500) from the fetched page in `/submit` and the order intake. Keep the current metadata extraction as the fallback when there's no `ANTHROPIC_API_KEY`.
9. **Newsletter open/click tracking** (optional): via Resend webhooks, if wanted for sponsor reporting.
10. **Hourly jobs:** PLAN §7.3 lists some jobs as hourly (payments reconcile, slots expire). On Vercel Hobby they run daily. If the owner upgrades to Vercel Pro, split `api/cron/daily` so these run hourly (`vercel.json`).

---

## 4. Owner's tasks (not code; mention them in PR descriptions when relevant)

- **Deploy:** run `pnpm db:migrate` against Supabase after each merge that adds migrations. Set Vercel env vars per `.env.example`: `RESEND_API_KEY`, the Paystack and PayPal keys, `CRON_SECRET`, `ADMIN_EMAIL`, the R2 keys, and any new keys these workstreams add (`DR_*`, `WORKER_*`, `SERP_*`, `GEMINI_API_KEY`).
- **Directory DR values:** import a CSV at `/admin/directories` from the owner's own Ahrefs or Moz export. The seed has DR empty on purpose: it came from a competitor's catalog, so only plain facts were kept.
- **Business:** register the business and KRA PIN, open the USD bank account, finish Paystack verification (enable USD and confirm USD subscriptions) and set up PayPal Business. Set `legalName` in `src/config/site.ts`. Get the policy pages reviewed, and confirm VAT with an accountant. Make a real low-value purchase with each provider and refund it.
- **Brand:** domains, social handles, a trademark search (PLAN §11).

---

## 5. Working agreements for the next agent

- Branch from `master` per workstream. Open a PR against `master` when the workstream is done and CI is green; `master` is production, and `preview.debutyard.com` shows the newest preview from any branch. Never push to `master` directly; never force-push shared branches.
- Before every push: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` (with `TEST_DATABASE_URL`), the drift check (`pnpm drizzle-kit check && pnpm drizzle-kit generate --name ci-drift-check` must report "No schema changes"), and `pnpm build`.
- Every new table gets RLS. Every new user-facing page works on mobile (no horizontal scroll) and in dark mode.
- Keep money logic idempotent (claims, unique keys, `onConflictDoNothing`), like the existing fulfilment and ad booking code.
- Update `README.md` (status table, layout, cron list) and `docs/PLAN.md` (mark Phase 4 done, note deferrals) in the final PR.
