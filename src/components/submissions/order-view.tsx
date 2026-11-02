import { CodeBlock } from "@/components/code-block";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DrChart } from "@/components/metrics/dr-chart";
import { PrintButton } from "@/components/print-button";
import { InstallOptions } from "@/components/submissions/block-install";
import { IntakeForm } from "@/components/submissions/intake-form";
import { OrderReport } from "@/components/submissions/order-report";
import { ButtonLink } from "@/components/ui/button";
import { Card, Heading } from "@/components/ui/primitives";
import { env } from "@/env";
import { installKit } from "@/lib/badge-block/render";
import { liveBadgeCount } from "@/lib/badge-block/service";
import { orderIndexStats } from "@/lib/links/indexed";
import { drHistory } from "@/lib/metrics/service";
import { listCategories } from "@/lib/products/queries";
import { domainOf } from "@/lib/slug";
import { PACKAGES } from "@/lib/submissions/packages";
import {
  badgeBlockFor,
  credentialsFor,
  orderByIntakeToken,
  orderRows,
  summarizeOrder,
} from "@/lib/submissions/service";
import { cn } from "@/lib/utils";

/** Where a maker's block loads from. A preview uses its own database, so it has to serve its own blocks. */
async function blockBase() {
  return process.env.VERCEL_ENV === "preview" ? `https://${(await headers()).get("host")}` : env().NEXT_PUBLIC_SITE_URL;
}

/**
 * A submission order by its private token: intake first, then the live
 * tracking dashboard. Shared by the emailed link (/orders/[token]) and the
 * maker dashboard (/dashboard/orders/[token]).
 */
export async function OrderView({ token }: { token: string }) {
  const order = await orderByIntakeToken(token);
  if (!order || order.status === "cancelled") notFound();
  const pkg = PACKAGES[order.package];
  const base = await blockBase();

  if (order.status === "awaiting_intake") {
    return (
      <>
        <Heading>Tell us about your product</Heading>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {pkg.label}: {order.targetCount} directories. Directories show different lengths of description, so we ask for
          three. Submissions start within 48 hours of your order going in.
        </p>
        <Card className="mt-8 p-6">
          <IntakeForm
            token={token}
            categories={await listCategories()}
            block={{
              base,
              key: order.blockKey,
              foundUrl: order.blockInstalledAt ? order.blockInstalledUrl : null,
              resume: Boolean(order.intakeDraftAt && order.badgePreference === "allow"),
            }}
            initial={{
              productName: order.productName ?? "",
              websiteUrl: order.websiteUrl ?? "",
              tagline: order.tagline ?? "",
              shortDescription: order.shortDescription ?? "",
              longDescription: order.longDescription ?? "",
              categories: order.categories,
              logoUrl: order.logoUrl ?? "",
              founderName: order.founderName ?? "",
              contactEmail: order.contactEmail ?? order.email,
              clientNotes: order.clientNotes ?? "",
              // Badges are the recommended option until they've chosen for themselves.
              badgePreference: order.intakeDraftAt ? order.badgePreference : "allow",
              allowAccounts: Boolean(order.intakeDraftAt && order.allowAccounts),
            }}
          />
        </Card>
      </>
    );
  }

  const domain = (() => {
    try {
      return order.websiteUrl ? domainOf(order.websiteUrl) : null;
    } catch {
      return null;
    }
  })();
  const blockLive = order.badgePreference === "allow" && Boolean(order.blockInstalledAt);
  const [rows, dr, badgeBlock, badgesShowing, accounts, index] = await Promise.all([
    orderRows(order.id),
    domain ? drHistory(domain) : Promise.resolve([]),
    order.badgePreference === "allow" && !blockLive && order.status !== "delivered" ? badgeBlockFor(order.id) : null,
    blockLive ? liveBadgeCount(order) : 0,
    // Logins are handed over with the delivery report, and only on this private page.
    order.status === "delivered" ? credentialsFor(order.id) : Promise.resolve([]),
    orderIndexStats(order.id),
  ]);
  const summary = summarizeOrder(
    order,
    rows.map((r) => r.s),
  );
  const shareUrl = new URL(`/r/${order.reportToken}`, env().NEXT_PUBLIC_SITE_URL).toString();
  const needs = rows.filter((r) => r.s.status === "needs_action");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading>{order.productName}</Heading>
          <p className="mt-1 text-muted-foreground">
            Directory submissions, live. Every link is checked by us, not self-reported.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <ButtonLink href={`/orders/${token}/export.csv`} variant="outline" size="sm">
            CSV
          </ButtonLink>
          <PrintButton />
        </div>
      </div>
      {needs.length > 0 && (
        <Card className="border-accent p-5">
          <p className="font-medium">We need something from you</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {needs.map(({ s, d }) => (
              <li key={s.id}>
                <strong>{d.name}</strong>: {s.actionNeeded ?? "Reply to our email about this directory."}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(blockLive || dr.length > 0) && (
        <div className={cn("grid gap-6", blockLive && dr.length > 0 && "md:grid-cols-[minmax(0,1fr)_18rem]")}>
          {blockLive && (
            <Card className="space-y-2 p-5 print:hidden">
              <p className="font-medium">Your badge block</p>
              <p className="text-sm text-muted-foreground">
                {badgesShowing === 0
                  ? "Installed, and invisible for now. Each directory's badge appears on your homepage by itself as we submit."
                  : `${badgesShowing} ${badgesShowing === 1 ? "badge" : "badges"} showing on your homepage. New ones appear by themselves.`}{" "}
                Keep the block in place: directories can check for their badge at any time.
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Need to install it again?
                </summary>
                <div className="mt-3">
                  <InstallOptions kit={installKit(base, order.blockKey, order.websiteUrl ?? "your website")} />
                </div>
              </details>
            </Card>
          )}
          {dr.length > 0 && (
            <Card className="p-4">
              <p className="text-sm font-medium">Authority Score</p>
              <p className="mb-2 truncate text-xs text-muted-foreground">{domain}</p>
              <DrChart points={dr} compact />
            </Card>
          )}
        </div>
      )}
      {badgeBlock && badgeBlock.directories.some((x) => !x.seen) && (
        <Card className="space-y-3 p-5 print:hidden">
          <p className="font-medium">Add your directory badges</p>
          <p className="text-sm text-muted-foreground">
            {badgeBlock.directories.length} of your directories only list products that show their badge. Paste this
            into your site&apos;s footer; we check daily and submit each one once its badge is up. Waiting on:{" "}
            {badgeBlock.directories
              .filter((x) => !x.seen)
              .map((x) => x.name)
              .join(", ")}
            .
          </p>
          <CodeBlock code={badgeBlock.html} />
        </Card>
      )}
      <OrderReport order={order} rows={rows} summary={summary} />
      {index.checked > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{index.indexed}</span> of {index.checked} live listings we
          checked are indexed by Google. New listings often take a few weeks; we re-check weekly.
        </p>
      )}
      {accounts.length > 0 && (
        <Card className="p-5">
          <p className="font-medium">Directory accounts we created</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Change these passwords when you log in. This list is only on your private link, never on the shared report.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {accounts.map((a) => (
                  <tr key={a.directory}>
                    <td className="py-2 pr-3">
                      <a href={a.url} target="_blank" rel="noopener nofollow" className="hover:text-primary">
                        {a.directory}
                      </a>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs break-all">{a.login}</td>
                    <td className="py-2 font-mono text-xs break-all">{a.password ?? "Ask us"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card className="p-5 text-sm print:hidden">
        <p className="font-medium">Share a read-only report</p>
        <p className="mt-1 text-muted-foreground">
          Anyone with this link sees progress and live links, but not notes or this page.
        </p>
        <code className="mt-2 block break-all rounded bg-muted p-2 text-xs">{shareUrl}</code>
      </Card>
    </div>
  );
}
