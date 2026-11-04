import Link from "next/link";
import { threadStatusAction, threadUnreadAction } from "@/app/admin/outreach/actions";
import { Icon, type IconName } from "@/components/app-shell/icons";
import { InboxToolbar, LiveSearch, ReplyBox } from "@/components/outreach/controls";
import { longTime, MessageText, shortTime } from "@/components/support/message-parts";
import { Badge } from "@/components/ui/primitives";
import { snippetFrom } from "@/lib/support/rules";
import { cn } from "@/lib/utils";
import type { getThread, listThreads, ThreadFilter } from "@/lib/outreach/inbox";

/** The outreach inbox, laid out like the support inbox at /admin/email. */

export type InboxParams = { filter: ThreadFilter; q: string; page: number; t: string | null };

const FILTER_NAV: Array<{ filter: ThreadFilter; label: string; icon: IconName }> = [
  { filter: "open", label: "Inbox", icon: "inbox" },
  { filter: "done", label: "Done", icon: "check" },
  { filter: "all", label: "All mail", icon: "mail" },
];

const CLASS_TONE: Record<string, "success" | "accent" | "default"> = {
  interested: "success",
  question: "success",
  complaint: "accent",
  unsubscribe: "accent",
};

function ClassBadge({ kind }: { kind: string | null }) {
  if (!kind) return null;
  return (
    <Badge tone={CLASS_TONE[kind] ?? "default"} className="w-fit shrink-0 px-2 py-0 text-[11px] capitalize">
      {kind.replaceAll("_", " ")}
    </Badge>
  );
}

export function inboxHref(p: Partial<InboxParams>) {
  const s = new URLSearchParams();
  if (p.filter && p.filter !== "open") s.set("filter", p.filter);
  if (p.q) s.set("q", p.q);
  if (p.page) s.set("page", String(p.page));
  if (p.t) s.set("t", p.t);
  return `/admin/outreach/inbox${s.size ? `?${s}` : ""}`;
}

export function InboxShell({
  filter,
  unread,
  children,
}: {
  filter: ThreadFilter;
  unread: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <nav aria-label="Reply folders" className="flex shrink-0 flex-col gap-3 lg:w-48">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {FILTER_NAV.map((f) => (
            <Link
              key={f.filter}
              href={inboxHref({ filter: f.filter })}
              aria-current={filter === f.filter ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-full px-4 py-1.5 text-sm",
                filter === f.filter
                  ? "bg-primary/15 font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon name={f.icon} className="size-[18px]" />
              <span className="flex-1 whitespace-nowrap">{f.label}</span>
              {f.filter === "open" && unread > 0 && <span className="text-xs font-semibold">{unread}</span>}
            </Link>
          ))}
        </div>
        <p className="hidden px-4 text-xs leading-relaxed text-muted-foreground lg:block">
          Replies to your cold emails land here, separate from the support inbox. Warm-up mail is left out.
        </p>
      </nav>
      <section className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">{children}</section>
    </div>
  );
}

export function ThreadList({
  p,
  rows,
  now,
}: {
  p: InboxParams;
  rows: Awaited<ReturnType<typeof listThreads>>;
  now: Date;
}) {
  const label = FILTER_NAV.find((f) => f.filter === p.filter)?.label;
  const more = rows.length === 40;
  return (
    <div>
      <LiveSearch
        action="/admin/outreach/inbox"
        value={p.q}
        filter={p.filter !== "open" ? p.filter : undefined}
        placeholder={`Search ${label?.toLowerCase() ?? "replies"}`}
        label="Search replies"
        className="flex items-center gap-2 border-b border-border px-3 py-2"
        inputClassName="h-11 w-full rounded-full bg-muted px-4 text-base outline-none sm:h-10 sm:text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring border-0"
      />
      <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
        <span>
          {label}
          {p.q && ` · results for "${p.q}"`}
        </span>
        <span className="flex items-center gap-1">
          {p.page > 0 && (
            <Link href={inboxHref({ ...p, t: null, page: p.page - 1 })} className="rounded px-2 py-1 hover:bg-muted">
              ‹ Newer
            </Link>
          )}
          {more && (
            <Link href={inboxHref({ ...p, t: null, page: p.page + 1 })} className="rounded px-2 py-1 hover:bg-muted">
              Older ›
            </Link>
          )}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          {p.q ? "No replies match that search." : p.filter === "open" ? "No replies waiting." : "Nothing here."}
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map(({ thread: r, business, messageCount }) => (
            <li
              key={r.id}
              // The same unread treatment as the support inbox: text and bar carry the difference.
              className={r.unread ? "bg-card shadow-[inset_3px_0_0_var(--color-primary)]" : "bg-muted/40"}
            >
              <Link
                href={inboxHref({ ...p, t: r.id })}
                className="flex items-start gap-2 px-4 py-2.5 hover:shadow-[inset_0_-1px_0_var(--color-border),0_1px_3px_rgb(0_0_0/0.08)] sm:items-center sm:gap-4"
              >
                <span
                  className={cn(
                    "w-36 shrink-0 truncate text-sm sm:w-48",
                    r.unread ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {business ?? r.contactName ?? r.contactEmail}
                  {messageCount > 1 && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{messageCount}</span>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                  <ClassBadge kind={r.replyClass} />
                  <span
                    className={cn(
                      "truncate text-sm",
                      r.unread ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {r.subject || "(no subject)"}
                  </span>
                  <span
                    className={cn(
                      "hidden truncate text-sm sm:inline",
                      r.unread ? "text-muted-foreground" : "text-muted-foreground/70",
                    )}
                  >
                    – {r.snippet}
                  </span>
                </span>
                <time
                  className={cn("shrink-0 text-xs", r.unread ? "font-semibold text-primary" : "text-muted-foreground")}
                >
                  {shortTime(r.lastMessageAt, now)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type ThreadData = NonNullable<Awaited<ReturnType<typeof getThread>>>;

/** One message, folded the way the support inbox folds them. */
function MessageCard({
  who,
  address,
  out,
  at,
  text,
  open,
}: {
  who: string;
  address: string;
  out: boolean;
  at: Date | null;
  text: string;
  open: boolean;
}) {
  return (
    <details open={open} className="group rounded-xl border border-border">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold",
            out ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {who.trim().charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold">{who}</span>
            <span className="truncate text-xs text-muted-foreground">{out ? `via ${address}` : `<${address}>`}</span>
          </span>
          <span className="block truncate text-xs text-muted-foreground group-open:hidden">
            {snippetFrom(text, 160)}
          </span>
        </span>
        {at && <time className="shrink-0 text-xs text-muted-foreground">{longTime(at)}</time>}
      </summary>
      <div className="px-4 pb-4 sm:pl-16">
        <MessageText text={text} />
      </div>
    </details>
  );
}

export function ThreadView({ p, data, canReply }: { p: InboxParams; data: ThreadData; canReply: boolean }) {
  const { thread: t, email, prospect, messages } = data;
  const backHref = inboxHref({ ...p, t: null });
  return (
    <div>
      <InboxToolbar
        backHref={backHref}
        done={t.status === "done"}
        setStatus={threadStatusAction.bind(null, t.id, t.status === "done" ? "open" : "done")}
        markUnread={threadUnreadAction.bind(null, t.id)}
      />
      <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <h2 className="flex-1 font-display text-xl font-semibold tracking-tight sm:text-2xl">
              {t.subject || "(no subject)"}
            </h2>
            {t.status === "done" && <Badge className="mt-1.5 capitalize">Done</Badge>}
          </div>
          <ol className="mt-5 space-y-3">
            {email && (
              <li>
                <MessageCard
                  who="Your first email"
                  address={email.fromAddress ?? t.mailbox ?? ""}
                  out
                  at={email.sentAt}
                  text={email.body}
                  open={false}
                />
              </li>
            )}
            {messages.map((m, i) => (
              <li key={m.id}>
                <MessageCard
                  who={m.direction === "out" ? "You" : (m.fromName ?? m.fromAddress)}
                  address={m.fromAddress}
                  out={m.direction === "out"}
                  at={m.createdAt}
                  text={m.text}
                  open={i >= messages.length - 2 || messages.length <= 3}
                />
              </li>
            ))}
          </ol>
          <div className="mt-5">
            <ReplyBox threadId={t.id} disabled={!canReply} />
          </div>
        </div>
        <aside className="h-fit space-y-3 rounded-xl border border-border p-4 text-sm">
          <div>
            <p className="font-semibold">{prospect?.name ?? t.contactName ?? t.contactEmail}</p>
            <p className="break-all text-xs text-muted-foreground">{t.contactEmail}</p>
          </div>
          <ClassBadge kind={t.replyClass} />
          {prospect ? (
            <a
              href={`https://${prospect.domain}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="block break-all text-xs font-medium text-primary hover:underline"
            >
              {prospect.domain}
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Not matched to a sent email.</p>
          )}
          {t.mailbox && (
            <div className="text-xs">
              <p className="text-muted-foreground">Answers go from</p>
              <p className="break-all">{t.mailbox}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
