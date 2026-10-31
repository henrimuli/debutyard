import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { site } from "@/config/site";
import { sendEmail } from "@/lib/email";
import { renderEmail, type Block } from "@/lib/email-template";
import { formatPeriodLabel } from "@/lib/periods";
import { PERK_LABELS, type PerkTask } from "@/lib/perks/service";
import { TIERS, type Tier } from "@/lib/products/input";
import { formatWeekLabel, formatWeekRange, weekKeyFor } from "@/lib/weeks";

type Product = typeof schema.products.$inferSelect;

function url(path: string) {
  return new URL(path, env().NEXT_PUBLIC_SITE_URL).toString();
}

async function makerEmail(p: Product): Promise<string | null> {
  const u = await db().query.user.findFirst({ where: eq(schema.user.id, p.createdBy), columns: { email: true } });
  return u?.email ?? null;
}

async function toMaker(p: Product, subject: string, blocks: Block[], preheader?: string) {
  const to = await makerEmail(p);
  if (!to) return;
  await sendEmail({
    to,
    ...renderEmail({
      variant: "customer",
      label: "Your listing",
      subject,
      preheader,
      reason: `you listed ${p.name} on DebutYard`,
      blocks,
    }),
  });
}

export async function toStaff(label: string, subject: string, blocks: Block[], trigger: string) {
  await sendEmail({
    to: env().ADMIN_EMAIL ?? site.supportEmail,
    ...renderEmail({ variant: "staff", label, subject, trigger, blocks }),
  });
}

export async function notifyProductSubmitted(p: Product) {
  await toStaff(
    "Review",
    `Review: ${p.name} (${p.tier})`,
    [
      { heading: `${p.name} is waiting for review` },
      { text: p.tagline },
      {
        facts: [
          ["Tier", p.tier],
          ["Website", p.websiteUrl],
        ],
      },
      { button: "Open the review queue", href: url("/admin/review") },
    ],
    "Sent when a listing is submitted for review.",
  );
}

export async function notifyProductApproved(p: Product) {
  const week = p.launchWeekKey!;
  // Paid debuts go into the current week, so they're live now.
  const liveNow = week <= weekKeyFor(new Date());
  await toMaker(
    p,
    liveNow ? `${p.name} is approved and live` : `${p.name} is approved for ${formatWeekLabel(week)}`,
    [
      { heading: liveNow ? `${p.name} is live on this week's board` : `${p.name} debuts in ${formatWeekLabel(week)}` },
      {
        text: liveNow
          ? `Good news: ${p.name} is approved and live now on this week's board (${formatWeekRange(week)}). Applause runs until Sunday at 23:59 UTC.`
          : `Good news: ${p.name} is approved and debuts in ${formatWeekLabel(week)} (${formatWeekRange(week)}). Applause opens Monday at 00:00 UTC and runs all week.`,
      },
      { button: "View your listing", href: url(`/p/${p.slug}`) },
      p.tier === "free"
        ? {
            callout: "Keep your followed link",
            text: "To keep a followed (dofollow) link from your listing, add the DebutYard badge to your homepage. Your snippet and a one-click check are in your dashboard.",
          }
        : { text: "Your paid debut includes a followed link, no badge needed." },
      { link: "Open your dashboard", href: url("/dashboard") },
    ],
    liveNow ? "Applause runs until Sunday at 23:59 UTC." : "Applause opens Monday at 00:00 UTC.",
  );
}

export async function notifyProductRejected(p: Product, refunded: boolean) {
  await toMaker(p, `About your DebutYard submission: ${p.name}`, [
    { heading: `We couldn't approve ${p.name}` },
    { text: `Thanks for submitting ${p.name}. We couldn't approve it this time.` },
    { callout: "Reason", text: p.rejectionReason ?? "It doesn't meet our listing guidelines." },
    ...(refunded
      ? [
          {
            text: "Under our money-back guarantee, we've refunded your payment in full. It can take a few business days to appear.",
          },
        ]
      : [
          { text: "You can update the listing and resubmit it from your dashboard." },
          { button: "Update your listing", href: url("/dashboard") },
        ]),
  ]);
}

export async function notifyPaidTierApplied(p: Product, tierLabel: string) {
  await toMaker(p, `${tierLabel} confirmed for ${p.name}`, [
    { heading: `${tierLabel} is on for ${p.name}` },
    { text: `Payment received: ${p.name} now has ${tierLabel}.` },
    {
      text:
        p.status === "approved" && p.launchWeekKey
          ? p.launchWeekKey <= weekKeyFor(new Date())
            ? "It's live now on this week's board."
            : `It's scheduled for ${formatWeekLabel(p.launchWeekKey)} (${formatWeekRange(p.launchWeekKey)}).`
          : "We review new listings within 24 hours. It goes live the moment it's approved, and we'll email you then.",
    },
    { button: "Track it in your dashboard", href: url("/dashboard") },
  ]);
}

export async function notifyWinner(p: Product, place: number, weekKey: string) {
  const medal = ["", "🥇 #1", "🥈 #2", "🥉 #3"][place] ?? `#${place}`;
  await toMaker(p, `${medal} Debut of the Week: ${p.name}`, [
    { heading: `${p.name} is Debut of the Week ${medal}` },
    { text: `Congratulations! ${p.name} finished ${medal} in ${formatWeekLabel(weekKey)} on DebutYard.` },
    { text: "Your listing now keeps a followed link permanently, badge or not." },
    { button: "Get your winner badge", href: url("/dashboard") },
  ]);
}

export async function notifyPeriodWinner(p: Product, place: number, scope: "month" | "year", key: string) {
  const medal = ["", "🥇 #1", "🥈 #2", "🥉 #3"][place] ?? `#${place}`;
  const title = scope === "month" ? "Debut of the Month" : "Debut of the Year";
  const label = formatPeriodLabel(scope, key);
  await toMaker(p, `${medal} ${title}: ${p.name}`, [
    { heading: `${p.name} is ${title} ${medal}` },
    { text: `${p.name} finished ${medal} among every product that debuted on DebutYard in ${label}.` },
    { text: `It now shows on your listing and on the ${label} board.` },
    { button: `See the ${label} board`, href: url(`/${scope}/${key}`) },
  ]);
}

export async function notifyBadgeMissing(p: Product, graceUntil: Date) {
  await toMaker(p, `Your DebutYard badge is missing on ${p.domain}`, [
    { heading: `We couldn't find your badge on ${p.domain}` },
    { text: `Our weekly check couldn't find the DebutYard badge on ${p.websiteUrl}.` },
    {
      callout: `Put it back by ${graceUntil.toUTCString().slice(0, 16)}`,
      text: "After that, the link from your listing switches to nofollow. It switches back as soon as the badge returns.",
    },
    { button: "Get the snippet and re-check", href: url("/dashboard") },
  ]);
}

/** A paid debut's perks need the team: one row per to-do, linking to where it's done. */
export async function notifyAdminPaidTier(p: Product, tier: Tier, tasks: PerkTask[]) {
  if (tasks.length === 0) return;
  const label = TIERS[tier].label;
  const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  await toStaff(
    "Needs attention",
    `Needs attention: ${p.name} (${label})`,
    [
      { heading: `${p.name} needs attention` },
      { text: `${p.name} bought ${label}. These perks are on the team:` },
      {
        items: tasks.map((t) => ({
          name: PERK_LABELS[t.kind],
          detail:
            t.kind === "launch_post"
              ? `Suggested on the Blog page${t.dueAt ? `, due ${date(t.dueAt)}` : ""}`
              : `Goes out automatically in the issue after ${formatWeekLabel(t.weekKey)} unless you skip it`,
          href: url(t.kind === "launch_post" ? "/admin/blog" : "/admin/newsletter"),
          chip: { label, tone: "neutral" as const },
        })),
      },
      { link: `View ${p.name}`, href: url(`/p/${p.slug}`) },
    ],
    "Sent when a paid tier with team-delivered perks is bought.",
  );
}

export async function notifyRecapDrafted(post: { id: string; title: string }) {
  await toStaff(
    "Blog",
    `Recap draft ready: ${post.title}`,
    [
      { heading: "The weekly recap is drafted" },
      { text: "It's drafted from last week's board. Add a line about each winner, then publish." },
      { facts: [["Draft", post.title]] },
      { button: "Edit the draft", href: url(`/admin/blog/${post.id}`) },
    ],
    "Sent when the weekly rollover drafts the recap post.",
  );
}

/** A paid debut's launch post went live: tell the maker, with the link to share. */
export async function notifyLaunchPostLive(post: { slug: string; title: string; productId: string | null }) {
  if (!post.productId) return;
  const p = await db().query.products.findFirst({ where: eq(schema.products.id, post.productId) });
  if (!p) return;
  const link = url(`/blog/${post.slug}`);
  await toMaker(
    p,
    `Your launch post for ${p.name} is live`,
    [
      { heading: "Your launch post is live" },
      {
        text: `We wrote up ${p.name} on the DebutYard blog, with you as co-author. It's also linked from your listing, right under the description.`,
      },
      { facts: [["Post", post.title]] },
      { button: "Read the post", href: link },
      {
        text: "Share it with your audience: a post from a third party tends to land better than your own announcement. If anything needs correcting, reply to this email.",
      },
    ],
    `${post.title}`,
  );
}

/** A launch post is ready for the maker's fact check. */
export async function notifyMakerReview(p: Product, post: { title: string }, reviewUrl: string, expiresAt: Date) {
  await toMaker(
    p,
    `Check your launch post before it goes live`,
    [
      { heading: `Your ${p.name} launch post is drafted` },
      {
        text: "Before we publish, take a look and tell us if anything is wrong: a feature, a price, who it's for. You can approve it as is or send notes.",
      },
      {
        facts: [
          ["Post", post.title],
          ["Review by", expiresAt.toUTCString().slice(0, 16)],
        ],
      },
      { button: "Review the draft", href: reviewUrl },
      {
        text: "If we don't hear back by then, we'll publish it as written. You can still send corrections afterwards.",
      },
    ],
    "Approve it or send notes.",
  );
}

/** The maker answered a fact check. */
export async function notifyMakerReviewAnswered(post: { id: string; title: string }, approved: boolean, notes: string) {
  await toStaff(
    "Blog",
    approved ? `Maker approved: ${post.title}` : `Maker sent notes: ${post.title}`,
    [
      { heading: approved ? "The maker approved their launch post" : "The maker sent notes on their launch post" },
      ...(notes ? [{ text: notes } as Block] : []),
      { button: "Open the post", href: url(`/admin/blog/${post.id}`) },
    ],
    "Sent when a maker answers a launch post fact check.",
  );
}

/** A Spotlight spot opened for someone on the waitlist. Spots go to whoever books first. */
export async function notifySpotlightOpen(to: string, productId: string | null) {
  const book = url(productId ? `/dashboard/products/${productId}/plan` : "/dashboard/products");
  await sendEmail({
    to,
    ...renderEmail({
      variant: "customer",
      label: "Spotlight",
      subject: "A Spotlight spot just opened",
      preheader: "Spots go to whoever books first.",
      reason: "you joined the Spotlight waitlist",
      blocks: [
        { heading: "A Spotlight spot just opened" },
        { text: "You asked us to tell you when a Spotlight spot opened on the DebutYard homepage. One just did." },
        {
          text: "There are only 3 at any time, and the spot goes to whoever books it first, so it may not stay open long. Spotlight keeps your product at the top of the homepage for 30 days.",
        },
        { button: "Book the Spotlight", href: book },
        { note: "If it's gone by the time you get there, you can join the waitlist again from the same page." },
      ],
    }),
  });
}
