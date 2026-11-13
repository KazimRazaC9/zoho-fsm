"use client";

import { ServiceForm } from "@/components/domain/service-form";
import { saveServiceFormAction } from "@/modules/work-orders/work-orders.actions";
import type { WorkOrderDetail } from "@/modules/work-orders/work-orders.schema";

/** The DriveSense job form on the office work order page. Editable until the work order is closed or cancelled. */
export function ServiceFormPanel({ wo }: { wo: WorkOrderDetail }) {
  return (
    <ServiceForm
      form={wo.serviceForm}
      context={wo.formContext}
      audience="office"
      readOnly={wo.status === "CLOSED" || wo.status === "CANCELLED"}
      hasSignature={wo.attachments.some((a) => a.kind === "SIGNATURE")}
      save={(input) => saveServiceFormAction(wo.id, input)}
    />
  );
}
