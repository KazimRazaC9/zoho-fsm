-- =====================================================================
-- Row-level security: the second safety layer behind the Prisma tenant
-- extension. The app connects as "fieldserve_app" (not the table owner),
-- so these policies apply to every query it runs.
--
-- Per transaction the app sets (SET LOCAL via set_config(..., true)):
--   app.company_id  = the caller's company id      (tenant requests)
--   app.bypass_rls  = 'on'                          (system context only:
--                     login lookups, super admin, background jobs)
-- With neither set, tenant tables return no rows (fails closed).
-- =====================================================================

-- Helper: true when the current transaction runs in system context.
CREATE OR REPLACE FUNCTION app_bypass() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on'
$$;

-- Helper: the current tenant id ('' when unset).
CREATE OR REPLACE FUNCTION app_company_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.company_id', true), '')
$$;

-- Tenant tables: rows visible / writable only for the current company.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'TechnicianProfile', 'Customer', 'ServiceAddress', 'Asset', 'ServiceItem',
    'ServiceRequest', 'Estimate', 'EstimateLine', 'WorkOrder', 'WorkOrderLine',
    'WorkOrderNote', 'ChecklistTemplate', 'ChecklistTemplateItem',
    'WorkOrderChecklistItem', 'Appointment', 'TimeSheet', 'Attachment',
    'TechnicianLocation', 'Invoice', 'InvoiceLine', 'Payment', 'MaintenancePlan',
    'Notification', 'NumberSequence'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (app_bypass() OR "companyId" = app_company_id())
         WITH CHECK (app_bypass() OR "companyId" = app_company_id())', t);
  END LOOP;
END $$;

-- Company: a tenant sees only its own row.
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Company"
  USING (app_bypass() OR "id" = app_company_id())
  WITH CHECK (app_bypass() OR "id" = app_company_id());

-- User: company users of the current tenant; super admins (companyId NULL) only in system context.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING (app_bypass() OR "companyId" = app_company_id())
  WITH CHECK (app_bypass() OR "companyId" = app_company_id());

-- AuditLog: tenant rows readable by the tenant; inserts allowed for the tenant or system.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING (app_bypass() OR "companyId" = app_company_id())
  WITH CHECK (app_bypass() OR "companyId" = app_company_id());

-- RefreshToken: only ever touched by the auth service in system context.
ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_only ON "RefreshToken"
  USING (app_bypass())
  WITH CHECK (app_bypass());

-- Emails are stored lower-case. Super admin emails must be unique
-- (the (companyId, email) unique index does not cover NULL companyId).
CREATE UNIQUE INDEX "User_superadmin_email_key" ON "User" ("email") WHERE "companyId" IS NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase" CHECK ("email" = lower("email"));

-- Grants for tables created by this and earlier migrations (default privileges cover later ones).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fieldserve_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fieldserve_app;
GRANT EXECUTE ON FUNCTION app_bypass() TO fieldserve_app;
GRANT EXECUTE ON FUNCTION app_company_id() TO fieldserve_app;
-- Prisma's migrations table is not app data (absent in Prisma's shadow database).
DO $$
BEGIN
  IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM fieldserve_app;
  END IF;
END $$;
