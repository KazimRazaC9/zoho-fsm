/**
 * Customer -> Project -> Site -> Asset: a customer can have several projects (for example
 * "Water DC" and "Drift Vans"), each with its own sites. Runs against the seeded dev database
 * (Demo company) and removes what it creates.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, tenantContext, type AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import { BLANK_ADDRESS, customersService, siteLabelOf } from "@/modules/customers";
import { assetsService } from "@/modules/assets";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const stamp = Date.now().toString(36);

let admin: CurrentUser;
let db: AppDb;
let acmeDb: AppDb;
const customerIds: string[] = [];

const site = (label: string, projectId = "") => ({ ...BLANK_ADDRESS, label, addressLine: `${label} road`, projectId });

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
  } as CurrentUser;
  db = createDb(tenantContext(a.companyId!, a.id));
  const acme = await owner.user.findFirstOrThrow({ where: { email: "admin@acme.local" } });
  acmeDb = createDb(tenantContext(acme.companyId!, acme.id));
});

afterAll(async () => {
  await owner.auditLog.deleteMany({ where: { entityId: { in: customerIds } } });
  await owner.asset.deleteMany({ where: { customerId: { in: customerIds } } });
  await owner.serviceAddress.deleteMany({ where: { customerId: { in: customerIds } } });
  await owner.project.deleteMany({ where: { customerId: { in: customerIds } } });
  await owner.customer.deleteMany({ where: { id: { in: customerIds } } });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("customer projects", () => {
  let customerId: string;
  let otherCustomerId: string;
  let waterId: string;
  let driftId: string;

  it("a customer has projects, and each site can be filed under one", async () => {
    const c = await customersService.create(db, admin, {
      type: "BUSINESS",
      name: `P9 Nestle ${stamp}`,
      email: "",
      phone: "",
      notes: "",
      addresses: [site("Head office")],
    });
    customerId = c.id;
    customerIds.push(c.id);
    expect(c.projects).toEqual([]);

    waterId = (await customersService.addProject(db, admin, customerId, { name: "Water DC", description: "" })).id;
    driftId = (
      await customersService.addProject(db, admin, customerId, { name: "Drift Vans", description: "Delivery vans" })
    ).id;
    await customersService.addAddress(db, admin, customerId, site("Sheikhupura", waterId));
    await customersService.addAddress(db, admin, customerId, site("Lahore DC", waterId));
    await customersService.addAddress(db, admin, customerId, site("Karachi depot", driftId));

    const got = await customersService.get(db, customerId);
    expect(got.projects.map((p) => [p.name, p.siteCount])).toEqual([
      ["Drift Vans", 1],
      ["Water DC", 2],
    ]);
    const bySite = Object.fromEntries(got.addresses.map((a) => [a.label, a.projectName]));
    expect(bySite).toEqual({
      "Head office": null,
      Sheikhupura: "Water DC",
      "Lahore DC": "Water DC",
      "Karachi depot": "Drift Vans",
    });
  });

  it("refuses a duplicate project name for the same customer, in any letter case", async () => {
    await expect(
      customersService.addProject(db, admin, customerId, { name: "water dc", description: "" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      customersService.updateProject(db, customerId, driftId, { name: "WATER DC", description: "" }),
    ).rejects.toBeInstanceOf(ConflictError);
    // Renaming to itself is fine.
    await customersService.updateProject(db, customerId, driftId, { name: "Drift Vans", description: "Vans" });
  });

  it("a site can only use a project of its own customer", async () => {
    const other = await customersService.create(db, admin, {
      type: "BUSINESS",
      name: `P9 Other ${stamp}`,
      email: "",
      phone: "",
      notes: "",
      addresses: [site("Other office")],
    });
    otherCustomerId = other.id;
    customerIds.push(other.id);
    await expect(
      customersService.addAddress(db, admin, otherCustomerId, site("Wrong", waterId)),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("shows the project in the site name used by pickers and assets", async () => {
    const a = (await customersService.get(db, customerId)).addresses.find((x) => x.label === "Sheikhupura")!;
    expect(siteLabelOf(a)).toBe("Water DC › Sheikhupura — Sheikhupura road");
    const opts = await customersService.options(db, `P9 Nestle ${stamp}`);
    expect(opts[0].addresses.map((x) => x.label)).toContain("Water DC › Sheikhupura — Sheikhupura road");

    const asset = await assetsService.create(
      db,
      admin,
      {
        customerId,
        addressId: a.id,
        name: "MDVR — NSD-1",
        category: "MDVR",
        brand: "",
        model: "",
        serialNo: "",
        installDate: "",
        warrantyEndDate: "",
        status: "ACTIVE",
      },
      "Asia/Karachi",
    );
    expect((await assetsService.get(db, asset.id, "Asia/Karachi")).siteLabel).toBe(
      "Water DC › Sheikhupura — Sheikhupura road",
    );
  });

  it("a project with sites cannot be deleted; an empty one can", async () => {
    await expect(customersService.removeProject(db, customerId, waterId)).rejects.toThrow(/still has 2 sites/);
    const sites = (await customersService.get(db, customerId)).addresses.filter((x) => x.projectId === driftId);
    // Move the only Drift Vans site out of the project, then the project can go.
    await customersService.updateAddress(db, customerId, sites[0].id, {
      ...site(sites[0].label ?? "x"),
      projectId: "",
    });
    await customersService.removeProject(db, customerId, driftId);
    const got = await customersService.get(db, customerId);
    expect(got.projects.map((p) => p.name)).toEqual(["Water DC"]);
    expect(got.addresses.find((x) => x.label === "Karachi depot")?.projectName).toBeNull();
  });

  it("projects are private to their company", async () => {
    await expect(
      customersService.updateProject(acmeDb, customerId, waterId, { name: "Hijack", description: "" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(customersService.removeProject(acmeDb, customerId, waterId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("moving an asset between sites and projects", () => {
  it("re-assigns an asset to another site of the same customer, and refuses another customer's site", async () => {
    const mk = async (name: string) =>
      customersService.create(db, admin, {
        type: "BUSINESS",
        name: `${name} ${stamp}`,
        email: "",
        phone: "",
        notes: "",
        addresses: [site(`${name} office`)],
      });
    const a = await mk("P9 Mover");
    const b = await mk("P9 Stranger");
    customerIds.push(a.id, b.id);
    const water = await customersService.addProject(db, admin, a.id, { name: "Water DC", description: "" });
    const drift = await customersService.addProject(db, admin, a.id, { name: "Drift Vans", description: "" });
    const siteW = await customersService.addAddress(db, admin, a.id, site("Plant", water.id));
    const siteD = await customersService.addAddress(db, admin, a.id, site("Yard", drift.id));

    const asset = await assetsService.create(
      db,
      admin,
      {
        customerId: a.id,
        addressId: siteW.id,
        name: "GPS — NSD-9",
        category: "GPS tracker",
        brand: "",
        model: "",
        serialNo: "",
        installDate: "",
        warrantyEndDate: "",
        status: "ACTIVE",
      },
      "Asia/Karachi",
    );
    expect((await assetsService.get(db, asset.id, "Asia/Karachi")).siteLabel).toMatch(/^Water DC › Plant/);

    await assetsService.moveToSite(db, asset.id, siteD.id);
    expect((await assetsService.get(db, asset.id, "Asia/Karachi")).siteLabel).toMatch(/^Drift Vans › Yard/);

    await assetsService.moveToSite(db, asset.id, null);
    expect((await assetsService.get(db, asset.id, "Asia/Karachi")).siteLabel).toBeNull();

    const strangerSite = b.addresses[0].id;
    await expect(assetsService.moveToSite(db, asset.id, strangerSite)).rejects.toBeInstanceOf(BadRequestError);
  });
});
