"use client";

import { useState, useTransition } from "react";
import { createTokenAction, revokeTokenAction } from "@/app/dashboard/api/actions";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/primitives";

type Token = { id: string; name: string; prefix: string; createdAt: Date; lastUsedAt: Date | null };

const fmt = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never";

export function ApiTokens({ tokens, mcpUrl }: { tokens: Token[]; mcpUrl: string }) {
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    setError(null);
    start(async () => {
      const res = await createTokenAction(name || "API token");
      if (res.ok) {
        setFresh(res.token);
        setName("");
      } else setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name, e.g. Claude Code"
          className="min-w-0 flex-1"
          maxLength={60}
        />
        <Button onClick={create} disabled={pending}>
          Create token
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {fresh && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Copy your token now. We only store a hash, so it won&apos;t be shown again.</p>
          <code className="block break-all rounded bg-card p-2 font-mono">{fresh}</code>
          <p className="text-muted-foreground">Connect Claude Code:</p>
          <code className="block break-all rounded bg-card p-2 font-mono text-xs">
            claude mcp add --transport http debutyard {mcpUrl} --header &quot;Authorization: Bearer {fresh}&quot;
          </code>
        </div>
      )}
      {tokens.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="font-medium">{t.name}</span>
              <code className="text-xs text-muted-foreground">{t.prefix}…</code>
              <span className="text-xs text-muted-foreground">
                created {fmt(t.createdAt)} · last used {fmt(t.lastUsedAt)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-danger"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: `Revoke "${t.name}"?`,
                    message: "Anything using this token stops working right away.",
                    confirmLabel: "Revoke",
                    danger: true,
                  });
                  if (ok) start(() => revokeTokenAction(t.id));
                }}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
