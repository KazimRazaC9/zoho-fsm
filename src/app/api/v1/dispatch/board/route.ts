import { route } from "@/lib/api";
import { boardQuerySchema, schedulingService } from "@/modules/scheduling";

/** GET /api/v1/dispatch/board?date=YYYY-MM-DD — technicians with their visits for the day, plus unscheduled jobs. */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"], query: boardQuerySchema }, ({ db, user, query }) =>
  schedulingService.board(db, user, query.date),
);
