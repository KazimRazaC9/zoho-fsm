/** Display helpers that are safe in client components (no Prisma imports). */

export const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);

export const formatQty = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

/** "2026-11-04" → "04 Nov 2026" (calendar dates have no time zone). */
export const formatDay = (day: string | null) => {
  if (!day) return "—";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};
