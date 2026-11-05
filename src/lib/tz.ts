import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Everything is stored in UTC. A company's IANA time zone is used only for display,
 * reports and "today" boundaries.
 */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** UTC instant → wall-clock Date in the zone (for display math only). */
export const toCompanyTime = (utc: Date, timeZone: string) => toZonedTime(utc, timeZone);

/** Wall-clock time in the zone → UTC instant. `local` like "2026-11-04T09:00". */
export const fromCompanyTime = (local: string | Date, timeZone: string) => fromZonedTime(local, timeZone);

/** UTC [start, end) of a calendar day ("YYYY-MM-DD") in the company's zone. */
export function dayRangeUtc(day: string, timeZone: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${day}T00:00:00`, timeZone);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 1);
  // Recompute from the next calendar day so DST days are 23/25 hours long.
  const next = formatInTimeZone(end, timeZone, "yyyy-MM-dd");
  return { start, end: fromZonedTime(`${next}T00:00:00`, timeZone) };
}

/** Today's date ("YYYY-MM-DD") in the company's zone. */
export const todayIn = (timeZone: string, now = new Date()) => formatInTimeZone(now, timeZone, "yyyy-MM-dd");

export const formatIn = (utc: Date, timeZone: string, pattern = "dd MMM yyyy, HH:mm") =>
  formatInTimeZone(utc, timeZone, pattern);
