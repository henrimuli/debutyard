import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import type { BlogAuthor } from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import { authorNames } from "./format";

/** Overlapping avatars plus names, e.g. "Henry M & Ada Lovelace". */
export function Bylines({
  authors,
  className,
  size = "sm",
}: {
  authors: BlogAuthor[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="flex shrink-0 -space-x-2">
        {authors.slice(0, 3).map((a) => (
          <Avatar
            key={a.name}
            name={a.name}
            src={a.avatarUrl}
            className={cn("ring-2 ring-background", size === "md" ? "size-9" : "size-6")}
          />
        ))}
      </span>
      <span className="truncate">{authorNames(authors)}</span>
    </span>
  );
}

/** The author box at the end of a post: everyone who wrote it, with their role. */
export function AuthorBox({ authors }: { authors: BlogAuthor[] }) {
  return (
    <section aria-label="About the authors" className="mt-12 space-y-4 rounded-lg border border-border bg-card p-5">
      {authors.map((a) => (
        <div key={a.name} className="flex gap-3">
          <Avatar name={a.name} src={a.avatarUrl} className="size-12" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {a.url ? (
                <Link href={a.url} className="hover:text-primary">
                  {a.name}
                </Link>
              ) : (
                a.name
              )}
            </p>
            {a.role ? <p className="text-muted-foreground">{a.role}</p> : null}
            {a.bio ? <p className="mt-1.5 leading-relaxed">{a.bio}</p> : null}
          </div>
        </div>
      ))}
    </section>
  );
}
