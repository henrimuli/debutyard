/** "31 Oct 2026" in UTC, so the server and the browser agree. */
export const postDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** True when the text changed at least a day after it was first published. */
export const wasUpdated = (publishedAt: string, updatedAt: string) =>
  new Date(updatedAt).getTime() - new Date(publishedAt).getTime() > 86_400_000;

export const authorNames = (authors: { name: string }[]) =>
  authors.length <= 2 ? authors.map((a) => a.name).join(" & ") : `${authors[0]!.name} and ${authors.length - 1} others`;
