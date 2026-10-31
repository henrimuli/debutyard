import type { KitItemSlug } from "./kit";

/** The Founder Kit's written guides (v1). The Directory Atlas is built from the catalog instead. */

export type GuideBlock =
  | { h2: string }
  | { p: string }
  | { list: string[] }
  | { checklist: string[] }
  | { steps: { title: string; body: string }[] }
  | { code: string; label?: string };

export type Guide = { title: string; intro: string; minutes: number; blocks: GuideBlock[] };

export const GUIDES: Record<Exclude<KitItemSlug, "directory-atlas">, Guide> = {
  "agentic-dev-starter": {
    title: "Agentic Dev Starter Pack",
    minutes: 8,
    intro:
      "Coding agents do their best work in a repo that tells them how it works and checks their output for them. This is the setup we use: an instruction file, fast feedback, guardrails, and a review loop that keeps you in charge.",
    blocks: [
      { h2: "1. Write the instruction file first" },
      {
        p: "Agents read a file at the repo root on every task (AGENTS.md, CLAUDE.md or similar). Keep it short and concrete: what the project is, how to run it, and the rules a newcomer would break.",
      },
      {
        label: "AGENTS.md",
        code: `# Project
Next.js app, Postgres via Drizzle, pnpm.

## Commands
- pnpm dev — local server on :3000
- pnpm test — unit tests (fast, run often)
- pnpm typecheck && pnpm lint — must pass before you finish

## Rules
- Never edit applied migrations; generate a new one.
- Money is integer cents. Dates are UTC.
- Server-only code imports "server-only".
- Ask before adding a dependency.

## Done means
Tests, typecheck and lint pass, and you've said what you didn't verify.`,
      },
      { h2: "2. Give the agent fast, honest feedback" },
      {
        list: [
          "A typecheck and lint that run in under a minute. Agents fix what they can see.",
          "Unit tests for pure logic (pricing, permissions, date maths). They catch the subtle regressions.",
          "A seed script so a fresh database has realistic data to click through.",
          "One command that starts the app, so the agent can open it and look.",
        ],
      },
      { h2: "3. Put guardrails where mistakes are expensive" },
      {
        checklist: [
          "Secrets live in .env.local, which is git-ignored; .env.example lists the names only.",
          "The agent's database is local or a disposable branch, never production.",
          "Migrations are reviewed by a human before they're applied anywhere shared.",
          "Payments run in test mode with test keys in development.",
          "Destructive scripts (reset, delete, send-to-all) ask for confirmation or refuse in production.",
        ],
      },
      { h2: "4. Work in small, reviewable tasks" },
      {
        steps: [
          {
            title: "Describe the outcome, not the code",
            body: '"Makers can reschedule a debut until it goes live; show the new date on the dashboard" beats "add a column". Include the edge cases you care about.',
          },
          {
            title: "Ask for a plan on anything bigger than an afternoon",
            body: "Read the plan before any code is written. It's the cheapest moment to catch a wrong assumption.",
          },
          {
            title: "One branch per task, one pull request per branch",
            body: "Small diffs get real reviews. Big ones get skimmed.",
          },
          {
            title: "Review like it's a new teammate's code",
            body: "Check the parts that touch money, auth and data deletion line by line. Run it yourself once.",
          },
        ],
      },
      { h2: "5. Keep the instruction file alive" },
      {
        p: "Every time you correct the agent for the same thing twice, add a line to the instruction file. After a month it reads like your team's playbook, and every new task starts from it.",
      },
    ],
  },

  "ship-checklist": {
    title: "Vibe-Coded App Ship Checklist",
    minutes: 10,
    intro:
      "AI tools make it easy to build something that works on your machine. Before strangers sign up and pay, run through this list. Most items take minutes, and each one is a problem we've seen on real launches.",
    blocks: [
      { h2: "Accounts and access" },
      {
        checklist: [
          "Every API route and server action checks who is calling, not just the page that links to it.",
          "Users can only read and change their own records: try another user's id in the URL.",
          "Admin pages check a role on the server, not a hidden button in the UI.",
          "Password reset and magic links expire and work only once.",
          "Sign-up has bot protection (Turnstile, hCaptcha or similar) if it sends email.",
        ],
      },
      { h2: "Secrets and data" },
      {
        checklist: [
          "No API keys in client code: search the built JavaScript for 'sk_', 'key' and your provider names.",
          "Database row-level security is on, or the database is only reachable from your server.",
          "Backups run daily and you've restored one at least once.",
          "Uploads have a size limit and a type check, and are served from a separate domain or bucket.",
          "User input rendered as HTML is sanitized (markdown, rich text, profile bios).",
        ],
      },
      { h2: "Payments" },
      {
        checklist: [
          "Prices are decided on the server; the client only sends a product id.",
          "Orders are marked paid by the provider's webhook, verified with its signature, not by the return page.",
          "Webhooks are idempotent: the same event twice doesn't grant twice.",
          "Refunds and failed renewals remove access.",
          "You've done one real purchase and one refund in live mode with a small amount.",
        ],
      },
      { h2: "Reliability" },
      {
        checklist: [
          "Errors are reported somewhere you'll see them (Sentry, your host's logs with alerts).",
          "Slow third-party calls have timeouts so one outage doesn't hang every request.",
          "Expensive endpoints (AI calls, email, scraping) are rate-limited per user and per IP.",
          "You know your AI and email spend limits, and they're set below what would hurt.",
          "There's an uptime check on the homepage and the sign-in page.",
        ],
      },
      { h2: "The first impression" },
      {
        checklist: [
          "Works on a phone: sign up, the core action, and checkout.",
          "Every page has a title and description; the homepage has an Open Graph image.",
          "Transactional email lands in the inbox, not spam (SPF, DKIM and DMARC set on your domain).",
          "Privacy policy and terms exist and match what you actually collect.",
          "There's a way to reach you: a support email that someone reads.",
        ],
      },
      {
        p: "Ask your coding agent to audit the repo against each section, then verify its claims yourself. Agents are good at finding a missing check and bad at proving one is there.",
      },
    ],
  },

  "ai-search-playbook": {
    title: "AI Search Visibility Playbook",
    minutes: 9,
    intro:
      "More people now ask ChatGPT, Perplexity, Claude or Google's AI answers which tool to use, instead of clicking through ten links. Those answers cite pages they can read, trust and quote. Here's how to become one of them.",
    blocks: [
      { h2: "How AI answers pick sources" },
      {
        list: [
          "They search the web (or their index) for the question, then read a handful of pages.",
          "They prefer pages that answer the question directly, near the top, in plain sentences.",
          "They lean on sources other sites already cite: directories, reviews, comparisons and communities.",
          "They can't use what they can't fetch: content behind logins, heavy client-side rendering or blocked crawlers is invisible.",
        ],
      },
      { h2: "Step 1: Make your site readable to machines" },
      {
        checklist: [
          "Pages render meaningful HTML on the server; view the source and check that your copy is there.",
          "robots.txt doesn't block the AI crawlers you want (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended).",
          "An /llms.txt file summarizes what you do and links your key pages.",
          "Product, pricing and FAQ pages carry structured data (SoftwareApplication, Offer, FAQPage).",
          "Your sitemap is submitted to Google Search Console and Bing Webmaster Tools (Bing feeds several AI products).",
        ],
      },
      { h2: "Step 2: Write the answer, not the pitch" },
      {
        p: 'For each question a buyer asks ("best uptime monitor for small teams", "X vs Y", "how to do Z without code"), have one page that answers it in the first two sentences, then backs it up. Use the words people use, not your internal names.',
      },
      {
        steps: [
          {
            title: "A clear one-line definition",
            body: '"Acme is an uptime monitor for small teams that alerts in Slack within 30 seconds." Repeat this exact sentence on your homepage, your directory listings and your social bios.',
          },
          {
            title: "Comparison and alternatives pages",
            body: 'Honest "Acme vs Competitor" pages get quoted because they\'re what the question asks for. Say where the competitor is better.',
          },
          {
            title: "Specific, checkable facts",
            body: "Prices, limits, integrations, release dates. AI answers quote numbers; vague copy gives them nothing to quote.",
          },
          {
            title: "An FAQ that matches real questions",
            body: "Take them from support email, sales calls and Reddit threads, and answer each in two or three sentences.",
          },
        ],
      },
      { h2: "Step 3: Get mentioned where AI looks" },
      {
        list: [
          "Launch boards and directories (the Directory Atlas in this kit) give you consistent, crawlable mentions.",
          "Reddit, Hacker News and niche forums are heavily cited: answer questions there as yourself, with disclosure.",
          'Guest posts, podcasts and "best tools for X" roundups put your name next to the category.',
          "Keep your name, one-liner and URL identical everywhere so they reinforce each other.",
        ],
      },
      { h2: "Step 4: Measure it" },
      {
        checklist: [
          "Monthly, ask five AI assistants your top ten buyer questions and log whether you're mentioned and cited.",
          "Watch referral traffic from chatgpt.com, perplexity.ai and similar in your analytics.",
          "Ask new sign-ups how they found you, and add 'an AI assistant' as an option.",
        ],
      },
    ],
  },

  "launch-playbook": {
    title: "30-Day Launch Playbook",
    minutes: 12,
    intro:
      "A launch is a month, not a day. This plan runs from two weeks before your debut to two weeks after, so launch day has an audience and the attention afterwards turns into users.",
    blocks: [
      { h2: "Days -14 to -8: get ready" },
      {
        checklist: [
          "Write your one-liner (under 60 characters) and a 2–3 sentence description. Use them everywhere.",
          "Make 3–5 screenshots and a 30–60 second demo video of the core action.",
          "Set up analytics and a way to see sign-ups by source (UTM tags on every launch link).",
          "Fix the first-run experience: a new user should hit the 'aha' moment in under two minutes.",
          "List 30 people who'd genuinely care, and tell them personally it's coming.",
        ],
      },
      { h2: "Days -7 to -1: warm up" },
      {
        checklist: [
          "Book your DebutYard week and draft your Product Hunt and Hacker News posts.",
          "Prepare a launch-day post for each of your channels (X, LinkedIn, newsletter, communities you're part of).",
          "Write an honest 'why I built this' story; it's what people share.",
          "Line up a launch offer with a clear end date.",
          "Test sign-up and checkout on a phone, one last time.",
        ],
      },
      { h2: "Day 0: launch" },
      {
        steps: [
          {
            title: "Morning",
            body: "Go live on DebutYard, post to your own channels, and email your list and the 30 people you told.",
          },
          {
            title: "All day",
            body: "Reply to every comment and question within the hour. This is the most valuable thing you can do today.",
          },
          {
            title: "Evening",
            body: "Post a short update with what you learned and any quick fix you shipped. Thank people by name.",
          },
        ],
      },
      { h2: "Days 1–7: keep the momentum" },
      {
        checklist: [
          "Submit to the 'week one' tier of the Directory Atlas, 5–10 a day.",
          "Email every new sign-up personally and ask one question: what almost stopped you signing up?",
          "Ship one visible improvement from launch feedback and announce it.",
          "Write a launch recap with real numbers. Founders love these and they get shared.",
        ],
      },
      { h2: "Days 8–16: compound it" },
      {
        checklist: [
          "Turn your best launch-day answers into an FAQ and two or three blog posts.",
          "Publish a comparison or alternatives page for your biggest competitor.",
          "Work through the long tail of the Directory Atlas in one or two sessions.",
          "Follow up with everyone who signed up but never came back, with one specific tip.",
          "Pick the single channel that brought the best users and plan a month of it.",
        ],
      },
      { h2: "What to measure" },
      {
        list: [
          "Visitors → sign-ups → activated users by source, not just total traffic.",
          "How many launch-week users come back in week two.",
          "Which directories and communities sent people who stayed.",
        ],
      },
    ],
  },
};
