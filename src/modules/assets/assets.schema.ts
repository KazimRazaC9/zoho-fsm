import { z } from "zod";
import { idParam, optionalDate, optionalText, requiredText } from "@/lib/validation";

export const ASSET_STATUSES = ["ACTIVE", "IN_REPAIR", "RETIRED"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  ACTIVE: "Active",
  IN_REPAIR: "In repair",
  RETIRED: "Retired",
};

/** Warranty state on a given day in the company's time zone. */
export const WARRANTY_STATES = ["active", "expiring", "expired", "none"] as const;
export type WarrantyState = (typeof WARRANTY_STATES)[number];
export const WARRANTY_LABEL: Record<WarrantyState, string> = {
  active: "In warranty",
  expiring: "Expires in 30 days",
  expired: "Warranty expired",
  none: "No warranty",
};
/** "Expiring" = ends within this many days. */
export const WARRANTY_EXPIRING_DAYS = 30;

export const assetSchema = z
  .object({
    customerId: z.string().min(1, "Choose a customer.").max(40),
    /** "" = not tied to a site. */
    addressId: z.union([z.literal(""), idParam]),
    name: requiredText(200, "Name"),
    category: optionalText(100),
    brand: optionalText(100),
    model: optionalText(100),
    serialNo: optionalText(100),
    installDate: optionalDate,
    warrantyEndDate: optionalDate,
    status: z.enum(ASSET_STATUSES),
  })
  .refine((a) => !a.installDate || !a.warrantyEndDate || a.warrantyEndDate >= a.installDate, {
    path: ["warrantyEndDate"],
    message: "Warranty cannot end before the install date.",
  });
export type AssetInput = z.infer<typeof assetSchema>;

export const assetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(ASSET_STATUSES).optional().catch(undefined),
  warranty: z.enum(WARRANTY_STATES).optional().catch(undefined),
  customerId: idParam.optional().catch(undefined),
  sortBy: z.enum(["name", "warrantyEndDate", "createdAt"]).default("name").catch("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc").catch("asc"),
});
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;

export type AssetDto = {
  id: string;
  customerId: string;
  customerName: string;
  addressId: string | null;
  siteLabel: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  serialNo: string | null;
  installDate: string | null;
  warrantyEndDate: string | null;
  warranty: WarrantyState;
  status: AssetStatus;
  lastServiceAt: string | null;
  workOrderCount: number;
  createdAt: string;
};

export const assetToInput = (a: AssetDto): AssetInput => ({
  customerId: a.customerId,
  addressId: a.addressId ?? "",
  name: a.name,
  category: a.category ?? "",
  brand: a.brand ?? "",
  model: a.model ?? "",
  serialNo: a.serialNo ?? "",
  installDate: a.installDate ?? "",
  warrantyEndDate: a.warrantyEndDate ?? "",
  status: a.status,
});
