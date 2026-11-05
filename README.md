# FieldServe

Multi-tenant Field Service Management — Next.js 15 modular monolith + PostgreSQL 16.

**Status: Phase 0 — Foundation & Auth ✅ · Phase 1 — Company & Team ✅** (see the project plan for Phases 2–9)

## Quick start

Prerequisites: Node 20+, pnpm 9 (`npm i -g pnpm@9`), Docker Desktop.

```bash
cp .env.example .env              # then set AUTH_SECRET and JWT_SECRET (32+ random chars each)
docker compose up -d              # PostgreSQL :5432 + Mailpit :1025/:8025
pnpm install
pnpm db:migrate                   # applies prisma/migrations (schema + row-level security)
pnpm db:seed                      # demo data
pnpm dev                          # http://localhost:3000  (use `pnpm dev -p 3100` if 3000 is taken)
```

Other scripts: `pnpm test` (unit + integration, needs the seeded DB) · `pnpm typecheck` · `pnpm lint` ·
`pnpm format` · `pnpm build` · `pnpm db:reset` (drop, migrate, seed) · `pnpm db:studio`.

## Demo logins

Password for every demo user = `SEED_PASSWORD` in `.env`.

| Email                                                  | Role                                                       | Lands on   |
| ------------------------------------------------------ | ---------------------------------------------------------- | ---------- |
| superadmin@fieldserve.local                            | Super Admin                                                | /companies |
| admin@demo.local                                       | Admin (Demo Cooling & Heating)                             | /dashboard |
| dispatcher@demo.local                                  | Dispatcher                                                 | /dashboard |
| tech1@demo.local · tech2@demo.local · tech3@demo.local | Technician                                                 | /my-jobs   |
| admin@acme.local                                       | Admin (Acme Plumbing — second tenant for isolation checks) | /dashboard |

### DriveSense Field Services (realistic tenant)

`prisma/seed-drivesense.ts` seeds a tenant modelled on DriveSense's own field work: installing and maintaining
MDVRs, ADAS/DMS cameras, GPS trackers and BLE temperature sensors on customer fleets. `pnpm db:seed` adds it to an
existing database too (it skips if it is already there). Customer names and plates are illustrative.

| Email                       | Role                                 |
| --------------------------- | ------------------------------------ |
| admin@drivesense.local      | Admin (Kazim Raza)                   |
| dispatcher@drivesense.local | Dispatcher (Talha Hamid)             |
| imran@drivesense.local      | Technician (MDVR, wiring)            |
| waqas@drivesense.local      | Technician (ADAS/DMS, night shift)   |
| ahsan@drivesense.local      | Technician (temperature, cold chain) |
| bilal.khi@drivesense.local  | Technician (Karachi)                 |

What it contains: 10 fleet customers with depots pinned on the map (Lahore, Karachi, Islamabad, Faisalabad, Multan,
Chakwal, Gujranwala), 28 devices on vehicles (warranties active, expiring within 30 days, expired, none), a 20-item
price list (installation services, devices, SD cards, SIMs; some parts low on stock), 15 work orders across every
status (history, this week's appointments, backlog) and 10 service requests.

## API (Phase 3 — Service Requests & Work Orders)

Work order status moves go through one state machine (`src/modules/work-orders/work-order-status.ts`):
New → Scheduled → Dispatched → In progress → Completed, with On hold and Cancelled. Hold, cancel and reopen need a
reason; only an Admin can reopen; Completed needs every checklist item done (and a signature when the company requires
one). Refused moves return **409** with a readable message. Completed/cancelled jobs are read-only until reopened.

| Method                         | Path                                                                                               | Notes                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| GET / POST                     | `/api/v1/requests` (`status=open\|all\|NEW…`, `source`, `priority`, `search`)                      | SR-000001 numbering                                                                        |
| GET / PUT                      | `/api/v1/requests/{id}`                                                                            | edit while New/Estimated                                                                   |
| POST                           | `/api/v1/requests/{id}/cancel`                                                                     |                                                                                            |
| POST                           | `/api/v1/requests/{id}/convert` `{ checklistTemplateId, dueDate }`                                 | → new work order, once only                                                                |
| GET / POST                     | `/api/v1/work-orders` (`status=open\|overdue\|NEW…`, `priority`, `customerId`, `search`, `sortBy`) | WO-000001 numbering                                                                        |
| GET / PUT / DELETE             | `/api/v1/work-orders/{id}`                                                                         | GET has lines, totals, checklist, notes, files, timeline; DELETE Admin, New/Cancelled only |
| POST                           | `/api/v1/work-orders/{id}/status` `{ status, reason }`                                             | the state machine                                                                          |
| POST, PUT / DELETE             | `/api/v1/work-orders/{id}/lines`, `/lines/{lineId}`                                                | totals recomputed on the server                                                            |
| POST, DELETE                   | `/api/v1/work-orders/{id}/notes`, `/notes/{noteId}`                                                | internal or customer-visible                                                               |
| POST, PATCH / DELETE           | `/api/v1/work-orders/{id}/checklist` (`{ templateId }` or `{ text }`), `/checklist/{itemId}`       | ticks record who and when                                                                  |
| POST, DELETE                   | `/api/v1/work-orders/{id}/attachments` (multipart `file`), `/attachments/{attachmentId}`           | JPG/PNG/WEBP/HEIC/PDF/TXT/CSV/DOCX/XLSX, `MAX_UPLOAD_MB`                                   |
| GET                            | `/api/v1/attachments/{id}[?inline=1]`                                                              | authenticated download, tenant-checked                                                     |
| GET / POST, GET / PUT / DELETE | `/api/v1/checklist-templates`, `/checklist-templates/{id}`                                         | Admin writes                                                                               |

Files are stored under `UPLOAD_DIR` (default `./uploads`, git-ignored), never in `/public`.

## API (Phase 2 — Customers, Assets & Catalog)

| Method             | Path                                                                                  | Who                         |
| ------------------ | ------------------------------------------------------------------------------------- | --------------------------- |
| GET / POST         | `/api/v1/customers` (`search` covers name, phone, email and addresses)                | Admin, Dispatcher           |
| GET / PUT / DELETE | `/api/v1/customers/{id}` (delete: Admin; 409 while work orders are open)              | Admin, Dispatcher           |
| GET                | `/api/v1/customers/{id}/history`                                                      | Admin, Dispatcher           |
| POST               | `/api/v1/customers/{id}/addresses`                                                    | Admin, Dispatcher           |
| PUT / DELETE       | `/api/v1/customers/{id}/addresses/{addressId}` (409 for the last site)                | Admin, Dispatcher           |
| GET / POST         | `/api/v1/assets` (`status`, `warranty=active\|expiring\|expired\|none`, `customerId`) | Admin, Dispatcher           |
| GET / PUT / DELETE | `/api/v1/assets/{id}` (delete: Admin)                                                 | Admin, Dispatcher           |
| GET                | `/api/v1/assets/{id}/history` (service history)                                       | Admin, Dispatcher           |
| GET / POST         | `/api/v1/service-items` (`type`, `status`, `stock=low`; POST Admin)                   | Admin, Dispatcher           |
| GET / PUT / DELETE | `/api/v1/service-items/{id}`                                                          | Admin (GET: Dispatcher too) |
| PATCH              | `/api/v1/service-items/{id}/status` `{ isActive }`                                    | Admin                       |
| POST               | `/api/v1/service-items/{id}/stock` `{ delta }` (409 below zero)                       | Admin                       |

## API (Phase 0)

All responses use `{ success, message, data, errors }`.

| Method | Path                         | Auth           | Purpose                                                                                  |
| ------ | ---------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| GET    | /api/v1/health               | none           | App + DB check                                                                           |
| POST   | /api/v1/auth/token           | none           | `{ email, password }` → access token (15 min) + refresh token (14 days)                  |
| POST   | /api/v1/auth/refresh         | none           | `{ refreshToken }` → new pair; the old token is revoked, reusing it revokes all sessions |
| POST   | /api/v1/auth/logout          | bearer/session | `{ refreshToken }` → revoke it                                                           |
| GET    | /api/v1/auth/me              | bearer/session | Current user                                                                             |
| POST   | /api/v1/auth/change-password | bearer/session | `{ currentPassword, newPassword }`; signs out other devices                              |

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/token -H "Content-Type: application/json" \
  -d '{"email":"tech1@demo.local","password":"<SEED_PASSWORD>"}'
curl -s http://localhost:3000/api/v1/auth/me -H "Authorization: Bearer <accessToken>"
```

The web dashboard uses the Auth.js session cookie instead (sign in at /login).

## API (Phase 1 — Company & Team)

| Method             | Path                                                          | Roles                         | Purpose                                                     |
| ------------------ | ------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| GET                | /api/v1/company/settings                                      | Admin, Dispatcher, Technician | The caller's company                                        |
| PUT                | /api/v1/company/settings                                      | Admin                         | Profile, logo URL, time zone, currency, tax, signature rule |
| GET                | /api/v1/users?page&pageSize&search&role&status&sortBy&sortDir | Admin, Dispatcher             | Company staff (paged)                                       |
| POST               | /api/v1/users                                                 | Admin                         | Add staff; technicians get a profile (defaults if omitted)  |
| GET / PUT / DELETE | /api/v1/users/{id}                                            | Admin (GET: + Dispatcher)     | View, edit (name, email, phone, role), soft delete          |
| PATCH              | /api/v1/users/{id}/status                                     | Admin                         | `{ isActive }` — deactivating signs the user out at once    |
| POST               | /api/v1/users/{id}/reset-password                             | Admin                         | `{ password }` — signs the user out everywhere              |
| PUT                | /api/v1/users/{id}/technician-profile                         | Admin                         | Skills, hourly rate, working hours/days, calendar colour    |
| GET / POST         | /api/v1/companies                                             | Super Admin                   | List tenants / create a tenant with its first Admin         |
| GET / PUT / PATCH  | /api/v1/companies/{id}                                        | Super Admin                   | View / edit settings / `{ isActive }` disable or enable     |

Team rules: an Admin cannot change their own role, deactivate or delete themselves; a company always keeps
at least one active Admin; emails are unique per company. Every request re-checks that the account and its
company are still active, so deactivation and role changes apply immediately.

Screens: **/users** (Admin), **/settings** (Admin), **/companies** (Super Admin).

## Architecture

```
src/
  app/                 pages (dashboard, tech app, login) + thin route handlers under api/v1
  modules/<name>/      domain modules: schema (zod) · repository · service · actions · index.ts (public API)
  lib/                 shared kernel: db (tenant extension), auth, api wrapper, errors, logger,
                       tokens, numbers, pagination, money, tz, rate-limit, nav, roles
  components/          ui/ (shadcn) + layout/ (sidebar, top bar, user menu)
  auth.ts, auth.config.ts, middleware.ts
prisma/                schema.prisma, migrations/ (init + rls), seed.ts
docker/                postgres init (creates the non-owner app role)
tests/                 unit/ + integration/ (tenant isolation, refresh rotation)
```

### Tenant isolation — two layers

1. **Prisma extension** (`src/lib/db.ts`, rules in `src/lib/db-scope.ts`): every query from a tenant user is
   filtered by `companyId` + `deletedAt IS NULL`; creates are stamped with `companyId`/`createdById`;
   `delete` becomes a soft delete; every write goes to `AuditLog` (no password hashes).
2. **PostgreSQL row-level security** (`prisma/migrations/*_rls`): the app connects as `fieldserve_app`, a
   non-owner role. Each query runs in a transaction that sets `app.company_id`; with nothing set, tenant tables
   return no rows. Login, super-admin tools and background jobs use an explicit system context
   (`systemDb("reason")`).

`companyId` always comes from the session/token — never from the request body.

### Conventions for new modules

- Route handlers: `export const GET = route({ roles, query: schema }, ({ db, user, query }) => service.list(db, query))`.
- Business logic lives in the module's service; other modules import only `@/modules/<name>` (lint-enforced).
- Prisma types require `companyId` on create: pass the context's companyId (the extension rejects any other).
  Nested creates need `companyId` on each row too.
- Use `db.$withTx(async () => { … })` for multi-step writes; `nextNumber(db, "WO")` inside it for document numbers.
- Money: `Prisma.Decimal` + `computeTotals` (`src/lib/money.ts`). Times: UTC in the DB, `src/lib/tz.ts` for company time.

## Environment

See `.env.example`. `DATABASE_URL` = app role (RLS applies). `DIRECT_DATABASE_URL` = owner role, used only by
Prisma Migrate and the seed.
