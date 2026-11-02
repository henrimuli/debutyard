import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/app-shell/icons";
import { OrderMailRefresh } from "@/components/support/live-inbox";
import { Badge, Heading } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { orderMailPulse } from "@/lib/submissions/inbox";
import { PACKAGES } from "@/lib/submissions/packages";
import { listOrdersForOps } from "@/lib/submissions/service";

export const metadata: Metadata = { title: "Submissions · Admin", robots: { index: false } };

const COLUMNS = [
  ["awaiting_intake", "Waiting for intake"],
  ["queued", "Queued"],
  ["in_progress", "In progress"],
  ["delivered", "Delivered"],
] as const;

export default function SubmissionsAdminPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <Heading className="text-2xl sm:text-3xl">Submission orders</Heading>
      <Suspense fallback={<p className="mt-8 text-muted-foreground">Loading…</p>}>
        <Board />
      </Suspense>
    </div>
  );
}

async function Board() {
  await requireStaff();
  const [rows, mail] = await Promise.all([listOrdersForOps(), orderMailPulse()]);
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <OrderMailRefresh rendered={mail} />
      {COLUMNS.map(([status, label]) => {
        const items = rows.filter((r) => r.o.status === status);
        return (
          <section key={status} className="rounded-lg bg-muted/40 p-3">
            <h2 className="mb-3 text-sm font-semibold">
              {label} <span className="text-muted-foreground">{items.length}</span>
            </h2>
            <ul className="space-y-2">
              {items.map(({ o, live, total, open, assignee, overdue: late, unreadMail }) => {
                return (
                  <li key={o.id}>
                    <Link
                      // An order with unread mail goes straight to its inbox.
                      href={`/admin/submissions/${o.id}${unreadMail > 0 ? "?view=inbox" : ""}`}
                      className={`block rounded-md border bg-card p-3 text-sm hover:border-primary/50 ${unreadMail > 0 ? "border-primary/60" : "border-border"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{o.productName ?? o.email}</span>
                        <Badge>{PACKAGES[o.package].label}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {total > 0 ? `${live}/${total} live · ${open} open` : "No targets yet"}
                        {assignee && ` · ${assignee}`}
                      </p>
                      {o.dueAt && (
                        <p className={`mt-1 text-xs ${late ? "text-danger" : "text-muted-foreground"}`}>
                          {late ? "Overdue: " : "Due "}
                          {o.dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                      )}
                      {unreadMail > 0 && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
                          <Icon name="mail" className="size-3.5" />
                          {unreadMail} unread {unreadMail === 1 ? "email" : "emails"}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
