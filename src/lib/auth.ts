import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { env } from "@/env";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { slugify, uniqueSlug } from "@/lib/slug";

function socialProviders() {
  const e = env();
  return {
    ...(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET
      ? { github: { clientId: e.GITHUB_CLIENT_ID, clientSecret: e.GITHUB_CLIENT_SECRET } }
      : {}),
  };
}

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "DebutYard",
    baseURL: e.NEXT_PUBLIC_SITE_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "user", input: false },
        handle: { type: "string", required: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            const base = slugify(data.name || data.email.split("@")[0] || "", 24);
            const handle = await uniqueSlug(base, async (h) =>
              Boolean(await db().query.user.findFirst({ where: eq(schema.user.handle, h), columns: { id: true } })),
            );
            // Admin access lives in admin_users (see staffRole), not on the user row.
            return { data: { ...data, handle, role: "user" } };
          },
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google", "github"] },
    },
    socialProviders: socialProviders(),
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        sendMagicLink: async ({ email, url }) => {
          await sendEmail({
            to: email,
            ...renderEmail({
              variant: "customer",
              label: "Sign in",
              subject: "Your DebutYard sign-in link",
              preheader: "This link expires in 15 minutes.",
              reason: "someone asked to sign in to DebutYard with this address",
              blocks: [
                { heading: "Sign in to DebutYard" },
                { text: "Use the button below to sign in. It expires in 15 minutes." },
                { button: "Sign in", href: url },
                { note: `Button not working? Paste this link into your browser: ${url}` },
                { note: "If you didn't ask for this, ignore this email. Nobody can sign in without the link." },
              ],
            }),
          });
        },
      }),
      // Must stay last: lets server actions set auth cookies.
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Lazily built so importing this module never requires a database. */
export function auth(): Auth {
  instance ??= createAuth();
  return instance;
}

export type SessionUser = Auth["$Infer"]["Session"]["user"];

/** The signed-in user for the current request, or null. Call inside a Suspense boundary. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  // Read the request first: it marks this render as dynamic before anything touches the database.
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
}

/** The signed-in user, or a redirect to sign-in. For pages and server actions. */
export async function requireUser(returnTo = "/"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export type StaffRole = "owner" | "admin" | "ops";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * The admin role for an email, or null. ADMIN_EMAIL is always the owner and
 * gets its admin_users row on first check, so it works for accounts created
 * before the variable was set. Cached per request.
 */
const roleForEmail = cache(async (rawEmail: string): Promise<StaffRole | null> => {
  const email = normalizeEmail(rawEmail);
  const owner = env().ADMIN_EMAIL ? normalizeEmail(env().ADMIN_EMAIL!) : null;
  const { adminUsers } = schema;
  if (email && email === owner) {
    await db()
      .insert(adminUsers)
      .values({ email, role: "owner", lastSeenAt: new Date() })
      .onConflictDoUpdate({ target: adminUsers.email, set: { role: "owner", lastSeenAt: new Date() } });
    return "owner";
  }
  const row = await db().query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
  if (!row) return null;
  // Touch at most hourly.
  if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > 3_600_000) {
    await db().update(adminUsers).set({ lastSeenAt: new Date() }).where(eq(adminUsers.id, row.id));
  }
  // A former ADMIN_EMAIL keeps access but is no longer the owner.
  return row.role === "owner" ? "admin" : row.role;
});

export async function staffRole(user: Pick<SessionUser, "email"> | null): Promise<StaffRole | null> {
  return user?.email ? roleForEmail(user.email) : null;
}

/**
 * Owners and admins may submit free debuts without the badge and past the
 * waiting-debut cap, and add listings past their plan's limit, e.g. to try
 * listings before launch. Ops staff may not.
 */
export async function canOverrideFreeRules(user: Pick<SessionUser, "email"> | null): Promise<boolean> {
  const role = await staffRole(user);
  return role === "owner" || role === "admin";
}

export async function isStaff(user: Pick<SessionUser, "email"> | null): Promise<boolean> {
  return (await staffRole(user)) !== null;
}

/**
 * Staff only. Signed-out visitors go to sign-in; signed-in non-staff get a
 * 403 page (app/admin/forbidden.tsx) saying which account they're using.
 */
export async function requireStaff(returnTo = "/admin/dashboard"): Promise<SessionUser & { staffRole: StaffRole }> {
  const user = await requireUser(returnTo);
  const role = await staffRole(user);
  if (!role) forbidden();
  return { ...user, staffRole: role };
}

export function enabledSocialProviders(): Array<"google" | "github"> {
  return Object.keys(socialProviders()) as Array<"google" | "github">;
}
