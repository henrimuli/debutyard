import { Suspense, type ReactNode } from "react";
import { AccountFooter } from "@/components/app-shell/account-footer";
import { AppShell, type NavGroup } from "@/components/app-shell/app-shell";
import { InboxBadge, OrderMailBadge } from "@/components/support/live-inbox";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { openPerkCounts } from "@/lib/perks/service";
import { orderMailPulse } from "@/lib/submissions/inbox";
import { inboxPulse } from "@/lib/support/service";

const navGroups = (perks: { newsletter: number; blog: number }, unread: number, orderMail: number): NavGroup[] => [
  { items: [{ href: "/admin/dashboard", label: "Overview", icon: "overview" }] },
  {
    label: "Operations",
    items: [
      { href: "/admin/review", label: "Review queue", icon: "review" },
      {
        href: "/admin/submissions",
        label: "Submissions",
        icon: "inbox",
        badge: <OrderMailBadge initial={orderMail} />,
      },
      { href: "/admin/directories", label: "Directories", icon: "directory" },
      { href: "/admin/ads", label: "Ads", icon: "megaphone" },
      { href: "/admin/email", label: "Email", icon: "mail", badge: <InboxBadge initial={unread} /> },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/blog", label: "Blog", icon: "pen", count: perks.blog },
      { href: "/admin/newsletter", label: "Newsletter", icon: "mail", count: perks.newsletter },
    ],
  },
  {
    label: "People",
    items: [
      // Affiliates are paused (see src/lib/affiliates/PAUSED.md).
      // { href: "/admin/affiliates", label: "Affiliates", icon: "gift" },
      { href: "/admin/users", label: "Admin users", icon: "users" },
    ],
  },
];

/** The admin area: its own space with a sidebar, no site header or footer. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <AdminFrame>{children}</AdminFrame>
    </Suspense>
  );
}

/** Staff get the sidebar; everyone else sees the page's own sign-in redirect or "admins only" view, centred. */
async function AdminFrame({ children }: { children: ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  if (!(await isStaff(user))) return <main className="flex flex-1 items-center justify-center">{children}</main>;
  // Paid perks waiting on the team and unread mail; a failed count never blocks the admin.
  const [perks, { unread }, orderMail] = await Promise.all([
    openPerkCounts().catch(() => ({ newsletter: 0, blog: 0 })),
    inboxPulse().catch(() => ({ unread: 0 })),
    orderMailPulse().catch(() => ({ unread: 0 })),
  ]);
  return (
    <AppShell
      area="Admin"
      badge="Admin"
      groups={navGroups(perks, unread, orderMail.unread)}
      footer={
        <Suspense fallback={<div className="h-12 animate-pulse rounded-md bg-muted" />}>
          <AccountFooter area="admin" />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
