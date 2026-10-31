"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { DebutWizard } from "@/components/debut/debut-wizard";
import { Logo } from "@/components/logo";
import { SignInForm, type SocialProvider } from "@/components/sign-in-form";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/primitives";
import { useSession } from "@/lib/auth-client";

const subscribeNoop = () => () => {};

/**
 * "Debut your product", opened by `?debut=1` on any public page. Signed-out
 * visitors get a sign-in dialog first; the magic link brings them back to the
 * same page with `?debut=1`, which reopens this straight into the submission wizard.
 */
export function DebutModal({ socialProviders }: { socialProviders: SocialProvider[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const open = params.has("debut");
  // Dialogs portal into document.body, so render only in the browser.
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  // Native history updates sync with useSearchParams, so closing doesn't wait on a server round-trip.
  const close = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("debut");
    next.delete("url");
    const qs = next.toString();
    window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, [params, pathname]);

  if (!open || !isClient) return null;
  return (
    <ModalBody
      socialProviders={socialProviders}
      initialUrl={params.get("url")}
      back={`${pathname}?${params}`}
      onClose={close}
      onSignedIn={() => router.refresh()}
    />
  );
}

function ModalBody({
  socialProviders,
  initialUrl,
  back,
  onClose,
  onSignedIn,
}: {
  socialProviders: SocialProvider[];
  initialUrl: string | null;
  back: string;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const session = useSession();

  if (session.isPending && !session.data) {
    return (
      <Dialog onClose={onClose} label="Loading">
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
          <Spinner /> Loading…
        </div>
      </Dialog>
    );
  }

  if (!session.data) {
    return (
      <Dialog onClose={onClose} label="Sign in to debut your product">
        <div className="p-7">
          <Logo className="text-lg" />
          <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">Debut your product</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in first so you can track your listing. New here? This creates your account.
          </p>
          <SignInForm
            socialProviders={socialProviders}
            next={back}
            onSignedIn={() => {
              void session.refetch();
              onSignedIn();
            }}
          />
        </div>
      </Dialog>
    );
  }

  return <DebutWizard initialUrl={initialUrl} onClose={onClose} />;
}
