# Blog and the AI writer

Staff write at `/admin/blog`, and readers see `/blog`, `/blog/category/[slug]` and `/blog/[slug]`. Staff can open any draft at `/blog/preview/[id]`.

## Before the first deploy

Apply the migration `supabase/migrations/20261031091844_blog_editor.sql` (`pnpm db:migrate`). It adds the working copy, revisions, bylines, author profiles, categories, redirects and maker reviews. It also backfills bylines from `posts.author_id` and files existing recaps and launch posts under **Launches**.

## Environment

| Variable | Needed for |
| --- | --- |
| `GEMINI_API_KEY` | The writer agent. It runs on a billed project and uses only `gemini-3.1-flash-lite` (text) and `gemini-nano-banana-2.1` (images). If this key is missing, the AI panel is off and the editor still works. |
| `GOOGLE_ADS_CLIENT_ID` | Keyword Planner search volume, using the same OAuth client as Hivra. |
| `GOOGLE_ADS_CLIENT_SECRET` | Keyword Planner. |
| `GOOGLE_ADS_REFRESH_TOKEN` | Keyword Planner. Hivra's refresh token works here too. |
| `GOOGLE_ADS_CUSTOMER_ID` | Keyword Planner. The Ads account, 10 digits with no dashes. |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Optional. The manager (MCC) id, if the account sits under one. |

If the Google Ads variables are missing, keyword research still runs on autocomplete and the "who ranks" check, but shows no volumes.

## Post kinds

- **Post**: a keyword article.
- **Roundup**: live DebutYard listings, plus well-known outside tools when the keyword needs them.
- **Comparison**: one product against another.
- **Alternatives**: other tools to a named product.
- **Recap**: the cron drafts one after each week closes.
- **Launch**: written from a paid listing's perk, via "Draft with AI" or "Write it myself" in the admin perks list.

## Images

The AI never leaves a "suggested image" card. Instead it uses one of two placeholders:

- **Image to generate** (✨): Nano Banana draws it from the description. Use "Draw images" in the AI panel, or put the cursor in the placeholder and choose Generate.
- **Screenshot needed** (📷): a real product screenshot has to be uploaded by hand.

Publishing stays blocked while either kind of placeholder is left in the post. The cover banner is generated from the Settings panel, or automatically after the first draft when the post has no cover yet.

## Launch posts

- The maker is the second byline, and the post carries a disclosure line.
- Links to the product's own domain get `rel="sponsored"` and `utm_source=debutyard&utm_medium=referral&utm_content=launch_post` when the post is published.
- "Send to maker" emails a fact-check link that is valid for 48 hours. The maker can approve it or leave notes, and the notes appear in the AI panel so the post can be revised. The check never blocks publishing.
- Once the post is live, it is linked from the product page under the description, and the maker gets an email. The daily cron sends that email for scheduled posts.
