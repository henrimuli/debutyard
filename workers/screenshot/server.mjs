/**
 * Evidence screenshots for DebutYard. POST /screenshot { url, key } with
 * "Authorization: Bearer $WORKER_SECRET" → { url } of a PNG stored in R2.
 * Runs Playwright, so it lives off Vercel (Railway, Fly, any container host).
 *
 * Also the only way in to our private OpenSERP (workers/openserp): POST /search
 * { text, limit } → OpenSERP's Google results, United States, English.
 */
import { createServer } from "node:http";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { timingSafeEqual } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { chromium } from "playwright";

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
};
const SECRET = env("WORKER_SECRET");
const BUCKET = env("R2_BUCKET");
const PUBLIC_URL = env("R2_PUBLIC_URL").replace(/\/$/, "");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
});

let browser;
const getBrowser = async () => (browser ??= await chromium.launch({ args: ["--no-sandbox"] }));

/** Refuses private, loopback and link-local targets (the same rule the app uses for fetches). */
function privateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

async function assertPublic(raw) {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) URLs");
  const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true });
  if (addrs.length === 0 || addrs.some((a) => privateAddress(a.address))) throw new Error("Private address");
  return u.toString();
}

async function screenshot(url) {
  const context = await (
    await getBrowser()
  ).newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    // Re-check every request (redirects, subresources) so a page can't pivot to an internal host.
    await page.route("**/*", async (route) => {
      try {
        await assertPublic(route.request().url());
        await route.continue();
      } catch {
        await route.abort();
      }
    });
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(1500);
    return await page.screenshot({ type: "png", fullPage: false });
  } finally {
    await context.close();
  }
}

const authorized = (header) => {
  const want = Buffer.from(`Bearer ${SECRET}`);
  const got = Buffer.from(header ?? "");
  return got.length === want.length && timingSafeEqual(got, want);
};

/** Asks OpenSERP for Google results, and hands back its status and body. Only a phrase and a limit get through. */
async function search({ text, limit }) {
  if (typeof text !== "string" || !text.trim() || text.length > 300)
    return { status: 400, body: { error: "Bad text" } };
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) return { status: 400, body: { error: "Bad limit" } };
  const base = process.env.OPENSERP_URL;
  if (!base) return { status: 503, body: { error: "OPENSERP_URL isn't set" } };
  const q = new URLSearchParams({ text, limit: String(limit), lang: "EN", region: "US" });
  // Longer than OpenSERP's own attempts and retry, and shorter than the app's wait for us.
  const res = await fetch(`${base.replace(/\/$/, "")}/google/search?${q}`, { signal: AbortSignal.timeout(40_000) });
  return { status: res.status, body: await res.json().catch(() => ({ error: "OpenSERP sent no JSON" })) };
}

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
  if (req.method !== "POST" || (req.url !== "/screenshot" && req.url !== "/search")) {
    return send(res, 404, { error: "Not found" });
  }
  if (!authorized(req.headers.authorization)) return send(res, 401, { error: "Unauthorized" });
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) return send(res, 413, { error: "Too large" });
  }
  if (req.url === "/search") {
    try {
      const { status, body } = await search(JSON.parse(raw));
      return send(res, status, body);
    } catch (err) {
      console.error("search failed", err);
      return send(res, err instanceof SyntaxError ? 400 : 502, {
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }
  try {
    const { url, key } = JSON.parse(raw);
    if (typeof key !== "string" || !/^[\w./-]{1,200}\.png$/.test(key) || key.includes("..")) {
      return send(res, 400, { error: "Bad key" });
    }
    const png = await screenshot(await assertPublic(url));
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: png,
        ContentType: "image/png",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    send(res, 200, { url: `${PUBLIC_URL}/${key}` });
  } catch (err) {
    console.error("screenshot failed", err);
    send(res, 502, { error: err instanceof Error ? err.message : "Failed" });
  }
}).listen(Number(process.env.PORT ?? 8080), () => console.log("screenshot worker listening"));
