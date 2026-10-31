"use client";

import { useState, useTransition } from "react";
import { addAdminAction, removeAdminAction } from "@/app/admin/users/actions";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input, Label } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";

const selectCls =
  "h-10 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function AddAdmin() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        start(async () => {
          const res = await addAdminAction(email, role);
          if (!res.ok) return setMessage({ ok: false, text: res.error });
          setMessage({ ok: true, text: `${email} can now open the admin area after signing in with that email.` });
          setEmail("");
        });
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="admin-email">Email</Label>
          <Input
            id="admin-email"
            type="email"
            required
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-role">Role</Label>
          <Select
            id="admin-role"
            className={`${selectCls} w-full sm:w-32`}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="admin">Admin</option>
            <option value="ops">Ops</option>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {message && <p className={`text-sm ${message.ok ? "text-muted-foreground" : "text-danger"}`}>{message.text}</p>}
    </form>
  );
}

export function RemoveAdmin({ id, email }: { id: string; email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={async () => {
          const ok = await confirmDialog({
            title: `Remove admin access for ${email}?`,
            confirmLabel: "Remove access",
            danger: true,
          });
          if (!ok) return;
          setError(null);
          start(async () => {
            const res = await removeAdminAction(id);
            if (!res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
