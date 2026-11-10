"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { invoicesService } from "./invoices.service";
import { invoiceSchema, paymentSchema, type InvoiceInput, type PaymentInput } from "./invoices.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import { idParam } from "@/lib/validation";
import { lineSchema, type LineInput } from "@/modules/work-orders/work-orders.schema";

/** Money moves are Admin-only; dispatchers can read invoices. */
const ADMIN = ["ADMIN"] as const;
const inv = z.object({ id: idParam });

function done<T>(res: ActionResult<T>) {
  if (res.ok) {
    revalidatePath("/invoices", "layout");
    revalidatePath("/work-orders", "layout");
  }
  return res;
}

export async function createInvoiceAction(workOrderId: string) {
  return done(
    await runAction(
      { roles: ADMIN, input: z.object({ workOrderId: idParam }) },
      { workOrderId },
      ({ db, user, input }) => invoicesService.createFromWorkOrder(db, user, input.workOrderId),
    ),
  );
}

export async function updateInvoiceAction(id: string, input: InvoiceInput) {
  return done(
    await runAction(
      { roles: ADMIN, input: inv.extend({ data: invoiceSchema }) },
      { id, data: input },
      async ({ db, user, input }) => {
        await invoicesService.update(db, user, input.id, input.data);
      },
    ),
  );
}

export async function issueInvoiceAction(id: string) {
  return done(
    await runAction({ roles: ADMIN, input: inv }, { id }, async ({ db, user, input }) => {
      await invoicesService.issue(db, user, input.id);
    }),
  );
}

export async function voidInvoiceAction(id: string) {
  return done(
    await runAction({ roles: ADMIN, input: inv }, { id }, async ({ db, user, input }) => {
      await invoicesService.void(db, user, input.id);
    }),
  );
}

export async function saveInvoiceLineAction(id: string, lineId: string | null, input: LineInput) {
  return done(
    await runAction(
      { roles: ADMIN, input: inv.extend({ lineId: idParam.nullable(), data: lineSchema }) },
      { id, lineId, data: input },
      async ({ db, user, input }) => {
        if (input.lineId) await invoicesService.updateLine(db, input.id, input.lineId, input.data);
        else await invoicesService.addLine(db, user, input.id, input.data);
      },
    ),
  );
}

export async function deleteInvoiceLineAction(id: string, lineId: string) {
  return done(
    await runAction({ roles: ADMIN, input: inv.extend({ lineId: idParam }) }, { id, lineId }, async ({ db, input }) => {
      await invoicesService.removeLine(db, input.id, input.lineId);
    }),
  );
}

export async function recordPaymentAction(id: string, input: PaymentInput) {
  return done(
    await runAction(
      { roles: ADMIN, input: inv.extend({ data: paymentSchema }) },
      { id, data: input },
      async ({ db, user, input }) => {
        await invoicesService.addPayment(db, user, input.id, input.data);
      },
    ),
  );
}

export async function deletePaymentAction(id: string, paymentId: string) {
  return done(
    await runAction(
      { roles: ADMIN, input: inv.extend({ paymentId: idParam }) },
      { id, paymentId },
      async ({ db, user, input }) => {
        await invoicesService.removePayment(db, user, input.id, input.paymentId);
      },
    ),
  );
}
