import { centsToDecimal, decimalToCents, requestJson, type FetchLike } from "./http";
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

type Link = { href: string; rel: string };

type Capture = {
  id: string;
  status: string;
  amount: { value: string; currency_code: string };
  custom_id?: string;
};

type PaypalOrder = {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  links?: Link[];
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    payments?: { captures?: Capture[] };
  }>;
};

export type PaypalConfig = {
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  environment: "sandbox" | "live";
};

const BRAND = "DebutYard";

export class PaypalProvider implements PaymentProvider {
  readonly id = "paypal" as const;
  private token?: { value: string; expiresAt: number };
  private productId?: string;

  constructor(
    private readonly config: PaypalConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private get baseUrl() {
    return this.config.environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const data = await requestJson<{ access_token: string; expires_in: number }>(
      this.fetchImpl,
      "PayPal",
      `${this.baseUrl}/v1/oauth2/token`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      },
    );
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async call<T>(path: string, init: RequestInit & { requestId?: string } = {}): Promise<T> {
    const { requestId, ...rest } = init;
    return requestJson<T>(this.fetchImpl, "PayPal", `${this.baseUrl}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
        ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
        ...rest.headers,
      },
    });
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const order = await this.call<PaypalOrder>("/v2/checkout/orders", {
      method: "POST",
      requestId: `order-${req.orderId}`,
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: req.orderId,
            custom_id: req.orderId,
            description: req.description.slice(0, 127),
            amount: { currency_code: req.currency, value: centsToDecimal(req.amountCents) },
          },
        ],
        payment_source: {
          paypal: {
            email_address: req.email,
            experience_context: {
              brand_name: BRAND,
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
              return_url: req.returnUrl,
              cancel_url: req.cancelUrl,
            },
          },
        },
      }),
    });
    const url = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!url) throw new Error("PayPal did not return an approval link");
    return { url, providerRef: order.id };
  }

  private paidFrom(order: PaypalOrder): VerifiedPayment {
    const unit = order.purchase_units?.[0];
    const capture = unit?.payments?.captures?.find((c) => c.status === "COMPLETED");
    if (!capture) return { status: "pending", providerRef: order.id };
    return {
      status: "paid",
      providerRef: order.id,
      orderId: capture.custom_id ?? unit?.custom_id ?? unit?.reference_id ?? "",
      amountCents: decimalToCents(capture.amount.value),
      currency: capture.amount.currency_code,
      captureId: capture.id,
    };
  }

  async verifyPayment(orderId: string): Promise<VerifiedPayment> {
    const order = await this.call<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    if (order.status === "COMPLETED") return this.paidFrom(order);
    if (order.status === "VOIDED") return { status: "failed", providerRef: order.id, reason: "Order voided" };
    if (order.status !== "APPROVED") return { status: "pending", providerRef: order.id };

    const captured = await this.call<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      requestId: `capture-${orderId}`,
    });
    const result = this.paidFrom(captured);
    if (
      result.status === "pending" &&
      captured.purchase_units?.[0]?.payments?.captures?.some((c) => c.status === "DECLINED")
    ) {
      return { status: "failed", providerRef: order.id, reason: "Capture declined" };
    }
    return result;
  }

  async refund(args: { providerRef: string; captureId?: string | null; amountCents: number; reason: string }) {
    if (!args.captureId) throw new Error("PayPal refunds need the capture id");
    const data = await this.call<{ id: string }>(`/v2/payments/captures/${encodeURIComponent(args.captureId)}/refund`, {
      method: "POST",
      requestId: `refund-${args.captureId}-${args.amountCents}`,
      body: JSON.stringify({
        amount: { value: centsToDecimal(args.amountCents), currency_code: "USD" },
        note_to_payer: args.reason.slice(0, 255),
      }),
    });
    return { providerRef: data.id };
  }

  private async ensureProduct(): Promise<string> {
    if (this.productId) return this.productId;
    const product = await this.call<{ id: string }>("/v1/catalogs/products", {
      method: "POST",
      requestId: "debutyard-subscriptions-product",
      body: JSON.stringify({ name: `${BRAND} subscriptions`, type: "SERVICE", category: "SOFTWARE" }),
    });
    this.productId = product.id;
    return product.id;
  }

  async createPlan(req: PlanRequest) {
    const productId = await this.ensureProduct();
    const plan = await this.call<{ id: string }>("/v1/billing/plans", {
      method: "POST",
      requestId: `plan-${req.sku}-${req.amountCents}`,
      body: JSON.stringify({
        product_id: productId,
        name: req.name,
        status: "ACTIVE",
        billing_cycles: [
          {
            frequency: {
              interval_unit: req.interval === "weekly" ? "WEEK" : req.interval === "monthly" ? "MONTH" : "YEAR",
              interval_count: 1,
            },
            tenure_type: "REGULAR",
            sequence: 1,
            total_cycles: 0,
            pricing_scheme: { fixed_price: { value: centsToDecimal(req.amountCents), currency_code: "USD" } },
          },
        ],
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
      }),
    });
    return { planId: plan.id };
  }

  async createSubscription(req: SubscriptionRequest): Promise<SubscriptionSession> {
    const sub = await this.call<{ id: string; links?: Link[] }>("/v1/billing/subscriptions", {
      method: "POST",
      requestId: `sub-${req.subscriptionId}`,
      body: JSON.stringify({
        plan_id: req.planId,
        custom_id: req.subscriptionId,
        subscriber: { email_address: req.email },
        application_context: {
          brand_name: BRAND,
          user_action: "SUBSCRIBE_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: req.returnUrl,
          cancel_url: req.cancelUrl,
        },
      }),
    });
    const url = sub.links?.find((l) => l.rel === "approve")?.href;
    if (!url) throw new Error("PayPal did not return a subscription approval link");
    return { url, providerSubscriptionId: sub.id };
  }

  async cancelSubscription(args: { providerSubscriptionId: string }) {
    await this.call(`/v1/billing/subscriptions/${encodeURIComponent(args.providerSubscriptionId)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "Cancelled by customer" }),
    });
  }

  async getSubscription(id: string): Promise<SubscriptionState> {
    const sub = await this.call<{ status: string; billing_info?: { next_billing_time?: string } }>(
      `/v1/billing/subscriptions/${encodeURIComponent(id)}`,
    );
    const status: Record<string, SubscriptionState["status"]> = {
      APPROVAL_PENDING: "pending",
      APPROVED: "pending",
      ACTIVE: "active",
      SUSPENDED: "past_due",
      CANCELLED: "cancelled",
      EXPIRED: "cancelled",
    };
    const next = sub.billing_info?.next_billing_time;
    return { status: status[sub.status] ?? "past_due", currentPeriodEnd: next ? new Date(next) : undefined };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent> {
    if (!this.config.webhookId) throw new Error("Missing environment variables: PAYPAL_WEBHOOK_ID");
    const event = JSON.parse(rawBody) as { id: string; event_type: string; resource: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

    const verification = await this.call<{ verification_status: string }>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: JSON.stringify({
          auth_algo: headers.get("paypal-auth-algo"),
          cert_url: headers.get("paypal-cert-url"),
          transmission_id: headers.get("paypal-transmission-id"),
          transmission_sig: headers.get("paypal-transmission-sig"),
          transmission_time: headers.get("paypal-transmission-time"),
          webhook_id: this.config.webhookId,
          webhook_event: event,
        }),
      },
    );
    if (verification.verification_status !== "SUCCESS") {
      throw new WebhookSignatureError("Invalid PayPal webhook signature");
    }

    const r = event.resource ?? {};
    const base = { eventId: event.id, type: event.event_type };
    const nextBilling = r.billing_info?.next_billing_time ? new Date(r.billing_info.next_billing_time) : undefined;

    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED":
        return {
          ...base,
          kind: "payment_succeeded",
          providerRef: r.supplementary_data?.related_ids?.order_id ?? "",
          orderId: r.custom_id,
        };
      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED":
        return {
          ...base,
          kind: "payment_failed",
          providerRef: r.supplementary_data?.related_ids?.order_id ?? "",
          reason: event.event_type,
        };
      case "PAYMENT.CAPTURE.REFUNDED":
        return { ...base, kind: "refund_processed", providerRef: r.id ?? "" };
      case "PAYMENT.SALE.COMPLETED": {
        // A subscription payment. It doesn't say when the next one is due, so ask.
        if (!r.billing_agreement_id) return { ...base, kind: "ignored" };
        const state = await this.getSubscription(r.billing_agreement_id);
        return {
          ...base,
          kind: "subscription_updated",
          providerSubscriptionId: r.billing_agreement_id,
          ourSubscriptionId: r.custom,
          status: "active",
          currentPeriodEnd: state.currentPeriodEnd,
        };
      }
      case "BILLING.SUBSCRIPTION.ACTIVATED":
      case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
        return {
          ...base,
          kind: "subscription_updated",
          providerSubscriptionId: r.id,
          ourSubscriptionId: r.custom_id,
          status: "active",
          currentPeriodEnd: nextBilling,
        };
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
        return {
          ...base,
          kind: "subscription_updated",
          providerSubscriptionId: r.id,
          ourSubscriptionId: r.custom_id,
          status: "cancelled",
        };
      case "BILLING.SUBSCRIPTION.SUSPENDED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        return {
          ...base,
          kind: "subscription_updated",
          providerSubscriptionId: r.id,
          ourSubscriptionId: r.custom_id,
          status: "past_due",
        };
      default:
        return { ...base, kind: "ignored" };
    }
  }
}
