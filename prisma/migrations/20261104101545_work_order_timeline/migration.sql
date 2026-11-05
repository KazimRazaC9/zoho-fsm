-- CreateTable
CREATE TABLE "public"."WorkOrderStatusChange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "fromStatus" "public"."WorkOrderStatus",
    "toStatus" "public"."WorkOrderStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderStatusChange_workOrderId_createdAt_idx" ON "public"."WorkOrderStatusChange"("workOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."WorkOrderStatusChange" ADD CONSTRAINT "WorkOrderStatusChange_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkOrderStatusChange" ADD CONSTRAINT "WorkOrderStatusChange_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkOrderStatusChange" ADD CONSTRAINT "WorkOrderStatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security, same policy as every tenant table.
ALTER TABLE "WorkOrderStatusChange" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkOrderStatusChange"
  USING (app_bypass() OR "companyId" = app_company_id())
  WITH CHECK (app_bypass() OR "companyId" = app_company_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkOrderStatusChange" TO fieldserve_app;

-- Backfill: existing work orders start their timeline at their current status.
INSERT INTO "WorkOrderStatusChange" ("id", "companyId", "workOrderId", "fromStatus", "toStatus", "changedById", "createdAt")
SELECT gen_random_uuid()::text, "companyId", "id", NULL, "status", "createdById", "createdAt"
FROM "WorkOrder";
