import { ok, route } from "@/lib/api";
import { createUserSchema, userListQuerySchema, usersService } from "@/modules/users";

/** GET /api/v1/users?page&pageSize&search&role&status&sortBy&sortDir — company staff. */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"], query: userListQuerySchema }, ({ db, query }) =>
  usersService.list(db, query),
);

/** POST /api/v1/users — Admin adds a staff member (technicians get a profile). */
export const POST = route({ roles: ["ADMIN"], body: createUserSchema }, async ({ db, user, body }) =>
  ok(await usersService.create(db, user, body), "User created.", 201),
);
