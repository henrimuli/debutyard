import { notFound } from "next/navigation";
import { z } from "zod";
import { InboxShell, ThreadList, ThreadView, type InboxParams } from "@/components/outreach/inbox-view";
import { requireStaff } from "@/lib/auth";
import {
  getThread,
  listThreads,
  markThreadRead,
  outreachUnread,
  THREAD_FILTERS,
  type ThreadFilter,
} from "@/lib/outreach/inbox";
import { canSend } from "@/lib/outreach/mailbox";

export default async function OutreachInboxPage(props: PageProps<"/admin/outreach/inbox">) {
  await requireStaff("/admin/outreach/inbox");
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const p: InboxParams = {
    filter: (THREAD_FILTERS as readonly string[]).includes(one(sp.filter)) ? (one(sp.filter) as ThreadFilter) : "open",
    q: one(sp.q).slice(0, 200),
    page: Math.max(0, Number.parseInt(one(sp.page), 10) || 0),
    t: z.string().uuid().safeParse(one(sp.t)).success ? one(sp.t) : null,
  };

  if (p.t) {
    await markThreadRead(p.t);
    const [data, unread] = await Promise.all([getThread(p.t), outreachUnread()]);
    if (!data) notFound();
    return (
      <InboxShell filter={p.filter} unread={unread}>
        <ThreadView p={p} data={data} canReply={canSend()} />
      </InboxShell>
    );
  }

  const [rows, unread] = await Promise.all([listThreads(p.filter, p.page, p.q), outreachUnread()]);
  return (
    <InboxShell filter={p.filter} unread={unread}>
      <ThreadList p={p} rows={rows} now={new Date()} />
    </InboxShell>
  );
}
