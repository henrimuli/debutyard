"use client";

import { useState, useTransition } from "react";
import { checkBlockAction } from "@/app/(site)/orders/[token]/actions";
import { CodeBlock } from "@/components/code-block";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { site } from "@/config/site";
import { installKit, type InstallKit } from "@/lib/badge-block/render";
import { cn } from "@/lib/utils";

const NOT_FOUND = {
  missing:
    "We loaded your homepage but the block isn't there yet. If you've just deployed, give it a minute and check again. It has to be on the homepage, not another page.",
  blocked:
    "Your site's bot protection turned us away, so we couldn't look. Allow our checker through, or email us and we'll sort it out with you.",
  unreachable: "We couldn't load your site. Check the website you gave us is right and that it's up.",
};

/** The block's install instructions: the prompt for a coding agent, or the tag to paste by hand. */
export function InstallOptions({ kit }: { kit: InstallKit }) {
  const [tab, setTab] = useState<"agent" | "diy">("agent");
  const tabs = [
    ["agent", "Working with an agent?"],
    ["diy", "Do it yourself"],
  ] as const;
  return (
    <div className="space-y-3">
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              tab === id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "agent" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Copy this prompt and paste it into Claude Code, Cursor, Lovable, Bolt or whichever coding agent you use. It
            has everything the agent needs, and you can read or edit it there.
          </p>
          {/* A preview: the Copy button takes the whole prompt, and it can be read and edited once pasted. */}
          <CodeBlock
            code={kit.prompt}
            className="max-h-44 overflow-hidden after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-20 after:bg-gradient-to-t after:from-muted after:to-transparent"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Paste this into your homepage&apos;s HTML, just before <code>&lt;/body&gt;</code>. On Webflow, Framer, Wix
            or WordPress, use the homepage&apos;s custom code setting.
          </p>
          <CodeBlock code={kit.scriptTag} />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Does your server render the homepage? There&apos;s a sturdier way
            </summary>
            <p className="mt-2 text-muted-foreground">
              Instead of the tag, fetch this URL when rendering the page and output the response as HTML, right before
              your footer. A few directories only read the HTML your server sends, and this way they see the badges too.
              Don&apos;t cache it for longer than a minute.
            </p>
            <CodeBlock code={kit.htmlUrl} className="mt-2" />
          </details>
        </div>
      )}
    </div>
  );
}

/** Last step of intake for makers who allow badges: install the block, we find it, then the order can go in. */
export function BlockInstall({
  token,
  base,
  blockKey,
  websiteUrl,
  found,
  pending,
  error,
  onFound,
  onBack,
  onSend,
  onSkip,
}: {
  token: string;
  /** Where the block loads from. */
  base: string;
  blockKey: string;
  websiteUrl: string;
  found: boolean;
  /** Sending the order. */
  pending: boolean;
  error: string | null;
  onFound: () => void;
  onBack: () => void;
  onSend: () => void;
  onSkip: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, start] = useTransition();
  const busy = pending || checking;

  function check() {
    setProblem(null);
    start(async () => {
      try {
        const res = await checkBlockAction(token);
        if (!res.ok) return setProblem(res.error);
        if (res.result.found) onFound();
        else setProblem(NOT_FOUND[res.result.reason]);
      } catch {
        setProblem(`We couldn't run the check. Try again in a moment, or email ${site.supportEmail}.`);
      }
    });
  }

  async function skip() {
    if (
      await confirmDialog({
        title: "Continue without badges?",
        message:
          "We'll only use directories that don't ask for a badge, so you reach fewer of them. You can't add the block to this order later.",
        confirmLabel: "Continue without badges",
      })
    ) {
      onSkip();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium">Last step: add your badge block</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Many directories only list products that show their badge. This block handles that for you. Nothing shows on{" "}
          <span className="break-all text-foreground">{websiteUrl}</span> until the first badge arrives, then each one
          appears on its own just above your footer as we submit. You won&apos;t need to touch your site again.
        </p>
      </div>
      <InstallOptions kit={installKit(base, blockKey, websiteUrl)} />
      <div className="space-y-3 border-t border-border pt-5">
        {!found && (
          <p className="text-sm text-muted-foreground">We check your live site, so publish your changes first.</p>
        )}
        {found ? (
          <p role="status" className="text-sm text-success">
            Found it. Your block is installed, and you&apos;re ready to send your order.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={check} disabled={busy} variant="outline" className="shrink-0 self-start sm:self-auto">
              {checking ? "Checking your site…" : "Check my site"}
            </Button>
            {problem && (
              <p role="alert" className="text-sm text-danger">
                {problem}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button onClick={onSend} disabled={!found || busy} size="lg" className="shrink-0 self-start sm:self-auto">
            {pending ? "Sending…" : "Send my order"}
          </Button>
          {!found && <p className="text-sm text-muted-foreground">You can send it once we&apos;ve found the block.</p>}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <button type="button" onClick={onBack} disabled={busy} className="hover:text-foreground">
          ← Edit your details
        </button>
        <button type="button" onClick={skip} disabled={busy} className="hover:text-foreground">
          Can&apos;t install it? Continue without badges
        </button>
        <a href={`mailto:${site.supportEmail}`} className="hover:text-foreground">
          Need a hand? {site.supportEmail}
        </a>
      </div>
      <p className="text-xs text-muted-foreground">Your details are saved, so you can come back to this link later.</p>
    </div>
  );
}
