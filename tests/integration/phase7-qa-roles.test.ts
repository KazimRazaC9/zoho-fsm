/**
 * QA step and custom-role safety.
 *  - A technician completing a job does NOT finish it: QA (Admin, Dispatcher, or a role holding
 *    "workOrders:close") verifies and closes it, or sends it back; only a closed one can be invoiced.
 *  - A user with a custom role cannot take over accounts that are above them.
 * Runs against the seeded dev database (Demo company) and removes what it creates.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, tenantContext, type AppDb } from "@/lib/db";
import { ConflictError, ForbiddenError } from "@/lib/errors";
import type { AppPermission } from "@/lib/permissions";
import { invoicesService } from "@/modules/invoices";
import { usersService } from "@/modules/users";
import { workOrdersService } from "@/modules/work-orders";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const stamp = Date.now().toString(36);

let companyId: string;
let customerId: string;
let addressId: string;
let admin: CurrentUser;
let dispatcher: CurrentUser;
let technician: CurrentUser;
let qa: CurrentUser;
let cs: CurrentUser;
let hr: CurrentUser;
let hrPeerId: string;
let adminId: string;
const dbOf = (u: CurrentUser): AppDb => createDb(tenantContext(companyId, u.id));
const woIds: string[] = [];
const invoiceIds: string[] = [];
const userIds: string[] = [];
const roleIds: string[] = [];

const line = { serviceItemId: "", description: "QA job", qty: 1, unitPrice: 1000, taxPercent: 16 };

function asUser(
  u: { id: string; role: string; companyId: string | null; fullName: string; email: string },
  custom?: { id: string; name: string; permissions: AppPermission[] },
): CurrentUser {
  return {
    id: u.id,
    role: u.role,
    customRoleId: custom?.id ?? null,
    customRoleName: custom?.name ?? null,
    permissions: custom?.permissions ?? [],
    companyId: u.companyId,
    fullName: u.fullName,
    email: u.email,
    via: "session",
  } as CurrentUser;
}

async function makeRole(name: string, baseRole: "ADMIN" | "DISPATCHER", permissions: AppPermission[]) {
  const r = await owner.customRole.create({
    data: { companyId, name: `${name} ${stamp}`, baseRole, permissions },
  });
  roleIds.push(r.id);
  return { id: r.id, name: r.name, permissions };
}

async function makeUser(name: string, role: "ADMIN" | "DISPATCHER", customRoleId: string) {
  const u = await owner.user.create({
    data: {
      companyId,
      fullName: name,
      email: `p7-${name.toLowerCase().replace(/\W+/g, "")}-${stamp}@demo.local`,
      passwordHash: "x",
      role,
      customRoleId,
    },
  });
  userIds.push(u.id);
  return u;
}

beforeAll(async () => {
  const a = await owner.user.findFirstOrThrow({ where: { email: "admin@demo.local" } });
  const d = await owner.user.findFirstOrThrow({ where: { email: "dispatcher@demo.local" } });
  const t = await owner.user.findFirstOrThrow({ where: { email: "tech1@demo.local" } });
  companyId = a.companyId!;
  adminId = a.id;
  admin = asUser(a);
  dispatcher = asUser(d);
  technician = asUser(t);

  const site = await owner.serviceAddress.findFirstOrThrow({
    where: { companyId, deletedAt: null, customer: { deletedAt: null } },
  });
  customerId = site.customerId;
  addressId = site.id;

  const qaRole = await makeRole("QA", "DISPATCHER", ["workOrders:view", "workOrders:close"]);
  const csRole = await makeRole("CS", "DISPATCHER", ["workOrders:view", "workOrders:create", "workOrders:edit"]);
  const hrRole = await makeRole("People", "ADMIN", ["users:view", "users:create", "users:edit", "users:delete"]);
  qa = asUser(await makeUser("QA Person", "DISPATCHER", qaRole.id), qaRole);
  cs = asUser(await makeUser("CS Person", "DISPATCHER", csRole.id), csRole);
  hr = asUser(await makeUser("People Lead", "ADMIN", hrRole.id), hrRole);
  hrPeerId = (await makeUser("People Peer", "ADMIN", hrRole.id)).id;
});

afterAll(async () => {
  const ids = [...woIds, ...invoiceIds, ...userIds, ...roleIds];
  await owner.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await owner.refreshToken.deleteMany({ where: { userId: { in: [...userIds, adminId] } } });
  await owner.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await owner.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await owner.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await owner.workOrderStatusChange.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrderChecklistItem.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrderLine.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrder.deleteMany({ where: { id: { in: woIds } } });
  await owner.user.deleteMany({ where: { id: { in: userIds } } });
  await owner.customRole.deleteMany({ where: { id: { in: roleIds } } });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("QA closes the work order", () => {
  let id: string;

  it("completed is not final: only QA can close it or send it back", async () => {
    const wo = await workOrdersService.create(dbOf(cs), cs, {
      customerId,
      addressId,
      assetId: "",
      title: `P7 QA job ${stamp}`,
      description: "",
      priority: "MEDIUM",
      dueDate: "",
      checklistTemplateId: "",
    });
    id = wo.id;
    woIds.push(id);
    await workOrdersService.addLine(dbOf(dispatcher), dispatcher, id, line);
    for (const status of ["SCHEDULED", "DISPATCHED", "IN_PROGRESS"] as const) {
      await workOrdersService.changeStatus(dbOf(dispatcher), dispatcher, id, { status, reason: "" });
    }

    // A QA-only role is not allowed to run the job itself.
    await expect(
      workOrdersService.changeStatus(dbOf(qa), qa, id, { status: "ON_HOLD", reason: "waiting" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const done = await workOrdersService.changeStatus(dbOf(technician), technician, id, {
      status: "COMPLETED",
      reason: "",
    });
    expect(done.status).toBe("COMPLETED");

    // The technician and a normal CS role cannot verify their own work.
    for (const who of [technician, cs]) {
      await expect(
        workOrdersService.changeStatus(dbOf(who), who, id, { status: "CLOSED", reason: "" }),
      ).rejects.toThrow(/Only QA/);
    }
    // It stays locked while it waits for QA.
    await expect(workOrdersService.addLine(dbOf(dispatcher), dispatcher, id, line)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("QA sends it back with a reason, the technician finishes again, QA closes it", async () => {
    await expect(
      workOrdersService.changeStatus(dbOf(qa), qa, id, { status: "IN_PROGRESS", reason: " " }),
    ).rejects.toThrow(/reason/);
    const back = await workOrdersService.changeStatus(dbOf(qa), qa, id, {
      status: "IN_PROGRESS",
      reason: "Camera 2 not recording",
    });
    expect(back.status).toBe("IN_PROGRESS");
    expect(back.completedAt).toBeNull();

    await workOrdersService.changeStatus(dbOf(technician), technician, id, { status: "COMPLETED", reason: "" });
    const closed = await workOrdersService.changeStatus(dbOf(qa), qa, id, { status: "CLOSED", reason: "" });
    expect(closed.status).toBe("CLOSED");
    expect(closed.completedAt).not.toBeNull();
    expect(closed.timeline.map((t) => t.toStatus).slice(-3)).toEqual(["IN_PROGRESS", "COMPLETED", "CLOSED"]);
  });

  it("only a closed work order can be invoiced, and only an Admin can reopen it", async () => {
    const wo2 = await workOrdersService.create(dbOf(admin), admin, {
      customerId,
      addressId,
      assetId: "",
      title: `P7 invoice gate ${stamp}`,
      description: "",
      priority: "LOW",
      dueDate: "",
      checklistTemplateId: "",
    });
    woIds.push(wo2.id);
    await workOrdersService.addLine(dbOf(admin), admin, wo2.id, line);
    for (const status of ["SCHEDULED", "DISPATCHED", "IN_PROGRESS", "COMPLETED"] as const) {
      await workOrdersService.changeStatus(dbOf(dispatcher), dispatcher, wo2.id, { status, reason: "" });
    }
    await expect(invoicesService.createFromWorkOrder(dbOf(admin), admin, wo2.id)).rejects.toThrow(/waiting for QA/);

    // A dispatcher counts as QA by default.
    await workOrdersService.changeStatus(dbOf(dispatcher), dispatcher, wo2.id, { status: "CLOSED", reason: "" });
    const inv = await invoicesService.createFromWorkOrder(dbOf(admin), admin, wo2.id);
    invoiceIds.push(inv.id);

    await expect(
      workOrdersService.changeStatus(dbOf(dispatcher), dispatcher, wo2.id, {
        status: "IN_PROGRESS",
        reason: "Customer complaint",
      }),
    ).rejects.toThrow(/Only an Admin/);
    const reopened = await workOrdersService.changeStatus(dbOf(admin), admin, wo2.id, {
      status: "IN_PROGRESS",
      reason: "Customer complaint",
    });
    expect(reopened.status).toBe("IN_PROGRESS");
  });
});

describe("custom roles cannot take over accounts above them", () => {
  it("cannot reset the password of, deactivate, or change a built-in Admin", async () => {
    const hrDb = dbOf(hr);
    await expect(usersService.resetPassword(hrDb, hr, adminId, "Takeover@12345")).rejects.toThrow(/within your own/);
    await expect(usersService.setActive(hrDb, hr, adminId, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(usersService.remove(hrDb, hr, adminId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cannot manage a user whose role holds permissions it lacks", async () => {
    await expect(usersService.resetPassword(dbOf(hr), hr, cs.id, "Takeover@12345")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("can still manage a peer with the same role", async () => {
    await expect(usersService.resetPassword(dbOf(hr), hr, hrPeerId, "Peer@12345678")).resolves.toBeUndefined();
  });

  it("a built-in Admin can manage anyone", async () => {
    await expect(usersService.resetPassword(dbOf(admin), admin, hrPeerId, "Admin@12345678")).resolves.toBeUndefined();
  });
});
