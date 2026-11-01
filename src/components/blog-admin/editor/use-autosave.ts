"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BlogApiError, blogApi, type SaveResult } from "@/lib/blog/client";
import type { BlogFields } from "@/lib/blog/types";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "offline" | "conflict";

const DEBOUNCE_MS = 1200;
/** Even while typing continuously, save at least this often. */
const MAX_WAIT_MS = 8000;
/** `keepalive` fetches are capped by the browser at ~64 KB. */
const KEEPALIVE_LIMIT = 60_000;

const backupKey = (id: string) => `debutyard-blog-backup:${id}`;

export type Backup = { at: number; baseVersion: number; fields: BlogFields };

export function readBackup(id: string): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

export function clearBackup(id: string): void {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {
    /* storage unavailable */
  }
}

/** JSON with sorted keys. Postgres's jsonb reorders them, so a plain stringify calls equal drafts different. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

/** Does this backup hold work the server doesn't have? */
export function backupHasNewWork(b: Backup, saved: { fields: BlogFields; updatedAt: string | Date }): boolean {
  return b.at > new Date(saved.updatedAt).getTime() && canonical(b.fields) !== canonical(saved.fields);
}

function writeBackup(id: string, b: Backup): void {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify(b));
  } catch {
    /* quota or private mode: the server save is the source of truth anyway */
  }
}

type Options = {
  postId: string;
  initialVersion: number;
  /** Current full state, used for the local backup and for "overwrite" after a conflict. */
  getFields: () => BlogFields;
  onSaved?: (r: SaveResult) => void;
};

/**
 * Debounced, ordered autosave with optimistic concurrency.
 *
 * - Only changed fields are sent (`queue(patch)`); the server merges them into the draft.
 * - One request in flight at a time; edits made during a save go out in the next one.
 * - A 409 (someone else saved) stops autosave and surfaces `conflict` instead of clobbering.
 * - Network/server errors retry with backoff and never drop the pending edits.
 * - A localStorage backup survives a crash or a closed tab before the save lands.
 */
export function useAutosave({ postId, initialVersion, getFields, onSaved }: Options) {
  const [state, setState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const versionRef = useRef(initialVersion);
  const pendingRef = useRef<Partial<BlogFields>>({});
  const inflightRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<number | null>(null);
  const maxWaitRef = useRef<number | null>(null);
  const retryRef = useRef(0);
  const conflictRef = useRef(false);
  const getFieldsRef = useRef(getFields);
  const onSavedRef = useRef(onSaved);
  const flushRef = useRef<(o?: { manual?: boolean; keepalive?: boolean }) => Promise<boolean>>(async () => true);
  useEffect(() => {
    getFieldsRef.current = getFields;
    onSavedRef.current = onSaved;
  });

  const clearTimers = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (maxWaitRef.current) window.clearTimeout(maxWaitRef.current);
    timerRef.current = null;
    maxWaitRef.current = null;
  };

  const schedule = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
    if (!maxWaitRef.current) {
      maxWaitRef.current = window.setTimeout(() => void flushRef.current(), MAX_WAIT_MS);
    }
  }, []);

  const hasPending = () => Object.keys(pendingRef.current).length > 0;

  const flush = useCallback(
    async (opts: { manual?: boolean; keepalive?: boolean } = {}): Promise<boolean> => {
      clearTimers();
      if (inflightRef.current) await inflightRef.current;
      if (conflictRef.current) return false;
      if (!hasPending() && !opts.manual) return true;

      const patch = pendingRef.current;
      pendingRef.current = {};
      setState("saving");

      const run = (async (): Promise<boolean> => {
        try {
          const size = opts.keepalive ? JSON.stringify(patch).length : 0;
          const res = await blogApi.save(
            postId,
            { baseVersion: versionRef.current, fields: patch, manual: opts.manual },
            opts.keepalive && size < KEEPALIVE_LIMIT,
          );
          versionRef.current = res.version;
          retryRef.current = 0;
          setSavedAt(Date.now());
          setError(null);
          onSavedRef.current?.(res);
          if (hasPending()) {
            setState("dirty");
            schedule();
          } else {
            setState("saved");
            clearBackup(postId);
          }
          return true;
        } catch (e) {
          // Put the edits back; anything typed since is newer and wins.
          pendingRef.current = { ...patch, ...pendingRef.current };
          if (e instanceof BlogApiError && e.status === 409) {
            conflictRef.current = true;
            setState("conflict");
            return false;
          }
          const offline = e instanceof BlogApiError && e.status === 0;
          setState(offline ? "offline" : "error");
          setError(e instanceof Error ? e.message : "Could not save.");
          retryRef.current += 1;
          const delay = Math.min(30_000, 2000 * 2 ** (retryRef.current - 1));
          timerRef.current = window.setTimeout(() => void flushRef.current(), delay);
          return false;
        }
      })();
      inflightRef.current = run;
      const ok = await run;
      inflightRef.current = null;
      return ok;
    },
    [postId, schedule],
  );
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  /** Queue changed fields for saving. */
  const queue = useCallback(
    (patch: Partial<BlogFields>) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (!conflictRef.current) setState((s) => (s === "saving" ? s : "dirty"));
      writeBackup(postId, { at: Date.now(), baseVersion: versionRef.current, fields: getFieldsRef.current() });
      if (!conflictRef.current) schedule();
    },
    [postId, schedule],
  );

  /** Resolves true once everything typed so far is safely on the server (used before publishing). */
  const settle = useCallback(async (): Promise<boolean> => {
    for (let i = 0; i < 4; i++) {
      const ok = await flush();
      if (!ok) return false;
      if (!hasPending() && !inflightRef.current) return true;
    }
    return !hasPending();
  }, [flush]);

  /** Snapshot a named revision now (the "Save version" button). */
  const saveVersion = useCallback(() => flush({ manual: true }), [flush]);

  /** After a 409: replace the server draft with everything currently in the editor. */
  const overwrite = useCallback(async () => {
    const latest = await blogApi.getPost(postId);
    versionRef.current = latest.post.version;
    conflictRef.current = false;
    pendingRef.current = { ...getFieldsRef.current() };
    setState("dirty");
    return flush();
  }, [flush, postId]);

  // Flush when the tab is hidden or closing; warn if something is still unsaved.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && hasPending()) void flushRef.current({ keepalive: true });
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPending() || inflightRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimers();
    };
  }, []);

  // Coming back online: try again right away instead of waiting for the backoff.
  useEffect(() => {
    const onOnline = () => {
      if (hasPending()) void flushRef.current();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return { state, savedAt, error, queue, flush, settle, saveVersion, overwrite, version: versionRef };
}
