# Cold outreach

Finds businesses that just launched on our starred directories, researches who ranks for what they do, and sends each one short, plain email from the founder about the submission service. Everything is run and read from `/admin/outreach`.

## How a business becomes an email

An hourly job (`/api/cron/outreach`, Supabase Cron at :35) moves each prospect one stage at a time and saves after every stage, so a run that runs out of time just stops and the next carries on.

1. **Discover** (`discover.ts`): reads a starred directory's front page, plus its recent launches page if it links one. Gemini picks recent launches from links that are really on the page, and code checks the link and section heading are there. A dated listing older than 14 days is dropped.
2. **Qualify** (`qualify.ts`): rejects known directories, existing makers, buyers and subscribers, then anything with a directory signal in its domain, title, heading or links. Finds a public address on the homepage, then contact, about, privacy and terms. Checks the domain takes mail. Gemini must call it a `product` at 80% confidence or more.
3. **Research** (`research.ts`, `pick.ts`): Gemini suggests up to three searches. DataForSEO says who ranks and each site's Authority Score. It needs a competitor in the top 3, the business outside the top 5, and a gap of at least 15. Otherwise no email.
4. **Write** (`writer.ts`, `draft.ts`): Gemini writes the subject and paragraphs with placeholders for every fact, and code fills them in. Numbers, prices, links, overclaims and hand-written names reject the draft. Greeting, link, sign-off and footer are fixed.
5. **Send** (`pipeline.ts`): spreads the daily limit across 13:00–21:00 UTC, from the least used mailbox each time. Each draft is claimed before sending and never retried once sending has started, so a crash can't cause a repeat.

Rejected prospects stay in the table with the reason, so the same site is never checked or paid for twice.

## Guarantees

- **One email per business, ever.** `outreach_prospects.domain`, `outreach_emails.prospect_id` and `outreach_emails.to_address` are all unique.
- **Never Resend.** Its policy bans cold email and it carries the site's sign-in and order mail. Cold email leaves only through `mailbox.ts`.
- **No mailbox goes over 15 a day.** Whatever the daily limit says, sending stops at 15 per mailbox.
- **A broken mailbox doesn't use up prospects.** One that can't connect, log in or take the message (a 4xx, usually throttling) gets a red note on the dashboard and sits out the rest of the run, and its draft goes to the next mailbox.
- **Only production sends.** Live needs `VERCEL_ENV=production` and a mailbox. Anywhere else, drafts are written and nothing goes out.
- **It stops itself.** One complaint, or 5% bounces over the last sends (with at least 20 sent), drops the mode to dry run and emails `ADMIN_EMAIL`.

## Going live

1. Buy a separate sending domain (see below) and create a mailbox on it in Maildoso. Turn on warm-up and leave it running for at least 14 days before the first campaign.
2. Set `OUTREACH_MAILBOXES` (see below), `OUTREACH_SMTP_HOST`, `OUTREACH_SMTP_PORT`, `OUTREACH_IMAP_HOST` and `OUTREACH_IMAP_PORT` on Vercel. DataForSEO uses the existing `DR_API_KEY`. Maildoso's are `smtp.maildoso.com` on 587 and `imap.apollo.maildoso.com` on 993, but check them and the login format against its mailbox CSV export.
3. Set the mode to **Dry run**. Each hourly run writes up to the daily limit of drafts. Read them under **Emails**, and block anything that shouldn't be there.
4. Use **Send a test from each mailbox** to check the logins and how the email lands.
5. Set the mode to **Live** at 5 a day. Drafts under three days old go first, so discard any you don't want. Raise the limit slowly.

## Sending domain

Cold email goes from its own domain, such as `trydebutyard.com`, never from `debutyard.com`. Maildoso takes over a connected domain's nameservers and allows no records of your own, which would take down the site and the `submit.debutyard.com` order inboxes.

- **Name:** a clear variation on the brand, not a misspelling, which can look like impersonation.
- **Registrar:** buy it through Maildoso, which sets it up automatically. A domain registered with Cloudflare can't be connected.
- **Redirect:** set the domain's redirect to `https://debutyard.com` in Maildoso, so anyone checking it finds the site. Visitors may see a short verification first.
- **Mailboxes per domain:** Maildoso recommends 4 to 8, so ten mailboxes need two domains. The list can mix domains.

The separation isn't complete: each email still names and links to `debutyard.com`, so poor targeting can still hurt it.

## Mailboxes

`OUTREACH_MAILBOXES` is a JSON list with one entry per mailbox:

```json
[
  { "from": "Henry from DebutYard <henry@trydebutyard.com>", "pass": "..." },
  { "from": "Henry from DebutYard <henry.m@trydebutyard.com>", "pass": "..." }
]
```

The login defaults to the address. An entry can also set `user`, `smtpHost` and `imapHost` when it differs from the shared `OUTREACH_SMTP_HOST` and `OUTREACH_IMAP_HOST`.

To add a mailbox, add an entry and redeploy, since Vercel only applies environment changes to new deployments. No code or database change is needed. **Send a test from each mailbox** proves its login, and it shares the load from the next run. Each one adds 15 a day, so ten allow 150. Then raise the daily limit under **Controls**.

Keep a retired mailbox in the list until replies to it have stopped: only listed mailboxes are read. A reply in a conversation whose mailbox has gone comes from the first one in the list.

A new mailbox is treated the same as an old one, so give it its 14 days of warm-up in Maildoso before adding it.

150 a day also needs 150 drafts a day. The pipeline reads up to 10 listings per directory per crawl, each directory every 6 hours, and most get rejected, so sending more usually means starring more directories. The **Pipeline** card shows where prospects run out.

## Replies

The job reads every mailbox over IMAP and files replies under **Inbox**, matched to the email they answer by message ID, then address, then domain. Gemini sorts them (interested, question, not interested, unsubscribe, complaint, auto-reply). Unsubscribes, complaints, refusals and hard bounces go on the permanent block list. Positive replies email `ADMIN_EMAIL`. Attachments aren't kept. Maildoso's warm-up filter only covers its own Master Inbox, so check that warm-up mail doesn't land in the mailboxes' IMAP inboxes before relying on **Inbox**. Answers go out from the mailbox the conversation is with.

## Versions

Versions of the pitch live under **Experiments**. New ones come from the agent and wait for approval. Sends favour the better performers (Thompson sampling on real clicks and positive replies, never opens). A version can be retired on results after 100 sends, or early at 5% unsubscribes and complaints after 30. At low volume, expect months before results mean much.
