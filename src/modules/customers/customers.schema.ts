import { z } from "zod";
import { idParam, latitudeText, longitudeText, optionalEmail, optionalText, requiredText } from "@/lib/validation";

export const CUSTOMER_TYPES = ["INDIVIDUAL", "BUSINESS"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = { INDIVIDUAL: "Individual", BUSINESS: "Business" };

/** A customer's project, e.g. "Water DC" or "Drift Vans". Its sites hang under it. */
export const projectSchema = z.object({
  name: requiredText(120, "Project name"),
  description: optionalText(500),
});
export type ProjectInput = z.infer<typeof projectSchema>;
export const BLANK_PROJECT: ProjectInput = { name: "", description: "" };

/** A service address (site). Latitude and longitude are text so an empty box stays "". */
export const addressSchema = z
  .object({
    /** "" = the site belongs to no project. */
    projectId: z.union([z.literal(""), idParam]).optional(),
    label: optionalText(100),
    addressLine: requiredText(300, "Address"),
    city: optionalText(100),
    state: optionalText(100),
    postalCode: optionalText(20),
    country: optionalText(100),
    latitude: latitudeText,
    longitude: longitudeText,
  })
  .refine((a) => (a.latitude === "") === (a.longitude === ""), {
    path: ["longitude"],
    message: "Enter both latitude and longitude, or leave both empty.",
  });
export type AddressInput = z.infer<typeof addressSchema>;

export const BLANK_ADDRESS: AddressInput = {
  projectId: "",
  label: "",
  addressLine: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  latitude: "",
  longitude: "",
};

const customerFields = {
  type: z.enum(CUSTOMER_TYPES),
  name: requiredText(200, "Name"),
  email: optionalEmail,
  phone: optionalText(50),
  notes: optionalText(2000),
};

export const updateCustomerSchema = z.object(customerFields);
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const createCustomerSchema = z.object({
  ...customerFields,
  addresses: z.array(addressSchema).min(1, "Add at least one service address.").max(20, "Up to 20 addresses."),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const customerListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
    search: z.string().trim().max(200).optional(),
    type: z.enum(CUSTOMER_TYPES).optional().catch(undefined),
    sortBy: z.enum(["name", "createdAt"]).default("name").catch("name"),
    sortDir: z.enum(["asc", "desc"]).optional().catch(undefined),
  })
  // Names read A→Z, dates newest first, unless sortDir says otherwise.
  .transform((q) => ({
    ...q,
    sortDir: q.sortDir ?? (q.sortBy === "createdAt" ? ("desc" as const) : ("asc" as const)),
  }));
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export type ProjectDto = {
  id: string;
  name: string;
  description: string | null;
  siteCount: number;
};

export type AddressDto = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  label: string | null;
  addressLine: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  /** One line for lists, e.g. "12 Garden Town, Lahore, Punjab". */
  fullAddress: string;
};

export type CustomerListItem = {
  id: string;
  type: CustomerType;
  name: string;
  email: string | null;
  phone: string | null;
  primaryAddress: string | null;
  projectNames: string[];
  addressCount: number;
  assetCount: number;
  openWorkOrders: number;
  createdAt: string;
};

export type CustomerDto = {
  id: string;
  type: CustomerType;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  projects: ProjectDto[];
  addresses: AddressDto[];
};

/** Customer + sites for pickers (asset form; work orders later). */
export type CustomerOption = {
  id: string;
  name: string;
  addresses: { id: string; label: string }[];
  /** Equipment that is not retired (for job pickers). */
  assets?: { id: string; name: string; addressId: string | null }[];
};

/** Address DTO → form values. */
/** "Water DC › Sheikhupura factory — Plot 14…": a site as pickers and lists show it. */
export const siteLabelOf = (a: { projectName?: string | null; label: string | null; addressLine: string }) =>
  [a.projectName, a.label ? `${a.label} — ${a.addressLine}` : a.addressLine].filter(Boolean).join(" › ");

export const addressToInput = (a: AddressDto): AddressInput => ({
  projectId: a.projectId ?? "",
  label: a.label ?? "",
  addressLine: a.addressLine,
  city: a.city ?? "",
  state: a.state ?? "",
  postalCode: a.postalCode ?? "",
  country: a.country ?? "",
  latitude: a.latitude == null ? "" : String(a.latitude),
  longitude: a.longitude == null ? "" : String(a.longitude),
});

/** Google Maps link for a pinned site (or a text search when there is no pin). */
export const mapsUrl = (a: Pick<AddressDto, "latitude" | "longitude" | "fullAddress">) =>
  a.latitude != null && a.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.fullAddress)}`;
