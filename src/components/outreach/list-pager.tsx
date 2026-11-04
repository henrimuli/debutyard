import Link from "next/link";

/** Newer and Older for a list on an outreach tab. `page` counts from 0, as it does in the URL. */
export function ListPager({
  page,
  pageCount,
  href,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 p-3 text-sm">
      {page > 0 ? <Link href={href(page - 1)}>Newer</Link> : <span />}
      <span className="text-muted-foreground">
        Page {page + 1} of {pageCount}
      </span>
      {page < pageCount - 1 ? <Link href={href(page + 1)}>Older</Link> : <span />}
    </nav>
  );
}
