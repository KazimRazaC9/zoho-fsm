import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prev/next pagination as plain links that keep the other search params. */
export function Pagination({
  page,
  pageSize,
  totalCount,
  basePath,
  searchParams,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <p className="text-muted-foreground">
        {from}–{to} of {totalCount}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
          {page > 1 ? (
            <Link href={href(page - 1)} aria-label="Previous page">
              <ChevronLeft /> Prev
            </Link>
          ) : (
            <span>
              <ChevronLeft /> Prev
            </span>
          )}
        </Button>
        <span className="text-muted-foreground px-2">
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" asChild={page < pages} disabled={page >= pages}>
          {page < pages ? (
            <Link href={href(page + 1)} aria-label="Next page">
              Next <ChevronRight />
            </Link>
          ) : (
            <span>
              Next <ChevronRight />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
