import { z } from "zod";
import { moneySchema, optionalText, percentSchema, requiredText } from "@/lib/validation";

export const ITEM_TYPES = ["SERVICE", "PART"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const ITEM_TYPE_LABEL: Record<ItemType, string> = { SERVICE: "Service", PART: "Part" };

/** Parts at or below this quantity are flagged "Low stock". */
export const LOW_STOCK_THRESHOLD = 10;

const quantity = z
  .number({ invalid_type_error: "Enter a number." })
  .min(0, "Stock cannot be negative.")
  .max(100_000_000, "Too large.")
  .refine((n) => Number.isInteger(Number((n * 100).toFixed(6))), "Use at most 2 decimals.");

/**
 * A price-list entry. Services have no stock; parts may track stock (null = not tracked).
 * The service ignores stockQty for services.
 */
export const serviceItemSchema = z.object({
  name: requiredText(200, "Name"),
  type: z.enum(ITEM_TYPES),
  sku: optionalText(50),
  unitPrice: moneySchema,
  taxPercent: percentSchema,
  stockQty: quantity.nullable(),
});
export type ServiceItemInput = z.infer<typeof serviceItemSchema>;

export const stockAdjustSchema = z.object({
  delta: z
    .number({ invalid_type_error: "Enter a number." })
    .refine((n) => n !== 0, "Enter a non-zero amount.")
    .refine((n) => Math.abs(n) <= 100_000_000, "Too large.")
    .refine((n) => Number.isInteger(Number((n * 100).toFixed(6))), "Use at most 2 decimals."),
});
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;

export const setItemActiveSchema = z.object({ isActive: z.boolean() });

export const serviceItemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
  type: z.enum(ITEM_TYPES).optional().catch(undefined),
  status: z.enum(["active", "inactive", "all"]).default("all").catch("all"),
  stock: z.enum(["low"]).optional().catch(undefined),
  sortBy: z.enum(["name", "unitPrice", "stockQty", "createdAt"]).default("name").catch("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc").catch("asc"),
});
export type ServiceItemListQuery = z.infer<typeof serviceItemListQuerySchema>;

export type ServiceItemDto = {
  id: string;
  name: string;
  type: ItemType;
  sku: string | null;
  unitPrice: number;
  taxPercent: number;
  /** null = not stock-tracked (always null for services). */
  stockQty: number | null;
  lowStock: boolean;
  isActive: boolean;
  createdAt: string;
};

export const BLANK_ITEM: ServiceItemInput = {
  name: "",
  type: "SERVICE",
  sku: "",
  unitPrice: 0,
  taxPercent: 0,
  stockQty: null,
};

export const itemToInput = (i: ServiceItemDto): ServiceItemInput => ({
  name: i.name,
  type: i.type,
  sku: i.sku ?? "",
  unitPrice: i.unitPrice,
  taxPercent: i.taxPercent,
  stockQty: i.stockQty,
});
