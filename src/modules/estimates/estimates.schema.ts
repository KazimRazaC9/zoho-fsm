import type { EstimateStatus } from "@prisma/client";
import { z } from "zod";
import { idParam, optionalDate, optionalText } from "@/lib/validation";
import { localDateTime } from "@/modules/work-orders/work-orders.schema";

export const ESTIMATE_STATUSES = ["DRAFT", "SENT", "APPROVED", "REJECTED"] as const;
export const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** Who may move an estimate where. Approved estimates are final; revising reopens Sent/Rejected ones. */
export const ESTIMATE_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["APPROVED", "REJECTED", "DRAFT"],
  REJECTED: ["DRAFT"],
  APPROVED: [],
};

export const estimateSchema = z.object({
  customerId: z.string().min(1, "Choose a customer.").max(40),
  addressId: z.union([z.literal(""), idParam]),
  /** Set when the estimate answers a service request. */
  requestId: z.union([z.literal(""), idParam]),
  validUntil: optionalDate,
  notes: optionalText(4000),
});
export type EstimateInput = z.infer<typeof estimateSchema>;

export const estimateStatusSchema = z.object({ status: z.enum(ESTIMATE_STATUSES) });
export type EstimateStatusInput = z.infer<typeof estimateStatusSchema>;

export const convertEstimateSchema = z.object({
  checklistTemplateId: z.union([z.literal(""), idParam]),
  dueDate: localDateTime,
});
export type ConvertEstimateInput = z.infer<typeof convertEstimateSchema>;

export const estimateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
  status: z
    .enum([...ESTIMATE_STATUSES, "all"])
    .default("all")
    .catch("all"),
});
export type EstimateListQuery = z.infer<typeof estimateListQuerySchema>;

export type DocLine = {
  id: string;
  serviceItemId: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  taxPercent: number;
  lineTotal: number;
};

export type EstimateListItem = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  status: EstimateStatus;
  total: number;
  validUntil: string | null;
  expired: boolean;
  createdAt: string;
  requestNumber: string | null;
  workOrder: { id: string; number: string } | null;
};

export type EstimateDetail = EstimateListItem & {
  addressId: string | null;
  siteLabel: string | null;
  requestId: string | null;
  notes: string | null;
  subTotal: number;
  tax: number;
  lines: DocLine[];
  /** Lines and details can only change while the estimate is a Draft. */
  editable: boolean;
};

export const estimateToInput = (e: EstimateDetail): EstimateInput => ({
  customerId: e.customerId,
  addressId: e.addressId ?? "",
  requestId: e.requestId ?? "",
  validUntil: e.validUntil ?? "",
  notes: e.notes ?? "",
});
