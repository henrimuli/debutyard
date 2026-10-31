"use client";

import { useEffect, useRef, useState } from "react";
import { Field, Modal, TextArea, TextInput } from "@/components/blog-admin/ui";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BlogApiError, blogApi } from "@/lib/blog/client";

/**
 * A team member's byline is one profile shared by every post they write:
 * set it once here. Makers are shown with their own account name and photo.
 */
export function AuthorProfileDialog({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    blogApi
      .myAuthor()
      .then(({ author }) => {
        if (cancelled) return;
        setName(author.name);
        setRole(author.role);
        setBio(author.bio);
        setAvatarUrl(author.avatarUrl);
        setLoaded(true);
      })
      .catch((e) => !cancelled && setError(e instanceof BlogApiError ? e.message : "Could not load your profile."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      setAvatarUrl((await blogApi.upload(file)).url);
    } catch (e) {
      setError(e instanceof BlogApiError ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await blogApi.saveMyAuthor({ name, role, bio, avatarUrl });
      onClose();
    } catch (e) {
      setError(e instanceof BlogApiError ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Your author profile"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || !loaded || !name.trim()}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </>
      }
    >
      {!loaded && !error ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {loaded ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Shown on every post you write or publish.</p>
          <div className="flex items-center gap-3">
            <Avatar name={name || "?"} src={avatarUrl} className="size-14" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                {avatarUrl ? "Replace photo" : "Upload photo"}
              </Button>
              {avatarUrl ? (
                <Button size="sm" variant="ghost" onClick={() => setAvatarUrl(null)}>
                  Remove
                </Button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </div>
          <Field label="Name" htmlFor="author-name">
            <TextInput id="author-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Role" htmlFor="author-role" hint="Under your name, e.g. “Founder, DebutYard”.">
            <TextInput id="author-role" value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} />
          </Field>
          <Field
            label="Short bio"
            htmlFor="author-bio"
            hint="One or two sentences for the author box at the end of a post."
          >
            <TextArea id="author-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={600} />
          </Field>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
