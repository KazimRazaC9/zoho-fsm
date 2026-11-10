/** What every server action returns to the client form (safe to import from client components). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
scm-history-item:c%3A%5CUsers%5CKazim%20Raza%5COneDrive%20-%20CORE9%20VENTURES%20%28PRIVATE%29%20LIMITED%5CDesktop%5Cfieldserve?%7B%22repositoryId%22%3A%22scm0%22%2C%22historyItemId%22%3A%220f8e37bfcd322d825173b146eaaf288e88f132b0%22%2C%22historyItemParentId%22%3A%229c06796d6db491df715ace714fc7594349579d8c%22%2C%22historyItemDisplayId%22%3A%220f8e37b%22%7D