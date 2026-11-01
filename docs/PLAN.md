# DebutYard — Product & Build Plan

> Product name: **DebutYard** (chosen Oct 25, 2026; see §6). Domains: `debutyard.com` / `debutyard.io`.
> Repo: `bookish-octo-computing-machine` (temporary name; to be renamed `debutyard`).
>
> **Research basis.** v1 of this plan (Oct 25, 2026) was built from web search alone. The environment's network policy blocked direct site access at the time. **v2 (this version)** re-checks the main competitors against their **live pages, fetched Oct 25, 2026**: Nick Launches, TinyLaunch, Startup Fame, SaaSCity, Startups Lab, Product Watch, Uneed, PeerPush, Fazier, DevHunt, MicroLaunch. Rows marked ✅ were verified on the live site. Unmarked figures still come from third-party reviews and may be stale.

---

## 1. Executive summary

The launch-directory niche has stopped being "Product Hunt clones." The sites that make money now sell five things:

1. **Time.** Free launches sit in a queue: 30 days at Product Watch, months at Uneed, **~364 days** at SaaSCity. Paying skips it. Skip prices run **$6 (Startups Lab) to $39.99 (Uneed)**.
2. **A dofollow backlink from a high-DR domain.** Free tiers trade the link for a badge on the maker's site ("pay in link equity"). Some also require winning (Startups Lab: top 3) or a vote threshold (Uneed: upvote score of 20). Paid tiers drop the badge requirement.
3. **Attention.** Featured/homepage slots, sidebar ads, and newsletter sponsorships. These are sold weekly or monthly, and the best sites deliberately cap the slots ("only 3 concurrent", "0 spots left").
4. **Done-for-you submissions.** Nick Launches, TinyLaunch, SaaSCity, Uneed and PeerPush all sell manual submission to 30–270 other directories for **$99–$279**.
5. **(New in 2026) Post-launch distribution tooling.** Nick Launches has a "Distribution Workspace": free site audit, a DIY directory tracker with a Chrome autofill extension, and an "find your first users" tool. A paid "Distribution Suite" (AI visibility tracking, keyword rankings, auto-written blogs) is announced at $99. TinyLaunch sells a $9 AI-visibility report. PeerPush and SaaSCity market "found by AI assistants" via MCP servers and APIs.

**Where the gap is (revised after the live-site review):** Nick Launches already has a **free DIY directory checklist/tracker** and a **report** for its done-for-you service. So "a tracking dashboard" alone isn't a differentiator. What nobody does is **automated verification and monitoring of the links**: crawl every placement, confirm it's live and dofollow and indexed, capture evidence, and keep re-checking after the job ends. Founders' top complaints are links quietly flipped to `nofollow`, listings removed, and directories that never publish. So:

**Positioning:** "Launch, get listed everywhere, and see proof." A weekly launch board with honest voting (no paid vote multipliers), plus a submission service and DIY tracker where **every link is machine-verified and monitored**. Tagline: *"DebutYard — launch, get listed, see proof."*

---

## 2. Competitive research

### 2.1 The sites studied

| Directory | Launch model | Free tier | Paid launch pricing | Other revenue | Notable mechanics |
|---|---|---|---|---|---|
| **Nick Launches** ✅ (primary reference) | **Weekly board** ("Week 43, 2026 · 100 launches"), weekly archive, top 3 medals | Free launch; **badge must stay live or the listing is removed**. Badge snippets: Featured/Premium × light/dark | Starter $19 · Pro $39 · Premium $99 · Ultimate $199 (from the Aug recap; the plan picker is behind login). "Featured launches" = Pro tier and up | **Submission service** (§2.2). Announced **Distribution Suite $99** (AI visibility, rankings, auto blogs; waitlist, prepay = 20% off for life). In-feed sponsored cards ("Advertise here"). Coupon sales (AUGUST20 = 20% off everything) | ~1,973 live products, ~85–105 launches/week, claims DR 76 (71 in Aug). See §2.5 for the full feature teardown |
| **Product Hunt** | Daily leaderboard, resets 12:00 AM PT | Free to launch | No paid launches (ads/sponsorships only) | Ads, sponsorships | Ranks on upvotes plus comment quality. Dampens vote bursts from new accounts and vote-begging. Top 3 of Day badges. Main complaint: a 24h spike that's mostly other founders |
| **TinyLaunch** ✅ | Weekly competition, top 3 get badge + backlink | Standard: free, queue, homepage for multiple days. **Only top 3 get the badge + "high authority backlink"** | **Premium $39/launch**: guaranteed backlink, skip queue. 3 random premium launches shown between 3rd and 4th place on each page load | **$279 submission (110 dirs)**. Featured: **Top $30/wk, Mid-feed $15/wk**, with "stays up free until CPC ≤ $1". **AI Visibility Audit $9** one-time | Rotating paid slot inside the leaderboard. Testimonial: "DR went from 7 to 30" (best for sites under DR 20) |
| **Startup Fame** ✅ | Daily "Today's Highlights" + directory | **Verified: free** with homepage badge; a verification bot checks it, then review (~7 days) | **Subscriptions:** Highlight **$19/mo** (daily highlights, instant), Spotlight **$149/mo** (permanent homepage priority, **"0 spots left"**) | — | DR 80+, "10+ do-follow backlinks". **Link lives only while listed or paid**: explicitly no "lifetime do-follows", framed as protecting DR. Positions *against* "submit to 100 directories" spam. Dashboard Stats tab (impressions, views, clicks) and UTM'd outbound links. Public analytics on Seline. Browse by founder and **location** |
| **SaaSCity** ✅ | Weekly Monday drops, community votes | Free with badge, but **~364-day review queue**. No map placement | **Quick Pass $19.99** (no badge, live in 24h, map building) · **Premium $39.99** (+ launch blog post with 3 links, AEO-optimised) · **Max $79.99** (+ 3000-word post, 5 links, 2×2 building, billboard + ticker + pinned homepage 30 days) | Billboard $50/30d, ticker $50/30d, submission service **up to 270 dirs from $99**, "Write for us" | Gamified isometric city map. Claims 770K visitors/30d, DR 69. **100% money-back guarantee** (not approved / not live in 48h / link not dofollow). Very candid copy ("what none of them buy: customers"). Comparison pages (vs Nick Launches, vs PeerPush). MCP for agents, multi-language (DE/NL/PT-BR) |
| **Startups Lab** ✅ | Weekly, Monday launches | Free: weekly feed, product page with FAQ + gallery, analytics, **AI-fill**, **max 2 active free submissions/account**, no guaranteed dofollow. **Top 3 each week win the dofollow + upgraded badge** | **Skip the Queue $6** (pick any Monday, guaranteed dofollow) · **Spotlight $29/30 days** (below hero, category pages, digest, report, **only 3 concurrent slots**) | Ads from $59/30d | DR 54, "3,000+ founders/wk". "Ask ChatGPT/Claude/Perplexity about us" buttons. Browse by platform, audience, tech stack |
| **Product Watch** ✅ | Daily feed + weekly/monthly/yearly "Award Winners" | Free: **30-day queue, or skip it by embedding the badge**. Permanent 72 DR dofollow | **Priority Pass** (one-time; price JS-rendered): instant, top featured spot, **+5 upvote head start, 2× upvote multiplier**, newsletter | Promoted spots (custom) | Selling vote multipliers is a credibility risk. **We should not copy it.** "Best X products of the week/year" SEO pages |
| **Uneed** ✅ | Product of the Day + weekly/monthly/yearly ladders | **Join the line** (free, back of the line). Needs upvote score **10 to stay published, 20 for the dofollow** | **Fast-track $14.99** (~14 days) · **Skip the line $39.99** (pick date, guaranteed dofollow) · **Relaunch $15** | **Uneed Pro $99/yr** (was $139): +3 vote multiplier, 1 free relaunch/mo, **DR tracking + alerts**, private Discord, partner perks. **Auto-submit 100+ dirs $249**. Newsletter $249. Premium spot from $197. Main ad $297/mo. **Public review $147** | 125K monthly visitors, 26K newsletter at 40% open rate, 22K visitors/month sent to products. Affiliate program, MCP, free tools (calculators/generators as SEO magnets), alternatives pages |
| **PeerPush** ✅ | Instant launches + promotion | Free: "wait in line behind paid users" | **Standard $39** (instant, MCP/AI indexing, **auto-generated product videos**, analytics) · **+7d promo $89** · **+30d promo $229** | **Directory submissions from $149** (30/60/100, 3–7 days). Ads from $129/week | Pitched at "found by AI": MCP server, ChatGPT plugin, Claude connector, public API. Points system |
| **Fazier** | Daily upvote board | Free, listed within 30 days with badge/link | Lite ~$29 · Premium ~$49 · Super ~$99–119 (third-party) | — | DR ~83. Free/Premium labels visible on the live feed ✅ |
| **MicroLaunch** | Month-long launches | Free queue (2–3+ months) | Pro ~$39 (capped 40/month) · Plus ~$79 | Sponsorships, deals, hackathons ✅ | Scarcity cap. Hall of Fame |
| **Peerlist Launchpad** | Weekly cohorts | Free, limited per week | Featured Launch (price unlisted) | Pro profiles | Professional-network audience. DR ~77 |
| **DevHunt** | Weekly, dev tools only | Free queue (~6 months) | Skip ~$49 | Newsletter + ads | Vertical focus |
| **Smol Launch / OpenHunts / Twelve Tools / BetaList / TAAFT** | various | — | $6–$437 | — | See the v1 notes: cheap skips, multi-link Pro tiers, TAAFT's $437 premium vertical pricing |

### 2.2 Submission services (the high-ticket line)

| Service | Price | Scope | Delivery / reporting |
|---|---|---|---|
| **Nick Launches** ✅ | **$99 / $149 / $199** (struck-through list prices $149 / $199 / $249) | 30+ (medium DR, free dirs) / 60+ (high DR, free + paid) / 100+ | **No account or launch needed**. Starts in 48h, done in 7–14 days. Report per submission (link + status). **Rejections are replaced** with an equivalent directory. Niche-matched, dofollow-only. Can be added to an existing launch as a "directory boost" from the dashboard. Case studies with before/after DR (+16 DR, +13 DR) |
| **TinyLaunch** ✅ | $279 | 110 dirs | "Comprehensive report". Honest note: works best below DR 20 |
| **Uneed** ✅ | $249 | 100+ curated | — |
| **PeerPush** ✅ | from $149 | 30 / 60 / 100 | 3–7 days, progress updates + final results |
| **SaaSCity** ✅ | from $99 | up to 270 | — |
| StartupSubmit | $99 / $199 / $299 | 60+ / 150+ / 220+ | — |
| Submit Juice | $197 / $297 | 20 / 50 | ≤1 week; pay nothing unless DA 20+ |
| ListingBott | $499 / $999 | 100 listings (+ own blogs) | Drip over ~1 month; weekly updates + final report |
| SubmitWell / Submitator (budget) | $29–$99 | 30–200 | Mostly automated |

**What the market expects:** manual submissions, niche matching, dofollow focus, a 48h start, a 1–2 week turnaround, replacement of rejected directories, and a report. **What nobody offers:** machine-verified status per link (rel, indexation, evidence), a live dashboard during the job, and monitoring after it.

### 2.3 Patterns that recur everywhere

- **Badge-for-backlink free tier,** in three flavours: (a) badge = dofollow (Startup Fame, SaaSCity); (b) badge = skip the queue (Product Watch); (c) badge required just to stay listed (Nick Launches). Verification is a bot that fetches the homepage. Founder pain: Cloudflare bot challenges make the badge look missing. **DNS TXT verification** avoids that.
- **Earn-it free link.** Startups Lab and TinyLaunch give the free dofollow only to the weekly top 3. Uneed requires an upvote score of 20. This makes voting matter and makes the paid "guaranteed backlink" more valuable.
- **Artificial scarcity.** Long free queues (30 days to ~1 year), caps on free submissions (Startups Lab: 2 active per account), and **capped paid slots** (Startups Lab: 3 concurrent Spotlights; Startup Fame: Spotlight "0 spots left"; Uneed: "4 spots left").
- **Winner badges as distribution.** Top-3 badges for Day/Week/Month/Year. Every badge is a backlink.
- **Recaps and content engines.** Nick Launches posts weekly recaps with real stats, plus **GitHub Signals** (trending repos 3×/day) and a dev-news feed. Uneed and SaaSCity run free-tool and "alternatives" SEO pages.
- **Agent-native distribution (2026).** Nick Launches, PeerPush, SaaSCity and Uneed all run an **MCP server**. Nick's lets an agent *draft* a launch (never publish/pay), and runs a `check_launch_readiness` audit. Plus `llms.txt`, OpenAPI and schema.org on every listing.
- **Cross-directory badge exchange.** Nick Launches' footer has an "As featured on" strip of ~35 other directories' badges, and it runs a free "Builders Backlinks" exchange. Directory owners trade links with each other to grow DR.
- **Guarantees and honesty as conversion tools.** SaaSCity's 100% money-back guarantee, TinyLaunch's CPC guarantee, Startup Fame's "we don't sell lifetime do-follows", SaaSCity's "what none of them buy: customers".
- **Recurring vs. one-time.** Most sell one-time launches, but subscriptions exist and work: Startup Fame $19–149/mo, Uneed Pro $99/yr, Nick's $99 Distribution Suite.

### 2.4 Founder complaints to design against

- Traffic is a 24h spike of other founders, not customers.
- Vote rings, launch crews, and **pay-to-win vote multipliers** (Product Watch 2×, Uneed Pro +3).
- "I submitted a link and never got anything back": no stats, no feedback.
- "Dofollow" promises that turn out to be `nofollow` (one DEV.to audit found about half of the directories it checked served nofollow).
- Badge checks failing because of bot protection.
- Queues of 1–12 months with no visibility into position.

### 2.5 Nick Launches teardown (verified on the live site)

Nick Launches is the most complete product in the niche and the benchmark to beat.

**Public site**
- Homepage: hero + builder avatars → **this week's board** (all ~100 launches ranked, medals for the top 3, category chips) → in-feed sponsored cards → category counts → "Top dev reads today" (DevFeed) → **popular builders leaderboard** (launches + total upvotes) → **weekly launch archive** (Week N, date range, count).
- **"Pick a winner" (`/vote`)**: two launches side by side, choose the better one, and the choice counts as an upvote. A simple engagement loop that adds votes.
- Product page: about, **upvotes-over-time chart** (24h, peak hour), comments with a "Builder" tag, **week rank**, details (pricing, open source, socials, tags), supporters, **similar products**, **"launched the same week"**.
- 38 categories, `/builders` profiles, `/reviews` (tool reviews), blog with weekly recaps (stats + hand-checked landing pages + sale codes), resources/launch guides.
- **Launch Wall**: social proof listing builders who used the tracker and the exact directories they submitted to (e.g. "Submitted to 56 directories").
- **"As featured on" footer**: badges from ~35 other directories (link exchange).

**Submission flow**
- Classic form with **URL prefill** (scrapes the site), logo/screenshots, plan + launch week picker, drafts.
- **Launch from your agent**: `claude mcp add --transport http nicklaunches https://nicklaunches.com/api/mcp/`. No API key; a one-time browser approval binds the agent to the account. The agent can only create a **draft**. A human picks the plan and pays, and an admin reviews before it goes live.
- MCP tools: `search_products`, `get_product`, `list_launch_directories`, `check_launch_readiness` (score, checks, badge snippet if missing, duplicate/relaunch eligibility, suggested listing, **next weeks with room**), `submit_product`, `get_my_launches`. A REST API mirrors them, plus an OpenAPI spec, `llms.txt` and sitemap. Roadmap: First Users, directory campaign planner, launch analytics, badge management, changelog publishing.

**Distribution Workspace (free tools, all tied to a launch)**
- **Site Audit**: indexability score, issues grouped by severity.
- **Launch Directories tracker**: catalog of **194 directories** (DR, traffic band, link strength, free/freemium/paid, badge-required flag, niche) with a per-launch checklist (To do → Submitted → Not checked).
- **Autofill Chrome extension** ("NL Launch Companion"): on 194 known directories, a panel autofills the submission form, and Done/Skip syncs back to the tracker. It also flags directories that require a badge.
- **First Users**: paste a URL and get an AI-written ICP report: segments, pain points, subreddits, and `site:reddit.com` search queries. 1 free run, then 5/week with an account.
- **Distribution Suite ($99, in build)**: AI Visibility (tracked prompts across ChatGPT/Claude/Perplexity, mentions, position, sentiment), Rankings (from your Search Console), Auto Blogs (weekly posts).

**Takeaways for us:** match the table stakes (weekly board, archive, builders, vote, MCP, readiness check, DIY tracker), and beat them where they're weak: **link verification and monitoring** (their tracker is a manual checklist), **transparent ranking/anti-fraud**, and a **live dashboard during done-for-you orders** instead of only a final report.

---

## 3. Product definition

### 3.1 Core loop

```
Submit product (form with URL prefill, or via MCP agent draft)
      → launch-readiness check → (free: verify badge → enter queue) | (paid: pick week)
      → Launch week (Mon 00:00 UTC → Sun 23:59 UTC) → votes + comments + "Pick a winner" duels
      → Weekly winners (top 3) + Month/Year boards → winner badges + recap post + newsletter
      → Permanent listing page (SEO, alternatives, categories) → DIY tracker / submission service → Link Monitor
```

**Launch cadence: weekly** (like Nick Launches, SaaSCity, TinyLaunch, Startups Lab and Peerlist). It gives small products a fair 7-day window instead of a 24h fight. A daily "Top today" view still exists inside the week, and **monthly and yearly boards** give extra winner badges.

### 3.2 Feature list

**Listings**
- Product page: name, tagline, logo, gallery (images + video embed), description (Markdown), FAQ, categories (max 3), tags, pricing model, platforms, open-source flag, website + social links, makers (multi-maker teams), launch week, **week rank**, **upvotes-over-time chart**, comments (maker replies tagged), supporters, **similar products**, **launched the same week**, "alternatives to".
- Free listings stay up permanently. A badge-gated dofollow is reviewed separately (see below).
- Category, tag, platform, and "Alternatives to X" pages. **Builder profiles** with a builders leaderboard. **Weekly archive** pages.
- Search with filters (category, pricing model, launch week, sort by votes/new).
- Structured data (`SoftwareApplication` JSON-LD), OG images generated per product, `llms.txt`, sitemap.

**Submission UX**
- **URL prefill**: fetch the site, read metadata, AI-draft the name, tagline, description and categories. The maker edits.
- **Launch-readiness check** before submit: HTTPS, live page, duplicate detection, badge present, listing quality, and the **next weeks with free capacity**.
- Drafts, and "save and come back later".
- **MCP server + REST API** with the same functions as the site. An agent can *draft* only, never publish or pay (copy Nick's boundary; it's the safe one).

**Free tier with badge verification**
- Maker embeds a personalised badge snippet (`<a href="https://debutyard.com/p/slug?ref=badge"><img src=".../badge/slug.svg" alt="Debuted on DebutYard"></a>`).
- Verification methods: (1) **server-side fetch** of the homepage, then parse for the anchor to our domain; (2) **DNS TXT** record fallback for bot-protected sites (a real pain point; Nick and Startup Fame don't offer it); (3) a meta tag fallback.
- After verification, the listing link is `dofollow`. A **re-check runs weekly**. If the badge is missing: email + 7-day grace period, then the link downgrades to `nofollow` (we don't delist; that's friendlier than Nick, which removes the listing). It auto-restores when the badge returns.
- **Weekly top 3 earn a permanent dofollow regardless of badge** (Startups Lab/TinyLaunch model). This makes voting matter.
- Badge variants: "Launching on", "Featured on", "#1/#2/#3 Product of the Week/Month/Year", light/dark, SVG with optional live vote count.
- Free launches are **capped per week** (start at ~30; tune it), limited to **2 active free submissions per account** (Startups Lab), and enter a **visible queue with position + ETA**.
- Free tier still gets a basic analytics tab (views, clicks). Startup Fame and Startups Lab both include one.

**Paid launch tiers** (§5): skip the queue, pick a week, no badge, guaranteed dofollow, featured placement, newsletter + social, and a written launch post.

**Voting & community**
- Upvotes (one per account per product), threaded comments, maker replies flagged.
- **"Pick a winner" duels**: two random launches from this week, side by side. Picking one counts as an upvote, rate-limited per account. Cheap engagement that also spreads votes to less-visible launches.
- Auth required to vote (email magic link, Google, GitHub, X).
- **No paid vote multipliers or head starts.** This is a deliberate positioning against Product Watch and Uneed Pro. Paid tiers buy *placement*, never *votes*. State it on `/how-ranking-works`.
- **Anti-fraud:** account-age weighting (accounts under 72h or with no activity count at a fractional weight), velocity/burst detection, IP/ASN/device clustering, disposable-email blocklist, Turnstile. Flagged votes are kept but excluded from ranking. Admin audit view.
- Ranking score = weighted votes + small weight for substantive comments, computed by a job.

**Winners**
- Weekly top 3 (Gold/Silver/Bronze), plus monthly and yearly.
- Automated: a cron closes the week, freezes the ranking, issues badges, emails winners, and drafts the **recap blog post** (stats: submitted / went live / votes cast / new builders, plus the top launches with short write-ups) and the newsletter.

**Featured & ads**
- Homepage "Featured" rail and a **rotating paid slot inside the leaderboard** between ranks 3 and 4 (TinyLaunch's best idea; clearly labelled "Featured").
- **Hard-capped premium slots** (e.g. 3 concurrent Spotlights) shown as "N spots left".
- Category sponsor slots, in-feed sponsored cards, newsletter sponsorship.
- Self-serve booking calendar with checkout (Paystack or PayPal, §7.5).
- Click/impression stats for every slot, plus the TinyLaunch-style CPC guarantee (if CPC > $1, the slot extends for free).

**Maker dashboard**
- My products, launch status, queue position/ETA, badge status + last check, link rel status.
- Analytics per product: views, outbound clicks (UTM `?ref=debutyard`), votes over time, referrers, badge impressions.
- **DR tracking** for the maker's domain, with alerts (Uneed Pro has this; it's cheap to offer via the Ahrefs/DataForSEO API).
- Upgrade flows, relaunch, "add directory boost" (attach a submission package to an existing launch).

**Directory tracker, submission service & Link Monitor** (§4).

**Content & growth**
- **Public directory database** (200+ directories, Nick has 194) with DR, traffic band, *crawler-verified* link type, pricing, queue length, badge requirement, niche, acceptance rate, and *time-to-live* (from our own orders). This is the main SEO magnet and the top of the funnel for the submission service.
- Weekly recap posts, launch guides, "best X tools" roundups, comparison pages (us vs. each competitor).
- Newsletter (weekly winners + new launches + sponsor).
- Free tools as lead magnets: **Dofollow checker** (paste any listing URL and we report the rel; nobody else does this as a product), badge generator, **launch-readiness audit**, a First Users-style audience finder, a DR checker.
- **"As featured on" footer exchange** with other directories, plus listing ourselves on all of them (fast early DR).

**Admin**
- Moderation queue (approve/reject with reasons), vote-fraud review, comment moderation, featured-slot calendar, ads inventory, refunds, submission ops console (§4), directory DB editor, CMS for blog posts and recaps.

---

## 4. Directory tracker, submission service & Link Monitor

All three share one data model, so a link looks the same whether the maker submitted it themselves or we did.

### 4.1 DIY tracker (free) — matches Nick Launches

- Per-product checklist over the full directory DB: **To do → Submitted → Live → Rejected → Skipped**, filterable by DR, cost, niche, and badge requirement.
- **Autofill browser extension** (Phase 5): fills known directory forms from the product kit, and Done/Skip syncs to the tracker. Nick ships this, so it's table stakes eventually.
- **Our edge:** when the maker marks a directory "Live" and pastes the URL, we **verify it automatically** (page reachable, link to their domain present, rel attribute, anchor text) and add it to Link Monitor. Nick's tracker only records what the user ticks.
- Public opt-in "Launch Wall" profile (Nick's social proof idea).

### 4.2 Done-for-you submission service

- **No account or launch required** to buy. Collect the product details after checkout (Nick does this; it lowers friction). It can also be attached to an existing launch as a "boost".
- **Manual submissions** by an ops team (contractors) using a prepared product kit: logo variants, screenshots, 3 description lengths (60/160/500 chars), categories, founder info, and a dedicated submission email inbox per client (so verification emails are captured).
- Target list = our directory DB, scored by DR, verified link type, acceptance rate, and time-to-live, then matched to the product's niche. Our own outcomes improve that data over time, which is a moat.
- Promise to match the market: start within **48h**, finish in **7–14 days**, and replace rejected or dead directories so the count holds. Be honest that some directories reject for editorial reasons.

### 4.2a Badges, accounts and how much the client is involved (researched Oct 26, 2026)

**How common badge requirements are:** in Nick Launches' public catalog (its API, first 100 directories by DR, DR 64–93), only **9 of 100 require a badge**: Startup Fame, Fazier, Turbo0, Launch Llama, TinyLaunch, Neeed, ScrollLaunch, Maidensail, BetterLaunch. Almost all are *launch platforms* where the badge is the price of the free tier (paying skips it). 87 of 100 are dofollow with no badge. Badge-gated directories get more common further down, among lower-DR launch boards.

**How services handle it:**
- skip badge-gated directories entirely (e.g. SubmitDirs);
- have the client paste one footer block containing all the badges, which the service then keeps verified (Submitator, SaaSCity: "every badge we find on your site adds a directory");
- or pay the directory's skip fee, which only works for a few at $15–40 each.

Vendors also warn against walls of reciprocal badges, since hundreds of them hurt the client's SEO.

**DebutYard's approach.** The client sets this once at intake, so there's no back-and-forth:

1. **Badge preference** (intake form):
   - **No badges** (default): we only target no-badge directories and swap badge-gated ones for equivalents.
   - **Up to N badges** (we recommend at most 5, the highest-DR launch platforms): we generate **one static HTML footer block** containing all the badges.
2. **The badge block must be plain HTML pasted into the site**, not a script that injects badges. Directories verify by fetching the page server-side, and most don't run JavaScript, so script-injected badges look missing.
3. **One email, once.** After intake we send the snippet. Our badge checker (the same one as the free tier, §3.2) confirms it's live, then the badge-gated submissions go out. If the client never adds it, those directories are replaced automatically after 7 days.
4. **Link Monitor** re-checks the client's footer weekly. If a redesign drops the badges, the client gets an alert before directories downgrade the links.
5. **Paid skips** are used only in Scale/Agency packages, with the cost built into the price.

**Accounts and email verification (the bigger contact issue):** most directories need an account and a confirmed email.
- Each order gets a **dedicated submission inbox**, e.g. `{order}@submit.debutyard.com`, using Resend receiving (an `email.received` webhook). Verification emails land there, the ops console shows them, and we click through without asking the client.
- Credentials for every account we create are stored per order and **handed over in the final report**, so the client owns their listings.
- The intake form asks permission to create accounts in the product's name.
- A few sites need the maker personally: Product Hunt and Hacker News (personal accounts), and G2/Capterra (vendor verification). These are offered as **"guided" items** with a checklist, not counted in the package total.

### 4.3 Live tracking dashboard (client-facing) — the differentiator

Per order, one row per target directory:

| Field | Notes |
|---|---|
| Directory, DR, category | from our DB |
| Status | `queued → submitted → pending review → live → rejected / replaced / needs action / dead` |
| Submitted at, live at | timestamps, SLA timers |
| Live URL | link to the listing on the third-party site |
| **Link check** | rel (`dofollow`/`nofollow`/`ugc`/`sponsored`), anchor text, HTTP status, last checked. **Machine-verified, not self-reported** |
| **Indexed?** | Google index check via a SERP API |
| Referral clicks | needs the client to connect GA4/Plausible, or we use UTM'd URLs where the directory allows it |
| **Evidence** | screenshot captured at publish time (Playwright) |
| Notes / action needed | e.g. "Directory asks for reciprocal badge", "Email verification needed" |

Plus: progress bar, ETA, acceptance rate, a summary ("62 live · 54 verified dofollow · 41 indexed"), **DR before/after chart** (Nick uses before/after DR in its marketing; we show it per customer automatically), CSV/PDF export, a shareable read-only link (agencies), and email digests on status changes.

### 4.4 Link Monitor (recurring revenue)

After delivery, a crawler re-checks every live placement weekly (status code, presence, rel) and alerts on changes: "3 links flipped to nofollow, 1 listing removed." It covers links from our service, the DIY tracker, and any URL the user adds. This turns a one-time buyer into a subscriber and fixes the market's top complaint.

### 4.5 Ops console (internal)

- Kanban per order and per directory, assignment to contractors, per-directory instructions/checklist + saved form answers, captcha/email-verification notes, time tracking, a QA step (the crawler verifies first, then a human spot-checks), and bulk status updates.
- A directory health score that updates automatically from outcomes and feeds back into target selection and the public DB.
- The internal autofill extension (same codebase as the public one) speeds up contractors.

---

## 5. Pricing recommendation

Verified market prices (Oct 2026): skip the queue **$6–$39.99**, featured launch **$39–$99**, homepage slots **$15–$59/week** or **$29–$50/30 days**, submissions **$99–$279** (30–110 dirs), subscriptions **$19–$149/mo** or **$99/yr**. Price at or a notch under the leaders, use launch-sale codes (everyone does: Nick's list prices are struck through), and raise prices once there's DR and traffic. We'll have neither at launch (see §8).

### 5.1 Launch tiers (one-time, per product)

| Tier | Price | What you get |
|---|---|---|
| **Free** | $0 | Listing + launch week from the queue (visible position/ETA), capped slots/week, max 2 active per account. Dofollow **while the badge is verified**. Top 3 of the week keep a permanent dofollow. Basic analytics |
| **Fast Track** | **$15** | Skip the queue (next week with room), no badge, guaranteed permanent dofollow |
| **Pro Launch** | **$39** | Pick any week, no badge, dofollow, **7 days featured** (rail + rotating leaderboard slot), weekly newsletter inclusion |
| **Premium Launch** | **$79** | Pro + **30 days featured**, social posts (X/LinkedIn/Bluesky), **written launch post** on our blog (AEO-optimised, 3 links), priority on its category page |
| **Spotlight** | **$149** | Premium + **top-of-homepage hero for the launch week (max 3 concurrent, shown as "N spots left")**, newsletter top slot, and a **Starter submission package (40 directories) bundled** |
| **Relaunch** | **$15** | Already-launched product, new version: one more week on the board |

All paid tiers come with a **money-back guarantee**: a full refund if the listing isn't approved, isn't live within 48h, or the link isn't dofollow (SaaSCity's guarantee; it removes the risk for buyers).

Rationale: Fast Track at $15 sits between Startups Lab ($6) and SaaSCity/Nick ($19.99/$19), matching Uneed's $14.99. $39/$79 match TinyLaunch, PeerPush, Nick Pro, SaaSCity Premium and Max. Bundling submissions into Spotlight makes it the anchor. Nick's $199 Ultimate has no such bundle.

### 5.2 Featured placement & ads (bookable calendar)

| Slot | Price |
|---|---|
| Leaderboard featured slot (between #3 and #4, rotating) | $15/week |
| Homepage featured rail | $29/week · $89/month |
| Homepage top sponsor (1 slot) | $59/week · $179/month |
| Category sponsor | $19/week per category |
| Newsletter sponsor | $49/issue at launch → $150–250 as the list grows (Uneed: $249 for 26K subscribers) |

Include click stats for every slot, plus a "stays up until CPC ≤ $1" guarantee.

### 5.3 Directory submission service (one-time)

| Package | Price | Scope |
|---|---|---|
| **Starter** | **$99** | **40** niche-matched directories (DR 30+), starts in 48h, done in 7 days, live tracking dashboard, 3 months Link Monitor |
| **Growth** ★ | **$179** | **100** directories, high-DR free + paid, 10–14 days, 6 months Link Monitor |
| **Scale** | **$299** | **180+** directories incl. AI-tool and "alternatives" sites, copy tailored per directory, 14 days, 12 months Link Monitor, DR before/after report |
| **Agency** | **$799/mo** | 5 client submissions/month at Growth scope, white-label reports, shared dashboards |

All packages replace rejected directories. Rationale: Nick charges $99/$149/$199 for 30/60/100, Uneed $249 for 100+, PeerPush from $149, TinyLaunch $279 for 110. We give more directories per dollar, plus verification, monitoring and a live dashboard.

### 5.4 Subscriptions

| Plan | Price | For |
|---|---|---|
| **Maker Pro** | **$12/mo** or **$99/yr** | Matches Uneed Pro's $99/yr. 100 listings, 100 monitored links, 1 free Fast Track per quarter, Authority Score tracking + alerts for 100 domains, Pro badge, sponsor slots bookable 16 weeks ahead. **No vote multiplier** |
| **Maker Unlimited** | **$29/mo** or **$249/yr** | Unlimited listings, monitored links and Authority Score tracking (fair use), 3 free Fast Tracks per quarter, Pro badge, sponsor slots bookable 20 weeks ahead. **No vote multiplier** |
| **Distribution Suite** (later) | **$79–99/mo** | AI-visibility prompt tracking, Search Console rankings, written posts. Nick has announced this at $99, so treat it as a Phase 5 option, not a launch item |

### 5.5 Launch promotions

- Founding-maker offer: the first 100 paid launches get 40% off for life on future products.
- Seasonal codes (20% off everything; it's the niche norm).
- Annual: 2 months free.
- Affiliate program: 30% on submission packages (Uneed runs one).

---

## 6. Name

**Chosen name: DebutYard** (written as one word, "DebutYard", camel-case Y; lowercase in URLs)

- **Meaning:** the yard where products make their debut. It's clearly about launching without using the overused word "launch", so it stands out from the 200+ "Launch-something" directories.
- **Brand vocabulary:**
  - A launch is a **debut**, and launch week is **debut week**.
  - Weekly winners are **"Debut of the Week"** (also Month/Year).
  - The maker-facing area is **"the Yard"** (dashboard).
  - Optional names for the services: **"Yard Pass"** (Fast Track), **"Yard Monitor"** (Link Monitor).
- **Badge copy:**
  - "Debuted on DebutYard"
  - "🥇 Debut of the Week — DebutYard"
  - "Featured on DebutYard"
  - "Verified by DebutYard" (for monitored links)
- **Tagline:** *"Launch. Network. Grow."*

**Domain & handle status (checked Oct 25, 2026):**
- `debutyard.com`: **available**, register it as the primary.
- `debutyard.io`: **available**, register it and redirect to `.com`.
- `debutyard.app`: **available**, optional defensive registration.
- npm package name `debutyard`: available.
- GitHub org / X handle: not verified from this environment, so check by hand.
- A web search found no existing product, company or trademark using the name.

**Runners-up** (both .com and .io were free when checked): Clapyard, Tadahall, Kudoyard, Laurelwall, Unveilery, Upvotary.

Still to do before committing: a USPTO/EUIPO trademark search, and X/GitHub handles. Avoid names close to existing players: LaunchPad, LaunchPanda, LaunchIgniter, LaunchBuff, LaunchReceipt (a link-check site, close in concept), Launching Next, LaunchList, Launch Llama, LaunchPact, LaunchZone, LaunchOnIt, Smol Launch.

---

## 7. Technical plan

### 7.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | SSR/ISR for SEO-heavy pages. Nick Launches runs Next.js too (seen in its page source) |
| UI | Tailwind + shadcn/ui | Fast, consistent |
| DB | **Supabase Postgres** + **Drizzle ORM** | Relational data (votes, orders, checks), row-level locking for capped slot booking |
| Auth | Better Auth: magic link, Google, GitHub, X, plus an OAuth-style device approval for MCP clients | Voting needs low-friction signup. Agent connections need browser approval |
| Payments | **Paystack (primary)** + **PayPal (secondary)**, behind our own `PaymentProvider` interface. Coupons and affiliates built in-house | Stripe doesn't serve Kenya. Merchant-of-record services ban or restrict ads and human services. See §7.5 |
| Jobs/cron | Inngest or Trigger.dev (or pg-boss workers on Railway/Fly) | Badge checks, link monitoring, week rollover, recap drafting, emails |
| Crawling | `fetch`/cheerio first, Playwright workers for JS/bot-protected pages and evidence screenshots | Badge verification, link checks, URL prefill |
| AI | Claude API for URL-prefill drafting, readiness suggestions, recap drafts, and audience reports | |
| SEO data | DataForSEO/Ahrefs API (DR, index checks) | DR tracking, directory DB, indexation |
| MCP / API | MCP server (Streamable HTTP) + REST `/api/v1` + OpenAPI, sharing one service layer | Agent-native submission (table stakes in 2026) |
| Storage | Cloudflare R2 | Logos, galleries, evidence screenshots |
| Email | Resend + React Email (newsletter: Beehiiv or Resend broadcasts) | |
| Search | Postgres full-text → Meilisearch later | |
| Analytics | PostHog + our own events table for maker-facing stats | |
| Hosting | Vercel (web + cron). Long-running crawlers (Playwright) move to a worker on Railway/Fly when Phase 3 needs them | |
| Extension (later) | Chrome MV3 (Plasmo/WXT) | Autofill + tracker sync |

### 7.2 Data model (initial)

```
users(id, email, name, avatar, role[user|maker|admin|ops], created_at, trust_score)
agent_connections(id, user_id, client_name, token_hash, created_at, revoked_at)
products(id, slug, name, tagline, description, faq_json, logo_url, website_url, pricing_model,
         is_open_source, status[draft|pending|approved|rejected|scheduled|live|archived],
         tier[free|fast|pro|premium|spotlight], link_rel[dofollow|nofollow],
         launch_week_id, created_by, created_via[web|mcp|api], created_at)
product_makers(product_id, user_id, role)
product_media(id, product_id, kind[image|video], url, position)
categories(id, slug, name, parent_id)  product_categories(product_id, category_id)
tags / product_tags

launch_weeks(id, iso_year, iso_week, starts_at, ends_at, free_capacity, status[open|live|closed],
             stats_json)  -- submitted / live / votes / new builders, for recaps
queue_entries(id, product_id, position, requested_at, eta_week_id)
readiness_checks(id, url, product_id NULL, score, checks_json, created_at)

votes(id, product_id, user_id, source[button|duel], created_at, ip_hash, ua_hash, weight, flagged, flag_reason)
duels(id, user_id, product_a_id, product_b_id, winner_id, created_at)
comments(id, product_id, user_id, parent_id, body, is_maker, created_at, status)
rankings(id, scope[day|week|month|year], period_key, product_id, score, rank, frozen_at)
awards(id, product_id, scope, period_key, place[1|2|3], badge_slug)

badge_verifications(id, product_id, method[html|dns|meta], status[pending|verified|missing|grace],
                    last_checked_at, last_seen_at, grace_until, failure_reason)

featured_slots(id, placement[home_rail|home_top|leaderboard|category|newsletter|in_feed], category_id,
               starts_at, ends_at, product_id, order_id, impressions, clicks)
slot_inventory(placement, max_concurrent)

orders(id, user_id NULL, email, kind[launch|relaunch|featured|submission|subscription], sku,
       amount_cents, currency, coupon_id NULL, discount_cents,
       provider[paystack|paypal], provider_ref, provider_customer_id,
       status[pending|paid|failed|refunded|partially_refunded], paid_at, refunded_at, created_at)
payment_events(id, provider, event_id UNIQUE, type, payload_json, received_at, processed_at)  -- webhook log, idempotency
refunds(id, order_id, amount_cents, reason, provider_ref, status, created_at)
subscriptions(id, user_id, plan, provider[paystack|paypal], provider_subscription_id,
              provider_plan_id, status[active|non_renewing|past_due|cancelled],
              current_period_end, cancel_at_period_end)
coupons(id, code UNIQUE, percent_off NULL, amount_off_cents NULL, applies_to_skus, max_redemptions,
        redeemed_count, expires_at)
affiliates(id, user_id, code UNIQUE, commission_pct, payout_method[paypal|bank], created_at)
affiliate_referrals(id, affiliate_id, order_id, commission_cents, status[pending|approved|paid], paid_at)

directories(id, slug, name, url, submit_url, dr, traffic_band, pricing[free|freemium|paid],
            link_type_claimed, link_type_observed, badge_required, queue_estimate_days, niche,
            acceptance_rate, avg_days_to_live, is_active, submission_notes, form_schema_json,
            last_audited_at)
submission_orders(id, order_id, product_id, package, target_count, status, due_at, assignee_id)
submissions(id, product_id, directory_id, submission_order_id NULL,  -- NULL = DIY tracker
            status[todo|submitted|pending|live|rejected|replaced|skipped|dead],
            submitted_at, live_at, live_url, notes, evidence_url, assignee_id)
tracked_links(id, owner_user_id, submission_id NULL, url, target_domain, expected_anchor,
              last_status_code, last_rel, indexed, last_checked_at)
link_checks(id, tracked_link_id, checked_at, status_code, rel, found, indexed, raw_excerpt)
domain_metrics(id, domain, dr, referring_domains, measured_at)  -- DR before/after, Pro DR tracking

events(id, product_id, kind[view|outbound_click|badge_impression|slot_impression|slot_click], ref, created_at)
newsletter_subscribers, posts (blog/CMS), audit_log
```

### 7.3 Key jobs

| Job | Schedule | Does |
|---|---|---|
| `week.rollover` | Mon 00:00 UTC | Close the previous week → freeze rankings → create awards → grant top-3 permanent dofollow → email winners → draft recap post + newsletter (with week stats) → open the new week, pull the next N free products from the queue |
| `rank.compute` | every 5 min during a live week | Recompute weighted scores |
| `votes.audit` | hourly | Burst/cluster detection, flags votes |
| `badge.verify` | on submit + weekly | Fetch site (honest UA, retry, Playwright fallback), parse anchor + rel; DNS TXT fallback; grace-period handling |
| `links.verify` | on "Live" (DIY or ops) | Verify the live URL, capture evidence, create the tracked link |
| `links.monitor` | weekly per link (daily for the first 2 weeks) | Status, rel, presence, index check; diff + alert |
| `domains.metrics` | weekly for Pro/order domains | DR snapshot for before/after charts and alerts |
| `directories.audit` | monthly | Re-verify the public directory DB (alive? link type observed?) |
| `slots.expire` | hourly | Rotate featured slots, send performance reports, apply the CPC guarantee |
| `digests` | daily/weekly | Maker + client status emails |
| `payments.reconcile` | hourly | Re-verify pending orders against the Paystack/PayPal APIs, in case a webhook was missed |
| `subscriptions.sync` | daily | Pull subscription status from both providers, handle `past_due` (dunning emails) and expiries |
| `affiliates.approve` | daily | Approve commissions on orders older than the refund window (30 days) |

### 7.4 Pages / routes

- **Public:** `/` (this week's board, featured rail, builders, archive), `/p/[slug]`, `/week/[yyyy-ww]`, `/winners`, `/vote` (duels), `/category/[slug]`, `/alternatives/[slug]`, `/builders` + `/builders/[handle]`, `/directories` + `/directories/[slug]`, `/launch-wall`, `/submit`, `/pricing`, `/advertise`, `/submission-service`, `/blog`, `/badges`, `/how-ranking-works`, `/tools/dofollow-checker`, `/tools/launch-readiness`, `/tools/dr-checker`, `/docs` (API + MCP), `/llms.txt`
- **App:** `/dashboard` (products, queue, badge, analytics, DR), `/dashboard/tracker/[productId]` (DIY tracker), `/dashboard/submissions/[orderId]` (live tracking), `/dashboard/links` (Link Monitor), `/dashboard/connections` (agent connections), `/dashboard/billing`
- **Admin/ops:** `/admin/moderation`, `/admin/votes`, `/admin/slots`, `/admin/directories`, `/ops/submissions` (kanban)
- **Machine:** `/api/mcp` (MCP), `/api/v1/*` (REST), `/api/v1/openapi.json`, `/connect` (agent approval)
- **Public share:** `/r/[token]` read-only submission report

### 7.5 Payments: Paystack primary, PayPal secondary

**Why not Stripe or a merchant of record (MoR):** Stripe doesn't serve Kenya. Paddle, Lemon Squeezy and Polar all pay out to Kenya, but their acceptable-use policies ban **advertising/sponsorship** (featured slots, newsletter ads) and **human-delivered services** (the done-for-you submission service). Creem puts both in a "restricted" category that needs a proven processing history. Dodo Payments doesn't accept Kenyan sellers. As the merchant on Paystack/PayPal, all our product lines are allowed. The cost: we handle tax ourselves (see below).

**Paystack (primary checkout)**
- Kenya-based businesses can charge international Visa, Mastercard, Amex and Apple Pay **in USD** and settle **in USD** to a USD account at a Kenyan bank. About **3.8%** per international card transaction, settled in ~2 working days (T+2). Local cards and M-Pesa are available too (KES) if we ever price locally.
- Integration:
  - One-time payments: Initialize Transaction → Popup/redirect → verify via webhook (`charge.success`) **and** a server-side `GET /transaction/verify/:reference`.
  - Subscriptions (Link Monitor, Maker Pro, Always Featured, Agency): Paystack Plans + Subscriptions. Handle `subscription.create`, `invoice.create`, `invoice.payment_failed`, `subscription.not_renew` and `subscription.disable`. Customers manage cards through Paystack's subscription management link.
  - Refunds via the Refund API (needed for the money-back guarantee).
  - Webhooks verified with the `x-paystack-signature` HMAC-SHA512 header.
- **Verify before building:** that recurring Plans can be priced in **USD** on a Kenyan account (the docs confirm USD for one-time charges). If they can't, bill subscriptions through PayPal, or charge a saved card authorization in USD on our own schedule (`charge_authorization`).

**PayPal (secondary checkout button)**
- Many indie founders prefer PayPal, and it covers buyers whose cards get declined on cross-border charges. Kenyan accounts can receive payments and withdraw to a local bank or M-Pesa.
- Integration: PayPal Orders v2 (one-time) + PayPal Subscriptions (billing plans), webhooks verified via the verify-webhook-signature API, and refunds via the Payments API.

**Our own payment layer** (`lib/payments/`)
- A `PaymentProvider` interface: `createCheckout(order)`, `verifyPayment(ref)`, `createSubscription(plan, customer)`, `cancelSubscription(id)`, `refund(order, amount)`, `parseWebhook(req)`. It has Paystack and PayPal implementations, and later Stripe (if we form a US LLC) or Creem (for SaaS plans) without touching the rest of the app.
- Prices are defined once in a `skus` config in USD cents. Both providers read from it. Product and plan IDs on each provider are mapped in config.
- **Coupons** (launch sales, founding-maker discount) are computed by us before creating the charge. Paystack has no Stripe-style coupon object.
- **Affiliates** are tracked in-house (`?ref=` cookie → `affiliate_referrals`) and paid monthly via PayPal Payouts or bank transfer. Rewardful and PromoteKit are Stripe-only.
- Fulfilment happens **only** from verified webhooks or server-side verification, never from the client redirect. Webhook events are stored in `payment_events` for idempotency, plus hourly reconciliation.
- Checkout shows "Pay with card" (Paystack) and "PayPal". Receipts/invoices come from our own system (PDF via React Email/react-pdf) with a sequential invoice number.

**Tax & compliance (to confirm with a Kenyan accountant before launch)**
- Without a merchant of record, DebutYard is the seller. Register the business, get a KRA PIN, and confirm how VAT applies to exported digital services/advertising, and whether turnover tax or income tax applies.
- Most buyers are businesses (B2B), which keeps foreign VAT exposure low. Collect the buyer's country and an optional VAT ID at checkout, so a later move to an MoR or to EU/UK VAT registration is straightforward if B2C volume grows.
- Terms of Service, Refund Policy (with the money-back guarantee), Privacy Policy and a visible support email are needed for Paystack's business review anyway.

**Later options**
- **US LLC + Stripe** (Stripe Atlas ~$500, then ~$100/yr registered agent + ~$300–1,500/yr Delaware tax and accounting) once revenue justifies the overhead. Most competitors (Nick Launches, Startup Fame) run on Stripe.
- **Creem** for the SaaS subscriptions, or for everything, once we have a few months of clean processing history (Uneed sells ads through Creem, so a directory can pass its review).

---

## 8. Go-to-market (the hard part)

The product is easy to build. The niche is crowded (Nick tracks 194 directories, and lists exceed 500), and **DR and traffic are what customers are really buying.** Nick Launches is at DR 71–76 with ~100 launches/week. We start at DR 0, so:

1. **Seed DR before charging premium prices.** Submit our own site to the 150+ directories in our DB (dogfooding the service, which also gives the first case study and DR before/after chart). Launch on Product Hunt, Uneed, TinyLaunch, Fazier, Startup Fame, SaaSCity, Nick Launches and Startups Lab. Join the **"As featured on" badge exchanges**: Nick's footer shows this is how directory owners grow DR together.
2. **The badge flywheel.** Every free launch adds a badge link to us. Keep free generous early (higher weekly cap) to grow referring domains fast.
3. **Directory database as the SEO magnet,** with *crawler-verified* link types ("we checked: actually nofollow") and time-to-live data from real orders. Competitors' catalogs are hand-reviewed or self-reported.
4. **Free tools** (dofollow checker, readiness audit, DR checker) as lead magnets. Uneed and SaaSCity get a lot of traffic this way.
5. **Weekly recap posts + newsletter** from day one, with real stats (Nick's recaps are a good template). Winners share their badges and recaps.
6. **Launch the submission service early.** It doesn't depend on our DR, so it can bring in revenue before the board has traffic. Sell it with verification proof and the guarantee.
7. **Agent-native from the start:** MCP server + `llms.txt` + JSON-LD. Get listed in MCP registries. Nick, PeerPush, SaaSCity and Uneed all already do this.
8. **Build in public** on X/Indie Hackers with MRR (TrustMRR), which is how this niche's own founders grow.

Pricing note: until DR is above ~50, run launch-sale codes on the launch tiers and rely on the submission service + Link Monitor for revenue.

---

## 9. Roadmap

**Phase 0 — Foundations (week 1)** ✅ *Done Oct 26, 2026 (see README).* Submission packages are already sellable, fulfilled by hand.
Repo setup, Next.js + Drizzle + Postgres, auth, Paystack + PayPal sandbox/test accounts and the `PaymentProvider` layer, CI (lint/typecheck/test), base design system, final name + domain.

**Phase 1 — MVP launch board (weeks 2–4)** ✅ *Done Oct 26, 2026.* Also shipped early: the Phase 2 featured rail for paid debuts, so paid perks are live from day one. AI-written prefill shipped in Phase 4: Claude drafts the copy when `ANTHROPIC_API_KEY` is set, and metadata extraction is the fallback.
Product submission with URL prefill + moderation, product pages (rank, votes chart, same-week, similar), categories, builders, weekly launch weeks + free queue (visible ETA, 2-active cap), voting + comments, basic anti-fraud, weekly winners job + badges + top-3 dofollow, badge verification (HTML + DNS), paid tiers via Paystack + PayPal (webhooks, verification, refunds, coupons), maker dashboard v1, SEO basics (sitemap, JSON-LD, OG images, `llms.txt`), transactional email.

**Phase 2 — Monetization + agent surface (weeks 5–6)** ✅ *Done Oct 26, 2026.* The OAuth connect flow (`/mcp`, approval at `/connect`) and newsletter open/click tracking shipped in Phase 4; pasted tokens still work.
Featured slot calendar with capped inventory + leaderboard slot, click/impression stats, newsletter, blog/CMS + automated recap drafts, monthly/yearly boards, `/vote` duels, pricing + advertise pages, **launch-readiness check**, **MCP server + REST API** (search, get, readiness, draft submit, my launches).

**Phase 3 — Directory DB, DIY tracker, submission service (weeks 7–9)** ✅ *Done Oct 26, 2026.* The deferred pieces (evidence screenshots, per-order inboxes, encrypted directory logins, the badge block, index and DR before/after checks, the monthly directory audit) shipped in Phase 4.
Directory database (admin editor + public pages), DIY tracker with automatic link verification, submission order checkout (no account needed) + "boost" on existing launches, ops console (kanban, per-directory checklists, QA), client live-tracking dashboard, evidence screenshots, CSV/PDF export, shareable reports, status emails.

**Phase 4 — Link Monitor & subscriptions (weeks 10–11)** ✅ *Done Oct 27, 2026.* Deferred: the hourly jobs (`/api/cron/hourly`: payments reconcile, slot settlement) exist but aren't scheduled until the project moves to Vercel Pro, so they run daily; `rank.compute` and `votes.audit` aren't separate jobs: scores are computed when the board is read, and vote weights are set when each vote is cast. The screenshot worker needs deploying, and the DR, SERP and Claude features stay hidden until their keys are set.
Tracked links for any URL, weekly monitoring + alerts, DR snapshots + before/after charts, Maker Pro + Always Featured + Link Monitor plans (Paystack/PayPal subscriptions + dunning emails), in-house affiliate program, free tools (dofollow checker, DR checker), launch wall.

**Phase 5 — Scale & moat (ongoing)**
Chrome autofill extension synced to the tracker, advanced vote-fraud detection, alternatives/comparison SEO pages, agency plan + white-label, audience-finder tool, Distribution Suite (AI-visibility prompt tracking, rankings, written posts), a gamified homepage element (optional).

---

## 10. Metrics to track

- Weekly submissions (free vs. paid), free→paid conversion, queue length, readiness-check → submit conversion
- Referring domains + DR (badge flywheel health)
- Votes per launch, duel participation, voter retention, flagged vote %
- Featured slot sell-through %, CTR delivered per slot
- Submission service: orders/week, acceptance rate, days-to-live, verified-dofollow %, gross margin per order
- DIY tracker: products with ≥10 verified links, extension installs (later)
- Link Monitor: attach rate after submission orders, churn
- MRR split: launches / featured / submissions / subscriptions

---

## 11. Decisions

All the open questions are settled (Oct 26, 2026):

| Decision | Choice |
|---|---|
| Name | **DebutYard** |
| Payments | **Paystack primary + PayPal secondary** (§7.5) |
| Cadence | **Weekly** debuts (Mon 00:00 UTC to Sun 23:59 UTC) |
| Positioning | **Generalist** (SaaS, AI, dev tools, indie apps) with strong categories |
| Submission service | **In-house**: the founder does submissions at launch. SLA: start within 48h of receiving product details, finish in 7–14 days. Hire contractors once volume needs it |
| Hosting | **Vercel** (web + cron) |
| Database | **Supabase** Postgres (transaction pooler for the app, direct connection for migrations, RLS on every table) |
| Storage | **Cloudflare R2** |
| Money-back guarantee | **Included from day one** on paid debuts (refund policy page live) |

**Still to do (owner):**
- Register `debutyard.com` + `.io` (+ `.app`), claim the X/GitHub handles, run a USPTO/EUIPO trademark search.
- Register the business and get a KRA PIN, open a USD account at a Kenyan bank, complete Paystack verification and turn on international (USD) payments, open a PayPal Business account, and confirm USD subscription support with Paystack.
- Have an accountant confirm the VAT/tax treatment, and a lawyer review the policy pages.
- Create the Supabase project, R2 bucket, Resend domain and Vercel project (steps in the README).

---

## Sources

**Live pages fetched Oct 25, 2026**
- Nick Launches: [home](https://nicklaunches.com/), [submit](https://nicklaunches.com/submit/), [badge](https://nicklaunches.com/badge/), [directory submission service](https://nicklaunches.com/directory-submission-service/), [API & MCP](https://nicklaunches.com/api-mcp/), [docs](https://nicklaunches.com/docs/), [tools/workspace](https://nicklaunches.com/tools/), [autofill](https://nicklaunches.com/tools/autofill/), [first users](https://nicklaunches.com/tools/find-users/), [AI visibility](https://nicklaunches.com/tools/ai-visibility/), [partners](https://nicklaunches.com/tools/partners/), [launch wall](https://nicklaunches.com/launch-wall/), [signals](https://nicklaunches.com/signals/), [discovery](https://nicklaunches.com/discovery/), [vote](https://nicklaunches.com/vote/), [week 14 recap](https://nicklaunches.com/blog/week-14-recap-august-09-2026/), [sample product page](https://nicklaunches.com/products/buttershare/)
- [TinyLaunch pricing](https://tinylaunch.com/pricing) · [Startup Fame pricing](https://startupfa.me/pricing) · [SaaSCity pricing](https://saascity.io/pricing) · [Startups Lab pricing](https://startupslab.site/pricing) · [Product Watch pricing](https://productwatch.io/pricing) · [Uneed pricing](https://www.uneed.best/pricing) · [PeerPush pricing](https://peerpush.com/pricing) · [Fazier](https://fazier.com/) · [DevHunt](https://devhunt.org/)
- Domain status: Verisign and Identity Digital RDAP lookups

**Third-party (v1 research)**
- Nick Launches: [press release](https://www.nbcrightnow.com/online_features/press_releases/nick-launches-introduces-hand-done-directory-submission-service-covering-100-high-dr-startup-directories/article_77d8e187-26de-5729-a163-663e1ea9d341.html), [Noonlaunch review](https://noonlaunch.com/blog/nick-launches-review), [LaunchIt profile](https://launchit.fast/tools/nick-launches)
- [LaunchPact TinyLaunch review](https://www.launchpact.io/product-hunt-alternatives/tinylaunch), [saas-directories: Startup Fame](https://saas-directories.com/directories/startupfa-me), [TrustMRR: Startup Fame](https://trustmrr.com/startup/startup-fame), [SaaSCity PH alternatives](https://saascity.io/blog/product-hunt-alternatives-saas-2026), [Uneed help center](https://help.uneed.best/getting-started/uneed-pro), [Stork: Fazier](https://www.stork.ai/en/fazier), [Orangebot BetaList alternatives](https://orangebot.ai/blog/betalist-alternatives-2026), [LaunchList PH alternatives](https://getlaunchlist.com/blog/product-hunt-alternatives), [TAAFT get featured](https://theresanaiforthat.com/get-featured/), [Position Digital 260+ SaaS directories](https://www.position.digital/blog/saas-directories/), [Startup-Launch-List (580+)](https://github.com/volodstaimi/Startup-Launch-List)
- Product Hunt: [Innmind playbook](https://blog.innmind.com/how-to-launch-on-product-hunt-in-2026), [Causo playbook](https://hub.causo.ai/guides/product-hunt-launch-2026-realistic-playbook)
- Submission services: [Arahi comparison](https://arahi.ai/blog/directory-submission-services), [StartupSubmit](https://startupsubmit.app/), [ListingBott (Dodo index)](https://index.dodopayments.com/listingbott)
- Badges & link integrity: [DEV — half of "dofollow" directories serve nofollow](https://dev.to/convertica/half-the-directories-promising-you-a-dofollow-backlink-are-serving-nofollow-ikn), [DEV — followed link worth ten upvotes](https://dev.to/blueticks/a-directory-told-me-exactly-what-my-followed-link-is-worth-ten-upvotes-82o), [ns-ui badge PR](https://github.com/nikolas-sapa/ns-ui/pull/63)
- Boilerplates: [Dirstarter review](https://boilerplatehub.com/detail/Dirstarter/review)

**Payments (checked Oct 25, 2026)**
- [Paystack: accepting USD (Kenya/Nigeria)](https://support.paystack.com/hc/en-us/articles/360009973799-Can-I-accept-payments-in-USD-), [Paystack Kenya pricing](https://dr.paystack.com/ke/pricing)
- [Paddle: what you can't sell](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle), [Lemon Squeezy: prohibited products](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products), [Polar: acceptable use](https://docs.polar.sh/merchant-of-record/acceptable-use), [Creem: account reviews / restricted products](https://docs.creem.io/merchant-of-record/account-reviews/account-reviews), [Creem: supported countries](https://docs.creem.io/merchant-of-record/supported-countries), [Dodo: supported countries](https://docs.dodopayments.com/api-reference/misc/supported-countries)
- [AgentaOS: selling from Kenya (provider-by-provider)](https://agentaos.ai/countries/kenya), [Stripe Atlas cost (Rho)](https://www.rho.co/blog/stripe-atlas-review)
