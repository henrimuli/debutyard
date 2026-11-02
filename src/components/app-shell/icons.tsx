import type { ComponentProps } from "react";

/** Small stroke icons for the app sidebars. 24×24, inherit colour. */
const paths = {
  overview: "M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",
  products: "M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  tracker: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  links: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  orders:
    "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm13-3a5 5 0 0 1 0 8m2.5-10.5a8.5 8.5 0 0 1 0 13",
  card: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 3h18M7 15h3",
  gift: "M4 11h16v9H4v-9Zm-1-4h18v4H3V7Zm9 0v13M12 7H8.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Zm0 0h3.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z",
  code: "m8 9-4 3 4 3m8-6 4 3-4 3M14 5l-4 14",
  review: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  inbox: "M4 13h4l1.5 3h5L16 13h4M5 5h14l1 8v6H4v-6l1-8Z",
  directory: "M4 5a2 2 0 0 1 2-2h5l2 3h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z",
  pen: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  mail: "M4 6h16v12H4V6Zm0 0 8 7 8-7",
  users:
    "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m17 0v-1a4 4 0 0 0-3-3.87M14 4.13a4 4 0 0 1 0 7.75M13.5 7.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z",
  external: "M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  plus: "M12 5v14M5 12h14",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  logout: "M15 17l5-5-5-5m5 5H9m4 9H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z",
  check: "M5 12.5 10 17.5 19 7",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  alert: "M12 9v4m0 4h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z",
  back: "M19 12H5m6-6-6 6 6 6",
  copy: "M9 9h11v11H9V9Zm-4 6H4V4h11v1",
  reply: "M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11Z",
  forward: "M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11Z",
  clip: "m21 11-8.6 8.6a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l8-8",
  minus: "M5 12h14",
  dot: "M12 12h.01",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, ...props }: { name: IconName } & ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
