import Link from "next/link";
import { z } from "zod";
import { ActionButton, ReplyBox } from "@/components/outreach/controls";
import { longTime, MessageText, shortTime } from "@/components/support/message-parts";
import { Badge, Card } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { getThread, listThreads, markThreadRead, THREAD_FILTERS, type ThreadFilter } from "@/lib/outreach/inbox";
import { canSend } from "@/lib/outreach/mailbox";
import { cn } from "@/lib/utils";
import { threadStatusAction } from "../actions";

const CLASS_TONE: Record<string, "success" | "accent" | "default"> = {
  interested: "success",
  question: "success",
  complaint: "accent",
  unsubscribe: "accent",
};

function ClassBadge({ kind }: { kind: string | null }) {
  if (!kind) return null;
  return <Badge tone={CLASS_TONE[kind] ?? "default"}>{kind.replaceAll("_", " ")}</Badge>;
}

export default async function OutreachInboxPage(props: PageProps<"/admin/outreach/inbox">) {
  await requireStaff("/admin/outreach/inbox");
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filter = (THREAD_FILTERS as readonly string[]).includes(one(sp.filter))
    ? (one(sp.filter) as ThreadFilter)
    : "open";
  const page = Math.max(0, Number.parseInt(one(sp.page), 10) || 0);
  const id = z.string().uuid().safeParse(one(sp.t)).success ? one(sp.t) : null;
  if (id) await markThreadRead(id);
  const [rows, open] = await Promise.all([listThreads(filter, page), id ? getThread(id) : null]);
  const now = new Date();
  const href = (patch: Record<string, string | number | null>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ filter, page, t: id, ...patch })) {
      if (v && v !== "open") s.set(k, String(v));
    }
    return `/admin/outreach/inbox${s.size ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {THREAD_FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ filter: f, page: 0, t: null })}
            className={cn(
              "rounded-full px-3 py-1 text-sm capitalize",
              f === filter ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {f}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="divide-y divide-border self-start">
          {rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {filter === "open" ? "No replies waiting." : "Nothing here."}
            </p>
          )}
          {rows.map(({ thread: t, business }) => (
            <Link
              key={t.id}
              href={href({ t: t.id })}
              className={cn("block p-3 text-sm hover:bg-muted/60", t.id === id && "bg-muted/60")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("truncate", t.unread && t.id !== id ? "font-semibold" : "font-medium")}>
                  {business ?? t.contactName ?? t.contactEmail}
                </span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {shortTime(t.lastMessageAt, now)}
                </span>
              </div>
              <p className="truncate text-muted-foreground">{t.snippet || t.subject}</p>
              <div className="mt-1">
                <ClassBadge kind={t.replyClass} />
              </div>
            </Link>
          ))}
          {(page > 0 || rows.length === 40) && (
            <div className="flex justify-between p-3 text-sm">
              {page > 0 ? <Link href={href({ page: page - 1, t: null })}>Newer</Link> : <span />}
              {rows.length === 40 && <Link href={href({ page: page + 1, t: null })}>Older</Link>}
            </div>
          )}
        </Card>

        {open ? (
          <Thread data={open} />
        ) : (
          <Card className="hidden self-start p-6 text-sm text-muted-foreground lg:block">
            Replies to your cold emails land here, separate from the support inbox. Pick one to read and answer it.
          </Card>
        )}
      </div>
    </div>
  );
}

function Thread({ data }: { data: NonNullable<Awaited<ReturnType<typeof getThread>>> }) {
  const { thread: t, email, prospect, messages } = data;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">{t.subject || "(no subject)"}</h2>
            <p className="text-sm text-muted-foreground">
              {t.contactEmail}
              {prospect ? ` · ${prospect.name} (${prospect.domain})` : " · not matched to a sent email"}
            </p>
            <div className="mt-2">
              <ClassBadge kind={t.replyClass} />
            </div>
          </div>
          <ActionButton
            action={threadStatusAction.bind(null, t.id, t.status === "open" ? "done" : "open")}
            label={t.status === "open" ? "Mark done" : "Reopen"}
          />
        </div>
      </Card>
      {email && (
        <details className="rounded-lg border border-border bg-card p-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Your first email{email.sentAt ? `, ${longTime(email.sentAt)}` : ""}
          </summary>
          <pre className="mt-3 whitespace-pre-wrap break-words font-sans leading-relaxed">{email.body}</pre>
        </details>
      )}
      {messages.map((m) => (
        <Card key={m.id} className={cn("p-4", m.direction === "out" && "border-primary/30 bg-primary/5")}>
          <p className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>{m.direction === "in" ? (m.fromName ?? m.fromAddress) : `You, from ${m.fromAddress}`}</span>
            <span>{longTime(m.createdAt)}</span>
          </p>
          <MessageText text={m.text} />
        </Card>
      ))}
      <ReplyBox threadId={t.id} disabled={!canSend()} />
    </div>
  );
}
