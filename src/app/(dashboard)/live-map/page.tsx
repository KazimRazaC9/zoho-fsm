import type { Metadata } from "next";
import { LiveMap } from "./live-map-client";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { fieldService } from "@/modules/field";

export const metadata: Metadata = { title: "Live map" };

export default async function LiveMapPage() {
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  requirePagePermission(user, "/live-map");
  const technicians = await fieldService.live(dbFor(user));

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Live map</h1>
        <p className="text-muted-foreground text-sm">
          Where your technicians are right now. Positions come from the field app while it is open and location sharing
          is on; faded pins are older than 15 minutes.
        </p>
      </div>
      <LiveMap technicians={technicians} />
    </div>
  );
}
