"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A long table cut to its first 10 rows, fading out above a "View All" button.
 * The rest stay in the page, so printing the report still includes them.
 */
export function FoldedTable({ total, children }: { total: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open || total <= 10) return children;
  return (
    <div className="relative">
      <div className="[&_tbody>tr:nth-child(n+11)]:hidden print:[&_tbody>tr:nth-child(n+11)]:table-row">{children}</div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-36 items-end justify-center rounded-b-lg bg-gradient-to-t from-background via-background/90 to-transparent pb-3 print:hidden">
        <Button variant="outline" size="sm" className="pointer-events-auto bg-card" onClick={() => setOpen(true)}>
          View All
        </Button>
      </div>
    </div>
  );
}
