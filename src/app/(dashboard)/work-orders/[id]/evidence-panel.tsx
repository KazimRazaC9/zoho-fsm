"use client";

import { EvidenceSection } from "@/components/domain/evidence-section";
import { isClosed } from "@/modules/work-orders/work-order-status";
import {
  addIssueAction,
  deleteAttachmentAction,
  deleteIssueAction,
  updateIssueAction,
} from "@/modules/work-orders/work-orders.actions";
import type { WorkOrderDetail } from "@/modules/work-orders/work-orders.schema";

/** Before/after proof and extra issues on the office work order page. */
export function EvidencePanel({ wo, userId }: { wo: WorkOrderDetail; userId: string }) {
  return (
    <EvidenceSection
      evidence={wo.evidence}
      issues={wo.issues}
      closed={isClosed(wo.status)}
      meId={userId}
      canDeleteAny
      api={{
        uploadUrl: `/api/v1/work-orders/${wo.id}/attachments`,
        addIssue: (input) => addIssueAction(wo.id, input),
        updateIssue: (issueId, input) => updateIssueAction(wo.id, issueId, input),
        deleteIssue: (issueId) => deleteIssueAction(wo.id, issueId),
        deleteFile: (attachmentId) => deleteAttachmentAction(wo.id, attachmentId),
      }}
    />
  );
}
