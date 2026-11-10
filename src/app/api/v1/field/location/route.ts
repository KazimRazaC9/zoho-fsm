import { ok, route } from "@/lib/api";
import { fieldService, locationSchema } from "@/modules/field";

/** POST /api/v1/field/location { latitude, longitude, accuracy?, speed?, heading? } — one GPS reading. */
export const POST = route(
  { roles: ["TECHNICIAN"], body: locationSchema, rateLimitPerMinute: 30 },
  async ({ db, user, body }) => {
    await fieldService.recordLocation(db, user, body);
    return ok(null, "Location saved.", 201);
  },
);
