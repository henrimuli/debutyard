export const site = {
  name: "DebutYard",
  tagline: "Launch. Network. Grow.",
  description:
    "DebutYard is a weekly launch board for SaaS and startups, plus a done-for-you directory submission service where every link is verified and monitored.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://debutyard.com",
  supportEmail: "support@debutyard.com",
  /** Legal entity shown in the policies. Update once the business is registered. */
  legalName: "DebutYard SaaS Solutions",
  country: "Kenya",
  /** Required in cold email, shown in its footer. */
  postalAddress: "A501 ShawHill Plaza, Moi Drive, Nairobi",
  social: { x: "https://x.com/hmhenree" },
} as const;
