import type { Interval } from "./skus";

export type ProviderId = "paystack" | "paypal";

export type CheckoutRequest = {
  orderId: string;
  email: string;
  amountCents: number;
  currency: "USD";
  description: string;
  /** Where the provider sends the buyer after paying. */
  returnUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = {
  /** URL to redirect the buyer to. */
  url: string;
  /** Paystack reference or PayPal order id; stored on the order. */
  providerRef: string;
};

/** Result of asking the provider directly whether a payment succeeded. */
export type VerifiedPayment =
  | {
      status: "paid";
      providerRef: string;
      orderId: string;
      amountCents: number;
      currency: string;
      captureId?: string;
    }
  | { status: "pending"; providerRef: string }
  | { status: "failed"; providerRef: string; reason?: string };

export type SubscriptionRequest = {
  email: string;
  planId: string;
  /** Our subscriptions.id, echoed back by the provider. */
  subscriptionId: string;
  amountCents: number;
  returnUrl: string;
  cancelUrl: string;
};

export type SubscriptionSession = { url: string; providerSubscriptionId?: string; providerRef?: string };

/** A subscription's status as the provider sees it now. `pending`: not paid for yet. */
export type SubscriptionState = {
  status: "pending" | "active" | "non_renewing" | "past_due" | "cancelled";
  currentPeriodEnd?: Date;
  providerToken?: string;
};

export type PlanRequest = {
  sku: string;
  /** Customers see this on provider receipts and checkout, so no internal ids. */
  name: string;
  amountCents: number;
  interval: Interval;
};

/** Normalised webhook event; `kind: "ignored"` for events we don't act on. */
export type WebhookEvent =
  | { eventId: string; type: string; kind: "payment_succeeded"; providerRef: string; orderId?: string }
  | { eventId: string; type: string; kind: "payment_failed"; providerRef: string; reason?: string }
  | { eventId: string; type: string; kind: "refund_processed"; providerRef: string }
  | {
      eventId: string;
      type: string;
      kind: "subscription_updated";
      providerSubscriptionId: string;
      status: "active" | "non_renewing" | "past_due" | "cancelled";
      ourSubscriptionId?: string;
      providerToken?: string;
      currentPeriodEnd?: Date;
      /** Paystack doesn't echo our id on subscription events; we match on email + plan instead. */
      customerEmail?: string;
      planId?: string;
    }
  | { eventId: string; type: string; kind: "ignored" };

export interface PaymentProvider {
  readonly id: ProviderId;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Server-side verification; for PayPal this also captures the approved order. */
  verifyPayment(providerRef: string): Promise<VerifiedPayment>;
  refund(args: {
    providerRef: string;
    captureId?: string | null;
    amountCents: number;
    reason: string;
  }): Promise<{ providerRef: string }>;
  createPlan(req: PlanRequest): Promise<{ planId: string }>;
  createSubscription(req: SubscriptionRequest): Promise<SubscriptionSession>;
  cancelSubscription(args: { providerSubscriptionId: string; providerToken?: string | null }): Promise<void>;
  /** Fetches the subscription's current status (daily sync, in case a webhook was missed). */
  getSubscription(providerSubscriptionId: string): Promise<SubscriptionState>;
  /** Verifies the signature and normalises the event. Throws WebhookSignatureError when invalid. */
  parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent>;
}

export class WebhookSignatureError extends Error {}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}
