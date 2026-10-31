import { Suspense } from "react";
import { DebutModalScope } from "@/components/debut/debut-link";
import { DebutModal } from "@/components/debut/debut-modal";
import { ExitPopup } from "@/components/kit/exit-popup";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { enabledSocialProviders } from "@/lib/auth";
import { turnstileSiteKey } from "@/lib/turnstile";

/**
 * Public pages: header, footer, the "Debut your product" modal that any page opens in place with `?debut=1`,
 * and the Founder Kit exit-intent popup.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <DebutModalScope>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <Suspense>
        <DebutModal socialProviders={enabledSocialProviders()} />
        <ExitPopup turnstileSiteKey={turnstileSiteKey()} />
      </Suspense>
    </DebutModalScope>
  );
}
