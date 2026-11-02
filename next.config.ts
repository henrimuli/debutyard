import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // forbidden(): admin pages show an "admins only" page (403) to signed-in non-staff.
  experimental: { authInterrupts: true },
  // Temporary badge check: directories only look at the domain root, so serve the test page there.
  // Only on the preview domain. Change "script" to "server" to test the other method.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "preview.debutyard.com" }],
          destination: "/badge-check/script",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      // Submitting happens in a modal on the homepage; editing lives in the dashboard.
      { source: "/submit", destination: "/?debut=1", permanent: false },
      { source: "/submit/:id/plan", destination: "/dashboard/products/:id/plan", permanent: false },
      { source: "/submit/:id", destination: "/dashboard/products/:id", permanent: false },
      // Prices now sit next to what they're for (submit flow, directory service, dashboard).
      { source: "/pricing", destination: "/", permanent: false },
      // Voting is now Applause.
      // "Pick a winner" is gone; old links land on this week's board.
      { source: "/vote", destination: "/", permanent: true },
      { source: "/applause", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
