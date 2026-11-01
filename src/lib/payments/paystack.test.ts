import { describe, expect, it, vi } from "vitest";
import { PaystackProvider, signPaystackBody } from "./paystack";
import { ProviderError, WebhookSignatureError } from "./types";

const KEY = "sk_test_123";

function fakeFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const fn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  });
  return fn;
}

function call(fn: ReturnType<typeof fakeFetch>, i = 0) {
  const [url, init] = fn.mock.calls[i] as unknown as [string, RequestInit];
  return { url, init, body: init.body ? JSON.parse(String(init.body)) : undefined };
}

describe("PaystackProvider", () => {
  it("initialises a USD transaction using the order id as reference", async () => {
    const fetch = fakeFetch({
      body: {
        status: true,
        message: "ok",
        data: { authorization_url: "https://checkout.paystack.com/abc", reference: "order-1" },
      },
    });
    const p = new PaystackProvider(KEY, fetch);
    const session = await p.createCheckout({
      orderId: "order-1",
      email: "a@b.com",
      amountCents: 9900,
      currency: "USD",
      description: "DebutYard: Starter",
      returnUrl: "https://debutyard.com/checkout/return?provider=paystack",
      cancelUrl: "https://debutyard.com/checkout/cancelled",
    });

    expect(session).toEqual({ url: "https://checkout.paystack.com/abc", providerRef: "order-1" });
    const { url, init, body } = call(fetch);
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(body).toMatchObject({ email: "a@b.com", amount: 9900, currency: "USD", reference: "order-1" });
    expect(body.metadata.order_id).toBe("order-1");
  });

  it("maps verify statuses, including string metadata", async () => {
    const p = new PaystackProvider(
      KEY,
      fakeFetch(
        {
          body: {
            status: true,
            message: "ok",
            data: {
              id: 1,
              reference: "r1",
              status: "success",
              amount: 9900,
              currency: "USD",
              metadata: '{"order_id":"o1"}',
            },
          },
        },
        {
          body: {
            status: true,
            message: "ok",
            data: { id: 2, reference: "r2", status: "abandoned", amount: 9900, currency: "USD" },
          },
        },
        {
          body: {
            status: true,
            message: "ok",
            data: { id: 3, reference: "r3", status: "ongoing", amount: 9900, currency: "USD" },
          },
        },
      ),
    );
    expect(await p.verifyPayment("r1")).toEqual({
      status: "paid",
      providerRef: "r1",
      orderId: "o1",
      amountCents: 9900,
      currency: "USD",
    });
    expect(await p.verifyPayment("r2")).toMatchObject({ status: "failed", providerRef: "r2" });
    expect(await p.verifyPayment("r3")).toEqual({ status: "pending", providerRef: "r3" });
  });

  it("raises ProviderError with Paystack's message on API errors", async () => {
    const p = new PaystackProvider(
      KEY,
      fakeFetch({ status: 400, body: { status: false, message: "Duplicate Transaction Reference" } }),
    );
    const err = await p.verifyPayment("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ message: "Paystack: Duplicate Transaction Reference", status: 400 });
  });

  it("accepts correctly signed webhooks and rejects others", async () => {
    const p = new PaystackProvider(KEY, fakeFetch());
    const raw = JSON.stringify({
      event: "charge.success",
      data: { id: 42, reference: "o1", metadata: { order_id: "o1" } },
    });

    const good = new Headers({ "x-paystack-signature": signPaystackBody(KEY, raw) });
    expect(await p.parseWebhook(raw, good)).toEqual({
      eventId: "charge.success:42:",
      type: "charge.success",
      kind: "payment_succeeded",
      providerRef: "o1",
      orderId: "o1",
    });

    await expect(p.parseWebhook(raw, new Headers({ "x-paystack-signature": "bad" }))).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
    await expect(p.parseWebhook(raw, new Headers())).rejects.toBeInstanceOf(WebhookSignatureError);
    const tampered = raw.replace("o1", "o2");
    await expect(p.parseWebhook(tampered, good)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("names plans without internal ids, since customers see the name", async () => {
    const fetch = fakeFetch({ body: { status: true, data: { plan_code: "PLN_1" } } });
    const { planId } = await new PaystackProvider(KEY, fetch).createPlan({
      sku: "sub_ad_home_sidebar_month",
      name: "DebutYard Homepage sidebar (monthly)",
      amountCents: 5900,
      interval: "monthly",
    });
    expect(planId).toBe("PLN_1");
    expect(call(fetch).body).toMatchObject({ name: "DebutYard Homepage sidebar (monthly)", interval: "monthly" });
  });

  it("normalises subscription events", async () => {
    const p = new PaystackProvider(KEY, fakeFetch());
    const raw = JSON.stringify({
      event: "subscription.create",
      data: {
        subscription_code: "SUB_1",
        email_token: "tok",
        status: "active",
        next_payment_date: "2026-11-26T00:00:00.000Z",
        customer: { email: "a@b.com" },
        plan: { plan_code: "PLN_1" },
      },
    });
    const event = await p.parseWebhook(raw, new Headers({ "x-paystack-signature": signPaystackBody(KEY, raw) }));
    expect(event).toMatchObject({
      kind: "subscription_updated",
      providerSubscriptionId: "SUB_1",
      status: "active",
      providerToken: "tok",
      customerEmail: "a@b.com",
      planId: "PLN_1",
    });
  });
});
