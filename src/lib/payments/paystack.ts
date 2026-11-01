import { createHmac, timingSafeEqual } from "node:crypto";
import { requestJson, type FetchLike } from "./http";
import {
  WebhookSignatureError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentProvider,
  type PlanRequest,
  type SubscriptionRequest,
  type SubscriptionState,
  type SubscriptionSession,
  type VerifiedPayment,
  type WebhookEvent,
} from "./types";

const BASE_URL = "https://api.paystack.co";

type Envelope<T> = { status: boolean; message: string; data: T };

type Transaction = {
  id: number;
  reference: string;
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "processing" | "queued" | "reversed";
  amount: number;
  currency: string;
  gateway_response?: string;
  metadata?: unknown;
};

/** Paystack returns metadata as an object, or as a JSON string on some endpoints. */
function readMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
}

export function signPaystackBody(secretKey: string, rawBody: string): string {
  return createHmac("sha512", secretKey).update(rawBody).digest("hex");
}

export class PaystackProvider implements PaymentProvider {
  readonly id = "paystack" as const;

  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private call<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
    return requestJson<Envelope<T>>(this.fetchImpl, "Paystack", `${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    // The order id doubles as the Paystack reference, which makes retries idempotent.
    const { data } = await this.call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: req.email,
        amount: req.amountCents,
        currency: req.currency,
        reference: req.orderId,
        callback_url: req.returnUrl,
        metadata: { order_id: req.orderId, cancel_action: req.cancelUrl, description: req.description },
      }),
    });
    return { url: data.authorization_url, providerRef: data.reference };
  }

  async verifyPayment(reference: string): Promise<VerifiedPayment> {
    const { data } = await this.call<Transaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (data.status === "success") {
      const orderId = String(readMetadata(data.metadata).order_id ?? data.reference);
      return {
        status: "paid",
        providerRef: data.reference,
        orderId,
        amountCents: data.amount,
        currency: data.currency,
      };
    }
    if (data.status === "failed" || data.status === "abandoned" || data.status === "reversed") {
      return { status: "failed", providerRef: data.reference, reason: data.gateway_response ?? data.status };
    }
    return { status: "pending", providerRef: data.reference };
  }

  async refund(args: { providerRef: string; amountCents: number; reason: string }) {
    const { data } = await this.call<{ id?: number; transaction?: { reference?: string } }>("/refund", {
      method: "POST",
      body: JSON.stringify({
        transaction: args.providerRef,
        amount: args.amountCents,
        merchant_note: args.reason,
      }),
    });
    return { providerRef: String(data.id ?? args.providerRef) };
  }

  async createPlan(req: PlanRequest) {
    const { data } = await this.call<{ plan_code: string }>("/plan", {
      method: "POST",
      body: JSON.stringify({
        name: req.name,
        interval: req.interval,
        amount: req.amountCents,
        currency: "USD",
      }),
    });
    return { planId: data.plan_code };
  }

  async createSubscription(req: SubscriptionRequest): Promise<SubscriptionSession> {
    // Initialising a transaction with a plan subscribes the customer once they pay.
    const { data } = await this.call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: req.email,
        amount: req.amountCents,
        currency: "USD",
        plan: req.planId,
        callback_url: req.returnUrl,
        metadata: { subscription_id: req.subscriptionId, cancel_action: req.cancelUrl },
      }),
    });
    return { url: data.authorization_url, providerRef: data.reference };
  }

  async cancelSubscription(args: { providerSubscriptionId: string; providerToken?: string | null }) {
    if (!args.providerToken) throw new Error("Paystack needs the subscription email token to cancel.");
    await this.call("/subscription/disable", {
      method: "POST",
      body: JSON.stringify({ code: args.providerSubscriptionId, token: args.providerToken }),
    });
  }

  async getSubscription(code: string): Promise<SubscriptionState> {
    const { data } = await this.call<{ status: string; next_payment_date?: string | null; email_token?: string }>(
      `/subscription/${encodeURIComponent(code)}`,
    );
    const status: Record<string, SubscriptionState["status"]> = {
      active: "active",
      "non-renewing": "non_renewing",
      attention: "past_due",
      completed: "cancelled",
      complete: "cancelled",
      cancelled: "cancelled",
    };
    return {
      status: status[data.status] ?? "past_due",
      currentPeriodEnd: data.next_payment_date ? new Date(data.next_payment_date) : undefined,
      providerToken: data.email_token,
    };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent> {
    const signature = headers.get("x-paystack-signature") ?? "";
    const expected = signPaystackBody(this.secretKey, rawBody);
    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookSignatureError("Invalid Paystack signature");
    }

    const event = JSON.parse(rawBody) as { event: string; data: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const d = event.data ?? {};
    // Paystack events carry no id of their own; derive a stable one per event + object.
    const objectId = d.id ?? d.reference ?? d.subscription_code ?? d.subscription?.subscription_code ?? "unknown";
    const eventId = `${event.event}:${objectId}:${d.status ?? ""}`;
    const type = event.event;

    switch (event.event) {
      case "charge.success": {
        const meta = readMetadata(d.metadata);
        return {
          eventId,
          type,
          kind: "payment_succeeded",
          providerRef: d.reference,
          orderId: typeof meta.order_id === "string" ? meta.order_id : undefined,
        };
      }
      case "charge.failed":
        return { eventId, type, kind: "payment_failed", providerRef: d.reference, reason: d.gateway_response };
      case "refund.processed":
        return {
          eventId,
          type,
          kind: "refund_processed",
          providerRef: d.transaction_reference ?? d.transaction?.reference ?? "",
        };
      case "subscription.create":
        return {
          eventId,
          type,
          kind: "subscription_updated",
          providerSubscriptionId: d.subscription_code,
          status: "active",
          providerToken: d.email_token,
          currentPeriodEnd: d.next_payment_date ? new Date(d.next_payment_date) : undefined,
          customerEmail: d.customer?.email,
          planId: d.plan?.plan_code,
        };
      case "subscription.not_renew":
        return {
          eventId,
          type,
          kind: "subscription_updated",
          providerSubscriptionId: d.subscription_code,
          status: "non_renewing",
        };
      case "subscription.disable":
        return {
          eventId,
          type,
          kind: "subscription_updated",
          providerSubscriptionId: d.subscription_code,
          status: "cancelled",
        };
      case "invoice.payment_failed":
        return {
          eventId,
          type,
          kind: "subscription_updated",
          providerSubscriptionId: d.subscription?.subscription_code,
          status: "past_due",
        };
      case "invoice.update":
        if (d.paid && d.subscription?.subscription_code) {
          return {
            eventId,
            type,
            kind: "subscription_updated",
            providerSubscriptionId: d.subscription.subscription_code,
            status: "active",
            currentPeriodEnd: d.subscription.next_payment_date ? new Date(d.subscription.next_payment_date) : undefined,
          };
        }
        return { eventId, type, kind: "ignored" };
      default:
        return { eventId, type, kind: "ignored" };
    }
  }
}
