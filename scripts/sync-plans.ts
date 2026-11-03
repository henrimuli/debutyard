/**
 * Creates our recurring plans on Paystack and PayPal (whichever are configured)
 * and records their ids in provider_plans. Safe to re-run: existing plans with
 * the same price are skipped. If a price changes, a new plan is created and the
 * mapping updated; existing subscribers stay on their old plan.
 *
 *   pnpm payments:sync-plans
 *
 * Plans belong to one provider account, but provider_plans doesn't record which. When
 * moving from sandbox to live keys on the same database, pass --recreate: otherwise the
 * sandbox plans count as existing and nothing is created.
 *
 *   pnpm payments:sync-plans --recreate
 *
 * --prod runs against production: provider credentials come from the *_PROD vars and the
 * database from the *_MASTER vars, with no fallback to the unsuffixed ones. Owner only.
 *
 *   pnpm payments:sync-plans --prod
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { PaypalProvider } from "../src/lib/payments/paypal";
import { PaystackProvider } from "../src/lib/payments/paystack";
import { SKUS, type RecurringSku } from "../src/lib/payments/skus";
import type { PaymentProvider } from "../src/lib/payments/types";

const recreate = process.argv.includes("--recreate");
const prod = process.argv.includes("--prod");
const providerEnv = (name: string) => process.env[prod ? `${name}_PROD` : name];

async function main() {
  const url = prod
    ? (process.env.DIRECT_DATABASE_URL_MASTER ?? process.env.DATABASE_URL_MASTER)
    : (process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL);
  if (!url)
    throw new Error(
      prod ? "Set DATABASE_URL_MASTER or DIRECT_DATABASE_URL_MASTER" : "Set DATABASE_URL or DIRECT_DATABASE_URL",
    );
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema, casing: "snake_case" });

  const providers: PaymentProvider[] = [];
  const paystackSecretKey = providerEnv("PAYSTACK_SECRET_KEY");
  if (paystackSecretKey) providers.push(new PaystackProvider(paystackSecretKey));
  const paypalClientId = providerEnv("PAYPAL_CLIENT_ID");
  const paypalClientSecret = providerEnv("PAYPAL_CLIENT_SECRET");
  if (paypalClientId && paypalClientSecret) {
    providers.push(
      new PaypalProvider({
        clientId: paypalClientId,
        clientSecret: paypalClientSecret,
        environment: providerEnv("PAYPAL_ENV") === "live" ? "live" : "sandbox",
      }),
    );
  }
  if (providers.length === 0) throw new Error("No payment provider credentials found");

  const plans = SKUS.filter((s): s is RecurringSku => s.type === "recurring");
  for (const provider of providers) {
    for (const sku of plans) {
      const existing = await db.query.providerPlans.findFirst({
        where: and(eq(schema.providerPlans.sku, sku.id), eq(schema.providerPlans.provider, provider.id)),
      });
      if (!recreate && existing && existing.amountCents === sku.amountCents) {
        console.log(`= ${provider.id} ${sku.id} ${existing.planId}`);
        continue;
      }
      const { planId } = await provider.createPlan({
        sku: sku.id,
        name: `DebutYard ${sku.name}`,
        amountCents: sku.amountCents,
        interval: sku.interval,
      });
      await db
        .insert(schema.providerPlans)
        .values({ sku: sku.id, provider: provider.id, planId, amountCents: sku.amountCents })
        .onConflictDoUpdate({
          target: [schema.providerPlans.sku, schema.providerPlans.provider],
          set: { planId, amountCents: sku.amountCents },
        });
      console.log(`+ ${provider.id} ${sku.id} ${planId}`);
    }
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
