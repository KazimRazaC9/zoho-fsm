import type { AttachmentKind, Priority, WorkOrderStatus } from "@prisma/client";
import { z } from "zod";
import { idParam, moneySchema, optionalText, percentSchema, requiredText } from "@/lib/validation";
import { ISSUE_STATUSES, type EvidenceKind, type IssueStatusValue } from "./evidence";
import { WORK_ORDER_STATUSES } from "./work-order-status";

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;

/** "" or a local date-time "YYYY-MM-DDTHH:mm" in the company's time zone (from <input type="datetime-local">). */
export const localDateTime = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use a date and time."),
]);

/** Where and what: shared by new work orders and new service requests. */
export const jobTargetFields = {
  customerId: z.string().min(1, "Choose a customer.").max(40),
  addressId: z.union([z.literal(""), idParam]),
  assetId: z.union([z.literal(""), idParam]),
  title: requiredText(200, "Title"),
  description: optionalText(4000),
  /** Optional free text: the Zoho ticket number or link (kept on the request and its work order). */
  zohoTicket: optionalText(100).optional(),
  priority: z.enum(PRIORITIES),
};

export const workOrderSchema = z.object({
  ...jobTargetFields,
  /** Optional free text: the customer purchase order number. */
  purchaseOrder: optionalText(100).optional(),
  dueDate: localDateTime,
});
export type WorkOrderInput = z.infer<typeof workOrderSchema>;

/** Creating also lets you start from a checklist template. */
export const createWorkOrderSchema = workOrderSchema.extend({
  checklistTemplateId: z.union([z.literal(""), idParam]),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

export const changeStatusSchema = z.object({
  status: z.enum(WORK_ORDER_STATUSES as [WorkOrderStatus, ...WorkOrderStatus[]]),
  reason: optionalText(1000),
});
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export const lineSchema = z.object({
  /** "" = free-text line. */
  serviceItemId: z.union([z.literal(""), idParam]),
  description: requiredText(300, "Description"),
  qty: z
    .number({ invalid_type_error: "Enter a number." })
    .gt(0, "Quantity must be more than 0.")
    .max(100_000, "Too large.")
    .refine((n) => Number.isInteger(Number((n * 100).toFixed(6))), "Use at most 2 decimals."),
  unitPrice: moneySchema,
  taxPercent: percentSchema,
});
export type LineInput = z.infer<typeof lineSchema>;

export const noteSchema = z.object({
  text: requiredText(4000, "Note"),
  isInternal: z.boolean(),
});
export type NoteInput = z.infer<typeof noteSchema>;

export const checklistItemSchema = z.object({ text: requiredText(300, "Item") });

/** Something found on site besides the reported problem. */
export const issueSchema = z.object({
  title: requiredText(120, "Issue"),
  details: optionalText(1000),
  status: z.enum(ISSUE_STATUSES),
});
export type IssueInput = z.infer<typeof issueSchema>;

export const workOrderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
  /** A status, or "open" (every status that is not closed), or "overdue". */
  status: z
    .enum(["open", "overdue", ...WORK_ORDER_STATUSES])
    .optional()
    .catch(undefined),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  customerId: idParam.optional().catch(undefined),
  sortBy: z.enum(["createdAt", "dueDate", "number"]).default("createdAt").catch("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc").catch("desc"),
});
export type WorkOrderListQuery = z.infer<typeof workOrderListQuerySchema>;

export type WorkOrderListItem = {
  id: string;
  number: string;
  title: string;
  status: WorkOrderStatus;
  priority: Priority;
  customerId: string;
  customerName: string;
  siteLabel: string | null;
  assetName: string | null;
  zohoTicket: string | null;
  dueDate: string | null;
  overdue: boolean;
  createdAt: string;
};

export type WorkOrderLineDto = {
  id: string;
  serviceItemId: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  taxPercent: number;
  lineTotal: number;
};

/** A before/after photo or video. */
export type MediaDto = {
  id: string;
  fileName: string;
  kind: EvidenceKind;
  contentType: string | null;
  createdAt: string;
  author: string | null;
  /** The user who uploaded it (a technician may remove only their own). */
  authorId: string | null;
};

export type EvidenceDto = { before: MediaDto[]; after: MediaDto[] };

export type IssueDto = {
  id: string;
  title: string;
  details: string | null;
  status: IssueStatusValue;
  createdAt: string;
  author: string | null;
  evidence: EvidenceDto;
};

export type WorkOrderDetail = WorkOrderListItem & {
  description: string | null;
  purchaseOrder: string | null;
  completedAt: string | null;
  /** Due date as "YYYY-MM-DDTHH:mm" in the company's zone (for the edit form); "" when none. */
  dueDateLocal: string;
  customerPhone: string | null;
  address: {
    id: string;
    fullAddress: string;
    label: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  assetId: string | null;
  request: { id: string; number: string } | null;
  lines: WorkOrderLineDto[];
  totals: { subTotal: number; tax: number; total: number };
  checklist: { id: string; text: string; isDone: boolean; doneBy: string | null; doneAt: string | null }[];
  notes: {
    id: string;
    text: string;
    isInternal: boolean;
    author: string | null;
    authorId: string | null;
    createdAt: string;
  }[];
  /** Proof for the reported problem (before / after). */
  evidence: EvidenceDto;
  /** Extra problems found on site, each with its own proof. */
  issues: IssueDto[];
  /** Ordinary files: documents, photos and signatures that are not before/after proof. */
  attachments: {
    id: string;
    fileName: string;
    contentType: string | null;
    sizeBytes: number | null;
    kind: AttachmentKind;
    createdAt: string;
    author: string | null;
  }[];
  timeline: {
    id: string;
    fromStatus: WorkOrderStatus | null;
    toStatus: WorkOrderStatus;
    reason: string | null;
    by: string | null;
    at: string;
  }[];
  requireSignatureOnComplete: boolean;
};
