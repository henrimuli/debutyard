import Link from "next/link";
import { z } from "zod";
import { ActionButton } from "@/components/outreach/controls";
import { Badge, Card, Input } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { EMAIL_FILTERS, getEmail, listEmails, type EmailFilter } from "@/lib/outreach/queries";
import { cn } from "@/lib/utils";
import { blockDomainAction, discardDraftAction } from "../actions";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const TONE = {
  draft: "default",
  sending: "accent",
  sent: "success",
  failed: "accent",
  bounced: "accent",
  discarded: "default",
} as const;

type Row = Awaited<ReturnType<typeof listEmails>>[number];

const outcome = (e: Row["email"]) =>
  e.orderId
    ? "Ordered"
    : e.replyClass
      ? `Replied: ${e.replyClass.replaceAll("_", " ")}`
      : e.unsubscribedAt
        ? "Unsubscribed"
        : e.firstClickAt
          ? `Clicked ${e.clicks}×`
          : "";

export default async function OutreachEmailsPage(props: PageProps<"/admin/outreach/sent">) {
  await requireStaff("/admin/outreach/sent");
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filter = (EMAIL_FILTERS as readonly string[]).includes(one(sp.filter))
    ? (one(sp.filter) as EmailFilter)
    : "all";
  const q = one(sp.q).slice(0, 200);
  const page = Math.max(0, Number.parseInt(one(sp.page), 10) || 0);
  const id = z.string().uuid().safeParse(one(sp.e)).success ? one(sp.e) : null;
  const [rows, open] = await Promise.all([listEmails(filter, q, page), id ? getEmail(id) : null]);
  const href = (patch: Record<string, string | number | null>) => {
    const s = new URLSearchParams();
    const all = { filter, q, page, e: id, ...patch };
    for (const [k, v] of Object.entries(all)) if (v && v !== "all") s.set(k, String(v));
    return `/admin/outreach/sent${s.size ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {EMAIL_FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ filter: f, page: 0, e: null })}
            className={cn(
              "rounded-full px-3 py-1 text-sm capitalize",
              f === filter ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {f}
          </Link>
        ))}
        <form action="/admin/outreach/sent" className="ml-auto w-full sm:w-64">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <Input name="q" defaultValue={q} placeholder="Search address or business" aria-label="Search emails" />
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card className="divide-y divide-border self-start">
          {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No emails here yet.</p>}
          {rows.map(({ email: e, prospect: p, variant }) => (
            <Link
              key={e.id}
              href={href({ e: e.id })}
              className={cn("block p-3 text-sm hover:bg-muted/60", e.id === id && "bg-muted/60")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{p.name}</span>
                <Badge tone={TONE[e.status]}>{e.status}</Badge>
              </div>
              <p className="truncate text-muted-foreground">{e.toAddress}</p>
              <p className="truncate">{e.subject}</p>
              <p className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {when.format(e.sentAt ?? e.createdAt)} UTC · {variant}
                </span>
                <span className="font-medium text-foreground">{outcome(e)}</span>
              </p>
            </Link>
          ))}
          {(page > 0 || rows.length === 40) && (
            <div className="flex justify-between p-3 text-sm">
              {page > 0 ? <Link href={href({ page: page - 1, e: null })}>Newer</Link> : <span />}
              {rows.length === 40 && <Link href={href({ page: page + 1, e: null })}>Older</Link>}
            </div>
          )}
        </Card>

        {open ? (
          <Detail row={open} />
        ) : (
          <Card className="hidden self-start p-6 text-sm text-muted-foreground lg:block">
            Pick an email to see exactly what was sent and the research behind it.
          </Card>
        )}
      </div>
    </div>
  );
}

function Detail({ row }: { row: NonNullable<Awaited<ReturnType<typeof getEmail>>> }) {
  const { email: e, prospect: p, variant, directory } = row;
  const r = p.research;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">
          To {e.toAddress}
          {e.fromAddress ? `, from ${e.fromAddress}` : ""}
        </p>
        <h2 className="mt-1 font-semibold">{e.subject}</h2>
        <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{e.body}</pre>
        {e.error && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{e.error}</p>}
        <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
          {e.status === "draft" && (
            <ActionButton
              action={discardDraftAction.bind(null, e.id)}
              label="Discard draft"
              ask="Discard this draft? This business won't be contacted."
            />
          )}
          <ActionButton
            action={blockDomainAction.bind(null, p.domain)}
            label={`Block ${p.domain}`}
            ask={`Never contact ${p.domain}?`}
          />
        </div>
      </Card>
      <Card className="p-5 text-sm">
        <h3 className="font-semibold">Why this business</h3>
        <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Website</dt>
          <dd>
            <a href={p.websiteUrl} target="_blank" rel="noreferrer" className="underline">
              {p.domain}
            </a>
          </dd>
          <dt className="text-muted-foreground">Found on</dt>
          <dd>
            <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="underline">
              {directory ?? p.sourceUrl}
            </a>
          </dd>
          <dt className="text-muted-foreground">Launch evidence</dt>
          <dd>{p.launchEvidence}</dd>
          <dt className="text-muted-foreground">Address found on</dt>
          <dd className="break-all">{p.emailSourceUrl}</dd>
          <dt className="text-muted-foreground">Classified as</dt>
          <dd>
            {p.classification?.kind} ({Math.round((p.classification?.confidence ?? 0) * 100)}%):{" "}
            {p.classification?.reason}
          </dd>
          <dt className="text-muted-foreground">Version</dt>
          <dd>{variant.name}</dd>
          {r && (
            <>
              <dt className="text-muted-foreground">What it does</dt>
              <dd>{r.summary}</dd>
              <dt className="text-muted-foreground">Domain Rating</dt>
              <dd>
                {p.name}: {r.pick.prospectAuthority}
                {r.pick.competitors.map((c) => `, ${c.name}: ${c.authority}`)}
              </dd>
            </>
          )}
        </dl>
        {r?.keywords.map((k) => (
          <details key={k.keyword} className="mt-3" open={k.keyword === r.pick.keyword}>
            <summary className="cursor-pointer font-medium">
              &ldquo;{k.keyword}&rdquo;{k.keyword === r.pick.keyword ? " (used)" : ""}
            </summary>
            <ol className="mt-2 space-y-1 text-muted-foreground">
              {k.results.map((s) => (
                <li key={`${s.position}-${s.url}`} className="truncate">
                  {s.position}. {s.domain}: {s.title}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </Card>
    </div>
  );
}
