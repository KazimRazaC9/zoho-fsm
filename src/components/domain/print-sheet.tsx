import type { DocLine } from "@/modules/estimates/estimates.schema";
import { formatCurrency, formatDay, formatQty } from "@/lib/format";

/** A clean, light-only paper layout for estimates and invoices (print → Save as PDF). */
export function PrintSheet({
  kind,
  number,
  status,
  company,
  billTo,
  meta,
  lines,
  totals,
  currency,
  notes,
  payments,
  footer,
}: {
  kind: "Estimate" | "Invoice";
  number: string;
  status: string;
  company: { name: string; address: string | null; email: string | null; phone: string | null };
  billTo: { name: string; lines: (string | null | undefined)[] };
  meta: [string, string][];
  lines: DocLine[];
  totals: { subTotal: number; tax: number; discount?: number; total: number; paid?: number; balance?: number };
  currency: string;
  notes: string | null;
  payments?: { day: string; method: string; reference: string | null; amount: number }[];
  footer?: string;
}) {
  const money = (n: number) => formatCurrency(n, currency);
  const cell = "border-b border-neutral-200 py-2";
  return (
    <article className="mx-auto max-w-3xl bg-white p-8 text-sm text-neutral-900 print:p-0">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold">{company.name}</h1>
          <div className="mt-1 space-y-0.5 text-neutral-600">
            {company.address && <p>{company.address}</p>}
            {company.phone && <p>{company.phone}</p>}
            {company.email && <p>{company.email}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-wide uppercase">{kind}</p>
          <p className="font-mono text-neutral-600">{number}</p>
          <p className="mt-1 inline-block rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium uppercase">
            {status}
          </p>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            {kind === "Invoice" ? "Bill to" : "Prepared for"}
          </p>
          <p className="mt-1 font-medium">{billTo.name}</p>
          {billTo.lines.filter(Boolean).map((l) => (
            <p key={l} className="text-neutral-600">
              {l}
            </p>
          ))}
        </div>
        <dl className="space-y-1 text-right">
          {meta.map(([k, v]) => (
            <div key={k} className="flex justify-end gap-3">
              <dt className="text-neutral-500">{k}</dt>
              <dd className="min-w-28 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <table className="mt-8 w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-neutral-900 text-left text-xs tracking-wide uppercase">
            <th className="py-2 font-semibold">Description</th>
            <th className="py-2 text-right font-semibold">Qty</th>
            <th className="py-2 text-right font-semibold">Unit price</th>
            <th className="py-2 text-right font-semibold">Tax</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td className={cell}>{l.description}</td>
              <td className={`${cell} text-right tabular-nums`}>{formatQty(l.qty)}</td>
              <td className={`${cell} text-right tabular-nums`}>{money(l.unitPrice)}</td>
              <td className={`${cell} text-right tabular-nums`}>{formatQty(l.taxPercent)}%</td>
              <td className={`${cell} text-right tabular-nums`}>{money(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-64 space-y-1">
        <Row k="Subtotal" v={money(totals.subTotal)} />
        <Row k="Tax" v={money(totals.tax)} />
        {!!totals.discount && <Row k="Discount" v={`− ${money(totals.discount)}`} />}
        <Row k="Total" v={money(totals.total)} strong />
        {totals.paid !== undefined && totals.paid > 0 && <Row k="Paid" v={money(totals.paid)} />}
        {totals.balance !== undefined && <Row k="Balance due" v={money(totals.balance)} strong />}
      </div>

      {payments && payments.length > 0 && (
        <section className="mt-8">
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Payments received</p>
          <table className="mt-1 w-full border-collapse">
            <tbody>
              {payments.map((p, i) => (
                <tr key={i}>
                  <td className={cell}>{formatDay(p.day)}</td>
                  <td className={cell}>{p.method}</td>
                  <td className={`${cell} text-neutral-600`}>{p.reference ?? ""}</td>
                  <td className={`${cell} text-right tabular-nums`}>{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {notes && (
        <section className="mt-8">
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Notes</p>
          <p className="mt-1 whitespace-pre-wrap">{notes}</p>
        </section>
      )}
      {footer && (
        <p className="mt-10 border-t border-neutral-200 pt-3 text-center text-xs text-neutral-500">{footer}</p>
      )}
    </article>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between ${strong ? "border-t border-neutral-900 pt-1 font-semibold" : "text-neutral-600"}`}
    >
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
