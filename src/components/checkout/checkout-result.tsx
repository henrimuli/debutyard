import { eq } from "drizzle-orm";
import { CheckoutBroadcast } from "@/app/(site)/checkout/broadcast";
import { ButtonLink } from "@/components/ui/button";
import { Heading } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { db, schema } from "@/db";
import { confirmPayment } from "@/lib/payments/service";

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * What the provider's redirect found, confirmed with the provider
 * server-side. `area` "dashboard" keeps every link inside the dashboard.
 */
export async function CheckoutResult({
  searchParams,
  area = "site",
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  area?: "site" | "dashboard";
}) {
  const params = await searchParams;
  const inDashboard = area === "dashboard";
  const provider = first(params.provider);

  if (first(params.subscription)) {
    return (
      <Message
        inDashboard={inDashboard}
        title="Subscription started"
        body="We'll email you as soon as the provider confirms it. This usually takes under a minute."
      />
    );
  }

  // Paystack sends ?reference=, PayPal sends ?token= (the PayPal order id).
  const ref =
    provider === "paystack" ? first(params.reference) : provider === "paypal" ? first(params.token) : undefined;
  if (!ref || (provider !== "paystack" && provider !== "paypal")) {
    return (
      <Message inDashboard={inDashboard} title="Nothing to confirm" body="We couldn't find a payment to confirm." />
    );
  }

  let order = null;
  try {
    order = await confirmPayment(provider, ref);
  } catch (err) {
    console.error("checkout return: confirm failed", err);
  }

  const broadcast = order && (
    <CheckoutBroadcast
      orderId={order.id}
      status={order.status === "paid" ? "paid" : order.status === "pending" ? "pending" : "failed"}
    />
  );

  if (order?.status === "paid" && order.kind === "submission") {
    const sub = await db().query.submissionOrders.findFirst({ where: eq(schema.submissionOrders.orderId, order.id) });
    if (sub) {
      return (
        <div className="space-y-4">
          <Heading className="text-2xl sm:text-2xl">Payment received. One more step</Heading>
          <p className="text-muted-foreground">
            Tell us about your product so we can start submitting. It takes about five minutes. We&apos;ve also emailed
            this link to {order.email}.
          </p>
          <ButtonLink href={`${inDashboard ? "/dashboard" : ""}/orders/${sub.intakeToken}`}>
            Add your product details
          </ButtonLink>
        </div>
      );
    }
  }
  if (order?.status === "paid" && order.kind === "launch") {
    return (
      <>
        {broadcast}
        <Message
          inDashboard={inDashboard}
          title="Payment received. Thank you!"
          body={`Your debut is booked and we've emailed a confirmation to ${order.email}.${inDashboard ? "" : " You can close this tab and head back to DebutYard."}`}
          href="/dashboard"
          cta="Go to your dashboard"
        />
      </>
    );
  }
  if (order?.status === "paid" && order.kind === "relaunch") {
    return (
      <>
        {broadcast}
        <Message
          inDashboard={inDashboard}
          title="Payment received. You're featured again"
          body={`Your listing is back in the featured section, and we've emailed a confirmation to ${order.email}.`}
          href="/dashboard/products"
          cta="See your products"
        />
      </>
    );
  }
  if (order?.status === "paid" && order.kind === "featured") {
    return (
      <>
        {broadcast}
        <Message
          title="Payment received. Your slot is booked"
          body={`It goes live at the start of the week you picked, and you can follow its impressions and clicks under Sponsorships. We've emailed a confirmation to ${order.email}.`}
          href="/dashboard/sponsorships"
          cta="See your sponsorships"
        />
      </>
    );
  }
  if (order?.status === "paid") {
    return (
      <>
        {broadcast}
        <Message
          inDashboard={inDashboard}
          title="Payment received. Thank you!"
          body={`We've emailed a confirmation to ${order.email}. Order reference: ${order.id}.`}
        />
      </>
    );
  }
  if (order?.status === "failed") {
    return (
      <>
        {broadcast}
        <Message
          inDashboard={inDashboard}
          title="Payment didn't go through"
          body={order.failureReason ?? "Your payment was declined. You haven't been charged."}
          retry
        />
      </>
    );
  }
  return (
    <>
      {broadcast}
      <Message
        inDashboard={inDashboard}
        title="Payment processing"
        body={`We're waiting for confirmation from the payment provider. You'll get an email as soon as it arrives. If you have questions, write to ${site.supportEmail}.`}
      />
    </>
  );
}

function Message({
  title,
  body,
  retry,
  href,
  cta,
  inDashboard,
}: {
  title: string;
  body: string;
  retry?: boolean;
  href?: string;
  cta?: string;
  inDashboard?: boolean;
}) {
  const home = retry || inDashboard;
  return (
    <div className="space-y-4">
      <Heading className="text-2xl sm:text-2xl">{title}</Heading>
      <p className="text-muted-foreground">{body}</p>
      <ButtonLink href={href ?? (home ? "/dashboard" : "/")} variant={retry || href ? "primary" : "outline"}>
        {cta ?? (home ? "Back to your dashboard" : "Back to DebutYard")}
      </ButtonLink>
    </div>
  );
}
