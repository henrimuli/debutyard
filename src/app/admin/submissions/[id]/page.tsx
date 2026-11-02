import type { Metadata } from "next";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { OrderMailRefresh } from "@/components/support/live-inbox";
import { OpsRows } from "@/components/submissions/ops-rows";
import { OrderInbox } from "@/components/submissions/order-inbox";
import { OrderControls, RecheckBlock, ResendBadgeBlock } from "@/components/submissions/order-controls";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, Heading } from "@/components/ui/primitives";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { liveBadgeCount } from "@/lib/badge-block/service";
import { effectiveLinkType } from "@/lib/directories/service";
import { PACKAGES } from "@/lib/submissions/packages";
import { inboxAddress, messagesFor, openMessage, orderMailPulse, unreadMailFor } from "@/lib/submissions/inbox";
import { badgeBlockFor, directoryChoices, heldForBadge, orderRows, summarizeOrder } from "@/lib/submissions/service";

export const metadata: Metadata = { title: "Submission order · Admin", robots: { index: false } };

export default function OrderOpsPage(props: PageProps<"/admin/submissions/[id]">) {
  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/submissions" className="text-sm text-muted-foreground hover:text-foreground">
        ← All orders
      </Link>
      <Suspense fallback={<p className="mt-6 text-muted-foreground">Loading…</p>}>
        <Detail params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Detail({ params, searchParams }: PageProps<"/admin/submissions/[id]">) {
  await requireStaff();
  const { id } = await params;
  // The order page has two views: the directory list (default) and the order's inbox, with `m` the open email.
  const sp = await searchParams;
  const showInbox = sp.view === "inbox";
  const messageId = showInbox && typeof sp.m === "string" ? sp.m : null;
  if (!z.string().uuid().safeParse(id).success) notFound();
  if (messageId && !z.string().uuid().safeParse(messageId).success) notFound();
  const order = await db().query.submissionOrders.findFirst({ where: eq(schema.submissionOrders.id, id) });
  if (!order) notFound();
  // Before the counts below, so they already leave this email out.
  const opened = messageId ? await openMessage(order.id, messageId) : null;
  if (messageId && !opened) notFound();
  const canChange = order.status === "queued" || order.status === "in_progress";
  const blockLive = order.badgePreference === "allow" && Boolean(order.blockInstalledAt);
  const [rows, staff, inbox, messages, unreadMail, mail, badgeBlock, badgesShowing, picks] = await Promise.all([
    orderRows(order.id),
    db()
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .innerJoin(schema.adminUsers, eq(schema.adminUsers.email, sql`lower(${schema.user.email})`)),
    inboxAddress(order),
    messagesFor(order.id),
    unreadMailFor(order.id),
    orderMailPulse(),
    order.badgePreference === "allow" && !blockLive ? badgeBlockFor(order.id) : null,
    blockLive ? liveBadgeCount(order) : 0,
    canChange ? directoryChoices(order) : null,
  ]);
  const s = summarizeOrder(
    order,
    rows.map((r) => r.s),
  );
  const kit: Array<[string, string | null]> = [
    ["Website", order.websiteUrl],
    ["Tagline (60)", order.tagline],
    ["Short (160)", order.shortDescription],
    ["Long (500)", order.longDescription],
    ["Categories", order.categories.join(", ")],
    ["Logo", order.logoUrl],
    ["Founder", order.founderName],
    ["Contact", order.contactEmail ?? order.email],
    ["Inbox", inbox ?? "Set INBOUND_EMAIL_DOMAIN to give orders an inbox"],
    ["Badges", order.badgePreference === "allow" ? "Allowed" : "None"],
    ["Client notes", order.clientNotes],
  ];

  return (
    <div className="mt-4 space-y-6">
      <OrderMailRefresh rendered={mail} />
      <div className="flex flex-wrap items-center gap-3">
        <Heading className="text-2xl sm:text-3xl">{order.productName ?? order.email}</Heading>
        <Badge>{PACKAGES[order.package].label}</Badge>
        <Badge tone={order.status === "delivered" ? "success" : "default"}>{order.status.replace("_", " ")}</Badge>
        <div className="ml-auto">
          {showInbox ? (
            <ButtonLink href={`/admin/submissions/${order.id}`} variant="outline" size="sm">
              ← Back to directories
            </ButtonLink>
          ) : (
            <ButtonLink href={`/admin/submissions/${order.id}?view=inbox`} variant="outline" size="sm">
              Inbox
              {unreadMail > 0 ? (
                <span className="rounded-full bg-primary px-2 text-xs font-semibold tabular-nums text-primary-foreground">
                  {unreadMail} unread
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">
                  {messages.length}
                </span>
              )}
            </ButtonLink>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {s.live} live ({s.dofollow} dofollow) · {s.inReview} submitted
        {s.awaitingScreenshot > 0 ? ` (${s.awaitingScreenshot} need a screenshot)` : ""} · {s.needsAction} need the
        client · {s.scheduled}/{s.target} scheduled ·{" "}
        <a href={`/orders/${order.intakeToken}`} target="_blank" className="text-primary hover:underline">
          client view ↗
        </a>
      </p>
      <OrderControls
        orderId={order.id}
        assigneeId={order.assigneeId}
        staff={staff}
        canDeliver={order.status === "queued" || order.status === "in_progress"}
      />
      {showInbox ? (
        <OrderInbox orderId={order.id} address={inbox} messages={messages} unread={unreadMail} opened={opened} />
      ) : order.status === "awaiting_intake" ? (
        <Card className="p-5 text-sm text-muted-foreground">
          Waiting for the client to fill in the intake form. They were emailed the link.
        </Card>
      ) : (
        <>
          <Card className="p-0">
            <details>
              <summary className="cursor-pointer px-5 py-3 font-medium">Product kit</summary>
              <dl className="divide-y divide-border border-t border-border text-sm">
                {kit.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-1 gap-1 px-5 py-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-words whitespace-pre-line">{v || "–"}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </Card>
          {blockLive && (
            <Card className="space-y-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">Badge block</h2>
                <RecheckBlock orderId={order.id} />
              </div>
              <p className="text-sm text-muted-foreground">
                Installed on{" "}
                <a
                  href={order.websiteUrl ?? "#"}
                  target="_blank"
                  rel="noopener"
                  className="text-primary hover:underline"
                >
                  {order.websiteUrl}
                </a>
                . {badgesShowing} {badgesShowing === 1 ? "badge" : "badges"} showing. Paste a directory&apos;s badge
                code on its row below, give it about 10 seconds, then click Verify on the directory. A badge comes off
                by itself if its directory is swapped, rejected, skipped or dead.
              </p>
            </Card>
          )}
          {order.badgePreference === "allow" && !blockLive && (
            <Card className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">Badge block</h2>
                <ResendBadgeBlock orderId={order.id} />
              </div>
              {badgeBlock ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {order.badgeBlockSentAt
                      ? `Emailed ${order.badgeBlockSentAt.toUTCString().slice(5, 16)}.`
                      : "Not emailed yet."}{" "}
                    Found on the client site:{" "}
                    {badgeBlock.directories.map((x) => `${x.name} ${x.seen ? "✓" : "…"}`).join(", ")}. We check daily
                    and swap unfound ones after 7 days.
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{badgeBlock.html}</pre>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  None of this order&apos;s badge directories has a badge snippet yet. Add them in the directory editor,
                  then email the block.
                </p>
              )}
            </Card>
          )}
          <Card className="p-5">
            <OpsRows
              orderId={order.id}
              target={order.targetCount}
              canChange={canChange}
              choices={picks?.choices ?? []}
              rows={rows.map(({ s: r, d }) => ({
                id: r.id,
                status: r.status,
                liveUrl: r.liveUrl,
                notes: r.notes,
                actionNeeded: r.actionNeeded,
                evidenceUrl: r.evidenceUrl,
                linkVerdict: r.linkVerdict,
                linkAnchor: r.linkAnchor,
                linkCheckedAt: r.linkCheckedAt,
                replaces: Boolean(r.replacesId),
                accountLogin: r.accountLogin,
                hasPassword: Boolean(r.accountSecret),
                held: heldForBadge(order, d, r),
                badgeSeen: Boolean(r.badgeSeenAt),
                badgeCode: r.badgeCode,
                blockLive,
                siteUrl: order.websiteUrl,
                directory: {
                  name: d.name,
                  url: d.url,
                  submitUrl: d.submitUrl,
                  dr: d.dr,
                  badgeRequired: d.badgeRequired,
                  needsAccount: d.needsAccount,
                  instructions: d.instructions,
                  linkType: effectiveLinkType(d),
                },
              }))}
            />
          </Card>
        </>
      )}
    </div>
  );
}
