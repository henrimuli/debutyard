"use client";

import { type ComponentProps, createContext, type ReactNode, useContext } from "react";
import { ButtonLink } from "@/components/ui/button";

const ModalMounted = createContext(false);

/** Marks pages where the debut modal is mounted (the public site layout), so links open it in place. */
export function DebutModalScope({ children }: { children: ReactNode }) {
  return <ModalMounted.Provider value>{children}</ModalMounted.Provider>;
}

/**
 * Opens the debut modal. Where it's mounted it just adds `?debut=1` to the
 * current URL (no server round-trip); elsewhere, like the dashboard, it
 * navigates to the homepage with it. `url` prefills the wizard.
 */
export function DebutLink({ url, ...props }: Omit<ComponentProps<typeof ButtonLink>, "href"> & { url?: string }) {
  const inPlace = useContext(ModalMounted);
  const query = `debut=1${url ? `&url=${encodeURIComponent(url)}` : ""}`;
  return (
    <ButtonLink
      {...props}
      // A query-only href resolves against the current page, and reading the pathname here would block prerendering.
      href={inPlace ? `?${query}` : `/?${query}`}
      scroll={false}
      onClick={(e) => {
        props.onClick?.(e);
        if (!inPlace || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        // Keep the page's own query and hash; the modal's close() strips just its own params.
        const next = new URLSearchParams(window.location.search);
        next.set("debut", "1");
        if (url) next.set("url", url);
        else next.delete("url");
        window.history.pushState(null, "", `${window.location.pathname}?${next}${window.location.hash}`);
      }}
    />
  );
}
