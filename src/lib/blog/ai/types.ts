import type { LinkSuggestion } from "@/lib/blog/links";
import type { BlogFaqItem, PostKind } from "@/lib/blog/types";

/** Client-safe result shapes for the writer agent's actions (no server imports). */

export type LengthOption = { text: string; length: number; ok: boolean };

/** "LOW"/"MEDIUM"/"HIGH" come from Google Keyword Planner; "UNKNOWN" when it had no data. */
export type KeywordCompetition = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type KeywordSignal = {
  volume: number | null;
  competition: KeywordCompetition;
  /** Google autocompletes the phrase: people really type it. */
  autocompleted: boolean;
  /** Computed in code from the data above, never taken from the model. */
  opportunity: "high" | "medium" | "low";
};

export type OutlineResult = {
  kind: PostKind;
  angle: string;
  searchIntent: "informational" | "commercial" | "transactional" | "navigational";
  audience: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  longTailQuestions: string[];
  titleOptions: string[];
  seoDescription: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  outline: { h2: string; h3s: string[]; keyPoints: string }[];
  faq: BlogFaqItem[];
  suggestedWordCount: number;
  /** Board listings to cover (roundups, comparisons, alternatives), checked to be live. */
  productSlugs: string[];
  /** Well-known tools outside DebutYard the keyword needs. */
  outsideTools: string[];
  keyword: KeywordSignal;
  keywordDataAvailable: boolean;
  /** Who ranks today, from a live Google search. */
  ranking: { title: string; url: string }[];
};

export type MetadataResult = {
  seoTitleOptions: LengthOption[];
  seoDescriptionOptions: LengthOption[];
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  secondaryKeywords: string[];
  coverAlt: string;
};

export type OptimizeEdit = { id: string; checkId: string; find: string; replace: string; why: string };

export type OptimizeResult = {
  fieldUpdates: Partial<{ seo_title: string; seo_description: string; excerpt: string; tags: string[] }>;
  edits: OptimizeEdit[];
  advice: { checkId: string; note: string }[];
  issuesConsidered: number;
};

export type InterlinkResult = { ranked: (LinkSuggestion & { note: string })[] };

/** One article opportunity from "Find ideas". */
export type ContentIdea = {
  id: string;
  kind: PostKind;
  title: string;
  /** Why it's worth writing, and the DebutYard angle. */
  angle: string;
  keyword: string;
  secondaryKeywords: string[];
  category: string;
  productSlugs: string[];
  outsideTools: string[];
  signal: KeywordSignal;
};

export type IdeasResult = { ideas: ContentIdea[]; keywordDataAvailable: boolean };

export type ImageResult = { url: string; width: number | null; height: number | null; alt: string };

export type AiResult = OutlineResult | MetadataResult | OptimizeResult | InterlinkResult | IdeasResult | ImageResult;

/** Appended to a text stream when a failure happens after streaming started (status is already 200). */
export const STREAM_ERROR_MARKER = "\n[[ERROR]]";
/** A progress line ("Reading the product's site…") the editor shows while research runs; never content. */
export const STREAM_STATUS_MARKER = "[[STATUS]]";
