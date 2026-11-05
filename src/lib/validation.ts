import { z } from "zod";
import { isValidTimeZone } from "./tz";

/**
 * Field schemas shared by forms (client) and APIs (server). They avoid transforms so a form's
 * input type equals its output type; services turn "" into null where a column is optional.
 */
export const requiredText = (max: number, label = "This field") =>
  z.string().trim().min(1, `${label} is required.`).max(max, `Use at most ${max} characters.`);

export const optionalText = (max: number) => z.string().trim().max(max, `Use at most ${max} characters.`);

export const optionalEmail = z.union([
  z.literal(""),
  z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
]);

export const optionalUrl = z.union([z.literal(""), z.string().trim().url("Enter a full URL (https://…).").max(500)]);

export const timeZoneSchema = z.string().refine(isValidTimeZone, "Choose a valid time zone.");

export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code, e.g. PKR.");

export const percentSchema = z
  .number({ invalid_type_error: "Enter a number." })
  .min(0, "Must be 0 or more.")
  .max(100, "Must be 100 or less.");

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24-hour).");

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #3b82f6.");

export const idParam = z.string().min(1).max(40);

/** "" → null for optional columns. */
export const nullIfEmpty = (v: string | undefined | null) => (v == null || v.trim() === "" ? null : v.trim());

/** Common IANA zones for pickers (any valid IANA id is accepted by the API). */
export const COMMON_TIME_ZONES = [
  "UTC",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

/** "" or a calendar date "YYYY-MM-DD" (for @db.Date columns). */
export const optionalDate = z.union([
  z.literal(""),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-04.")
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Enter a real date."),
]);

/** "YYYY-MM-DD" → Date at UTC midnight (what Postgres `date` round-trips to); "" → null. */
export const dateOrNull = (s: string) => (s ? new Date(`${s}T00:00:00Z`) : null);

/** Date column → "YYYY-MM-DD" (or null). */
export const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Latitude / longitude typed as text so an empty box is simply "". */
const coordinate = (min: number, max: number, label: string) =>
  z.union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(/^-?\d{1,3}(\.\d{1,8})?$/, `Enter ${label} as a decimal number.`)
      .refine((s) => Number(s) >= min && Number(s) <= max, `${label} must be between ${min} and ${max}.`),
  ]);
export const latitudeText = coordinate(-90, 90, "Latitude");
export const longitudeText = coordinate(-180, 180, "Longitude");

/** Money / quantity typed into a number box. */
export const moneySchema = z
  .number({ invalid_type_error: "Enter a number." })
  .min(0, "Must be 0 or more.")
  .max(1_000_000_000, "Too large.")
  .refine((n) => Number.isInteger(Number((n * 100).toFixed(6))), "Use at most 2 decimals.");
