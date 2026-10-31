"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveDirectoryAction } from "@/app/admin/directories/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import type { DirectoryInput } from "@/lib/directories/service";
import { Select } from "@/components/ui/select";

type Values = {
  name: string;
  slug: string;
  url: string;
  submitUrl: string;
  description: string;
  niche: "general" | "devtools" | "ai" | "indie" | "b2b";
  pricing: "free" | "freemium" | "paid";
  dr: string;
  linkTypeClaimed: "dofollow" | "nofollow" | "unknown";
  badgeRequired: boolean;
  needsAccount: boolean;
  guided: boolean;
  queueEstimateDays: string;
  submissionNotes: string;
  instructions: string;
  badgeSnippet: string;
  isActive: boolean;
};

const selectCls = "h-10 w-full rounded-md border border-border bg-card px-3 text-sm";
const areaCls =
  "w-full rounded-md border border-border bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function DirectoryEditor({ id, initial }: { id: string | null; initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((s) => ({ ...s, [k]: val }));

  function save() {
    setMsg(null);
    start(async () => {
      const input: DirectoryInput = { ...v, dr: v.dr, queueEstimateDays: v.queueEstimateDays, submitUrl: v.submitUrl };
      const res = await saveDirectoryAction(input, id);
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: "Saved." });
      if (!id) router.replace(`/admin/directories/${res.id}`);
    });
  }

  const text = (k: "name" | "slug" | "url" | "submitUrl" | "dr" | "queueEstimateDays", label: string, ph = "") => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={v[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  const check = (k: "badgeRequired" | "needsAccount" | "guided" | "isActive", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={v[k]} onChange={(e) => set(k, e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {text("name", "Name")}
        {text("slug", "Slug", "from the name")}
        {text("url", "Website", "https://")}
        {text("submitUrl", "Submit page", "https:// (optional)")}
        {text("dr", "Authority Score", "0–100")}
        {text("queueEstimateDays", "Typical queue (days)")}
        <div className="space-y-1.5">
          <Label htmlFor="niche">Niche</Label>
          <Select
            id="niche"
            className={selectCls}
            value={v.niche}
            onChange={(e) => set("niche", e.target.value as Values["niche"])}
          >
            {["general", "devtools", "ai", "indie", "b2b"].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pricing">Pricing</Label>
          <Select
            id="pricing"
            className={selectCls}
            value={v.pricing}
            onChange={(e) => set("pricing", e.target.value as Values["pricing"])}
          >
            {["free", "freemium", "paid"].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="link">Link type (as stated)</Label>
          <Select
            id="link"
            className={selectCls}
            value={v.linkTypeClaimed}
            onChange={(e) => set("linkTypeClaimed", e.target.value as Values["linkTypeClaimed"])}
          >
            {["dofollow", "nofollow", "unknown"].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-5">
        {check("badgeRequired", "Badge required")}
        {check("needsAccount", "Needs an account")}
        {check("guided", "Needs the maker (guided)")}
        {check("isActive", "Active")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="desc">Description (public)</Label>
        <textarea
          id="desc"
          rows={2}
          className={areaCls}
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes for makers (public)</Label>
        <textarea
          id="notes"
          rows={2}
          className={areaCls}
          value={v.submissionNotes}
          onChange={(e) => set("submissionNotes", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="instr">Submission instructions (internal: shown in the ops console)</Label>
        <textarea
          id="instr"
          rows={6}
          className={areaCls}
          value={v.instructions}
          onChange={(e) => set("instructions", e.target.value)}
        />
      </div>
      {v.badgeRequired && (
        <div className="space-y-1.5">
          <Label htmlFor="badge">
            Badge snippet (HTML the directory asks makers to embed; goes in the client badge block)
          </Label>
          <textarea
            id="badge"
            rows={3}
            className={`${areaCls} font-mono`}
            value={v.badgeSnippet}
            onChange={(e) => set("badgeSnippet", e.target.value)}
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          Save
        </Button>
        {msg && <p className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</p>}
      </div>
    </div>
  );
}
