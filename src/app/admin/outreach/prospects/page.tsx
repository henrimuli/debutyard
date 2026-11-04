import Link from "next/link";
import { ActionButton, LiveSearch } from "@/components/outreach/controls";
import { ListPager } from "@/components/outreach/list-pager";
import { Badge, Card } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { listProspects, listSuppressions, PROSPECT_FILTERS, type ProspectFilter } from "@/lib/outreach/queries";
import { cn } from "@/lib/utils";
import { blockDomainAction, retryProspectAction } from "../actions";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const pageParam = (raw: string) => Math.max(0, Number.parseInt(raw, 10) || 0);

export default async function OutreachProspectsPage(props: PageProps<"/admin/outreach/prospects">) {
  await requireStaff("/admin/outreach/prospects");
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filter = (PROSPECT_FILTERS as readonly string[]).includes(one(sp.filter))
    ? (one(sp.filter) as ProspectFilter)
    : "all";
  const q = one(sp.q).slice(0, 200);
  const [{ rows, page, pageCount }, blocked] = await Promise.all([
    listProspects(filter, q, pageParam(one(sp.page))),
    listSuppressions(pageParam(one(sp.blocked))),
  ]);
  const href = (patch: Record<string, string | number>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ filter, q, page, blocked: blocked.page, ...patch }))
      if (v && v !== "all") s.set(k, String(v));
    return `/admin/outreach/prospects${s.size ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {PROSPECT_FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ filter: f, page: 0 })}
            className={cn(
              "rounded-full px-3 py-1 text-sm capitalize",
              f === filter ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {f}
          </Link>
        ))}
        <LiveSearch
          action="/admin/outreach/prospects"
          value={q}
          filter={filter !== "all" ? filter : undefined}
          placeholder="Search domain or name"
          label="Search prospects"
          className="ml-auto w-full sm:w-64"
        />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Business</th>
              <th className="p-3 font-medium">Found on</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Why</th>
              <th className="p-3 font-medium">Updated</th>
              <th className="p-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground">
                  {q
                    ? "No prospects match that search."
                    : "No prospects here yet. Turn on a dry run and the next research run starts finding them."}
                </td>
              </tr>
            )}
            {rows.map(({ prospect: p, directory }) => (
              <tr key={p.id}>
                <td className="p-3">
                  <a href={p.websiteUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {p.name}
                  </a>
                  <p className="text-xs text-muted-foreground">{p.domain}</p>
                  {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                </td>
                <td className="p-3 text-muted-foreground">
                  {directory ?? "–"}
                  <p className="text-xs">{p.launchEvidence}</p>
                </td>
                <td className="p-3">
                  <Badge tone={p.status === "drafted" ? "success" : "default"}>{p.status}</Badge>
                </td>
                <td className="max-w-xs p-3 text-muted-foreground">
                  {p.reason && <p className="font-medium text-foreground">{p.reason.replaceAll("_", " ")}</p>}
                  {p.reasonDetail && <p className="text-xs break-words">{p.reasonDetail}</p>}
                </td>
                <td className="whitespace-nowrap p-3 text-muted-foreground">{day.format(p.updatedAt)}</td>
                <td className="p-3">
                  {p.status === "rejected" || p.status === "failed" ? (
                    <ActionButton action={retryProspectAction.bind(null, p.id)} label="Try again" />
                  ) : (
                    <ActionButton
                      action={blockDomainAction.bind(null, p.domain)}
                      label="Block"
                      ask={`Never contact ${p.domain}?`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ListPager page={page} pageCount={pageCount} href={(n) => href({ page: n })} />
      </Card>

      <Card id="never-contact" className="scroll-mt-4 p-5">
        <h2 className="font-semibold">Never contact</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Unsubscribes, hard bounces, people who said no, and anything blocked by hand.
        </p>
        {blocked.rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nobody yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {blocked.rows.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="break-all">{b.value}</span>
                <span className="text-muted-foreground">
                  {b.reason.replaceAll("_", " ")}, {day.format(b.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ListPager
          page={blocked.page}
          pageCount={blocked.pageCount}
          href={(n) => `${href({ blocked: n })}#never-contact`}
        />
      </Card>
    </div>
  );
}
