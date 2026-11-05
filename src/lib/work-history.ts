import "server-only";
import type { Prisma, Priority, WorkOrderStatus } from "@prisma/client";
import type { AppDb } from "./db";

/** One past or open job, as shown in a customer's or an asset's service history. */
export type WorkHistoryItem = {
  id: string;
  number: string;
  title: string;
  status: WorkOrderStatus;
  priority: Priority;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  assetName: string | null;
  siteLabel: string | null;
};

/** Latest work orders matching `where`, newest first. Used by customers and assets. */
export async function workHistory(db: AppDb, where: Prisma.WorkOrderWhereInput, take = 50): Promise<WorkHistoryItem[]> {
  const rows = await db.workOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
      asset: { select: { name: true } },
      address: { select: { label: true, addressLine: true } },
    },
  });
  return rows.map((w) => ({
    id: w.id,
    number: w.number,
    title: w.title,
    status: w.status,
    priority: w.priority,
    dueDate: w.dueDate?.toISOString() ?? null,
    completedAt: w.completedAt?.toISOString() ?? null,
    createdAt: w.createdAt.toISOString(),
    assetName: w.asset?.name ?? null,
    siteLabel: w.address ? (w.address.label ?? w.address.addressLine) : null,
  }));
}
