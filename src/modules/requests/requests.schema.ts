import type { Priority, ServiceRequestStatus } from "@prisma/client";
import { z } from "zod";
import { idParam, optionalEmail, optionalText } from "@/lib/validation";
import { jobTargetFields, localDateTime } from "@/modules/work-orders/work-orders.schema";

export const REQUEST_SOURCES = ["PHONE", "EMAIL", "WEB", "WHATSAPP", "WALK_IN"] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];
export const SOURCE_LABEL: Record<RequestSource, string> = {
  PHONE: "Phone",
  EMAIL: "Email",
  WEB: "Web",
  WHATSAPP: "WhatsApp",
  WALK_IN: "Walk-in",
};

export const REQUEST_CATEGORIES = [
  "INSTALLATION",
  "REPAIR",
  "MAINTENANCE",
  "INSPECTION",
  "REPLACEMENT",
  "OTHER",
] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<RequestCategory, string> = {
  INSTALLATION: "Installation",
  REPAIR: "Repair / fault",
  MAINTENANCE: "Maintenance",
  INSPECTION: "Inspection",
  REPLACEMENT: "Replacement",
  OTHER: "Other",
};

export const REQUEST_STATUSES = ["NEW", "ESTIMATED", "CONVERTED", "CANCELLED"] as const;
export const REQUEST_STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  NEW: "New",
  ESTIMATED: "Estimated",
  CONVERTED: "Converted",
  CANCELLED: "Cancelled",
};

/** Everything beyond the basics is optional (Zoho-style ticket fields). */
export const requestSchema = z.object({
  ...jobTargetFields,
  source: z.enum(REQUEST_SOURCES),
  category: z.union([z.literal(""), z.enum(REQUEST_CATEGORIES)]),
  contactName: optionalText(120),
  contactPhone: optionalText(50),
  contactEmail: optionalEmail,
  preferredAt: localDateTime,
});
export type RequestInput = z.infer<typeof requestSchema>;

/** Options when turning a request into a work order. */
export const convertRequestSchema = z.object({
  checklistTemplateId: z.union([z.literal(""), idParam]),
  dueDate: localDateTime,
});
export type ConvertRequestInput = z.infer<typeof convertRequestSchema>;

export const requestListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
  /** Default "open" = New + Estimated (the intake queue). */
  status: z
    .enum([...REQUEST_STATUSES, "open", "all"])
    .default("open")
    .catch("open"),
  source: z.enum(REQUEST_SOURCES).optional().catch(undefined),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().catch(undefined),
});
export type RequestListQuery = z.infer<typeof requestListQuerySchema>;

export type RequestDto = {
  id: string;
  number: string;
  title: string;
  description: string | null;
  customerId: string;
  customerName: string;
  addressId: string | null;
  siteLabel: string | null;
  assetId: string | null;
  assetName: string | null;
  priority: Priority;
  source: string;
  category: string | null;
  zohoTicket: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /** Local date-time in the company time zone, for the form. */
  preferredAtLocal: string;
  preferredAt: string | null;
  status: ServiceRequestStatus;
  createdAt: string;
  workOrder: { id: string; number: string } | null;
};

export const requestToInput = (r: RequestDto): RequestInput => ({
  customerId: r.customerId,
  addressId: r.addressId ?? "",
  assetId: r.assetId ?? "",
  title: r.title,
  description: r.description ?? "",
  priority: r.priority,
  source: (REQUEST_SOURCES as readonly string[]).includes(r.source) ? (r.source as RequestSource) : "PHONE",
  category: (REQUEST_CATEGORIES as readonly string[]).includes(r.category ?? "") ? (r.category as RequestCategory) : "",
  zohoTicket: r.zohoTicket ?? "",
  contactName: r.contactName ?? "",
  contactPhone: r.contactPhone ?? "",
  contactEmail: r.contactEmail ?? "",
  preferredAt: r.preferredAtLocal,
});
