import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { site } from "@/config/site";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name}: ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: {
    siteName: site.name,
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: `${site.name}: ${site.tagline}` }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
  // The icon suite lives in public/ (see public/icons/README.md).
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    other: [{ rel: "mask-icon", url: "/icons/safari-pinned-tab.svg", color: "#0e9f6a" }],
  },
  manifest: "/site.webmanifest",
  other: { "msapplication-config": "/browserconfig.xml" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1714" },
  ],
};

/** Shell only. Public pages get the header and footer from (site)/layout.tsx; auth, dashboard and admin have their own. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: themeScript may set data-theme before React hydrates.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
