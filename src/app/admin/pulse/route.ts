import { getCurrentUser, isStaff } from "@/lib/auth";
import { orderMailPulse } from "@/lib/submissions/inbox";
import { inboxPulse } from "@/lib/support/service";

/**
 * Staff only: what the admin polls for new mail in the support inbox and the
 * order inboxes. A route rather than a server action because actions run one at
 * a time, and a poll this frequent would hold up the ones people click.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!(await isStaff(user))) return new Response("Not allowed", { status: 403 });
  const [support, orderMail] = await Promise.all([inboxPulse(), orderMailPulse()]);
  return Response.json({ ...support, orderMail }, { headers: { "Cache-Control": "no-store" } });
}
