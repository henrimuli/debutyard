"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Placement } from "@/lib/ads/placements";

/** The placement the booking form should start on, when a card opened it. */
export const BookingPlacementContext = createContext<Placement | null>(null);

const OpenContext = createContext<(placement: Placement) => void>(() => {});

/**
 * The slot-booking modal for a page. `form` is the server-rendered booking form;
 * it mounts fresh on each opening, on the placement that was clicked.
 */
export function BookingModalScope({ form, children }: { form: ReactNode; children: ReactNode }) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const open = useCallback((p: Placement) => setPlacement(p), []);
  const close = useCallback(() => setPlacement(null), []);

  // Sign-in sends people back to #book, and older links point there.
  useEffect(() => {
    // The hash is only readable after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.location.hash === "#book") setPlacement("leaderboard");
  }, []);

  return (
    <OpenContext value={open}>
      {children}
      {placement && (
        <Dialog onClose={close} label="Book a slot" size="md" className="max-w-3xl p-6">
          <h2 className="pr-8 font-display text-lg font-semibold">Book a slot</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Pick a placement, a listing and a start week. Unpaid bookings hold their slot for an hour.
          </p>
          <BookingPlacementContext value={placement}>{form}</BookingPlacementContext>
        </Dialog>
      )}
    </OpenContext>
  );
}

/** Opens the booking modal on `placement`. */
export function BookSlotButton({
  placement,
  ...props
}: { placement: Placement } & Omit<ComponentProps<typeof Button>, "onClick" | "type">) {
  const open = use(OpenContext);
  return <Button type="button" onClick={() => open(placement)} {...props} />;
}
