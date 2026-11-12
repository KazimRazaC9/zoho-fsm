/**
 * Phase 1 acceptance: "an admin adds a dispatcher and two technicians, who can then sign in",
 * plus the team rules (last admin, deactivation, tenant isolation, Super Admin tenants).
 * Runs against the seeded dev database.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, systemContext, tenantContext, type AppDb } from "@/lib/db";
import { authService } from "@/modules/auth";
import { companiesService } from "@/modules/companies";
import { usersService } from "@/modules/users";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const PW = "Phase1@Pass";
const stamp = Date.now().toString(36);
const email = (n: string) => `p1-${n}-${stamp}@demo.local`;

let admin: CurrentUser;
let db: AppDb;
const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];

beforeAll(async () => {
  const a = await owner.user.findFirstOrThrow({ where: { email: "admin@demo.local" } });
  admin = {
    id: a.id,
    role: "ADMIN",
    customRoleId: null,
    customRoleName: null,
    permissions: [],
    companyId: a.companyId,
    fullName: a.fullName,
    email: a.email,
    via: "session",
  };
  db = createDb(tenantContext(a.companyId!, a.id));
});

afterAll(async () => {
  const companyUsers = await owner.user.findMany({
    where: { companyId: { in: createdCompanyIds } },
    select: { id: true },
  });
  const ids = [...createdUserIds, ...companyUsers.map((u) => u.id)];
  await owner.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await owner.technicianProfile.deleteMany({ where: { userId: { in: ids } } });
  await owner.auditLog.deleteMany({
    where: { OR: [{ entityId: { in: [...ids, ...createdCompanyIds] } }, { companyId: { in: createdCompanyIds } }] },
  });
  await owner.user.deleteMany({ where: { id: { in: ids } } });
  await owner.company.deleteMany({ where: { id: { in: createdCompanyIds } } });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("Phase 1 — company team", () => {
  it("admin adds a dispatcher and two technicians who can then sign in", async () => {
    const dispatcher = await usersService.create(db, admin, {
      fullName: "P1 Dispatcher",
      email: email("disp"),
      phone: "",
      role: "DISPATCHER",
      password: PW,
    });
    const t1 = await usersService.create(db, admin, {
      fullName: "P1 Tech One",
      email: email("t1"),
      phone: "",
      role: "TECHNICIAN",
      password: PW,
      technicianProfile: {
        skills: ["HVAC", " ", "Electrical"],
        hourlyRate: 1200.5,
        workStart: "08:00",
        workEnd: "17:00",
        workingDays: ["MON", "TUE", "WED"],
        color: "#ff0000",
      },
    });
    const t2 = await usersService.create(db, admin, {
      fullName: "P1 Tech Two",
      email: email("t2"),
      phone: "",
      role: "TECHNICIAN",
      password: PW,
    });
    createdUserIds.push(dispatcher.id, t1.id, t2.id);

    expect(t1.technicianProfile).toMatchObject({
      skills: ["HVAC", "Electrical"],
      hourlyRate: 1200.5,
      workStart: "08:00",
    });
    expect(t2.technicianProfile?.workingDays).toEqual(["MON", "TUE", "WED", "THU", "FRI"]); // defaults

    for (const u of [dispatcher, t1, t2]) {
      const signedIn = await authService.verifyCredentials(u.email, PW);
      expect(signedIn?.id).toBe(u.id);
      expect(signedIn?.companyId).toBe(admin.companyId);
    }
  });

  it("rejects a duplicate email in the same company", async () => {
    await expect(
      usersService.create(db, admin, {
        fullName: "Dup",
        email: email("disp"),
        phone: "",
        role: "DISPATCHER",
        password: PW,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("deactivating a user blocks sign-in; reactivating restores it", async () => {
    const id = createdUserIds[0];
    await usersService.setActive(db, admin, id, false);
    expect(await authService.verifyCredentials(email("disp"), PW)).toBeNull();
    await usersService.setActive(db, admin, id, true);
    expect(await authService.verifyCredentials(email("disp"), PW)).not.toBeNull();
  });

  it("reset password replaces the old one", async () => {
    const id = createdUserIds[1];
    await usersService.resetPassword(db, admin, id, "NewPass@123");
    expect(await authService.verifyCredentials(email("t1"), PW)).toBeNull();
    expect(await authService.verifyCredentials(email("t1"), "NewPass@123")).not.toBeNull();
  });

  it("an admin cannot deactivate, demote or delete themselves", async () => {
    await expect(usersService.setActive(db, admin, admin.id, false)).rejects.toThrow(/own account/);
    await expect(
      usersService.update(db, admin, admin.id, {
        fullName: admin.fullName,
        email: admin.email,
        phone: "",
        role: "DISPATCHER",
      }),
    ).rejects.toThrow(/own role/);
    await expect(usersService.remove(db, admin, admin.id)).rejects.toThrow(/own account/);
  });

  it("the last active admin cannot be removed by another admin", async () => {
    const second = await usersService.create(db, admin, {
      fullName: "P1 Second Admin",
      email: email("admin2"),
      phone: "",
      role: "ADMIN",
      password: PW,
    });
    createdUserIds.push(second.id);
    const secondActor: CurrentUser = { ...admin, id: second.id, fullName: second.fullName, email: second.email };
    // With two admins, demoting the seed admin is allowed…
    await usersService.update(db, secondActor, admin.id, {
      fullName: admin.fullName,
      email: admin.email,
      phone: "",
      role: "DISPATCHER",
    });
    // …which leaves `second` as the only admin, so it cannot be deactivated.
    await expect(usersService.setActive(db, admin, second.id, false)).rejects.toThrow(/last active Admin/);
    // Restore the seed admin's role.
    await usersService.update(db, secondActor, admin.id, {
      fullName: admin.fullName,
      email: admin.email,
      phone: "",
      role: "ADMIN",
    });
  });

  it("another company cannot see or change these users", async () => {
    const acme = await owner.company.findFirstOrThrow({ where: { name: "Acme Plumbing" } });
    const acmeAdmin = await owner.user.findFirstOrThrow({ where: { email: "admin@acme.local" } });
    const acmeDb = createDb(tenantContext(acme.id, acmeAdmin.id));
    const acmeActor: CurrentUser = {
      id: acmeAdmin.id,
      role: "ADMIN",
      customRoleId: null,
      customRoleName: null,
      permissions: [],
      companyId: acme.id,
      fullName: "",
      email: "",
      via: "session",
    };

    const list = await usersService.list(acmeDb, {
      page: 1,
      pageSize: 200,
      status: "all",
      sortBy: "fullName",
      sortDir: "asc",
    });
    expect(list.items.some((u) => createdUserIds.includes(u.id))).toBe(false);
    await expect(usersService.get(acmeDb, createdUserIds[0])).rejects.toThrow(/not found/);
    await expect(usersService.setActive(acmeDb, acmeActor, createdUserIds[0], false)).rejects.toThrow(/not found/);
  });

  it("company settings validate and save", async () => {
    const before = await companiesService.getSettings(db, admin);
    const saved = await companiesService.updateSettings(db, admin, {
      name: before.name,
      email: before.email ?? "",
      phone: before.phone ?? "",
      address: before.address ?? "",
      logoUrl: "",
      timeZone: before.timeZone,
      currency: before.currency,
      taxPercent: 17.5,
      requireSignatureOnComplete: true,
    });
    expect(saved.taxPercent).toBe(17.5);
    expect(saved.requireSignatureOnComplete).toBe(true);
    await companiesService.updateSettings(db, admin, {
      name: before.name,
      email: before.email ?? "",
      phone: before.phone ?? "",
      address: before.address ?? "",
      logoUrl: before.logoUrl ?? "",
      timeZone: before.timeZone,
      currency: before.currency,
      taxPercent: before.taxPercent,
      requireSignatureOnComplete: before.requireSignatureOnComplete,
    });
  });

  it("super admin creates a company with its first admin, and disabling it blocks sign-in", async () => {
    const sa = await owner.user.findFirstOrThrow({ where: { email: "superadmin@fieldserve.local" } });
    const saActor: CurrentUser = {
      id: sa.id,
      role: "SUPER_ADMIN",
      customRoleId: null,
      customRoleName: null,
      permissions: [],
      companyId: null,
      fullName: sa.fullName,
      email: sa.email,
      via: "session",
    };
    const sysDb = createDb(systemContext("super-admin", sa.id));

    const company = await companiesService.create(sysDb, saActor, {
      name: `P1 Test Co ${stamp}`,
      email: "",
      phone: "",
      timeZone: "Asia/Dubai",
      currency: "AED",
      taxPercent: 5,
      admin: { fullName: "P1 Tenant Admin", email: email("tenant-admin"), password: PW },
    });
    createdCompanyIds.push(company.id);

    const signedIn = await authService.verifyCredentials(email("tenant-admin"), PW);
    expect(signedIn?.companyId).toBe(company.id);
    expect(signedIn?.role).toBe("ADMIN");

    await companiesService.setActive(sysDb, saActor, company.id, false);
    expect(await authService.verifyCredentials(email("tenant-admin"), PW)).toBeNull();

    // A tenant admin cannot use Super Admin functions.
    await expect(companiesService.list(db, admin)).rejects.toThrow();
  });
});
