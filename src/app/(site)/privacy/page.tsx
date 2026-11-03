import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 2, 2026">
      <p>
        This policy explains what {site.legalName} ({site.country}) collects when you use {site.name}, why, and your
        choices. We follow Kenya&apos;s Data Protection Act, 2019, and aim to meet the GDPR standard for visitors from
        the EU and UK.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account data: your email, and your name and avatar if you sign in with Google or GitHub.</li>
        <li>Listing data you submit: product details, images and links.</li>
        <li>
          Order data: what you bought, amounts and the payment reference. Card details stay with Paystack or PayPal.
        </li>
        <li>
          Usage data: pages viewed, applause, clicks on outbound links, and technical data such as IP address and
          browser, used for analytics and to detect applause fraud.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run your account, publish your listings and deliver what you buy.</li>
        <li>To keep rankings fair by detecting fake accounts and applause manipulation.</li>
        <li>To send service emails (sign-in links, receipts, launch updates) and, if you opt in, our newsletter.</li>
        <li>To meet legal, tax and accounting obligations.</li>
        <li>
          To write once to businesses that have just launched about our submission service, using the contact address
          they publish on their own website and public information about their site. Every such email has an unsubscribe
          link, and we keep a record of addresses that opt out so we never contact them again.
        </li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        Service providers that run parts of {site.name} for us: hosting (Vercel), database (Supabase), file storage and
        bot protection (Cloudflare), email (Resend, and Maildoso for outreach email), payments (Paystack, PayPal),
        search and authority data (DataForSEO), writing and classification (Google Gemini) and fetching public web pages
        our own checks can&apos;t reach (Firecrawl). For the submission service, we share the product details you give
        us with the directories we submit to. We don&apos;t sell personal data.
      </p>

      <h2>Badge block</h2>
      <p>
        If you allow directory badges on a submission order, you add a small block to your website that loads from{" "}
        {site.name}. As with any file a page loads, our hosting provider receives the IP address and browser details of
        your visitors when it&apos;s fetched. We use these only to deliver the block and keep it secure, and we
        don&apos;t use them to identify or track your visitors. The block sets no cookies. The badges it shows may load
        images from the directories they came from, under those directories&apos; own policies. If your site&apos;s
        visitors are covered by your own privacy policy, mention this there. Removing the block stops all of this.
      </p>

      <h2>Bot protection</h2>
      <p>
        The Authority Score checker uses Cloudflare Turnstile to tell people from automated traffic. When you run a
        check, Turnstile collects information about your device and browser, such as your IP address and browser
        signals, and Cloudflare processes it to decide whether the request is genuine. Cloudflare&apos;s handling of
        this data is covered by the{" "}
        <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noopener noreferrer">
          Cloudflare Turnstile Privacy Addendum
        </a>
        .
      </p>

      <h2>Retention</h2>
      <p>
        We keep account and listing data while your account is open. Order records are kept as long as tax law requires.
        Applause and usage logs are kept for up to 24 months.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct, export or delete your data, or object to how we use it, by emailing{" "}
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>. You can also complain to the Office of the Data
        Protection Commissioner (Kenya) or your local authority.
      </p>

      <h2>Cookies</h2>
      <p>
        We use essential cookies to keep you signed in and to remember your checkout. We don&apos;t use advertising
        cookies.
      </p>
    </LegalPage>
  );
}
