-- Runs once when the postgres container is first created.
-- The app connects as "fieldserve_app": a NON-superuser without BYPASSRLS,
-- so the row-level security policies really apply to it.
-- "fieldserve" (owner) is used only by Prisma Migrate and the seed.

CREATE ROLE fieldserve_app LOGIN PASSWORD 'fieldserve_app' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE fieldserve TO fieldserve_app;
GRANT USAGE ON SCHEMA public TO fieldserve_app;

-- Tables created later by migrations (owned by "fieldserve") are granted automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE fieldserve IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fieldserve_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fieldserve IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fieldserve_app;
