-- The DriveSense job form (visit type and reason, checks, work done, replaced parts, final result, confirmation).
CREATE TABLE "WorkOrderServiceForm" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "vehicleNumber" TEXT,
    "simNumber" TEXT,
    "driverName" TEXT,
    "driverMobile" TEXT,
    "visitTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visitReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visitReasonOther" TEXT,
    "checks" JSONB NOT NULL DEFAULT '{}',
    "firmwareNumber" TEXT,
    "workDone" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workDoneOther" TEXT,
    "replaced" JSONB NOT NULL DEFAULT '{}',
    "finalResult" TEXT,
    "notResolvedReason" TEXT,
    "finalRemarks" TEXT,
    "clientPersonName" TEXT,
    "clientPersonMobile" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkOrderServiceForm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOrderServiceForm_workOrderId_key" ON "WorkOrderServiceForm"("workOrderId");
ALTER TABLE "WorkOrderServiceForm" ADD CONSTRAINT "WorkOrderServiceForm_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderServiceForm" ADD CONSTRAINT "WorkOrderServiceForm_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrderServiceForm" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkOrderServiceForm"
    USING (app_bypass() OR "companyId" = app_company_id())
    WITH CHECK (app_bypass() OR "companyId" = app_company_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "WorkOrderServiceForm" TO fieldserve_app;
