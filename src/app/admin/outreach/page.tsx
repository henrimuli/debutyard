import { ActionButton, SettingsForm } from "@/components/outreach/controls";
import { Badge, Card } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { canSend, mailboxProblems } from "@/lib/outreach/mailbox";
import { canGoLive, missingForPipeline, sentToday, sentTodayByMailbox } from "@/lib/outreach/pipeline";
import { dailyActivity, funnel, mailboxRows, sendsLookIgnored, sourceRows } from "@/lib/outreach/queries";
import { dailyTarget, IGNORED_AFTER, MAILBOX_DAILY_CAP } from "@/lib/outreach/rules";
import { getSettings } from "@/lib/outreach/settings";
import { formatUsd } from "@/lib/payments/skus";
import { sendTestAction } from "./actions";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "–");

const MODE_LABEL = { off: "Off", dry_run: "Dry run", live: "Live" } as const;

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export default async function OutreachOverviewPage() {
  await requireStaff("/admin/outreach");
  const now = new Date();
  const [settings, f, days, sources, today, boxes, byBox, ignored] = await Promise.all([
    getSettings(),
    funnel(),
    dailyActivity(now),
    sourceRows(),
    sentToday(now),
    mailboxRows(),
    sentTodayByMailbox(now),
    sendsLookIgnored(now),
  ]);
  const problems = mailboxProblems();
  const m = f.emails;
  const missing = missingForPipeline();
  const stages = [
    ["Waiting to check", f.prospects.discovered ?? 0],
    ["Qualified", f.prospects.qualified ?? 0],
    ["Researched", f.prospects.researched ?? 0],
    ["Drafted or sent", f.prospects.drafted ?? 0],
    ["Rejected", f.prospects.rejected ?? 0],
    ["Failed", f.prospects.failed ?? 0],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Controls</h2>
          <Badge tone={settings.mode === "live" ? "success" : "default"}>{MODE_LABEL[settings.mode]}</Badge>
          <span className="text-sm text-muted-foreground">
            {today} of {dailyTarget(settings.dailyLimit, boxes.length)} sent today
          </span>
        </div>
        {settings.pausedReason && (
          <p role="alert" className="mt-3 rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            Sending stopped itself because of {settings.pausedReason}. Choose Live again when you&apos;re ready.
          </p>
        )}
        {ignored && (
          <p role="status" className="mt-3 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            The latest {IGNORED_AFTER} emails got no clicks or replies, so they may be landing in spam. Send a test to
            your own Gmail and Outlook to see, and consider new wording under Experiments.
          </p>
        )}
        <div className="mt-4">
          <SettingsForm
            initial={{ mode: settings.mode, dailyLimit: settings.dailyLimit, maxAuthority: settings.maxAuthority }}
            canGoLive={canGoLive()}
            mailboxCount={boxes.length}
            capacity={boxes.length * MAILBOX_DAILY_CAP}
          />
        </div>
        {missing.length > 0 && (
          <p className="mt-5 border-t border-border pt-4 text-sm text-red-700 dark:text-red-300">
            Missing: {missing.join(", ")}
          </p>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Mailboxes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {boxes.length === 0
                ? "Not set up: add OUTREACH_MAILBOXES and OUTREACH_SMTP_HOST."
                : `${boxes.length} sending, ${boxes.length * MAILBOX_DAILY_CAP} a day between them. Add one to OUTREACH_MAILBOXES and redeploy for ${MAILBOX_DAILY_CAP} more.`}
            </p>
          </div>
          {canSend() && <ActionButton action={sendTestAction} label="Send a test from each mailbox" />}
        </div>
        {problems.length > 0 && (
          <ul role="alert" className="mt-3 rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {boxes.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Address</th>
                  <th className="py-1 text-right font-medium">Today</th>
                  <th className="py-1 text-right font-medium">Sent</th>
                  <th className="py-1 text-right font-medium">Bounced</th>
                  <th className="py-1 text-right font-medium">Replied</th>
                  <th className="py-1 pl-4 font-medium">Reading replies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border align-top tabular-nums">
                {boxes.map((b) => (
                  <tr key={b.address}>
                    <td className="py-1.5">
                      <span className="break-all">{b.address}</span>
                      {b.state?.sendError && (
                        <p className="text-xs text-red-700 dark:text-red-300">Can&apos;t send: {b.state.sendError}</p>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {byBox[b.address] ?? 0} of {MAILBOX_DAILY_CAP}
                    </td>
                    <td className="py-1.5 text-right">{b.totals.sent}</td>
                    <td className="py-1.5 text-right">{pct(b.totals.bounced, b.totals.sent)}</td>
                    <td className="py-1.5 text-right">{b.totals.replied}</td>
                    <td className="py-1.5 pl-4">
                      {!b.canRead ? (
                        "Not set up: add OUTREACH_IMAP_HOST"
                      ) : b.state?.imapError ? (
                        <span className="text-red-700 dark:text-red-300">Failed: {b.state.imapError}</span>
                      ) : b.state?.imapCheckedAt ? (
                        `Checked ${when.format(b.state.imapCheckedAt)} UTC`
                      ) : (
                        "Not checked yet"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section aria-labelledby="outreach-results">
        <h2 id="outreach-results" className="font-semibold">
          Results
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Sent" value={m.sent} hint={`${m.drafts} drafts waiting`} />
          <Stat label="Clicked" value={m.clicked} hint={pct(m.clicked, m.sent)} />
          <Stat label="Replied" value={m.replied} hint={`${m.positive} positive, ${pct(m.positive, m.sent)}`} />
          <Stat label="Orders" value={m.orders} hint={m.revenueCents ? formatUsd(m.revenueCents) : "None yet"} />
          <Stat label="Bounced" value={m.bounced} hint={`${pct(m.bounced, m.sent)} (stops at 5%)`} />
          <Stat label="Unsubscribed" value={m.unsubscribed} hint={pct(m.unsubscribed, m.sent)} />
          <Stat label="Complaints" value={m.complained} hint="One stops sending" />
          <Stat label="Failed sends" value={m.failed} hint="Never retried" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Pipeline</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {stages.map(([label, n]) => (
              <li key={label} className="flex justify-between py-2">
                <span>{label}</span>
                <span className="tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
          {f.reasons.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-medium">Why sites were rejected</h3>
              <ul className="mt-2 divide-y divide-border text-sm">
                {f.reasons.map((r) => (
                  <li key={r.reason ?? "none"} className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">{(r.reason ?? "unknown").replaceAll("_", " ")}</span>
                    <span className="tabular-nums">{r.n}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Starred directories</h2>
          {sources.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Star a directory to crawl it.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {sources.map((s) => (
                <li key={s.id} className="py-2">
                  <div className="flex justify-between gap-3">
                    <a href={s.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      {s.name}
                    </a>
                    <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {s.totalFound ?? 0} found
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.lastCrawledAt ? `Read ${when.format(s.lastCrawledAt)} UTC, ${s.lastFound} new` : "Not read yet"}
                  </p>
                  {s.lastError && <p className="text-xs text-red-700 dark:text-red-300">{s.lastError}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-x-auto p-5">
        <h2 className="font-semibold">Last 14 days</h2>
        {days.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <table className="mt-3 w-full min-w-[32rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Day (UTC)</th>
                <th className="py-1 text-right font-medium">Sent</th>
                <th className="py-1 text-right font-medium">Clicked</th>
                <th className="py-1 text-right font-medium">Replied</th>
                <th className="py-1 text-right font-medium">Positive</th>
                <th className="py-1 text-right font-medium">Bounced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {days.map((d) => (
                <tr key={d.day}>
                  <td className="py-1.5">{d.day}</td>
                  <td className="py-1.5 text-right">{d.sent}</td>
                  <td className="py-1.5 text-right">{d.clicked}</td>
                  <td className="py-1.5 text-right">{d.replied}</td>
                  <td className="py-1.5 text-right">{d.positive}</td>
                  <td className="py-1.5 text-right">{d.bounced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
