"use client";

import { useRef, useState, type ReactNode } from "react";
import { IconImage, IconPlus, IconTrash, IconWand } from "@/components/blog-admin/icons";
import { ChipInput, Counter, Field, Select, TextArea, TextInput } from "@/components/blog-admin/ui";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/blog/slug";
import type { BlogFields, StaffCategory, StaffPost } from "@/lib/blog/types";

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="space-y-4 px-4 pb-5">{children}</div>
    </details>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
    </label>
  );
}

type Uploaded = { url: string; width: number | null; height: number | null };

function Bylines({
  authors,
  isLaunch,
  onAdd,
  onRemove,
  onEditProfile,
}: {
  authors: StaffPost["authors"];
  isLaunch: boolean;
  onAdd: (query: string, role: "team" | "maker") => Promise<string | null>;
  onRemove: (userId: string) => void;
  onEditProfile: () => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"team" | "maker">("team");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      {authors.length === 0 ? (
        <p className="text-sm text-muted-foreground">Whoever publishes is added automatically.</p>
      ) : (
        <ul className="space-y-2">
          {authors.map((a) => (
            <li key={a.userId} className="flex items-center gap-2.5">
              <Avatar name={a.name} src={a.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="truncate text-xs text-muted-foreground">{a.role}</p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => onRemove(a.userId)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
              >
                <IconTrash />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Email or @handle"
          aria-label="Co-author email or handle"
        />
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as "team" | "maker")}
          aria-label="Co-author role"
          className="w-28 shrink-0"
        >
          <option value="team">Team</option>
          <option value="maker">Maker</option>
        </Select>
        <Button
          size="md"
          variant="outline"
          disabled={busy || !query.trim()}
          aria-label="Add co-author"
          onClick={async () => {
            setBusy(true);
            const err = await onAdd(query, role);
            setBusy(false);
            setError(err);
            if (!err) setQuery("");
          }}
        >
          <IconPlus />
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        {isLaunch
          ? "Launch posts are co-authored by the team and the product's maker."
          : "Team bylines use each person's author profile."}{" "}
        <button type="button" onClick={onEditProfile} className="font-semibold text-primary hover:underline">
          Edit your profile
        </button>
      </p>
    </div>
  );
}

export function SettingsPanel({
  fields,
  update,
  post,
  slug,
  status,
  featured,
  siteHost,
  categories,
  tags,
  onSaveSlug,
  onFeatured,
  onCreateCategory,
  onUpload,
  onGenerateCover,
  generatingCover,
  onAddAuthor,
  onRemoveAuthor,
  onEditProfile,
}: {
  fields: BlogFields;
  update: (patch: Partial<BlogFields>) => void;
  post: Pick<StaffPost, "kind" | "authors" | "product">;
  slug: string;
  status: "draft" | "published";
  featured: boolean;
  siteHost: string;
  categories: StaffCategory[];
  tags: string[];
  onSaveSlug: (slug: string) => Promise<string | null>;
  onFeatured: (v: boolean) => void;
  onCreateCategory: (name: string) => Promise<void>;
  onUpload: (file: File) => Promise<Uploaded | null>;
  onGenerateCover: (notes: string) => void;
  generatingCover: boolean;
  onAddAuthor: (query: string, role: "team" | "maker") => Promise<string | null>;
  onRemoveAuthor: (userId: string) => void;
  onEditProfile: () => void;
}) {
  const [slugDraft, setSlugDraft] = useState(slug);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugBusy, setSlugBusy] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [coverNotes, setCoverNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cleanSlug = slugify(slugDraft);
  const slugChanged = cleanSlug !== slug;

  async function saveSlug() {
    setSlugBusy(true);
    setSlugError(null);
    const err = await onSaveSlug(cleanSlug);
    setSlugBusy(false);
    if (err) setSlugError(err);
    else setSlugDraft(cleanSlug);
  }

  async function uploadCover(f: File) {
    setUploading(true);
    const r = await onUpload(f);
    setUploading(false);
    if (r) update({ cover_url: r.url, cover_width: r.width, cover_height: r.height });
  }

  return (
    <div>
      <Section title="URL & visibility">
        <Field
          label="URL"
          htmlFor="post-slug"
          hint={
            status === "published" ? "The old URL of a live post keeps working as a permanent redirect." : undefined
          }
        >
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card pl-3 focus-within:ring-2 focus-within:ring-ring">
            <span className="shrink-0 text-xs text-muted-foreground">/blog/</span>
            <input
              id="post-slug"
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value)}
              className="min-w-0 flex-1 bg-transparent py-2 pr-2 text-sm outline-none"
            />
          </div>
          {slugChanged ? (
            <div className="mt-2 flex items-start gap-2">
              <Button
                size="sm"
                className="h-auto min-h-8 min-w-0 whitespace-normal break-all py-1.5 text-left"
                onClick={() => void saveSlug()}
                disabled={slugBusy || !cleanSlug}
              >
                {slugBusy ? "Saving…" : `Use /blog/${cleanSlug || "…"}`}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  setSlugDraft(slug);
                  setSlugError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : null}
          {slugError ? (
            <p role="alert" className="mt-1 text-sm text-danger">
              {slugError}
            </p>
          ) : null}
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {siteHost}/blog/{slug}
          </p>
        </Field>
        <Toggle
          label="Featured"
          hint="Pins this post to the top of the blog."
          checked={featured}
          onChange={onFeatured}
        />
        <Toggle
          label="Hide from search engines"
          hint="Adds noindex. Anyone with the link can still read it."
          checked={fields.noindex}
          onChange={(v) => update({ noindex: v })}
        />
      </Section>

      <Section title="Authors">
        <Bylines
          authors={post.authors}
          isLaunch={post.kind === "launch"}
          onAdd={onAddAuthor}
          onRemove={onRemoveAuthor}
          onEditProfile={onEditProfile}
        />
      </Section>

      <Section title="Excerpt">
        <Field
          label="Excerpt"
          htmlFor="post-excerpt"
          right={<Counter value={fields.excerpt.length} min={80} max={220} />}
          hint="Shown on blog cards and under the headline."
        >
          <TextArea
            id="post-excerpt"
            rows={3}
            value={fields.excerpt}
            onChange={(e) => update({ excerpt: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Category & tags">
        <Field label="Category" htmlFor="post-category">
          <Select
            id="post-category"
            value={fields.category_id ?? ""}
            onChange={(e) => update({ category_id: e.target.value || null })}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {addingCat ? (
            <div className="mt-2 flex gap-2">
              <TextInput
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="New category name"
                aria-label="New category name"
              />
              <Button
                size="md"
                disabled={newCat.trim().length < 2}
                onClick={async () => {
                  await onCreateCategory(newCat.trim());
                  setNewCat("");
                  setAddingCat(false);
                }}
              >
                Add
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCat(true)}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <IconPlus className="size-3.5" /> New category
            </button>
          )}
        </Field>
        <Field label="Tags" hint="2–6 specific tags. Existing tags are suggested as you type.">
          <ChipInput
            label="Tag"
            values={fields.tags}
            onChange={(v) => update({ tags: v })}
            suggestions={tags}
            placeholder="Add a tag"
            max={12}
          />
        </Field>
        <Field
          label="Topic cluster"
          htmlFor="post-cluster"
          hint="A short label shared by posts on one theme (e.g. launch-directories). Related posts and link suggestions favour the same cluster."
        >
          <TextInput
            id="post-cluster"
            value={fields.cluster}
            onChange={(e) => update({ cluster: e.target.value })}
            placeholder="launch-directories"
          />
        </Field>
        <Toggle
          label="Pillar post"
          hint="A comprehensive hub other posts link to. Held to a longer target (1,500+ words)."
          checked={fields.is_pillar}
          onChange={(v) => update({ is_pillar: v })}
        />
      </Section>

      <Section title="Cover image">
        {fields.cover_url ? (
          // Uploaded or generated images live on R2, which next/image would need allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fields.cover_url}
            alt={fields.cover_alt}
            className="aspect-video w-full rounded-md border border-border object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-60"
          >
            <IconImage className="size-6" />
            {uploading ? "Uploading…" : "Upload a cover"}
            <span className="text-xs">1600 × 900 (16:9) recommended</span>
          </button>
        )}
        {fields.cover_url ? (
          <div className="space-y-2">
            <TextInput
              value={fields.cover_alt}
              onChange={(e) => update({ cover_alt: e.target.value })}
              placeholder="Alt text: describe the image"
              aria-label="Cover alt text"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                Replace
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => update({ cover_url: null, cover_alt: "", cover_width: null, cover_height: null })}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : null}
        <div className="space-y-2 rounded-md bg-muted/60 p-3">
          <p className="text-sm font-medium">Generate a banner</p>
          <p className="text-xs text-muted-foreground">
            Nano Banana draws an illustrated banner from the post, in DebutYard&apos;s colours. Add direction if you
            like.
          </p>
          <TextArea
            rows={2}
            value={coverNotes}
            onChange={(e) => setCoverNotes(e.target.value)}
            placeholder="Optional: “a launch rocket made of browser windows”"
            aria-label="Banner direction"
            maxLength={500}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={generatingCover || !fields.title.trim()}
            onClick={() => onGenerateCover(coverNotes)}
          >
            <IconWand />
            {generatingCover ? "Drawing…" : fields.cover_url ? "Generate a new banner" : "Generate banner"}
          </Button>
          {!fields.title.trim() ? <p className="text-xs text-muted-foreground">Add a headline first.</p> : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadCover(f);
          }}
        />
      </Section>

      <Section title="Advanced" defaultOpen={false}>
        <Field
          label="Canonical URL"
          htmlFor="post-canonical"
          hint="Only when the same post was published somewhere else first. Leave blank to use this page's URL."
        >
          <TextInput
            id="post-canonical"
            value={fields.canonical_url ?? ""}
            onChange={(e) => update({ canonical_url: e.target.value.trim() || null })}
            placeholder="https://"
          />
        </Field>
      </Section>
    </div>
  );
}
