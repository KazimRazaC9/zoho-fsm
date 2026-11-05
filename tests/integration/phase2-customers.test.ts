/**
 * Phase 2 acceptance: "a dispatcher creates a customer with two sites and an asset, and finds it
 * by search", plus the rules around sites, assets, warranty and the catalog.
 * Runs against the seeded dev database and removes what it creates.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, tenantContext, type AppDb } from "@/lib/db";
import { ConflictError, BadRequestError, NotFoundError } from "@/lib/errors";
import { assetListQuerySchema, assetsService, warrantyState } from "@/modules/assets";
import { catalogService, serviceItemListQuerySchema } from "@/modules/catalog";
import { customerListQuerySchema, customersService, BLANK_ADDRESS } from "@/modules/customers";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const TZ = "Asia/Karachi";
const stamp = Date.now().toString(36);

let dispatcher: CurrentUser;
let db: AppDb;
let acmeDb: AppDb;
const customerIds: string[] = [];
const itemIds: string[] = [];

const asUser = (u: { id: string; role: string; companyId: string | null; fullName: string; email: string }) =>
  ({
    id: u.id,
    role: u.role,
    companyId: u.companyId,
    fullName: u.fullName,
    email: u.email,
    via: "session",
  }) as CurrentUser;

beforeAll(async () => {
  const d = await owner.user.findFirstOrThrow({ where: { email: "dispatcher@demo.local" } });
  dispatcher = asUser(d);
  db = createDb(tenantContext(d.companyId!, d.id));
  const acme = await owner.user.findFirstOrThrow({ where: { email: "admin@acme.local" } });
  acmeDb = createDb(tenantContext(acme.companyId!, acme.id));
});

afterAll(async () => {
  const assets = await owner.asset.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } });
  const addresses = await owner.serviceAddress.findMany({
    where: { customerId: { in: customerIds } },
    select: { id: true },
  });
  const entityIds = [...customerIds, ...itemIds, ...assets.map((a) => a.id), ...addresses.map((a) => a.id)];
  await owner.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
  await owner.asset.deleteMany({ where: { customerId: { in: customerIds } } });
  await owner.serviceAddress.deleteMany({ where: { customerId: { in: customerIds } } });
  await owner.customer.deleteMany({ where: { id: { in: customerIds } } });
  await owner.serviceItem.deleteMany({ where: { id: { in: itemIds } } });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("Phase 2 — customers, sites and assets", () => {
  it("dispatcher creates a customer with two sites and an asset, then finds it by search", async () => {
    const name = `P2 Orchard Foods ${stamp}`;
    const customer = await customersService.create(db, dispatcher, {
      type: "BUSINESS",
      name,
      email: `orders-${stamp}@orchard.example`,
      phone: "+92-42-5550100",
      notes: "",
      addresses: [
        {
          ...BLANK_ADDRESS,
          label: "Head office",
          addressLine: "1 Mall Road",
          city: "Lahore",
          latitude: "31.5546",
          longitude: "74.3572",
        },
        { ...BLANK_ADDRESS, label: "Warehouse", addressLine: `Plot ${stamp} Sundar Estate`, city: "Lahore" },
      ],
    });
    customerIds.push(customer.id);
    expect(customer.addresses).toHaveLength(2);
    expect(customer.addresses[0].latitude).toBeCloseTo(31.5546, 4);
    expect(customer.addresses[1].latitude).toBeNull();

    const asset = await assetsService.create(
      db,
      dispatcher,
      {
        customerId: customer.id,
        addressId: customer.addresses[1].id,
        name: "Cold Room Compressor",
        category: "Refrigeration",
        brand: "Copeland",
        model: "ZB45",
        serialNo: `CR-${stamp}`,
        installDate: "2025-01-15",
        warrantyEndDate: "2099-01-15",
        status: "ACTIVE",
      },
      TZ,
    );
    expect(asset.customerName).toBe(name);
    expect(asset.siteLabel).toContain("Warehouse");
    expect(asset.warranty).toBe("active");

    // Found by name, by phone, and by a site address.
    for (const search of [`orchard foods ${stamp}`, "5550100", `Plot ${stamp}`]) {
      const res = await customersService.list(db, customerListQuerySchema.parse({ search }));
      expect(
        res.items.map((c) => c.id),
        search,
      ).toContain(customer.id);
      const row = res.items.find((c) => c.id === customer.id)!;
      expect(row.addressCount).toBe(2);
      expect(row.assetCount).toBe(1);
    }
    // The asset is found by serial number.
    const assets = await assetsService.list(db, assetListQuerySchema.parse({ search: `CR-${stamp}` }), TZ);
    expect(assets.items.map((a) => a.id)).toEqual([asset.id]);
  });

  it("another company cannot see or edit the customer", async () => {
    const id = customerIds[0];
    const res = await customersService.list(
      acmeDb,
      customerListQuerySchema.parse({ search: `Orchard Foods ${stamp}` }),
    );
    expect(res.totalCount).toBe(0);
    await expect(customersService.get(acmeDb, id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an asset on another customer's site", async () => {
    const other = await owner.serviceAddress.findFirstOrThrow({
      where: { customerId: { notIn: customerIds }, customer: { companyId: dispatcher.companyId! } },
    });
    await expect(
      assetsService.create(
        db,
        dispatcher,
        {
          customerId: customerIds[0],
          addressId: other.id,
          name: "Wrong site",
          category: "",
          brand: "",
          model: "",
          serialNo: "",
          installDate: "",
          warrantyEndDate: "",
          status: "ACTIVE",
        },
        TZ,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("keeps at least one site; removing a site keeps its assets with the customer", async () => {
    const id = customerIds[0];
    const c = await customersService.get(db, id);
    const warehouse = c.addresses.find((a) => a.label === "Warehouse")!;
    await customersService.removeAddress(db, id, warehouse.id);

    const after = await customersService.get(db, id);
    expect(after.addresses).toHaveLength(1);
    const assets = await assetsService.list(db, assetListQuerySchema.parse({ customerId: id }), TZ);
    expect(assets.items[0].addressId).toBeNull();

    await expect(customersService.removeAddress(db, id, after.addresses[0].id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to delete a customer with open work orders", async () => {
    const busy = await owner.workOrder.findFirstOrThrow({
      where: { companyId: dispatcher.companyId!, status: { in: ["NEW", "SCHEDULED", "IN_PROGRESS"] }, deletedAt: null },
    });
    await expect(customersService.remove(db, busy.customerId)).rejects.toBeInstanceOf(ConflictError);
  });

  it("deleting a customer soft-deletes its sites and assets", async () => {
    const id = customerIds[0];
    await customersService.remove(db, id);
    await expect(customersService.get(db, id)).rejects.toBeInstanceOf(NotFoundError);
    const live = await owner.asset.count({ where: { customerId: id, deletedAt: null } });
    expect(live).toBe(0);
    const rows = await owner.serviceAddress.count({ where: { customerId: id } });
    expect(rows).toBeGreaterThan(0); // still in the database, just marked deleted
  });
});

describe("Phase 2 — warranty", () => {
  it("classifies warranty end dates against today", () => {
    expect(warrantyState(null, "2026-11-04")).toBe("none");
    expect(warrantyState("2026-11-03", "2026-11-04")).toBe("expired");
    expect(warrantyState("2026-11-04", "2026-11-04")).toBe("expiring");
    expect(warrantyState("2026-12-04", "2026-11-04")).toBe("expiring");
    expect(warrantyState("2026-12-05", "2026-11-04")).toBe("active");
  });
});

describe("Phase 2 — catalog", () => {
  it("creates a part, keeps SKUs unique and never lets stock go negative", async () => {
    const sku = `P2-${stamp}`;
    const part = await catalogService.create(db, dispatcher, {
      name: `P2 Contactor ${stamp}`,
      type: "PART",
      sku,
      unitPrice: 1250.5,
      taxPercent: 16,
      stockQty: 3,
    });
    itemIds.push(part.id);
    expect(part.unitPrice).toBe(1250.5);
    expect(part.lowStock).toBe(true);

    await expect(
      catalogService.create(db, dispatcher, {
        name: "Duplicate",
        type: "SERVICE",
        sku: sku.toLowerCase(),
        unitPrice: 1,
        taxPercent: 0,
        stockQty: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect((await catalogService.adjustStock(db, part.id, 20)).stockQty).toBe(23);
    expect((await catalogService.adjustStock(db, part.id, -23)).stockQty).toBe(0);
    await expect(catalogService.adjustStock(db, part.id, -1)).rejects.toBeInstanceOf(ConflictError);

    const found = await catalogService.list(db, serviceItemListQuerySchema.parse({ search: sku, stock: "low" }));
    expect(found.items.map((i) => i.id)).toEqual([part.id]);
  });

  it("services never carry stock", async () => {
    const svc = await catalogService.create(db, dispatcher, {
      name: `P2 Duct Cleaning ${stamp}`,
      type: "SERVICE",
      sku: "",
      unitPrice: 5000,
      taxPercent: 16,
      stockQty: 99,
    });
    itemIds.push(svc.id);
    expect(svc.stockQty).toBeNull();
    await expect(catalogService.adjustStock(db, svc.id, 1)).rejects.toBeInstanceOf(BadRequestError);
  });
});
