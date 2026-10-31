import "server-only";
import { env } from "@/env";

/**
 * Gemini API client for the blog writer. One text model and one image model,
 * no fallback chain: when a call fails, the editor shows Google's own error.
 *
 * - Structured answers use `responseJsonSchema`, so the reply is JSON in the
 *   schema's shape (code still validates every field before the UI sees it).
 * - Research uses Google Search grounding; the sources it cites are resolved
 *   to their real URLs, so an article only ever links what search returned.
 */

export const TEXT_MODEL = "gemini-3.1-flash-lite";
/** Nano Banana 2.1. */
export const IMAGE_MODEL = "gemini-nano-banana-2.1";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiError extends Error {
  constructor(
    message: string,
    /** HTTP status to surface (503 for an unconfigured key, Google's own status otherwise). */
    readonly status = 502,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export const geminiConfigured = () => Boolean(env().GEMINI_API_KEY);

function key(): string {
  const k = env().GEMINI_API_KEY;
  if (!k) throw new GeminiError("The writer agent needs GEMINI_API_KEY set (then redeploy).", 503);
  return k;
}

export type Part = {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
};
export type Content = { role: "user" | "model"; parts: Part[] };

type GroundingChunk = { web?: { uri?: string; title?: string } };
type Candidate = {
  content?: { parts?: Part[] };
  finishReason?: string;
  groundingMetadata?: { groundingChunks?: GroundingChunk[]; webSearchQueries?: string[] };
};
type Response = { candidates?: Candidate[]; error?: { message?: string; status?: string; code?: number } };

export type CallArgs = {
  system: string;
  contents: Content[];
  maxOutputTokens?: number;
  temperature?: number;
  /** Google Search grounding (and reading pages it finds). */
  search?: boolean;
  timeoutMs?: number;
};

const answerText = (parts: Part[] = []) =>
  parts
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join("");

/** Turns Google's error into a sentence an editor can act on. */
function explain(status: number, body: string): string {
  let msg = body.slice(0, 300);
  try {
    msg = (JSON.parse(body) as Response).error?.message ?? msg;
  } catch {}
  if (status === 400 && /api key/i.test(msg))
    return "Google rejected GEMINI_API_KEY. Check the key in Vercel, then redeploy.";
  if (status === 403)
    return `Google denied access: ${msg}. Check the key's project has the Gemini API enabled and billing on.`;
  if (status === 404) return `Gemini model not available on this key: ${msg}`;
  if (status === 429) return "Gemini rate limit reached. Wait a minute and try again.";
  if (status >= 500) return "Gemini is having trouble right now. Try again in a moment.";
  return `Gemini returned ${status}: ${msg}`;
}

function body(model: string, a: CallArgs, extra: Record<string, unknown> = {}) {
  return {
    systemInstruction: { parts: [{ text: a.system }] },
    contents: a.contents,
    ...(a.search ? { tools: [{ google_search: {} }, { url_context: {} }] } : {}),
    generationConfig: {
      maxOutputTokens: a.maxOutputTokens ?? 4096,
      ...(a.temperature !== undefined ? { temperature: a.temperature } : {}),
      ...extra,
    },
  };
}

async function post(model: string, method: string, payload: unknown, timeoutMs: number) {
  let res: globalThis.Response;
  try {
    res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    console.error("[blog ai] gemini unreachable", err);
    throw new GeminiError("Couldn't reach Gemini. Try again.", 504);
  }
  if (!res.ok) {
    const text = await res.text();
    console.error(
      "[blog ai] gemini request failed",
      JSON.stringify({ model, status: res.status, body: text.slice(0, 500) }),
    );
    throw new GeminiError(explain(res.status, text), res.status === 429 ? 429 : 502);
  }
  return res;
}

export const user = (text: string): Content => ({ role: "user", parts: [{ text }] });
export const model = (text: string): Content => ({ role: "model", parts: [{ text }] });

function parseJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced.trim());
    throw new GeminiError("Gemini's answer wasn't valid JSON. Try again.");
  }
}

/** A structured answer in the shape of `schema` (plain JSON Schema). */
export async function geminiJson(a: Omit<CallArgs, "search"> & { schema: Record<string, unknown> }): Promise<unknown> {
  const res = await post(
    TEXT_MODEL,
    "generateContent",
    body(TEXT_MODEL, a, { responseMimeType: "application/json", responseJsonSchema: a.schema }),
    a.timeoutMs ?? 60_000,
  );
  const json = (await res.json()) as Response;
  const text = answerText(json.candidates?.[0]?.content?.parts);
  if (!text) throw new GeminiError("Gemini returned an empty answer. Try again.");
  return parseJson(text);
}

/** Streams the answer's text as it's written. */
export async function* geminiStream(a: CallArgs): AsyncGenerator<string> {
  const res = await post(TEXT_MODEL, "streamGenerateContent?alt=sse", body(TEXT_MODEL, a), a.timeoutMs ?? 240_000);
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const chunk = JSON.parse(line.slice(5)) as Response;
        if (chunk.error) throw new GeminiError(chunk.error.message ?? "Gemini stopped unexpectedly.");
        const text = answerText(chunk.candidates?.[0]?.content?.parts);
        if (text) yield text;
      } catch (err) {
        if (err instanceof GeminiError) throw err;
      }
    }
  }
}

export type Source = { title: string; url: string };
export type Research = { notes: string; sources: Source[]; queries: string[] };

/**
 * Grounding cites sources through short-lived Google redirect links; this
 * follows each one (without fetching the page) to the real URL.
 */
async function resolveSource(uri: string): Promise<string | null> {
  try {
    const u = new URL(uri);
    if (u.hostname !== "vertexaisearch.cloud.google.com") return /^https?:$/.test(u.protocol) ? uri : null;
    const res = await fetch(uri, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000) });
    const location = res.headers.get("location");
    return location && /^https?:\/\//i.test(location) ? location : null;
  } catch {
    return null;
  }
}

/** Researches a question on the live web. The notes cite sources as [1], [2]… */
export async function geminiResearch(a: {
  system: string;
  question: string;
  maxOutputTokens?: number;
}): Promise<Research> {
  const res = await post(
    TEXT_MODEL,
    "generateContent",
    body(TEXT_MODEL, {
      system: a.system,
      contents: [user(a.question)],
      search: true,
      maxOutputTokens: a.maxOutputTokens ?? 4096,
    }),
    90_000,
  );
  const json = (await res.json()) as Response;
  const cand = json.candidates?.[0];
  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
  const resolved = await Promise.all(
    chunks.map(async (c) => {
      const url = c.web?.uri ? await resolveSource(c.web.uri) : null;
      return url ? { title: c.web?.title?.slice(0, 200) || new URL(url).hostname, url } : null;
    }),
  );
  const seen = new Set<string>();
  const sources = resolved.filter((s): s is Source => {
    if (!s || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
  return {
    notes: answerText(cand?.content?.parts).slice(0, 12_000),
    sources: sources.slice(0, 15),
    queries: cand?.groundingMetadata?.webSearchQueries ?? [],
  };
}

export type AspectRatio = "16:9" | "4:3" | "1:1" | "3:4" | "21:9";
export type GeneratedImage = { bytes: Uint8Array; mimeType: string; width: number | null; height: number | null };

/** Width and height from a PNG or JPEG header, when it's one of those. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) {
    const v = new DataView(b.buffer, b.byteOffset);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      const len = (b[i + 2]! << 8) | b[i + 3]!;
      if (marker >= 0xc0 && marker <= 0xc3)
        return { height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! };
      i += 2 + len;
    }
  }
  return null;
}

/** Generates one image with Nano Banana. */
export async function geminiImage(prompt: string, aspectRatio: AspectRatio = "16:9"): Promise<GeneratedImage> {
  const res = await post(
    IMAGE_MODEL,
    "generateContent",
    {
      contents: [user(prompt)],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
    },
    120_000,
  );
  const json = (await res.json()) as Response;
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData) {
    const reason = json.candidates?.[0]?.finishReason;
    throw new GeminiError(
      reason && reason !== "STOP"
        ? `Nano Banana declined this image (${reason.toLowerCase().replace(/_/g, " ")}). Reword the description.`
        : "Nano Banana returned no image. Try again.",
    );
  }
  const bytes = Uint8Array.from(Buffer.from(part.inlineData.data, "base64"));
  const size = imageSize(bytes);
  return { bytes, mimeType: part.inlineData.mimeType, width: size?.width ?? null, height: size?.height ?? null };
}

/** A one-word probe of both models, for the diagnostics endpoint. Never returns the key. */
export async function geminiHealth() {
  const configured = geminiConfigured();
  if (!configured) return { configured, text: "missing key", models: { text: TEXT_MODEL, image: IMAGE_MODEL } };
  try {
    const res = await post(
      TEXT_MODEL,
      "generateContent",
      body(TEXT_MODEL, { system: "Reply with one word.", contents: [user("Say OK.")], maxOutputTokens: 16 }),
      20_000,
    );
    const json = (await res.json()) as Response;
    return {
      configured,
      text: answerText(json.candidates?.[0]?.content?.parts) ? "ok" : "empty",
      models: { text: TEXT_MODEL, image: IMAGE_MODEL },
    };
  } catch (err) {
    return {
      configured,
      text: err instanceof Error ? err.message : "failed",
      models: { text: TEXT_MODEL, image: IMAGE_MODEL },
    };
  }
}
