"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { signIn } from "@/lib/auth-client";
import { AUTH_MESSAGE } from "@/lib/auth-popup";

const providerLabels = { google: "Continue with Google", github: "Continue with GitHub" } as const;
export type SocialProvider = keyof typeof providerLabels;

/** Only same-site paths, so ?next= can't be used as an open redirect. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

/** A centred popup over the current window. */
function openPopup(): Window | null {
  const w = 500;
  const h = 640;
  const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
  return window.open("about:blank", "debutyard-sign-in", `popup,width=${w},height=${h},left=${left},top=${top}`);
}

/**
 * Magic link plus Google/GitHub. Social sign-in runs in a popup and calls
 * `onSignedIn` when it finishes; if the popup is blocked it falls back to a
 * full-page redirect that lands on `next`. The magic link always lands on `next`.
 */
export function SignInForm({
  socialProviders,
  next,
  onSignedIn,
}: {
  socialProviders: SocialProvider[];
  next: string;
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [waitingFor, setWaitingFor] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const onSignedInRef = useRef(onSignedIn);
  useEffect(() => {
    onSignedInRef.current = onSignedIn;
  });

  // The popup page posts back here when the provider sends it home.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.type !== AUTH_MESSAGE) return;
      setWaitingFor(null);
      if (e.data.ok) onSignedInRef.current();
      else setError(e.data.error ?? "Sign-in didn't complete. Try again.");
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Notice when the maker closes the popup without finishing.
  useEffect(() => {
    if (!waitingFor) return;
    const id = setInterval(() => {
      if (popupRef.current?.closed) setWaitingFor(null);
    }, 500);
    return () => clearInterval(id);
  }, [waitingFor]);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const { error } = await signIn.magicLink({ email, callbackURL: next });
    if (error) {
      setError(error.message ?? "Couldn't send the link. Try again.");
      setState("idle");
    } else {
      setState("sent");
    }
  }

  async function social(provider: SocialProvider) {
    setError(null);
    // Open the window inside the click so popup blockers allow it, then point it at the provider.
    const popup = openPopup();
    popupRef.current = popup;
    const landing = `/auth/popup?next=${encodeURIComponent(next)}`;
    const { data, error } = await signIn.social({
      provider,
      callbackURL: landing,
      errorCallbackURL: landing,
      disableRedirect: true,
    });
    if (error || !data?.url) {
      popup?.close();
      setError(error?.message ?? "Couldn't reach the sign-in provider. Try again.");
      return;
    }
    if (!popup || popup.closed) {
      window.location.assign(data.url);
      return;
    }
    popup.location.href = data.url;
    popup.focus();
    setWaitingFor(provider);
  }

  if (state === "sent") {
    return (
      <div className="mt-6 space-y-3 rounded-md bg-success/10 p-4 text-sm text-success">
        <p>
          Check <strong>{email}</strong> for your sign-in link. It expires in 15 minutes.
        </p>
        <button type="button" className="text-xs underline underline-offset-4" onClick={() => setState("idle")}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {socialProviders.length > 0 && (
        <div className="space-y-2">
          {socialProviders.map((provider) => (
            <Button
              key={provider}
              variant="outline"
              className="w-full"
              disabled={waitingFor !== null}
              onClick={() => social(provider)}
            >
              <ProviderIcon provider={provider} />
              {waitingFor === provider ? "Finish in the popup…" : providerLabels[provider]}
            </Button>
          ))}
          <div className="flex items-center gap-3 pt-2 text-xs uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}

      <form onSubmit={sendLink} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Email me a link"}
        </Button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function ProviderIcon({ provider }: { provider: SocialProvider }) {
  if (provider === "github") {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current">
        <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.28a12 12 0 0 0 0 10.8l4.01-3.11Z" />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.6l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}
