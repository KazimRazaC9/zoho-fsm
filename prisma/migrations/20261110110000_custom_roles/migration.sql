CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseRole" "Role" NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "customRoleId" TEXT;

CREATE UNIQUE INDEX "CustomRole_companyId_name_key" ON "CustomRole"("companyId", "name");
CREATE INDEX "CustomRole_companyId_idx" ON "CustomRole"("companyId");

ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_customRoleId_fkey"
    FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomRole" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomRole"
    USING (app_bypass() OR "companyId" = app_company_id())
    WITH CHECK (app_bypass() OR "companyId" = app_company_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "CustomRole" TO fieldserve_app;
