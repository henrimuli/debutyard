"use client";

import { useState } from "react";
import { DomainRating, DrAttribution } from "@/components/metrics/domain-rating";
import { Badge, Input } from "@/components/ui/primitives";

export type DirectoryChoice = {
  id: string;
  name: string;
  dr: number | null;
  niche: string;
  badgeRequired: boolean;
  starred: boolean;
};

/** A searchable list of the directories staff can put on an order, best fit first. */
export function DirectoryPicker({
  label,
  choices,
  disabled,
  onPick,
}: {
  label: string;
  choices: DirectoryChoice[];
  disabled: boolean;
  onPick: (choice: DirectoryChoice) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? choices.filter((c) => `${c.name} ${c.niche}`.toLowerCase().includes(q)) : choices;

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search dofollow directories"
        aria-label={label}
        className="h-9 text-sm"
      />
      {shown.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          {choices.length === 0 ? "No other dofollow directories are available." : "No matching directories."}
        </p>
      ) : (
        <>
          <DrAttribution className="block px-1" />
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card">
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(c)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <span className="min-w-0 truncate font-medium">{c.name}</span>
                  {c.starred && (
                    <span title="Starred" className="text-amber-500">
                      ★
                    </span>
                  )}
                  {c.dr !== null && <DomainRating score={c.dr} />}
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {c.badgeRequired && <Badge tone="accent">badge</Badge>}
                    <Badge>{c.niche}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
