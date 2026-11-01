import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="October 26, 2026">
      <p>
        These terms govern your use of {site.name} ({site.url}), operated by {site.legalName}. By using the site or
        buying anything on it, you agree to them.
      </p>

      <h2>What we offer</h2>
      <ul>
        <li>A launch board where makers list products and the community applauds them each week.</li>
        <li>Paid debut tiers, featured placements and newsletter sponsorships.</li>
        <li>
          A directory submission service: we submit your product to third-party directories by hand and report the
          result of each submission.
        </li>
        <li>
          Subscriptions such as Maker Pro and Maker Unlimited. &quot;Unlimited&quot; is subject to fair use: normal use
          by one maker or team, not reselling or automated bulk use. If an account goes well beyond that, we&apos;ll
          contact you before limiting anything.
        </li>
      </ul>

      <h2>Your account and listings</h2>
      <ul>
        <li>You must give accurate information and keep your account secure.</li>
        <li>
          You may only list products you own or are authorised to promote. Listings must be truthful, link to a working
          product, and must not contain malware, scams, adult content or anything illegal.
        </li>
        <li>We review every listing and may decline or remove listings that break these terms.</li>
        <li>
          You give us a licence to display your listing content (name, logo, screenshots, descriptions) on {site.name},
          in our newsletter and on social media to promote it.
        </li>
      </ul>

      <h2>Applause and fair play</h2>
      <p>
        Buying, trading or automating applause, or creating accounts to applaud, is not allowed. We filter suspicious
        applause and may disqualify products or close accounts involved in manipulation. Paid plans buy placement, never
        applause.
      </p>

      <h2>Free listings and the badge</h2>
      <p>
        Free debuts get a followed link while our badge stays on your website. If the badge is removed, the link on your
        listing becomes nofollow after a 7-day grace period, and is restored when the badge returns.
      </p>

      <h2>Directory submissions</h2>
      <p>
        Third-party directories decide independently whether to accept a listing, and may change or remove it later. We
        guarantee the number of submissions we make and an honest report of each outcome, not acceptance by any
        particular directory, traffic, rankings or sales.
      </p>

      <h2>Payments</h2>
      <p>
        Prices are in US dollars. Payments are processed by Paystack and PayPal; we never see or store your full card
        details. Refunds follow our <Link href="/refund-policy">refund policy</Link>.
      </p>

      {/* Affiliates are paused (see src/lib/affiliates/PAUSED.md).
      <h2 id="affiliates">Affiliate program</h2>
      <p>
        Affiliates earn 30% of the first payment for a submission package or paid debut bought within 60 days of a
        visitor clicking their link (the last affiliate link clicked wins). You can&apos;t earn commission on your own
        purchases. A commission is approved 30 days after the payment if it hasn&apos;t been refunded, and refunds
        reduce or cancel it. We pay approved commissions by PayPal to the email you give us, usually monthly. Spam, paid
        search on our name, misleading claims and self-referrals aren&apos;t allowed; we may suspend an affiliate and
        withhold unpaid commission for breaking these rules.
      </p>
      */}

      <h2>Liability</h2>
      <p>
        {site.name} is provided &quot;as is&quot;. To the extent the law allows, our total liability for any claim is
        limited to the amount you paid us in the 12 months before it arose, and we aren&apos;t liable for indirect or
        consequential losses.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will post the new date above. Questions:{" "}
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>
    </LegalPage>
  );
}
