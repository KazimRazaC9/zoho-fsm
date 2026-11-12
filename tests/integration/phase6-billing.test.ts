/**
 * Phase 6 acceptance: "an approved estimate becomes a work order; a completed work order becomes an
 * invoice; payments (including partial ones) settle it". Runs against the seeded dev database (Demo
 * company) and removes what it creates.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, tenantContext, type AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import { estimatesService } from "@/modules/estimates";
import { invoicesService } from "@/modules/invoices";
import { requestsService } from "@/modules/requests";
import { workOrdersService } from "@/modules/work-orders";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const stamp = Date.now().toString(36);

let admin: CurrentUser;
let db: AppDb;
let acmeDb: AppDb;
let acmeAdmin: CurrentUser;
let customerId: string;
let addressId: string;
const requestIds: string[] = [];
const estimateIds: string[] = [];
const woIds: string[] = [];
const invoiceIds: string[] = [];

const asUser = (u: { id: string; role: string; companyId: string | null; fullName: string; email: string }) =>
  ({
    id: u.id,
    role: u.role,
    companyId: u.companyId,
    fullName: u.fullName,
    email: u.email,
    via: "session",
  }) as CurrentUser;

const line = (description: string, qty: number, unitPrice: number, taxPercent = 16) => ({
  serviceItemId: "",
  description,
  qty,
  unitPrice,
  taxPercent,
});

beforeAll(async () => {
  const a = await owner.user.findFirstOrThrow({ where: { email: "admin@demo.local" } });
  admin = asUser(a);
  db = createDb(tenantContext(a.companyId!, a.id));
  const x = await owner.user.findFirstOrThrow({ where: { email: "admin@acme.local" } });
  acmeAdmin = asUser(x);
  acmeDb = createDb(tenantContext(x.companyId!, x.id));
  const site = await owner.serviceAddress.findFirstOrThrow({
    where: { companyId: a.companyId!, deletedAt: null, customer: { deletedAt: null } },
  });
  customerId = site.customerId;
  addressId = site.id;
});

afterAll(async () => {
  const ids = [...requestIds, ...estimateIds, ...woIds, ...invoiceIds];
  await owner.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await owner.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await owner.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await owner.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await owner.workOrderStatusChange.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrderChecklistItem.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrderLine.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrder.deleteMany({ where: { id: { in: woIds } } });
  await owner.estimateLine.deleteMany({ where: { estimateId: { in: estimateIds } } });
  await owner.estimate.deleteMany({ where: { id: { in: estimateIds } } });
  await owner.serviceRequest.deleteMany({ where: { id: { in: requestIds } } });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("Phase 6 — estimates", () => {
  it("a request gets an estimate; it is sent, approved and becomes a work order with its lines", async () => {
    const req = await requestsService.create(db, admin, {
      customerId,
      addressId,
      assetId: "",
      title: `P6 quote ${stamp}`,
      description: "Needs a price first",
      priority: "HIGH",
      source: "EMAIL",
      category: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      preferredAt: "",
    });
    requestIds.push(req.id);

    const est = await estimatesService.create(db, admin, {
      customerId,
      addressId,
      requestId: req.id,
      validUntil: "2035-01-31",
      notes: "Prices valid 30 days",
    });
    estimateIds.push(est.id);
    expect(est.number).toMatch(/^EST-\d{6}$/);
    expect(est.status).toBe("DRAFT");
    expect((await requestsService.get(db, admin, req.id)).status).toBe("ESTIMATED");

    await expect(estimatesService.changeStatus(db, admin, est.id, "SENT")).rejects.toThrow(/at least one line/);
    await estimatesService.addLine(db, admin, est.id, line("MDVR install", 2, 1500.5));
    await estimatesService.addLine(db, admin, est.id, line("Cable", 1, 400));
    const d = await estimatesService.get(db, admin, est.id);
    expect(d).toMatchObject({ subTotal: 3401, tax: 544.16, total: 3945.16 });

    await expect(estimatesService.changeStatus(db, admin, est.id, "APPROVED")).rejects.toThrow(/Allowed: sent/);
    await estimatesService.changeStatus(db, admin, est.id, "SENT");
    await expect(estimatesService.addLine(db, admin, est.id, line("x", 1, 1))).rejects.toThrow(/Revise it/);
    await estimatesService.changeStatus(db, admin, est.id, "APPROVED");
    await expect(estimatesService.changeStatus(db, admin, est.id, "DRAFT")).rejects.toBeInstanceOf(ConflictError);

    const wo = await estimatesService.convert(db, admin, est.id, { checklistTemplateId: "", dueDate: "" });
    woIds.push(wo.id);
    const detail = await workOrdersService.get(db, admin, wo.id);
    expect(detail.lines.map((l) => l.description)).toEqual(["MDVR install", "Cable"]);
    expect(detail.totals.total).toBe(3945.16);
    expect(detail.title).toBe(req.title);
    expect(detail.request?.id).toBe(req.id);
    expect((await requestsService.get(db, admin, req.id)).status).toBe("CONVERTED");
    expect((await estimatesService.get(db, admin, est.id)).workOrder?.id).toBe(wo.id);

    await expect(estimatesService.convert(db, admin, est.id, { checklistTemplateId: "", dueDate: "" })).rejects.toThrow(
      /already became/,
    );
  });

  it("deleting a draft estimate returns its request to New; other companies cannot see estimates", async () => {
    const req = await requestsService.create(db, admin, {
      customerId,
      addressId: "",
      assetId: "",
      title: `P6 draft ${stamp}`,
      description: "",
      priority: "LOW",
      source: "PHONE",
      category: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      preferredAt: "",
    });
    requestIds.push(req.id);
    const est = await estimatesService.create(db, admin, {
      customerId,
      addressId: "",
      requestId: req.id,
      validUntil: "",
      notes: "",
    });
    estimateIds.push(est.id);
    await expect(estimatesService.get(acmeDb, acmeAdmin, est.id)).rejects.toBeInstanceOf(NotFoundError);
    await estimatesService.remove(db, est.id);
    expect((await requestsService.get(db, admin, req.id)).status).toBe("NEW");
  });
});

describe("Phase 6 — invoices and payments", () => {
  let invoiceId: string;

  it("a completed work order becomes a draft invoice; duplicates are refused", async () => {
    const wo = await workOrdersService.create(db, admin, {
      customerId,
      addressId,
      assetId: "",
      title: `P6 invoice job ${stamp}`,
      description: "",
      priority: "MEDIUM",
      dueDate: "",
      checklistTemplateId: "",
    });
    woIds.push(wo.id);
    await expect(invoicesService.createFromWorkOrder(db, admin, wo.id)).rejects.toThrow(/must be closed/);

    await workOrdersService.addLine(db, admin, wo.id, line("Diagnostic", 1, 2000));
    await workOrdersService.addLine(db, admin, wo.id, line("Harness", 2, 1500.5));
    await owner.workOrder.update({ where: { id: wo.id }, data: { status: "CLOSED", completedAt: new Date() } });

    const inv = await invoicesService.createFromWorkOrder(db, admin, wo.id);
    invoiceIds.push(inv.id);
    invoiceId = inv.id;
    expect(inv.number).toMatch(/^INV-\d{6}$/);

    const d = await invoicesService.get(db, admin, inv.id);
    expect(d).toMatchObject({ status: "DRAFT", subTotal: 5001, tax: 800.16, total: 5801.16, balance: 5801.16 });
    expect(d.lines).toHaveLength(2);
    expect(d.dueDate).not.toBeNull();
    await expect(invoicesService.createFromWorkOrder(db, admin, wo.id)).rejects.toThrow(/already has invoice/);
    await expect(invoicesService.get(acmeDb, acmeAdmin, inv.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a draft can be edited and discounted; issuing locks the amounts", async () => {
    await invoicesService.addLine(db, admin, invoiceId, line("Travel", 1, 100, 0));
    let d = await invoicesService.get(db, admin, invoiceId);
    expect(d.total).toBe(5901.16);

    await expect(
      invoicesService.update(db, admin, invoiceId, { dueDate: "", notes: "", discount: 999_999 }),
    ).rejects.toBeInstanceOf(BadRequestError);
    d = await invoicesService.update(db, admin, invoiceId, {
      dueDate: "2035-02-01",
      notes: "Thanks",
      discount: 901.16,
    });
    expect(d).toMatchObject({ discount: 901.16, total: 5000, dueDate: "2035-02-01" });

    await expect(
      invoicesService.addPayment(db, admin, invoiceId, { amount: 10, method: "CASH", reference: "", paidAt: "" }),
    ).rejects.toThrow(/Issue/);
    d = await invoicesService.issue(db, admin, invoiceId);
    expect(d.status).toBe("SENT");
    await expect(invoicesService.addLine(db, admin, invoiceId, line("x", 1, 1))).rejects.toThrow(/locked/);
    await expect(
      invoicesService.update(db, admin, invoiceId, { dueDate: "2035-02-01", notes: "", discount: 0 }),
    ).rejects.toThrow(/discount is locked/);
    // Terms and notes can still change.
    await invoicesService.update(db, admin, invoiceId, { dueDate: "2035-03-01", notes: "Net 30", discount: 901.16 });
  });

  it("partial payments settle the invoice; overpaying and paying a paid invoice are refused", async () => {
    await expect(
      invoicesService.addPayment(db, admin, invoiceId, { amount: 5000.01, method: "CARD", reference: "", paidAt: "" }),
    ).rejects.toThrow(/more than the balance of 5000\.00/);

    let d = await invoicesService.addPayment(db, admin, invoiceId, {
      amount: 2000,
      method: "BANK_TRANSFER",
      reference: "TRX-1",
      paidAt: "2035-01-10",
    });
    expect(d).toMatchObject({ status: "PARTIALLY_PAID", amountPaid: 2000, balance: 3000 });
    expect(d.payments[0]).toMatchObject({ method: "BANK_TRANSFER", reference: "TRX-1", paidAtDay: "2035-01-10" });
    await expect(invoicesService.void(db, admin, invoiceId)).rejects.toThrow(/has payments/);

    d = await invoicesService.addPayment(db, admin, invoiceId, {
      amount: 3000,
      method: "CASH",
      reference: "",
      paidAt: "",
    });
    expect(d).toMatchObject({ status: "PAID", amountPaid: 5000, balance: 0, canPay: false });
    await expect(
      invoicesService.addPayment(db, admin, invoiceId, { amount: 1, method: "CASH", reference: "", paidAt: "" }),
    ).rejects.toThrow(/fully paid/);

    // A mistake is fixed by removing the payment: back to partially paid.
    const cash = d.payments.find((p) => p.method === "CASH")!;
    d = await invoicesService.removePayment(db, admin, invoiceId, cash.id);
    expect(d).toMatchObject({ status: "PARTIALLY_PAID", amountPaid: 2000, balance: 3000 });
  });

  it("two simultaneous payments cannot overpay the invoice", async () => {
    const results = await Promise.allSettled([
      invoicesService.addPayment(db, admin, invoiceId, { amount: 2000, method: "CASH", reference: "a", paidAt: "" }),
      invoicesService.addPayment(db, admin, invoiceId, { amount: 2000, method: "CASH", reference: "b", paidAt: "" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const d = await invoicesService.get(db, admin, invoiceId);
    expect(d.amountPaid).toBe(4000);
    expect(d.balance).toBe(1000);
  });

  it("an unpaid invoice past its due date reads as Overdue and shows in the summary and filter", async () => {
    await owner.invoice.update({ where: { id: invoiceId }, data: { dueDate: new Date("2020-01-01T00:00:00Z") } });
    const d = await invoicesService.get(db, admin, invoiceId);
    expect(d.status).toBe("OVERDUE");
    const overdue = await invoicesService.list(db, admin, { page: 1, pageSize: 50, status: "OVERDUE" });
    expect(overdue.items.map((i) => i.id)).toContain(invoiceId);
    const sent = await invoicesService.list(db, admin, { page: 1, pageSize: 50, status: "PARTIALLY_PAID" });
    expect(sent.items.map((i) => i.id)).not.toContain(invoiceId);
    const s = await invoicesService.summary(db, admin);
    expect(s.overdue).toBeGreaterThanOrEqual(1000);
    expect(s.outstanding).toBeGreaterThanOrEqual(s.overdue);
    expect(s.collected30).toBeGreaterThanOrEqual(2000);
  });

  it("a draft invoice can be voided and then the work order can be invoiced again", async () => {
    const wo = await workOrdersService.create(db, admin, {
      customerId,
      addressId: "",
      assetId: "",
      title: `P6 void ${stamp}`,
      description: "",
      priority: "LOW",
      dueDate: "",
      checklistTemplateId: "",
    });
    woIds.push(wo.id);
    await workOrdersService.addLine(db, admin, wo.id, line("Check", 1, 500));
    await owner.workOrder.update({ where: { id: wo.id }, data: { status: "CLOSED" } });
    const first = await invoicesService.createFromWorkOrder(db, admin, wo.id);
    invoiceIds.push(first.id);
    const v = await invoicesService.void(db, admin, first.id);
    expect(v.status).toBe("VOID");
    const second = await invoicesService.createFromWorkOrder(db, admin, wo.id);
    invoiceIds.push(second.id);
    expect(second.id).not.toBe(first.id);
  });
});
