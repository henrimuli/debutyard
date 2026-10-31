"use client";

import { useState } from "react";
import { answerReviewAction } from "@/app/(site)/blog/review/[token]/actions";
import { Button } from "@/components/ui/button";

/** Approve the launch post as written, or send corrections. Answering again replaces the earlier answer. */
export function ReviewForm({ token, answered }: { token: string; answered: "approved" | "changes_requested" | null }) {
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "approved" | "sent">(
    answered === "approved" ? "approved" : answered ? "sent" : "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function send(approved: boolean) {
    setState("busy");
    setError(null);
    const res = await answerReviewAction(token, approved, notes);
    if (res.ok) setState(approved ? "approved" : "sent");
    else {
      setError(res.error);
      setState("idle");
    }
  }

  if (state === "approved" || state === "sent") {
    return (
      <div role="status" className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
        <p className="font-medium">
          {state === "approved" ? "Thanks, you approved it." : "Thanks, we've got your notes."}
        </p>
        <p className="mt-1 text-muted-foreground">
          {state === "approved"
            ? "We'll publish it and email you when it's live."
            : "We'll update the post and email you when it's live."}{" "}
          <button type="button" onClick={() => setState("idle")} className="font-medium text-primary hover:underline">
            Change your answer
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label htmlFor="review-notes" className="block text-sm font-medium">
        Anything wrong or missing?
      </label>
      <textarea
        id="review-notes"
        rows={5}
        maxLength={4000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="A feature that's changed, the current price, who it's really for, a detail worth adding…"
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void send(true)} disabled={state === "busy"}>
          Looks good, approve it
        </Button>
        <Button
          variant="outline"
          onClick={() => void send(false)}
          disabled={state === "busy" || notes.trim().length < 3}
        >
          Send my notes
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
