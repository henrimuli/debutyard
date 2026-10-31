"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { homepageImageAction, logoUploadAction, prefillAction, saveProductAction } from "@/app/submit/actions";
import { ScreenshotsField } from "@/components/screenshots";
import { Button } from "@/components/ui/button";
import { Input, Label, Spinner } from "@/components/ui/primitives";
import { MAX_CATEGORIES, MAX_SCREENSHOTS, type ProductInput } from "@/lib/products/input";
import { normalizeWebsite } from "@/lib/products/website";
import { putToStorage } from "@/lib/upload";
import { cn } from "@/lib/utils";

type Category = { slug: string; name: string };

const pricingOptions: Array<{ value: ProductInput["pricingModel"]; label: string }> = [
  { value: "free", label: "Free" },
  { value: "freemium", label: "Freemium" },
  { value: "trial", label: "Free trial" },
  { value: "paid", label: "Paid" },
  { value: "open_source", label: "Open source" },
];

const empty: ProductInput = {
  websiteUrl: "",
  name: "",
  tagline: "",
  description: "",
  logoUrl: "",
  categories: [],
  pricingModel: "freemium",
  twitterUrl: "",
  githubUrl: "",
  screenshots: [],
};

/**
 * Listing details. Leaving the website field checks the address (fixing
 * small slips like a missing https://) and fetches what we can from the site.
 * `layout="modal"` lays the fields out in two columns for the debut modal.
 */
export function ProductForm({
  categories,
  initial,
  productId,
  uploadsEnabled,
  screenshotsEnabled = false,
  initialWebsiteUrl,
  layout = "page",
  onSaved,
  status,
}: {
  categories: Category[];
  initial?: ProductInput;
  productId?: string;
  uploadsEnabled: boolean;
  /** The screenshot worker is set up: a fetch screenshots the homepage when it has no OG image. */
  screenshotsEnabled?: boolean;
  initialWebsiteUrl?: string;
  layout?: "page" | "modal";
  /** Called with the listing id after saving. Defaults to the plan page. */
  onSaved?: (id: string) => void;
  /** The caller's progress after saving (modal only), e.g. loading the plans. */
  status?: { text: string; error?: boolean } | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductInput>(
    initial ?? (initialWebsiteUrl ? { ...empty, websiteUrl: initialWebsiteUrl } : empty),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [urlNote, setUrlNote] = useState<string | null>(null);
  const [prefilling, startPrefill] = useTransition();
  const [saving, startSave] = useTransition();
  const [uploading, setUploading] = useState(false);
  // The last address we fetched, so leaving the field again doesn't refetch it.
  const fetchedUrl = useRef<string | null>(initial?.websiteUrl ?? null);
  const pricingTouched = useRef(Boolean(initial));
  const [capturing, setCapturing] = useState(false);
  const screenshots = values.screenshots ?? [];

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  /** Validates and tidies the website field. Returns the cleaned URL, or null with an error shown. */
  function checkWebsite(raw: string): string | null {
    const res = normalizeWebsite(raw);
    if (!res.ok) {
      setErrors((e) => ({ ...e, websiteUrl: res.error }));
      setUrlNote(null);
      return null;
    }
    setErrors((e) => {
      const rest = { ...e };
      delete rest.websiteUrl;
      return rest;
    });
    if (res.url !== raw.trim()) {
      set("websiteUrl", res.url);
      setUrlNote(`We tidied that to ${res.url}`);
    } else {
      setUrlNote(null);
    }
    return res.url;
  }

  /**
   * Puts the homepage's OG image (or, without one, a screenshot) into the first
   * free slot. Called once the prefill has found the OG image, so the form fills first.
   */
  async function capture(url: string, ogImageUrl?: string) {
    if (!uploadsEnabled || (!ogImageUrl && !screenshotsEnabled) || screenshots.length >= MAX_SCREENSHOTS) {
      return setCapturing(false);
    }
    setCapturing(true);
    try {
      const res = await homepageImageAction(url, ogImageUrl);
      if (res.ok) {
        setValues((v) => {
          const shots = v.screenshots ?? [];
          return shots.length < MAX_SCREENSHOTS ? { ...v, screenshots: [...shots, res.data.url] } : v;
        });
      }
    } finally {
      setCapturing(false);
    }
  }

  function prefill(url: string) {
    fetchedUrl.current = url;
    setMessage(null);
    const wantsImage = uploadsEnabled && screenshots.length < MAX_SCREENSHOTS;
    if (wantsImage) setCapturing(true);
    startPrefill(async () => {
      const res = await prefillAction(url);
      if (!res.ok) {
        if (wantsImage) void capture(url);
        return setMessage(res.error);
      }
      const d = res.data;
      if (wantsImage) void capture(d.url, d.imageUrl);
      // Pre-tick suggested categories only if the maker hasn't picked any yet.
      const known = new Set(categories.map((c) => c.slug));
      const suggested = d.categories.filter((c) => known.has(c)).slice(0, MAX_CATEGORIES);
      const picked = values.categories.length ? [] : suggested;
      setValues((v) => ({
        ...v,
        websiteUrl: d.url,
        name: v.name || d.name || "",
        tagline: v.tagline || d.tagline || "",
        description: v.description || d.description || "",
        logoUrl: v.logoUrl || d.logoUrl || "",
        twitterUrl: v.twitterUrl || d.twitterUrl || "",
        githubUrl: v.githubUrl || d.githubUrl || "",
        // Only replace the default pricing, never one the maker chose.
        pricingModel: !pricingTouched.current && d.pricingModel ? d.pricingModel : v.pricingModel,
        categories: v.categories.length ? v.categories : suggested,
      }));
      fetchedUrl.current = d.url;
      const names = picked.map((s) => categories.find((c) => c.slug === s)?.name).filter(Boolean);
      setMessage(
        names.length
          ? `We filled in what we could find and picked ${names.join(", ")} as categories. Check everything before continuing.`
          : "We filled in what we could find. Check everything before continuing.",
      );
    });
  }

  function fetchSite() {
    const url = checkWebsite(values.websiteUrl);
    if (url) prefill(url);
  }

  /** Leaving the field: check it, then fetch automatically if it's a new address. */
  function onWebsiteBlur(e: React.FocusEvent<HTMLInputElement>) {
    // Heading for Fetch or Continue: let that button's own click handle it.
    if ((e.relatedTarget as HTMLElement | null)?.dataset.ownsFetch !== undefined) return;
    if (!values.websiteUrl.trim() || prefilling) return;
    const url = checkWebsite(values.websiteUrl);
    if (url && url !== fetchedUrl.current) prefill(url);
  }

  // Arriving with ?url= (from the readiness check): fetch straight away.
  const autoFetched = useRef(false);
  useEffect(() => {
    if (autoFetched.current || initial || !initialWebsiteUrl) return;
    autoFetched.current = true;
    fetchSite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadLogo(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const res = await logoUploadAction(file.type, file.size);
      if (!res.ok) throw new Error(res.error);
      await putToStorage(res.data.uploadUrl, file);
      set("logoUrl", res.data.publicUrl);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function toggleCategory(slug: string) {
    setValues((v) => {
      const has = v.categories.includes(slug);
      if (!has && v.categories.length >= MAX_CATEGORIES) return v;
      return { ...v, categories: has ? v.categories.filter((c) => c !== slug) : [...v.categories, slug] };
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const websiteUrl = checkWebsite(values.websiteUrl);
    if (!websiteUrl) return;
    if (screenshots.length === 0) {
      setErrors({
        screenshots: capturing
          ? "Hold on, we're still taking a screenshot of your homepage."
          : "Add at least one screenshot",
      });
      document.getElementById("screenshots")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setErrors({});
    startSave(async () => {
      const res = await saveProductAction({ ...values, websiteUrl }, productId);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setMessage(res.error);
        return;
      }
      if (onSaved) onSaved(res.data.id);
      else router.push(`/dashboard/products/${res.data.id}/plan`);
    });
  }

  const field = (key: keyof ProductInput) => errors[key] && <p className="text-sm text-danger">{errors[key]}</p>;
  const modal = layout === "modal";

  const website = (
    <section className="space-y-2">
      <Label htmlFor="websiteUrl">Website</Label>
      <div className="flex gap-2">
        <Input
          id="websiteUrl"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="yourproduct.com"
          value={values.websiteUrl}
          aria-invalid={Boolean(errors.websiteUrl)}
          onChange={(e) => {
            set("websiteUrl", e.target.value);
            setUrlNote(null);
          }}
          onBlur={onWebsiteBlur}
          onKeyDown={(e) => {
            // Enter in the website field fetches rather than submitting the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              if (!prefilling) fetchSite();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="w-28"
          data-owns-fetch
          onClick={fetchSite}
          disabled={!values.websiteUrl.trim() || prefilling}
          aria-live="polite"
        >
          {prefilling ? (
            <>
              <Spinner />
              Fetching
            </>
          ) : (
            "Fetch"
          )}
        </Button>
      </div>
      {urlNote && !errors.websiteUrl && <p className="text-xs text-muted-foreground">{urlNote}</p>}
      {field("websiteUrl")}
    </section>
  );

  const nameAndPricing = (
    <section className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name">Product name</Label>
        <Input id="name" required maxLength={60} value={values.name} onChange={(e) => set("name", e.target.value)} />
        {field("name")}
      </div>
      <div className="space-y-2">
        <Label htmlFor="pricingModel">Pricing</Label>
        <select
          id="pricingModel"
          className="h-11 w-full rounded-md border border-border bg-card px-3 text-base sm:h-10 sm:text-sm"
          value={values.pricingModel}
          onChange={(e) => {
            pricingTouched.current = true;
            set("pricingModel", e.target.value as ProductInput["pricingModel"]);
          }}
        >
          {pricingOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );

  const tagline = (
    <section className="space-y-2">
      <Label htmlFor="tagline">Tagline</Label>
      <Input
        id="tagline"
        required
        maxLength={80}
        placeholder="What it does, in one line"
        value={values.tagline}
        onChange={(e) => set("tagline", e.target.value)}
      />
      <p className="text-xs text-muted-foreground">{values.tagline.length}/80</p>
      {field("tagline")}
    </section>
  );

  const description = (
    <section className="space-y-2">
      <Label htmlFor="description">Description</Label>
      <textarea
        id="description"
        required
        rows={modal ? 8 : 6}
        maxLength={2000}
        className="w-full rounded-md border border-border bg-card p-3 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Who it's for, the problem it solves, and what makes it different."
        value={values.description}
        onChange={(e) => set("description", e.target.value)}
      />
      {field("description")}
    </section>
  );

  const logo = (
    <section className="space-y-2">
      <Label htmlFor="logoUrl">Logo</Label>
      <div className="flex items-center gap-4">
        {values.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={values.logoUrl} alt="" className="size-14 rounded-md border border-border bg-card object-contain" />
        ) : (
          <div className="size-14 shrink-0 rounded-md border border-dashed border-border" />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            id="logoUrl"
            type="url"
            placeholder="https://… (square, at least 128px)"
            value={values.logoUrl ?? ""}
            onChange={(e) => set("logoUrl", e.target.value)}
          />
          {uploadsEnabled && (
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
              className="max-w-full text-sm text-muted-foreground"
            />
          )}
        </div>
      </div>
      {field("logoUrl")}
    </section>
  );

  const screenshotPicker = (
    <ScreenshotsField
      value={screenshots}
      onChange={(update) => setValues((v) => ({ ...v, screenshots: update(v.screenshots ?? []) }))}
      capturing={capturing}
      uploadsEnabled={uploadsEnabled}
      error={errors.screenshots}
    />
  );

  const categoryPicker = (
    <section className="space-y-2">
      <Label>Categories (up to {MAX_CATEGORIES})</Label>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const active = values.categories.includes(c.slug);
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => toggleCategory(c.slug)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
              aria-pressed={active}
            >
              {c.name}
            </button>
          );
        })}
      </div>
      {field("categories")}
    </section>
  );

  const socials = (
    <section className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="twitterUrl">X / Twitter (optional)</Label>
        <Input
          id="twitterUrl"
          type="url"
          placeholder="https://x.com/yourhandle"
          value={values.twitterUrl ?? ""}
          onChange={(e) => set("twitterUrl", e.target.value)}
        />
        {field("twitterUrl")}
      </div>
      <div className="space-y-2">
        <Label htmlFor="githubUrl">GitHub (optional)</Label>
        <Input
          id="githubUrl"
          type="url"
          placeholder="https://github.com/you/repo"
          value={values.githubUrl ?? ""}
          onChange={(e) => set("githubUrl", e.target.value)}
        />
        {field("githubUrl")}
      </div>
    </section>
  );

  const footer = (
    <>
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      <Button type="submit" size="lg" data-owns-fetch disabled={saving || uploading || prefilling}>
        {saving ? "Saving…" : "Continue to plan"}
      </Button>
    </>
  );

  if (modal) {
    const note = message ? { text: message, error: false } : status;
    return (
      <form onSubmit={save} className="space-y-6">
        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
          <div className="space-y-6">
            {website}
            {nameAndPricing}
            {tagline}
            {logo}
            {description}
          </div>
          <div className="space-y-6">
            {screenshotPicker}
            {categoryPicker}
            {socials}
          </div>
        </div>
        {/* Pinned to the bottom of the modal's scroll area. */}
        <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 flex flex-col gap-3 border-t border-border bg-card px-6 py-4 sm:-mx-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          {note ? (
            <p className={cn("rounded-md p-3 text-sm sm:flex-1", note.error ? "bg-danger/10 text-danger" : "bg-muted")}>
              {note.text}
            </p>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" data-owns-fetch disabled={saving || uploading || prefilling}>
            {saving ? "Saving…" : "Continue to plan →"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={save} className="space-y-8">
      {website}
      {nameAndPricing}
      {tagline}
      {description}
      {logo}
      {screenshotPicker}
      {categoryPicker}
      {socials}
      {footer}
    </form>
  );
}
