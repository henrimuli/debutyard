import Link from "next/link";
import { Icon } from "@/components/app-shell/icons";
import { longTime, MessageText, shortTime } from "@/components/support/message-parts";
import { MessageHtml } from "@/components/support/thread-parts";
import type { messagesFor } from "@/lib/submissions/inbox";
import { messageLinks } from "@/lib/submissions/inbox-rules";
import { isRichHtml, parseAddress, snippetFrom } from "@/lib/support/rules";
import { cn } from "@/lib/utils";
import { AddressBox, MessageToolbar } from "./order-inbox-controls";

type Message = Awaited<ReturnType<typeof messagesFor>>[number];

/** Mail that directories send to this order's address, laid out like the admin mailbox. */
export function OrderInbox({
  orderId,
  address,
  messages,
  unread,
  opened,
}: {
  orderId: string;
  address: string | null;
  messages: Message[];
  unread: number;
  opened: Message | null;
}) {
  const listHref = `/admin/submissions/${orderId}?view=inbox`;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="space-y-3 border-b border-border p-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"
            >
              <Icon name="inbox" className="size-[18px]" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold leading-tight tracking-tight">Inbox</h2>
              <p className="text-xs text-muted-foreground">
                {messages.length === 0
                  ? "No mail yet"
                  : `${unread} unread · ${messages.length} ${messages.length === 1 ? "email" : "emails"}`}
              </p>
            </div>
          </div>
          {address && <AddressBox address={address} />}
        </div>
        <p className="text-sm text-muted-foreground">
          {address
            ? "Use this address when creating directory accounts. Verification emails land here."
            : "Set INBOUND_EMAIL_DOMAIN and RESEND_WEBHOOK_SECRET, with receiving on for that domain in Resend, to get mail here."}
        </p>
      </header>
      {opened ? (
        <OpenMessage message={opened} backHref={listHref} />
      ) : messages.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          Nothing here yet. New mail shows up on its own.
        </p>
      ) : (
        <MessageList messages={messages} listHref={listHref} />
      )}
    </section>
  );
}

function MessageList({ messages, listHref }: { messages: Message[]; listHref: string }) {
  const now = new Date();
  return (
    <ul className="divide-y divide-border">
      {messages.map((m) => {
        const from = parseAddress(m.fromAddress);
        const isUnread = !m.readAt;
        const snippet = snippetFrom(m.text);
        return (
          <li
            key={m.id}
            // The same unread look as the admin mailbox: full-strength text and a green bar on the left.
            className={isUnread ? "bg-card shadow-[inset_3px_0_0_var(--color-primary)]" : "bg-muted/40"}
          >
            <Link
              // Opening marks it read, so only a real click may load it.
              prefetch={false}
              href={`${listHref}&m=${m.id}`}
              className="flex items-start gap-2 px-4 py-2.5 hover:shadow-[inset_0_-1px_0_var(--color-border),0_1px_3px_rgb(0_0_0/0.08)] sm:items-center sm:gap-4 sm:px-5"
            >
              <span
                className={cn(
                  "w-36 shrink-0 truncate text-sm sm:w-48",
                  isUnread ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {from.name || from.email}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                <span
                  className={cn(
                    "truncate text-sm",
                    isUnread ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {m.subject || "(no subject)"}
                </span>
                {snippet && (
                  <span
                    className={cn(
                      "hidden truncate text-sm sm:inline",
                      isUnread ? "text-muted-foreground" : "text-muted-foreground/70",
                    )}
                  >
                    – {snippet}
                  </span>
                )}
              </span>
              <time
                className={cn("shrink-0 text-xs", isUnread ? "font-semibold text-primary" : "text-muted-foreground")}
              >
                {shortTime(m.receivedAt, now)}
              </time>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function OpenMessage({ message: m, backHref }: { message: Message; backHref: string }) {
  const from = parseAddress(m.fromAddress);
  const who = from.name || from.email;
  const links = messageLinks(m.text, m.html);
  const verify = links.filter((l) => l.likely);
  const others = links.filter((l) => !l.likely);
  return (
    <div>
      <MessageToolbar messageId={m.id} backHref={backHref} />
      <div className="space-y-4 p-4 sm:p-6">
        <h3 className="font-display text-xl font-semibold tracking-tight">{m.subject || "(no subject)"}</h3>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground"
          >
            {who.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-semibold">{who}</span>
              {from.name && <span className="truncate text-xs text-muted-foreground">&lt;{from.email}&gt;</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">to {m.toAddress}</p>
          </div>
          <time className="shrink-0 text-xs text-muted-foreground">{longTime(m.receivedAt)}</time>
        </div>
        {verify.length > 0 && (
          <ul className="space-y-2">
            {verify.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="block truncate rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:underline"
                >
                  Verify: {l.url}
                </a>
              </li>
            ))}
          </ul>
        )}
        {isRichHtml(m.html) ? <MessageHtml html={m.html!} /> : <MessageText text={m.text} />}
        {others.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Other links in this email ({others.length})</summary>
            <ul className="mt-2 space-y-1">
              {others.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="block truncate hover:underline"
                  >
                    {l.url}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
