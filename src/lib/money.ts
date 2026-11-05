import { Prisma } from "@prisma/client";

/** Money is always Prisma.Decimal (numeric(18,2)) — never JS floats. */
export type Money = Prisma.Decimal;
export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export const ZERO = D(0);

const round2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export type LineInput = {
  qty: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  taxPercent: Prisma.Decimal.Value;
};

/** One line: lineTotal = qty × unitPrice (before tax), tax = lineTotal × taxPercent / 100. */
export function computeLine(line: LineInput) {
  const lineTotal = round2(D(line.qty).mul(line.unitPrice));
  const tax = round2(lineTotal.mul(line.taxPercent).div(100));
  return { lineTotal, tax };
}

/** Document totals, always recalculated on the server from its lines. */
export function computeTotals(lines: LineInput[], discount: Prisma.Decimal.Value = 0) {
  let subTotal = ZERO;
  let tax = ZERO;
  for (const l of lines) {
    const c = computeLine(l);
    subTotal = subTotal.add(c.lineTotal);
    tax = tax.add(c.tax);
  }
  const disc = round2(D(discount));
  const total = Prisma.Decimal.max(ZERO, subTotal.add(tax).sub(disc));
  return { subTotal: round2(subTotal), tax: round2(tax), discount: disc, total: round2(total) };
}

export const formatMoney = (v: Prisma.Decimal.Value, currency: string, locale = "en-US") =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(D(v).toFixed(2)));
