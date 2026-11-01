"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Card } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";

/** Query value for "not one of my listings", so a single listing isn't picked again by default. */
export const NO_LISTING = "none";

/** Which listing the order is for. Kept in the URL, so the server-rendered packages buy for that listing. */
export function ListingPicker({
  listings,
  selected,
}: {
  listings: Array<{ id: string; name: string }>;
  selected: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  return (
    <Card className="mt-6 p-4 sm:p-5">
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium">Which product is this for?</span>
        <Select
          className="h-11 w-full max-w-sm rounded-md border border-border bg-card px-3 text-base sm:h-10 sm:text-sm"
          value={selected ?? NO_LISTING}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            start(() => router.replace(`${pathname}?product=${next}`, { scroll: false }));
          }}
        >
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value={NO_LISTING}>A product not listed here</option>
        </Select>
      </label>
      <p className="mt-2 text-sm text-muted-foreground">
        {selected
          ? "We'll start your order with its details filled in."
          : "You'll add its details on a short form after checkout."}
      </p>
    </Card>
  );
}
