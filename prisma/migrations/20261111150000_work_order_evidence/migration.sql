-- Before/after photos and videos on a work order, and extra issues found on site (each with its own proof).
ALTER TYPE "AttachmentKind" ADD VALUE IF NOT EXISTS 'VIDEO';
CREATE TYPE "EvidencePhase" AS ENUM ('BEFORE', 'AFTER');
CREATE TYPE "IssueStatus" AS ENUM ('FOUND', 'FIXED', 'FOLLOW_UP');

CREATE TABLE "WorkOrderIssue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "status" "IssueStatus" NOT NULL DEFAULT 'FOUND',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkOrderIssue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkOrderIssue_companyId_workOrderId_idx" ON "WorkOrderIssue"("companyId", "workOrderId");
ALTER TABLE "WorkOrderIssue" ADD CONSTRAINT "WorkOrderIssue_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderIssue" ADD CONSTRAINT "WorkOrderIssue_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD COLUMN "phase" "EvidencePhase";
ALTER TABLE "Attachment" ADD COLUMN "issueId" TEXT;
CREATE INDEX "Attachment_issueId_idx" ON "Attachment"("issueId");
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "WorkOrderIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkOrderIssue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkOrderIssue"
    USING (app_bypass() OR "companyId" = app_company_id())
    WITH CHECK (app_bypass() OR "companyId" = app_company_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "WorkOrderIssue" TO fieldserve_app;
