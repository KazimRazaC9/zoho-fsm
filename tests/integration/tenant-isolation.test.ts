/**
 * Acceptance: "a user from company A cannot read company B data".
 * Runs against the seeded dev database (docker compose up -d && pnpm db:seed).
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, prismaBase, systemContext, tenantContext } from "@/lib/db";
import { nextNumber } from "@/lib/numbers";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
let demoId = "";
let acmeId = "";
let demoCustomerId = "";
const createdIds: string[] = [];

beforeAll(async () => {
  demoId = (await owner.company.findFirstOrThrow({ where: { name: "Demo Cooling & Heating" } })).id;
  acmeId = (await owner.company.findFirstOrThrow({ where: { name: "Acme Plumbing" } })).id;
  demoCustomerId = (await owner.customer.findFirstOrThrow({ where: { companyId: demoId } })).id;
});

afterAll(async () => {
  await owner.auditLog.deleteMany({ where: { entityId: { in: createdIds } } });
  await owner.customer.deleteMany({ where: { id: { in: createdIds } } });
  await owner.numberSequence.deleteMany({ where: { companyId: acmeId, entityType: "SR" } });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("tenant isolation", () => {
  it("each company sees only its own customers", async () => {
    const demo = createDb(tenantContext(demoId, null));
    const acme = createDb(tenantContext(acmeId, null));
    expect(await demo.customer.count()).toBe(10);
    expect(await acme.customer.count()).toBe(2);
  });

  it("cannot read another company's record by id", async () => {
    const acme = createDb(tenantContext(acmeId, null));
    expect(await acme.customer.findUnique({ where: { id: demoCustomerId } })).toBeNull();
    expect(await acme.customer.findFirst({ where: { id: demoCustomerId } })).toBeNull();
  });

  it("cannot update another company's record", async () => {
    const acme = createDb(tenantContext(acmeId, null));
    await expect(acme.customer.update({ where: { id: demoCustomerId }, data: { notes: "hacked" } })).rejects.toThrow();
    const row = await owner.customer.findUniqueOrThrow({ where: { id: demoCustomerId } });
    expect(row.notes).not.toBe("hacked");
  });

  it("cannot create a row for another company", async () => {
    const acme = createDb(tenantContext(acmeId, null));
    await expect(acme.customer.create({ data: { name: "Sneaky", companyId: demoId } })).rejects.toThrow(/Cross-tenant/);
  });

  it("RLS fails closed when no context is set (second safety layer)", async () => {
    const rows = await prismaBase.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Customer"`;
    expect(Number(rows[0].n)).toBe(0);
  });

  it("RLS limits even an unfiltered raw query to the current company", async () => {
    const acme = createDb(tenantContext(acmeId, null));
    const rows = await acme.$rawInContext(
      (tx) => tx.$queryRaw<{ companyId: string }[]>`SELECT "companyId" FROM "Customer"`,
    );
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.companyId === acmeId)).toBe(true);
  });

  it("stamps companyId on create, soft-deletes and writes the audit log", async () => {
    const acme = createDb(tenantContext(acmeId, null));
    const created = await acme.customer.create({ data: { name: "Isolation Test Co", companyId: acmeId } });
    createdIds.push(created.id);
    expect(created.companyId).toBe(acmeId);

    await acme.customer.delete({ where: { id: created.id } });
    expect(await acme.customer.findUnique({ where: { id: created.id } })).toBeNull();
    const raw = await owner.customer.findUniqueOrThrow({ where: { id: created.id } });
    expect(raw.deletedAt).not.toBeNull();

    const audit = await owner.auditLog.findMany({ where: { entityId: created.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => a.action)).toEqual(["CREATE", "DELETE"]);
  });

  it("system context can see every company", async () => {
    const sys = createDb(systemContext("test"));
    expect(await sys.company.count()).toBeGreaterThanOrEqual(2);
  });

  it("document numbers are unique under concurrency", async () => {
    const acme = createDb(tenantContext(acmeId, null));
    const numbers = await Promise.all(Array.from({ length: 10 }, () => nextNumber(acme, "SR")));
    expect(new Set(numbers).size).toBe(10);
    expect(numbers.sort()[0]).toBe("SR-000001");
  });
});
