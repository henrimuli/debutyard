import { getDomain } from "tldts";
import { decodeEntities, findAnchors } from "@/lib/html";

/**
 * Outreach decisions that need no network or database: who counts as a
 * business, what counts as a recent launch, which address to write to and how
 * many to send. Every rule here fails closed: when in doubt, nobody gets email.
 */

const DAY = 86_400_000;

/** A launch older than this makes "congrats on the launch" sound stale. */
export const RECENT_LAUNCH_DAYS = 14;

/** Registrable domain of a URL or host ("https://www.app.acme.co.uk/x" → "acme.co.uk"), or null. */
export function registrableDomain(raw: string): string | null {
  const host = /^https?:\/\//i.test(raw) ? hostOf(raw) : raw.trim().toLowerCase();
  if (!host) return null;
  return getDomain(host, { allowPrivateDomains: true })?.toLowerCase() ?? null;
}

function hostOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Places a product lives on without owning a site: there's no business address to find there. */
const PLATFORMS =
  /(^|\.)(apple\.com|google\.com|github\.com|github\.io|gitlab\.com|bitbucket\.org|producthunt\.com|x\.com|twitter\.com|linkedin\.com|facebook\.com|instagram\.com|youtube\.com|youtu\.be|tiktok\.com|reddit\.com|discord\.com|discord\.gg|t\.me|telegram\.me|medium\.com|substack\.com|notion\.site|notion\.so|linktr\.ee|bio\.link|beacons\.ai|gumroad\.com|lemonsqueezy\.com|stripe\.com|paypal\.com|microsoft\.com|mozilla\.org|wordpress\.com|wordpress\.org|blogspot\.com|wixsite\.com|carrd\.co|vercel\.app|netlify\.app|pages\.dev|replit\.app|lovable\.app|bolt\.new|framer\.website|framer\.ai|webflow\.io|bubbleapps\.io|herokuapp\.com|onrender\.com|fly\.dev|railway\.app|supabase\.co|gstatic\.com|googleusercontent\.com|googleapis\.com|cloudflare\.com|w3\.org|schema\.org|wikipedia\.org)$/;

export const isPlatformHost = (host: string) => PLATFORMS.test(host.toLowerCase());

/** The site's front door, with the directory's tracking parameters gone. */
export function cleanWebsite(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

const stripTags = (html: string) =>
  decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

type Link = { url: string; label: string };

/** Absolute http(s) links on a page, each once, with their visible text. */
export function pageLinks(html: string, pageUrl: string): Link[] {
  const seen = new Map<string, Link>();
  for (const a of findAnchors(html)) {
    try {
      const u = new URL(decodeEntities(a.href), pageUrl);
      if (!/^https?:$/.test(u.protocol)) continue;
      u.hash = "";
      const url = u.toString();
      const label = stripTags(a.inner).slice(0, 120);
      const known = seen.get(url);
      if (!known) seen.set(url, { url, label });
      else if (!known.label && label) known.label = label;
    } catch {}
  }
  return [...seen.values()];
}

const NAV_SEGMENTS = new Set(
  "about account advertise api app auth blog c categories category changelog contact docs faq features guides help home legal login news newsletter partners popular pricing privacy refund register resources search sign-in sign-up signin signup sitemap sponsors submit support tag tags terms tos trending".split(
    " ",
  ),
);

export type Candidate = { url: string; label: string; external: boolean };

/**
 * Links on a directory's page that might be a listed business: other sites, and
 * the page's own links that repeat in one shape (/product/x, /tools/y).
 * Paid placements are left out: they aren't launches.
 */
export function listingCandidates(html: string, pageUrl: string): Candidate[] {
  const home = registrableDomain(pageUrl);
  const links = pageLinks(html, pageUrl).filter((l) => !/[?&]utm_campaign=sponsored|[?&]sponsored=/i.test(l.url));
  const sponsored = new Set(
    findAnchors(html)
      .filter((a) => a.rel.includes("sponsored"))
      .map((a) => decodeEntities(a.href)),
  );
  const external: Candidate[] = [];
  const shapes = new Map<string, Link[]>();
  for (const l of links) {
    const u = new URL(l.url);
    if (sponsored.has(l.url)) continue;
    if (registrableDomain(l.url) !== home) {
      if (!isPlatformHost(u.hostname)) external.push({ ...l, external: true });
      continue;
    }
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0 || parts.length > 2 || NAV_SEGMENTS.has(parts[0]!)) continue;
    if (/\.[a-z0-9]{2,5}$/i.test(u.pathname)) continue;
    const shape = parts.length === 1 ? "/*" : `/${parts[0]}/*`;
    shapes.set(shape, [...(shapes.get(shape) ?? []), l]);
  }
  const internal = [...shapes.entries()]
    .filter(([shape, rows]) => rows.length >= (shape === "/*" ? 8 : 4))
    .flatMap(([, rows]) => rows.map((l) => ({ ...l, external: false })));
  return [...internal, ...external].slice(0, 200);
}

const RECENT_LABEL = /\b(today|this week|new|newest|latest|recent|recently|just launched|launching|launched)\b/i;
const NOT_RECENT_LABEL =
  /\b(trending|popular|top|best|featured|sponsored|premium|all[- ]time|last (month|year)|hall)\b/i;

/** A section heading that promises recent launches: "Launching today", not "Top this month". */
export const sectionLooksRecent = (label: string) => RECENT_LABEL.test(label) && !NOT_RECENT_LABEL.test(label);

/** Links to a directory's page of recent launches ("This week", /launches/week), when the front page has one. */
export function recentPageLink(html: string, pageUrl: string): string | null {
  const home = registrableDomain(pageUrl);
  const self = new URL(pageUrl).pathname.replace(/\/$/, "");
  for (const l of pageLinks(html, pageUrl)) {
    const u = new URL(l.url);
    if (registrableDomain(l.url) !== home || u.pathname.replace(/\/$/, "") === self) continue;
    if (/\/(launches|new|latest|recent)(\/(week|today|this-week))?\/?$/i.test(u.pathname)) return l.url;
  }
  return null;
}

/** The one link on a listing page that goes to the product. Null when we can't tell which it is. */
export function findVisitLink(html: string, pageUrl: string): string | null {
  const home = registrableDomain(pageUrl);
  const links = pageLinks(html, pageUrl);
  const isExternal = (l: Link) => registrableDomain(l.url) !== home && !isPlatformHost(new URL(l.url).hostname);
  const VISIT = /\b(visit|website|try it|try now|open|go to|view site|launch app|get started)\b/i;
  const labelled = links.find((l) => isExternal(l) && VISIT.test(l.label));
  if (labelled) return labelled.url;
  const tracked = links.find(
    (l) =>
      isExternal(l) && /[?&](ref|utm_source|via|source)=/i.test(l.url) && !/[?&]utm_campaign=sponsored/i.test(l.url),
  );
  if (tracked) return tracked.url;
  // Some directories count clicks on their own redirect first.
  const redirect = links.find((l) => !isExternal(l) && /\/(go|out|visit|redirect)\//i.test(new URL(l.url).pathname));
  return redirect?.url ?? null;
}

/** When a listing page says the product launched, if it says. */
export function findLaunchDate(html: string, now = new Date()): Date | null {
  const parse = (raw: string | undefined) => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) || d.getTime() > now.getTime() + DAY ? null : d;
  };
  const jsonLd = /"date(?:Published|Created)"\s*:\s*"([^"]{8,40})"/i.exec(html)?.[1];
  const time = /<time\b[^>]*\bdatetime=["']([^"']{8,40})["']/i.exec(html)?.[1];
  const dated = parse(jsonLd) ?? parse(time);
  if (dated) return dated;
  const text = stripTags(html);
  const rel = /\b(launched|launching|added|published|posted)\b[^.]{0,20}?\b(\d{1,2})\s+(hour|day)s?\s+ago\b/i.exec(
    text,
  );
  if (rel) return new Date(now.getTime() - Number(rel[2]) * (rel[3]!.toLowerCase() === "hour" ? 3_600_000 : DAY));
  if (/\b(launched|launching|added|published)\s+today\b/i.test(text)) return now;
  if (/\b(launched|added|published)\s+yesterday\b/i.test(text)) return new Date(now.getTime() - DAY);
  const onDate =
    /\b(?:launched|launching|added|published)(?:\s+on)?\s+([A-Z][a-z]{2,8}\.? \d{1,2},? \d{4}|\d{1,2} [A-Z][a-z]{2,8} \d{4})/.exec(
      text,
    );
  return parse(onDate?.[1]);
}

export const isRecentLaunch = (at: Date, now = new Date()) => now.getTime() - at.getTime() <= RECENT_LAUNCH_DAYS * DAY;

const DOMAIN_SIGNAL =
  /directory|directories|launch|alternative|submit|listing|hunt|toolhub|toolshub|toolslist|aitools|saashub|startuplist|startupslist|tools$/i;
const SUFFIX_SIGNAL = /\.(tools|directory|directories|list|reviews|deals)$/i;
const TITLE_SIGNAL =
  /\b(director(y|ies)|launch (platform|board|pad|site)|launchpad|launch your|launches|discover (the )?(best|new|top|latest)|best [\w\s-]{0,40}tools|top \d+|submit your|list your|product hunt|alternatives? to|marketplace of|tools? list|find (the )?best|backlinks?|dofollow|guest post)\b/i;
const LINK_LABEL_SIGNAL =
  /\b(submit|add|list|post|launch)\s+(your|a|an|my)?\s*(tool|product|startup|saas|app|site|website|listing|project|business)\b|\bget (listed|featured)\b/i;
const LINK_PATH_SIGNAL =
  /^\/(submit|submit-(your-)?(tool|product|startup|saas|app|site|website|listing|project|business)s?|add-(tool|product|startup|listing|your-[a-z]+)|list-your-[a-z-]+|launch-your-[a-z-]+)\/?$/i;
/**
 * A directory's front page links to its own listing pages, many under one
 * prefix. Outbound links don't tell the two apart: makers carry walls of
 * directory badges, often outside the footer, while directories mostly link
 * inward. "tools", "apps" and "p" are left out because products use them for
 * their own free tools, app pages and newsletter posts.
 */
const LISTING_PATH =
  /^\/(tool|product|products|item|items|launch|launches|listing|listings|startup|startups)\/[^/]+\/?$/i;
const MANY_LISTINGS = 15;

/**
 * Why a homepage looks like a directory, launch platform or link seller. Any
 * reason at all rejects it, and that includes real products with an unlucky
 * name: a missed customer costs nothing, an email to a directory is what we
 * promised never to send.
 */
export function directorySignals(input: { url: string; html: string; title?: string; description?: string }): string[] {
  const reasons: string[] = [];
  const domain = registrableDomain(input.url) ?? "";
  const name = domain.split(".")[0] ?? "";
  if (DOMAIN_SIGNAL.test(name)) reasons.push(`domain name: ${domain}`);
  if (SUFFIX_SIGNAL.test(domain)) reasons.push(`domain ending: ${domain}`);
  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(input.html)?.[1];
  for (const [what, text] of [
    ["title", input.title],
    ["description", input.description],
    ["heading", heading ? stripTags(heading) : undefined],
  ] as const) {
    const hit = text && TITLE_SIGNAL.exec(text)?.[0];
    if (hit) reasons.push(`${what} says "${hit}"`);
  }
  for (const l of pageLinks(input.html, input.url)) {
    if (registrableDomain(l.url) !== domain) continue;
    if (LINK_LABEL_SIGNAL.test(l.label)) reasons.push(`link "${l.label.slice(0, 60)}"`);
    else if (LINK_PATH_SIGNAL.test(new URL(l.url).pathname)) reasons.push(`link to ${new URL(l.url).pathname}`);
  }
  const listings = new Map<string, Set<string>>();
  for (const l of pageLinks(input.html, input.url)) {
    if (registrableDomain(l.url) !== domain) continue;
    const path = new URL(l.url).pathname.replace(/\/$/, "");
    const prefix = LISTING_PATH.exec(path)?.[1]?.toLowerCase();
    if (prefix) listings.set(prefix, (listings.get(prefix) ?? new Set()).add(path));
  }
  for (const [prefix, paths] of listings) {
    if (paths.size >= MANY_LISTINGS) reasons.push(`links to ${paths.size} listing pages under /${prefix}/`);
  }
  return [...new Set(reasons)];
}

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "hey.com",
  "fastmail.com",
  "zoho.com",
]);

/** Addresses that exist to receive something other than a note from a founder. */
const WRONG_DOOR =
  /^(no-?reply|do-?not-?reply|noreply|abuse|dmca|copyright|legal|privacy|gdpr|dpo|data-?protection|security|compliance|postmaster|webmaster|hostmaster|mailer-daemon|bounces?|billing|invoices?|accounts?|accounting|payments?|refunds?|careers?|jobs?|hr|recruiting|press|media|pr|newsletter|unsubscribe|notifications?|alerts?|sentry|admin|root|test)([+._-].*)?$/i;
const PLACEHOLDER =
  /^(you|your|yourname|your-?email|name|email|user|username|someone|example|john|jane|johndoe|john\.doe|jane\.doe|first\.last|firstname|lastname)$/i;
const PLACEHOLDER_DOMAIN =
  /^(example\.|test\.|domain\.|email\.|yourdomain\.|yourcompany\.|company\.|sentry\.|wixpress\.)/i;
const ROLE_SCORES: Array<[RegExp, number]> = [
  [/^(founder|founders|ceo|cofounder|co-founder)$/i, 100],
  [/^(hello|hi|hey)$/i, 90],
  [/^(contact|contactus|contact-us)$/i, 80],
  [/^team$/i, 75],
  [/^(support|help|helpdesk|care)$/i, 70],
  [/^(info|enquiries|inquiries)$/i, 55],
  [/^(sales|partnerships?|marketing)$/i, 30],
];

/** How good an address is to write to, or null for one we must not use. */
export function scoreEmail(email: string, siteDomain: string): number | null {
  const m = /^([^@\s]+)@([^@\s]+\.[a-z]{2,})$/i.exec(email);
  if (!m) return null;
  const [, local, host] = m as unknown as [string, string, string];
  if (WRONG_DOOR.test(local) || PLACEHOLDER.test(local) || PLACEHOLDER_DOMAIN.test(host)) return null;
  const free = FREE_MAIL.has(host.toLowerCase());
  if (!free && registrableDomain(host) !== siteDomain) return null;
  if (free) return 40;
  return ROLE_SCORES.find(([re]) => re.test(local))?.[1] ?? 65;
}

/** Cloudflare's email obfuscation: the first byte is the XOR key for the rest. */
function decodeCfEmail(hex: string): string {
  const key = Number.parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i + 1 < hex.length; i += 2)
    out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

const EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi;
const ASSET = /\.(png|jpe?g|gif|svg|webp|avif|css|js|mjs|ts|woff2?|ttf|map|ico)$/i;

/** Every email address a page shows, in mailto links, text and the usual obfuscations. */
export function extractEmails(html: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    const e = raw
      .trim()
      .toLowerCase()
      .replace(/[.,;:]+$/, "");
    if (!ASSET.test(e) && !/%[0-9a-f]{2}/i.test(e)) found.add(e);
  };
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    try {
      add(decodeURIComponent(decodeEntities(m[1]!)));
    } catch {}
  }
  for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) add(decodeCfEmail(m[1]!));
  for (const m of html.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) add(decodeCfEmail(m[1]!));
  const text = stripTags(html);
  for (const m of text.matchAll(EMAIL)) add(m[0]);
  const spelled =
    /([a-z0-9._-]{2,40})\s*[[({]\s*at\s*[\])}]\s*([a-z0-9-]{2,40})\s*(?:[[({]\s*dot\s*[\])}]|\.)\s*([a-z]{2,24})/gi;
  for (const m of text.matchAll(spelled)) add(`${m[1]}@${m[2]}.${m[3]}`);
  return [...found];
}

/** The best address on a page for this site, or null. */
export function bestEmail(html: string, siteDomain: string): string | null {
  let best: { email: string; score: number } | null = null;
  for (const email of extractEmails(html)) {
    const score = scoreEmail(email, siteDomain);
    if (score !== null && (!best || score > best.score)) best = { email, score };
  }
  return best?.email ?? null;
}

const CONTACT_PAGES: Array<[RegExp, string]> = [
  [/\/(contact|contact-us|support|help)\/?$/i, "/contact"],
  [/\/(about|about-us|team|company)\/?$/i, "/about"],
  [/\/(privacy|privacy-policy|legal\/privacy|legal\/privacy-policy)\/?$/i, "/privacy"],
  [/\/(terms|tos|terms-of-service|terms-and-conditions|legal\/terms|legal)\/?$/i, "/terms"],
];

/** The site's contact, about, privacy and terms pages: its own links first, else the usual addresses. */
export function contactPages(html: string, pageUrl: string): string[] {
  const home = registrableDomain(pageUrl);
  const links = pageLinks(html, pageUrl).filter((l) => registrableDomain(l.url) === home);
  const origin = new URL(pageUrl).origin;
  return CONTACT_PAGES.map(([re, fallback]) => {
    const hit = links.find((l) => re.test(new URL(l.url).pathname));
    return hit ? `${new URL(hit.url).origin}${new URL(hit.url).pathname}` : `${origin}${fallback}`;
  });
}

/** Sending hours, in UTC: the working day in Europe and the Americas overlap. */
export const SEND_WINDOW = { from: 13, to: 21 } as const;

/** How many to send this hour so that `limit` spreads across the window rather than all going at once. */
export function sendsDue(now: Date, limit: number, sentToday: number): number {
  const hour = now.getUTCHours();
  if (limit <= 0 || hour < SEND_WINDOW.from || hour > SEND_WINDOW.to) return 0;
  const hours = SEND_WINDOW.to - SEND_WINDOW.from + 1;
  const target = Math.ceil((limit * (hour - SEND_WINDOW.from + 1)) / hours);
  return Math.max(0, Math.min(target, limit) - sentToday);
}

/** Maildoso allows this many cold emails per mailbox per day. */
export const MAILBOX_DAILY_CAP = 15;

/** What can really go out today: the limit staff set, within what the mailboxes allow. */
export function dailyTarget(limit: number, mailboxCount: number): number {
  return mailboxCount > 0 ? Math.min(limit, mailboxCount * MAILBOX_DAILY_CAP) : limit;
}

export type MailboxAccount = {
  /** Bare and lowercased. */
  address: string;
  /** The whole From header, e.g. "Henry from DebutYard <henry@trydebutyard.com>". */
  from: string;
  user: string;
  pass: string;
  smtpHost: string;
  imapHost: string | null;
};

/**
 * Reads OUTREACH_MAILBOXES. A bad entry is reported and skipped so the others keep
 * working. Problems never quote the value: it holds passwords.
 */
export function parseMailboxes(
  raw: string | undefined,
  hosts: { smtpHost?: string; imapHost?: string },
): { boxes: MailboxAccount[]; problems: string[] } {
  if (!raw?.trim()) return { boxes: [], problems: [] };
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return { boxes: [], problems: ["OUTREACH_MAILBOXES isn't valid JSON"] };
  }
  if (!Array.isArray(list)) return { boxes: [], problems: ["OUTREACH_MAILBOXES must be a JSON list"] };
  const boxes: MailboxAccount[] = [];
  const problems: string[] = [];
  list.forEach((entry: unknown, i) => {
    const b = (entry ?? {}) as Record<string, unknown>;
    const text = (k: string) => {
      const v = b[k];
      return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    const from = text("from");
    const pass = typeof b.pass === "string" && b.pass ? b.pass : undefined;
    const address = from && (/<([^<>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
    const smtpHost = text("smtpHost") ?? hosts.smtpHost;
    if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
      problems.push(`Mailbox ${i + 1} needs a "from" address`);
    else if (!pass) problems.push(`${address} needs a "pass"`);
    else if (!smtpHost) problems.push(`${address} needs OUTREACH_SMTP_HOST`);
    else if (boxes.some((x) => x.address === address)) problems.push(`${address} is listed twice`);
    else
      boxes.push({
        address,
        from: from!,
        user: text("user") ?? address,
        pass,
        smtpHost,
        imapHost: text("imapHost") ?? hosts.imapHost ?? null,
      });
  });
  return { boxes, problems };
}

/** The least used mailbox with room left today, so sends spread evenly. Null when none has. */
export function pickSender<T extends { address: string }>(
  boxes: T[],
  sentToday: Record<string, number>,
  skip: ReadonlySet<string> = new Set(),
): T | null {
  let best: T | null = null;
  for (const box of boxes) {
    const sent = sentToday[box.address] ?? 0;
    if (skip.has(box.address) || sent >= MAILBOX_DAILY_CAP) continue;
    if (!best || sent < (sentToday[best.address] ?? 0)) best = box;
  }
  return best;
}

const SCANNER_UA =
  /bot\b|crawler|spider|preview|scan|proofpoint|mimecast|barracuda|safelinks|headless|python|curl|wget|go-http/i;

/** Mail security tools open links seconds after delivery; those aren't people. */
export function looksLikeScanner(userAgent: string | null, secondsSinceSent: number): boolean {
  return !userAgent || SCANNER_UA.test(userAgent) || secondsSinceSent < 20;
}

/** How many sends in a row with no response before the dashboard says something. */
export const IGNORED_AFTER = 30;

/**
 * Nothing from a whole batch usually means it isn't being seen. We don't track
 * opens, so this stands in for the guide's "open rate dropped". It only warns.
 */
export const looksIgnored = (recent: Array<{ clicked: boolean; replied: boolean }>) =>
  recent.length >= IGNORED_AFTER && !recent.some((r) => r.clicked || r.replied);

/** Stops sending once the last sends look unhealthy. Null means carry on. */
export function healthProblem(recent: { sent: number; bounced: number; complained: number }): string | null {
  if (recent.complained >= 1 && recent.sent < 100) return `a spam complaint in the last ${recent.sent} sends`;
  if (recent.sent >= 20 && recent.bounced / recent.sent >= 0.05)
    return `${recent.bounced} bounces in the last ${recent.sent} sends`;
  return null;
}
