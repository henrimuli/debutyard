import { describe, expect, it, vi } from "vitest";
import { PaypalProvider } from "./paypal";
import { WebhookSignatureError } from "./types";

const config = { clientId: "id", clientSecret: "secret", webhookId: "WH-1", environment: "sandbox" as const };
const token = { body: { access_token: "A21", expires_in: 3600 } };

function fakeFetch(...responses: Array<{ status?: number; body: unknown }>) {
  return vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  });
}

function call(fn: ReturnType<typeof fakeFetch>, i: number) {
  const [url, init] = fn.mock.calls[i] as unknown as [string, RequestInit];
  const raw = init.body ? String(init.body) : undefined;
  const body = raw?.startsWith("{") ? JSON.parse(raw) : raw;
  return { url, init, headers: init.headers as Record<string, string>, body };
}

describe("PaypalProvider", () => {
  it("creates an order with our id and returns the payer-action link", async () => {
    const fetch = fakeFetch(token, {
      body: {
        id: "PP-1",
        status: "PAYER_ACTION_REQUIRED",
        links: [{ rel: "payer-action", href: "https://paypal.com/pay?token=PP-1" }],
      },
    });
    const p = new PaypalProvider(config, fetch);
    const session = await p.createCheckout({
      orderId: "o1",
      email: "a@b.com",
      amountCents: 17900,
      currency: "USD",
      description: "DebutYard: Growth",
      returnUrl: "https://debutyard.com/r",
      cancelUrl: "https://debutyard.com/c",
    });
    expect(session).toEqual({ url: "https://paypal.com/pay?token=PP-1", providerRef: "PP-1" });

    expect(call(fetch, 0).url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    const create = call(fetch, 1);
    expect(create.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(create.headers.Authorization).toBe("Bearer A21");
    expect(create.headers["PayPal-Request-Id"]).toBe("order-o1");
    expect(create.body.purchase_units[0]).toMatchObject({
      custom_id: "o1",
      amount: { currency_code: "USD", value: "179.00" },
    });
  });

  it("reuses the access token across calls", async () => {
    const order = { body: { id: "PP-1", status: "CREATED" } };
    const fetch = fakeFetch(token, order, order);
    const p = new PaypalProvider(config, fetch);
    await p.verifyPayment("PP-1");
    await p.verifyPayment("PP-1");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("captures approved orders when verifying", async () => {
    const fetch = fakeFetch(
      token,
      { body: { id: "PP-1", status: "APPROVED" } },
      {
        body: {
          id: "PP-1",
          status: "COMPLETED",
          purchase_units: [
            {
              reference_id: "o1",
              payments: {
                captures: [
                  {
                    id: "CAP-1",
                    status: "COMPLETED",
                    custom_id: "o1",
                    amount: { value: "99.00", currency_code: "USD" },
                  },
                ],
              },
            },
          ],
        },
      },
    );
    const p = new PaypalProvider(config, fetch);
    expect(await p.verifyPayment("PP-1")).toEqual({
      status: "paid",
      providerRef: "PP-1",
      orderId: "o1",
      amountCents: 9900,
      currency: "USD",
      captureId: "CAP-1",
    });
    const capture = call(fetch, 2);
    expect(capture.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders/PP-1/capture");
    expect(capture.headers["PayPal-Request-Id"]).toBe("capture-PP-1");
  });

  it("verifies webhook signatures with PayPal and maps capture events", async () => {
    const event = {
      id: "WH-EVT-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "CAP-1", custom_id: "o1", supplementary_data: { related_ids: { order_id: "PP-1" } } },
    };
    const headers = new Headers({
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api.paypal.com/cert",
      "paypal-transmission-id": "t1",
      "paypal-transmission-sig": "sig",
      "paypal-transmission-time": "2026-10-26T00:00:00Z",
    });

    const fetch = fakeFetch(token, { body: { verification_status: "SUCCESS" } });
    const p = new PaypalProvider(config, fetch);
    expect(await p.parseWebhook(JSON.stringify(event), headers)).toEqual({
      eventId: "WH-EVT-1",
      type: "PAYMENT.CAPTURE.COMPLETED",
      kind: "payment_succeeded",
      providerRef: "PP-1",
      orderId: "o1",
    });
    expect(call(fetch, 1).body).toMatchObject({ webhook_id: "WH-1", transmission_id: "t1", webhook_event: event });

    const failing = new PaypalProvider(config, fakeFetch(token, { body: { verification_status: "FAILURE" } }));
    await expect(failing.parseWebhook(JSON.stringify(event), headers)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("reads the next charge date when a subscription payment lands", async () => {
    const headers = new Headers();
    const event = {
      id: "WH-EVT-2",
      event_type: "PAYMENT.SALE.COMPLETED",
      resource: { id: "SALE-1", billing_agreement_id: "I-1", custom: "sub-1" },
    };
    const fetch = fakeFetch(
      token,
      { body: { verification_status: "SUCCESS" } },
      { body: { status: "ACTIVE", billing_info: { next_billing_time: "2026-11-18T10:00:00Z" } } },
    );
    expect(await new PaypalProvider(config, fetch).parseWebhook(JSON.stringify(event), headers)).toEqual({
      eventId: "WH-EVT-2",
      type: "PAYMENT.SALE.COMPLETED",
      kind: "subscription_updated",
      providerSubscriptionId: "I-1",
      ourSubscriptionId: "sub-1",
      status: "active",
      currentPeriodEnd: new Date("2026-11-18T10:00:00Z"),
    });

    // A one-off sale with no subscription behind it needs nothing from us.
    const oneOff = { ...event, resource: { id: "SALE-2" } };
    const ignored = fakeFetch(token, { body: { verification_status: "SUCCESS" } });
    expect(await new PaypalProvider(config, ignored).parseWebhook(JSON.stringify(oneOff), headers)).toEqual({
      eventId: "WH-EVT-2",
      type: "PAYMENT.SALE.COMPLETED",
      kind: "ignored",
    });
  });

  it("refunds against the capture id", async () => {
    const fetch = fakeFetch(token, { body: { id: "RF-1", status: "COMPLETED" } });
    const p = new PaypalProvider(config, fetch);
    expect(
      await p.refund({ providerRef: "PP-1", captureId: "CAP-1", amountCents: 9900, reason: "Not approved" }),
    ).toEqual({
      providerRef: "RF-1",
    });
    expect(call(fetch, 1).url).toBe("https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-1/refund");
    await expect(p.refund({ providerRef: "PP-1", amountCents: 1, reason: "x" })).rejects.toThrow("capture id");
  });
});
