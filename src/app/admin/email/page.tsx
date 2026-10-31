import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Icon, type IconName } from "@/components/app-shell/icons";
import { ComposeLauncher } from "@/components/support/compose-window";
import { MessageHtml, ReplyBox, SentEmail, StarToggle, ThreadToolbar } from "@/components/support/thread-parts";
import { Badge } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { requireStaff } from "@/lib/auth";
import { LiveRefresh } from "@/components/support/live-inbox";
import { baseSubject, isRichHtml, replySubject, snippetFrom, splitQuoted, supportKeyFrom } from "@/lib/support/rules";
import {
  FOLDERS,
  folderCounts,
  getThread,
  listThreads,
  setUnread,
  staffMembers,
  type Folder,
} from "@/lib/support/service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Email · Admin", robots: { index: false } };

const FOLDER_NAV: Array<{
  folder: Folder;
  label: string;
  icon: IconName;
  count?: "inbox" | "mine" | "unassigned" | "spam";
}> = [
  { folder: "inbox", label: "Inbox", icon: "inbox", count: "inbox" },
  { folder: "starred", label: "Starred", icon: "star" },
  { folder: "sent", label: "Sent", icon: "send" },
  { folder: "done", label: "Done", icon: "check" },
  { folder: "spam", label: "Spam", icon: "alert", count: "spam" },
  { folder: "trash", label: "Trash", icon: "trash" },
];
const VIEW_NAV: typeof FOLDER_NAV = [
  { folder: "mine", label: "Assigned to me", icon: "users", count: "mine" },
  { folder: "unassigned", label: "Unassigned", icon: "dot", count: "unassigned" },
];

type Params = { folder: Folder; q: string; page: number; t: string | null };

function href(p: Partial<Params> & { folder: Folder }) {
  const s = new URLSearchParams({ folder: p.folder });
  if (p.q) s.set("q", p.q);
  if (p.page) s.set("page", String(p.page));
  if (p.t) s.set("t", p.t);
  return `/admin/email?${s}`;
}

const TZ = "Africa/Nairobi";
/** "14:02" today, "28 Oct" this year, "28/10/2025" before. */
function shortTime(at: Date, now: Date) {
  const day = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: TZ });
  if (day(at) === day(now)) return at.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  if (at.getUTCFullYear() === now.getUTCFullYear())
    return at.toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
  return day(at);
}
const longTime = (at: Date) =>
  at.toLocaleString("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function EmailPage(props: PageProps<"/admin/email">) {
  return (
    <div className="mx-auto max-w-7xl">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Mailbox searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Mailbox({ searchParams }: Pick<PageProps<"/admin/email">, "searchParams">) {
  const me = await requireStaff("/admin/email");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const folder = (FOLDERS as readonly string[]).includes(one(sp.folder)) ? (one(sp.folder) as Folder) : "inbox";
  const p: Params = {
    folder,
    q: one(sp.q).slice(0, 200),
    page: Math.max(0, Number.parseInt(one(sp.page), 10) || 0),
    t: z.string().uuid().safeParse(one(sp.t)).success ? one(sp.t) : null,
  };
  const counts = await folderCounts(me.id);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <nav aria-label="Mail folders" className="flex shrink-0 flex-col gap-3 lg:w-56">
        <ComposeLauncher className="self-start" />
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {FOLDER_NAV.map((f) => (
            <FolderLink key={f.folder} item={f} active={folder === f.folder} n={f.count ? counts[f.count] : 0} />
          ))}
          <p className="hidden px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:block">
            Views
          </p>
          {VIEW_NAV.map((f) => (
            <FolderLink key={f.folder} item={f} active={folder === f.folder} n={f.count ? counts[f.count] : 0} />
          ))}
        </div>
        <LiveRefresh />
        <p className="hidden px-4 text-xs leading-relaxed text-muted-foreground lg:block">
          Mail to {site.supportEmail} lands here. Everyone on the admin team shares this inbox.
        </p>
      </nav>
      <section className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        {p.t ? <ThreadView p={p} me={me.id} /> : <ThreadList p={p} me={me.id} />}
      </section>
    </div>
  );
}

function FolderLink({ item, active, n }: { item: (typeof FOLDER_NAV)[number]; active: boolean; n: number }) {
  return (
    <Link
      href={href({ folder: item.folder })}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-full px-4 py-1.5 text-sm",
        active
          ? "bg-primary/15 font-semibold text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon name={item.icon} className="size-[18px]" />
      <span className="flex-1 whitespace-nowrap">{item.label}</span>
      {n > 0 && <span className={cn("text-xs", active || item.count === "inbox" ? "font-semibold" : "")}>{n}</span>}
    </Link>
  );
}

async function ThreadList({ p, me }: { p: Params; me: string }) {
  const { rows, more } = await listThreads({ folder: p.folder, me, q: p.q, page: p.page });
  const now = new Date();
  const label = [...FOLDER_NAV, ...VIEW_NAV].find((f) => f.folder === p.folder)?.label;
  return (
    <div>
      <form action="/admin/email" className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input type="hidden" name="folder" value={p.folder} />
        <input
          name="q"
          defaultValue={p.q}
          placeholder={`Search ${label?.toLowerCase() ?? "mail"}`}
          aria-label="Search mail"
          className="h-11 w-full rounded-full bg-muted px-4 text-base outline-none sm:h-10 sm:text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>
      <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
        <span>
          {label}
          {p.q && ` · results for "${p.q}"`}
        </span>
        <span className="flex items-center gap-1">
          {p.page > 0 && (
            <Link href={href({ ...p, t: null, page: p.page - 1 })} className="rounded px-2 py-1 hover:bg-muted">
              ‹ Newer
            </Link>
          )}
          {more && (
            <Link href={href({ ...p, t: null, page: p.page + 1 })} className="rounded px-2 py-1 hover:bg-muted">
              Older ›
            </Link>
          )}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          {p.q ? "No conversations match that search." : p.folder === "inbox" ? "Inbox zero. Nice." : "Nothing here."}
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((r) => (
            <li
              key={r.id}
              // Unread: full-strength text and a green bar on the left. Read: dimmed text on a
              // muted background. Text and bar carry the difference, since dark backgrounds barely differ.
              className={cn(
                "relative",
                r.unread ? "bg-card shadow-[inset_3px_0_0_var(--color-primary)]" : "bg-muted/40",
              )}
            >
              <Link
                href={href({ ...p, t: r.id })}
                className="flex items-start gap-2 py-2.5 pl-11 pr-4 hover:shadow-[inset_0_-1px_0_var(--color-border),0_1px_3px_rgb(0_0_0/0.08)] sm:items-center sm:gap-4"
              >
                <span
                  className={cn(
                    "w-36 shrink-0 truncate text-sm sm:w-48",
                    r.unread ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {r.contactName || r.contactEmail}
                  {r.messageCount > 1 && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{r.messageCount}</span>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                  {r.maker && (
                    <Badge tone="primary" className="w-fit shrink-0 px-2 py-0 text-[11px]">
                      Maker
                    </Badge>
                  )}
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
                {r.assigneeName && p.folder !== "mine" && (
                  <span className="hidden shrink-0 rounded-full bg-muted px-2 text-xs text-muted-foreground md:inline">
                    {r.assigneeName.split(" ")[0]}
                  </span>
                )}
                <time
                  className={cn("shrink-0 text-xs", r.unread ? "font-semibold text-primary" : "text-muted-foreground")}
                >
                  {shortTime(r.lastMessageAt, now)}
                </time>
              </Link>
              <StarToggle
                threadId={r.id}
                starred={r.starred}
                className="absolute left-2 top-2 sm:top-1/2 sm:-translate-y-1/2"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function ThreadView({ p, me }: { p: Params; me: string }) {
  const [data, staff] = await Promise.all([getThread(p.t!), staffMembers()]);
  if (!data) notFound();
  const { thread, messages, customer, maker } = data;
  if (thread.unread) await setUnread([thread.id], false);

  const isOurs = (a: string) => supportKeyFrom(a, site.supportEmail) !== null;
  const lastIn = messages.findLast((m) => m.direction === "in");
  const replyTo = lastIn?.fromAddress ?? thread.contactEmail;
  const others = lastIn
    ? [...lastIn.toAddresses, ...lastIn.ccAddresses]
        .map((a) => a.toLowerCase())
        .filter((a) => !isOurs(a) && a !== replyTo)
    : [];
  const base = baseSubject(thread.subject) || thread.subject;
  const defaults = {
    reply: { to: [replyTo], cc: [], subject: replySubject(thread.subject) },
    replyAll: { to: [replyTo], cc: [...new Set(others)], subject: replySubject(thread.subject) },
    forward: { to: [], cc: [], subject: `Fwd: ${base}` },
  };
  const backHref = href({ ...p, t: null });

  return (
    <div>
      <ThreadToolbar
        threadId={thread.id}
        status={thread.status}
        assigneeId={thread.assigneeId}
        staff={staff}
        backHref={backHref}
      />
      <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <h1 className="flex-1 font-display text-xl font-semibold tracking-tight sm:text-2xl">
              {thread.subject || "(no subject)"}
            </h1>
            {thread.status !== "open" && <Badge className="mt-1.5 capitalize">{thread.status}</Badge>}
            <StarToggle threadId={thread.id} starred={thread.starred} className="mt-0.5" />
          </div>
          <ol className="mt-5 space-y-3">
            {messages.map((m, i) => {
              const out = m.direction === "out";
              const who = out ? (m.authorName ?? "DebutYard") : (m.fromName ?? m.fromAddress);
              return (
                <li key={m.id}>
                  <details
                    open={i >= messages.length - 2 || messages.length <= 3}
                    className="group rounded-xl border border-border"
                  >
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
                          {(out || m.fromName) && (
                            <span className="truncate text-xs text-muted-foreground">
                              {out ? `via ${m.fromAddress}` : `<${m.fromAddress}>`}
                            </span>
                          )}
                          {!out && maker && m.fromAddress === thread.contactEmail && (
                            <Badge tone="primary" className="px-2 py-0 text-[11px]">
                              Maker
                            </Badge>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground group-open:hidden">
                          {snippetFrom(m.text, 160)}
                        </span>
                        <span className="hidden truncate text-xs text-muted-foreground group-open:block">
                          to {[...m.toAddresses, ...m.ccAddresses].join(", ")}
                        </span>
                      </span>
                      <time className="shrink-0 text-xs text-muted-foreground">{longTime(m.createdAt)}</time>
                    </summary>
                    <div className="px-4 pb-4 sm:pl-16">
                      {!out && isRichHtml(m.html) ? <MessageHtml html={m.html!} /> : <MessageText text={m.text} />}
                      {out && m.html && <SentEmail html={m.html} />}
                      {m.attachments.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {m.attachments.map((a) => (
                            <li key={a.id}>
                              <a
                                href={`/admin/email/attachment/${m.id}/${a.id}`}
                                target="_blank"
                                rel="noopener"
                                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                              >
                                <Icon name="clip" />
                                <span className="max-w-48 truncate">{a.filename ?? "attachment"}</span>
                                <span className="text-xs text-muted-foreground">
                                  {Math.max(1, Math.round(a.size / 1024))} KB
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
          <div className="mt-5">
            <ReplyBox threadId={thread.id} defaults={defaults} />
          </div>
        </div>
        <CustomerCard
          email={thread.contactEmail}
          name={thread.contactName}
          customer={customer}
          mine={thread.assigneeId === me}
        />
      </div>
    </div>
  );
}

function CustomerCard({
  email,
  name,
  customer,
  mine,
}: {
  email: string;
  name: string | null;
  customer: NonNullable<Awaited<ReturnType<typeof getThread>>>["customer"];
  mine: boolean;
}) {
  return (
    <aside className="h-fit space-y-4 rounded-xl border border-border p-4 text-sm">
      <div>
        <p className="font-semibold">{customer?.name ?? name ?? email}</p>
        <p className="break-all text-xs text-muted-foreground">{email}</p>
        {mine && <p className="mt-1 text-xs text-primary">Assigned to you</p>}
      </div>
      {!customer ? (
        <p className="text-xs text-muted-foreground">No DebutYard account with this email.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>
                {customer.joinedAt.toLocaleDateString("en-GB", { timeZone: TZ, month: "short", year: "numeric" })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Paid orders</dt>
              <dd>{customer.paidOrders}</dd>
            </div>
          </dl>
          {customer.subscriptions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Subscriptions</p>
              {customer.subscriptions.map((s) => (
                <p key={s.sku} className="text-xs">
                  {s.sku} <span className="text-muted-foreground">· {s.status.replace("_", " ")}</span>
                </p>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Products {customer.products.length > 0 && `(${customer.products.length})`}
            </p>
            {customer.products.length === 0 ? (
              <p className="text-xs">None yet</p>
            ) : (
              <ul className="space-y-1">
                {customer.products.map((pr) => (
                  <li key={pr.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link href={`/p/${pr.slug}`} className="truncate font-medium hover:underline">
                      {pr.name}
                    </Link>
                    <span className="shrink-0 text-muted-foreground">
                      {pr.tier.replace("_", " ")} · {pr.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

// [label](url) as written in our composer, or a bare URL.
const LINK = /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;

function Linked({ text }: { text: string }) {
  return text.split(LINK).map((part, i) => {
    if (i % 2 === 0) return part;
    const md = part.match(/^\[([^\]]+)\]\((.+)\)$/);
    return (
      <a
        key={i}
        href={md ? md[2] : part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium text-primary underline underline-offset-2"
      >
        {md ? md[1] : part}
      </a>
    );
  });
}

/**
 * A plain message in the page's own colours. The history the sender's mail app
 * quoted under it is folded away behind "•••", as in Gmail.
 */
function MessageText({ text }: { text: string }) {
  const { own, quoted } = splitQuoted(text);
  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {own ? <Linked text={own} /> : quoted ? null : "(empty message)"}
      {quoted && (
        <details className="mt-2">
          <summary
            aria-label="Show quoted text"
            title="Show quoted text"
            className="inline-block cursor-pointer list-none rounded bg-muted px-2 text-xs leading-4 text-muted-foreground hover:bg-muted/70 [&::-webkit-details-marker]:hidden"
          >
            •••
          </summary>
          <div className="mt-2 border-l-2 border-border pl-3 text-muted-foreground">
            <Linked text={quoted} />
          </div>
        </details>
      )}
    </div>
  );
}
