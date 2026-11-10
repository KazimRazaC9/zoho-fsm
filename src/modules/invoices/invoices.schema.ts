import type { InvoiceStatus, PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { moneySchema, optionalDate, optionalText } from "@/lib/validation";
import type { DocLine } from "@/modules/estimates/estimates.schema";

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"] as const;
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Issued",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
};

export const PAYMENT_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"] as const;
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  ONLINE: "Online",
};

/** Default payment terms for a new invoice. */
export const DEFAULT_TERMS_DAYS = 14;

export const invoiceSchema = z.object({
  dueDate: optionalDate,
  notes: optionalText(4000),
  discount: moneySchema,
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const paymentSchema = z.object({
  amount: z
    .number({ invalid_type_error: "Enter the amount." })
    .gt(0, "Amount must be more than 0.")
    .max(1_000_000_000, "Too large.")
    .refine((n) => Number.isInteger(Number((n * 100).toFixed(6))), "Use at most 2 decimals."),
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(200),
  /** "" = now; otherwise the day the money arrived. */
  paidAt: optionalDate,
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const invoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
  /** A status, "overdue" (unpaid and past due), "open" (issued, not fully paid) or "all". */
  status: z
    .enum([...INVOICE_STATUSES, "open", "all"])
    .default("all")
    .catch("all"),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const createInvoiceSchema = z.object({ workOrderId: z.string().min(1).max(40) });

export type InvoiceListItem = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  workOrder: { id: string; number: string } | null;
  /** Stored status, except an unpaid issued invoice past its due date shows as Overdue. */
  status: InvoiceStatus;
  total: number;
  amountPaid: number;
  balance: number;
  issueDate: string;
  dueDate: string | null;
};

export type PaymentDto = {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  paidAtDay: string;
};

export type InvoiceDetail = InvoiceListItem & {
  customer: { name: string; email: string | null; phone: string | null; address: string | null };
  notes: string | null;
  subTotal: number;
  tax: number;
  discount: number;
  lines: DocLine[];
  payments: PaymentDto[];
  /** Lines, discount and totals can only change while the invoice is a Draft. */
  editable: boolean;
  canPay: boolean;
  canVoid: boolean;
};

export type InvoiceSummary = { outstanding: number; overdue: number; collected30: number; openCount: number };

export const invoiceToInput = (i: InvoiceDetail): InvoiceInput => ({
  dueDate: i.dueDate ?? "",
  notes: i.notes ?? "",
  discount: i.discount,
});
