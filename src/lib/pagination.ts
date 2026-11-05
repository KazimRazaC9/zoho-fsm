import { z } from "zod";

/** Shared list query: ?page=1&pageSize=20&search=&sortBy=&sortDir=&status= */
export const pagedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
  sortBy: z.string().trim().max(50).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  status: z.string().trim().max(50).optional(),
});
export type PagedQuery = z.infer<typeof pagedQuerySchema>;

export type PagedResult<T> = {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export const toSkipTake = (q: Pick<PagedQuery, "page" | "pageSize">) => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});

/** Only allow sorting by known columns; falls back to `fallback`. */
export function orderBy<T extends string>(
  q: Pick<PagedQuery, "sortBy" | "sortDir">,
  allowed: readonly T[],
  fallback: T,
) {
  const field = (allowed as readonly string[]).includes(q.sortBy ?? "") ? (q.sortBy as T) : fallback;
  return { [field]: q.sortDir } as Record<T, "asc" | "desc">;
}

export const paged = <T>(items: T[], totalCount: number, q: Pick<PagedQuery, "page" | "pageSize">): PagedResult<T> => ({
  items,
  totalCount,
  page: q.page,
  pageSize: q.pageSize,
});
