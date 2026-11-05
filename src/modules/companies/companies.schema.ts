import { z } from "zod";
import { emailSchema, passwordPolicy } from "@/modules/auth/auth.schema";
import {
  currencySchema,
  optionalEmail,
  optionalText,
  optionalUrl,
  percentSchema,
  requiredText,
  timeZoneSchema,
} from "@/lib/validation";

/** Company profile + regional settings (Admin edits their own; Super Admin edits any). */
export const companySettingsSchema = z.object({
  name: requiredText(200, "Company name"),
  email: optionalEmail,
  phone: optionalText(50),
  address: optionalText(500),
  logoUrl: optionalUrl,
  timeZone: timeZoneSchema,
  currency: currencySchema,
  taxPercent: percentSchema,
  requireSignatureOnComplete: z.boolean(),
});
export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

/** Super Admin: a new tenant and its first Admin, created together. */
export const createCompanySchema = z.object({
  name: requiredText(200, "Company name"),
  email: optionalEmail,
  phone: optionalText(50),
  timeZone: timeZoneSchema,
  currency: currencySchema,
  taxPercent: percentSchema,
  admin: z.object({
    fullName: requiredText(200, "Admin name"),
    email: emailSchema,
    password: passwordPolicy,
  }),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const setCompanyActiveSchema = z.object({ isActive: z.boolean() });

export type CompanyDto = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  timeZone: string;
  currency: string;
  taxPercent: number;
  requireSignatureOnComplete: boolean;
  isActive: boolean;
  createdAt: string;
};

export type CompanyListItem = CompanyDto & { userCount: number; adminEmails: string[] };
