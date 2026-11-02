import type { Metadata } from "next";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { OpsRows } from "@/components/submissions/ops-rows";
import { OrderControls, ResendBadgeBlock } from "@/components/submissions/order-controls";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, Heading } from "@/components/ui/primitives";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { effectiveLinkType } from "@/lib/directories/service";
import { PACKAGES } from "@/lib/submissions/packages";
import { inboxAddress, messagesFor } from "@/lib/submissions/inbox";
import { messageLinks } from "@/lib/submissions/inbox-rules";
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
  // The order page has two views: the directory list (default) and the order's inbox.
  const showInbox = (await searchParams).view === "inbox";
  if (!z.string().uuid().safeParse(id).success) notFound();
  const order = await db().query.submissionOrders.findFirst({ where: eq(schema.submissionOrders.id, id) });
  if (!order) notFound();
  const canChange = order.status === "queued" || order.status === "in_progress";
  const [rows, staff, inbox, messages, badgeBlock, picks] = await Promise.all([
    orderRows(order.id),
    db()
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .innerJoin(schema.adminUsers, eq(schema.adminUsers.email, sql`lower(${schema.user.email})`)),
    inboxAddress(order),
    messagesFor(order.id),
    order.badgePreference === "allow" ? badgeBlockFor(order.id) : null,
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
    ["Badges", order.badgePreference === "allow" ? "Allowed (up to 5)" : "None"],
    ["Client notes", order.clientNotes],
  ];

  return (
    <div className="mt-4 space-y-6">
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
              <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">
                {messages.length}
              </span>
            </ButtonLink>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {s.live} live ({s.dofollow} dofollow) · {s.inReview} in review · {s.needsAction} need the client · {s.scheduled}
        /{s.target} scheduled ·{" "}
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
        <InboxPanel inbox={inbox} messages={messages} />
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
          {order.badgePreference === "allow" && (
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
              badgesFull={picks?.badgesFull ?? false}
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

/** Mail that directories send to this order's inbox address: verification links first. */
function InboxPanel({ inbox, messages }: { inbox: string | null; messages: Awaited<ReturnType<typeof messagesFor>> }) {
  return (
    <Card className="p-5">
      <h2 className="font-medium">Inbox</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {inbox ? (
          <>
            Use <code className="break-all">{inbox}</code> when creating directory accounts. Verification emails land
            here.
          </>
        ) : (
          "Set INBOUND_EMAIL_DOMAIN and RESEND_WEBHOOK_SECRET, with receiving on for that domain in Resend, to get mail here."
        )}
      </p>
      {messages.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No mail yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border text-sm">
          {messages.map((m) => (
            <li key={m.id} className="py-3">
              <details>
                <summary className="cursor-pointer">
                  <span className="font-medium">{m.subject || "(no subject)"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {m.fromAddress} · {m.receivedAt.toUTCString().slice(5, 22)}
                  </span>
                </summary>
                <div className="mt-2 space-y-2">
                  {messageLinks(m.text, m.html).map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className={`block truncate text-xs hover:underline ${l.likely ? "font-medium text-primary" : "text-muted-foreground"}`}
                    >
                      {l.likely ? "Verify: " : ""}
                      {l.url}
                    </a>
                  ))}
                  <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                    {m.text.slice(0, 5000) || "(HTML only)"}
                  </pre>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
