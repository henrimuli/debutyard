"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { saveDirectory, type DirectoryInput } from "@/lib/directories/service";

async function staffOnly() {
  const user = await getCurrentUser();
  return user && (await isStaff(user)) ? user : null;
}

export async function saveDirectoryAction(
  input: DirectoryInput,
  id: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await staffOnly())) return { ok: false, error: "Not allowed." };
  if (id && !z.string().uuid().safeParse(id).success) return { ok: false, error: "Not found." };
  try {
    const d = await saveDirectory(input, id ?? undefined);
    refresh();
    return { ok: true, id: d.id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const i = err.issues[0];
      return { ok: false, error: `${i?.path.join(".")}: ${i?.message}` };
    }
    if (err instanceof Error && /unique/i.test(err.message)) return { ok: false, error: "That slug is taken." };
    throw err;
  }
}
