/**
 * Demo data. Runs as the database OWNER (DIRECT_DATABASE_URL), which is not subject to RLS.
 *   pnpm db:seed          seed an empty database
 *   pnpm db:reset         drop everything, migrate, seed
 */
import "dotenv/config";
import { PrismaClient, Prisma, type WorkOrderStatus, type AppointmentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { seedDriveSense } from "./seed-drivesense";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const D = (v: number) => new Prisma.Decimal(v);

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error("Set SEED_PASSWORD in .env");

  const passwordHash = await bcrypt.hash(password, 11);

  if ((await prisma.company.count()) > 0) {
    console.log("Demo data already exists — skipped. Use `pnpm db:reset` to start over.");
    // The DriveSense tenant can still be added to an existing database.
    await seedDriveSense(prisma, passwordHash);
    await backfillTimelines();
    await seedDemoLocations();
    return;
  }

  // ---------------------------------------------------------------- platform
  await prisma.user.create({
    data: { fullName: "Platform Owner", email: "superadmin@fieldserve.local", passwordHash, role: "SUPER_ADMIN" },
  });

  // ---------------------------------------------------------------- demo company
  const tz = "Asia/Karachi";
  const demo = await prisma.company.create({
    data: {
      name: "Demo Cooling & Heating",
      email: "info@demo.local",
      phone: "+92-42-111-000-111",
      address: "12 Main Boulevard, Gulberg, Lahore",
      timeZone: tz,
      currency: "PKR",
      taxPercent: D(16),
    },
  });
  const c = demo.id;

  const staff = await Promise.all(
    [
      { fullName: "Ayesha Admin", email: "admin@demo.local", role: "ADMIN" as const },
      { fullName: "Bilal Dispatcher", email: "dispatcher@demo.local", role: "DISPATCHER" as const },
    ].map((u) => prisma.user.create({ data: { ...u, companyId: c, passwordHash } })),
  );
  const adminId = staff[0].id;

  const techDefs = [
    {
      fullName: "Usman Technician",
      email: "tech1@demo.local",
      skills: ["HVAC", "Refrigeration"],
      rate: 1500,
      color: "#3b82f6",
    },
    {
      fullName: "Hamza Technician",
      email: "tech2@demo.local",
      skills: ["Electrical", "HVAC"],
      rate: 1400,
      color: "#10b981",
    },
    {
      fullName: "Sara Technician",
      email: "tech3@demo.local",
      skills: ["Plumbing", "Appliances"],
      rate: 1300,
      color: "#f59e0b",
    },
  ];
  const techs = [];
  for (const t of techDefs) {
    techs.push(
      await prisma.user.create({
        data: {
          companyId: c,
          fullName: t.fullName,
          email: t.email,
          passwordHash,
          role: "TECHNICIAN",
          technicianProfile: {
            create: {
              companyId: c,
              skills: t.skills,
              hourlyRate: D(t.rate),
              workStart: "09:00",
              workEnd: "18:00",
              workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
              color: t.color,
            },
          },
        },
      }),
    );
  }

  // ---------------------------------------------------------------- customers + addresses
  const customerDefs: [string, "BUSINESS" | "INDIVIDUAL", string, string, number, number][] = [
    ["Packages Mall", "BUSINESS", "Main Site", "Walton Road, Nishtar Town", 31.4697, 74.356],
    ["Grand Hotel Lahore", "BUSINESS", "Hotel", "Shahrah-e-Quaid-e-Azam", 31.5546, 74.329],
    ["Ali Raza", "INDIVIDUAL", "Home", "House 21, Block C, DHA Phase 5", 31.463, 74.41],
    ["Fatima Khan", "INDIVIDUAL", "Home", "45-B Model Town", 31.483, 74.326],
    ["City Hospital", "BUSINESS", "Main Block", "Jail Road", 31.538, 74.337],
    ["Omar Sheikh", "INDIVIDUAL", "Home", "House 9, Johar Town Block J", 31.469, 74.272],
    ["Tech Park Offices", "BUSINESS", "Tower A", "Arfa Software Technology Park", 31.5755, 74.307],
    ["Zainab Malik", "INDIVIDUAL", "Home", "12 Garden Town", 31.504, 74.32],
    ["Bright Future School", "BUSINESS", "Campus", "Faisal Town Block A", 31.48, 74.305],
    ["Hassan Iqbal", "INDIVIDUAL", "Home", "78 Bahria Town Sector C", 31.369, 74.184],
  ];
  const customers = [];
  for (const [i, [name, type, label, line, lat, lng]] of customerDefs.entries()) {
    customers.push(
      await prisma.customer.create({
        data: {
          companyId: c,
          name,
          type,
          email: `${name
            .toLowerCase()
            .replace(/[^a-z]+/g, ".")
            .replace(/^\.|\.$/g, "")}@example.com`,
          phone: `+92-300-${String(1000001 + i)}`,
          createdById: adminId,
          addresses: {
            create: {
              companyId: c,
              label,
              addressLine: line,
              city: "Lahore",
              state: "Punjab",
              country: "Pakistan",
              latitude: D(lat),
              longitude: D(lng),
            },
          },
        },
        include: { addresses: true },
      }),
    );
  }

  // ---------------------------------------------------------------- assets
  const assetDefs: [number, string, string, string, string, string][] = [
    [0, "Central Chiller #1", "Chiller", "Carrier", "30XA-400", "CH-0001"],
    [1, "Rooftop AHU", "AHU", "Trane", "M-Series", "AHU-0007"],
    [2, "Split AC Bedroom", "Split AC", "Gree", "GS-18", "SP-1001"],
    [3, "Inverter AC Lounge", "Split AC", "Haier", "HSU-24", "SP-1002"],
    [4, "Backup Generator", "Generator", "Cummins", "C500", "GEN-0501"],
    [6, "VRF Outdoor Unit", "VRF", "Daikin", "VRV-IV", "VRF-0303"],
    [8, "Water Cooler Block A", "Cooler", "Dawlance", "WC-200", "WC-0042"],
  ];
  const assetByCustomer = new Map<string, string>();
  for (const [ci, name, category, brand, model, serialNo] of assetDefs) {
    const cust = customers[ci];
    const a = await prisma.asset.create({
      data: {
        companyId: c,
        customerId: cust.id,
        addressId: cust.addresses[0].id,
        name,
        category,
        brand,
        model,
        serialNo,
        installDate: new Date("2024-03-10"),
        warrantyEndDate: new Date("2026-03-10"),
      },
    });
    assetByCustomer.set(cust.id, a.id);
  }

  // ---------------------------------------------------------------- service catalog
  const items = await Promise.all(
    (
      [
        ["AC General Service", "SERVICE", "SRV-ACGS", 3500, null],
        ["AC Gas Refill (R410)", "SERVICE", "SRV-GAS", 6500, null],
        ["Chiller Preventive Maintenance", "SERVICE", "SRV-CHPM", 45000, null],
        ["Generator Service", "SERVICE", "SRV-GEN", 18000, null],
        ["Diagnostic Visit", "SERVICE", "SRV-DIAG", 1500, null],
        ["Capacitor 45uF", "PART", "PRT-CAP45", 900, 120],
        ["Air Filter (Standard)", "PART", "PRT-FLT", 650, 300],
        ["Fan Motor", "PART", "PRT-FANM", 7800, 25],
        ["Copper Pipe (per ft)", "PART", "PRT-CU", 450, 1000],
      ] as const
    ).map(([name, type, sku, price, stock]) =>
      prisma.serviceItem.create({
        data: {
          companyId: c,
          name,
          type,
          sku,
          unitPrice: D(price),
          taxPercent: D(16),
          stockQty: stock == null ? null : D(stock),
        },
      }),
    ),
  );
  const acService = items[0];

  // ---------------------------------------------------------------- checklist template
  await prisma.checklistTemplate.create({
    data: {
      companyId: c,
      name: "AC Service Checklist",
      items: {
        create: [
          "Clean indoor filters",
          "Wash outdoor coil",
          "Check gas pressure",
          "Check capacitor and wiring",
          "Test cooling and record temperature",
        ].map((text, i) => ({ companyId: c, text, sortOrder: i + 1 })),
      },
    },
  });

  // ---------------------------------------------------------------- 20 work orders + appointments this week
  const statuses: WorkOrderStatus[] = [
    "NEW",
    "SCHEDULED",
    "DISPATCHED",
    "IN_PROGRESS",
    "ON_HOLD",
    "COMPLETED",
    "CANCELLED",
  ];
  const titles = [
    "AC not cooling",
    "Quarterly preventive maintenance",
    "Strange noise from unit",
    "Gas leak inspection",
    "New installation check",
  ];
  const priorities = ["HIGH", "MEDIUM", "LOW"] as const;
  const apptStatus: Partial<Record<WorkOrderStatus, AppointmentStatus>> = {
    SCHEDULED: "SCHEDULED",
    DISPATCHED: "EN_ROUTE",
    IN_PROGRESS: "ON_SITE",
    COMPLETED: "COMPLETED",
  };
  // Monday of the current week in the company's time zone.
  const mondayLocal = formatInTimeZone(startOfWeek(new Date(), { weekStartsOn: 1 }), tz, "yyyy-MM-dd");
  let slot = 0;

  for (let i = 1; i <= 20; i++) {
    const status = statuses[(i - 1) % statuses.length];
    const cust = customers[(i - 1) % customers.length];
    const due = addDays(new Date(), ((i - 1) % 10) - 3);
    const wo = await prisma.workOrder.create({
      data: {
        companyId: c,
        number: `WO-${String(i).padStart(6, "0")}`,
        customerId: cust.id,
        addressId: cust.addresses[0].id,
        assetId: assetByCustomer.get(cust.id) ?? null,
        title: titles[(i - 1) % titles.length],
        description: "Seeded demo work order",
        priority: priorities[(i - 1) % 3],
        status,
        dueDate: due,
        completedAt: status === "COMPLETED" ? addDays(new Date(), -((i - 1) % 3)) : null,
        createdById: adminId,
        lines: {
          create: {
            companyId: c,
            serviceItemId: acService.id,
            description: acService.name,
            qty: D(1),
            unitPrice: acService.unitPrice,
            taxPercent: acService.taxPercent,
            lineTotal: acService.unitPrice,
          },
        },
      },
    });

    const aStatus = apptStatus[status];
    if (aStatus) {
      const day = formatInTimeZone(
        addDays(fromZonedTime(`${mondayLocal}T12:00:00`, tz), Math.floor(slot / 3)),
        tz,
        "yyyy-MM-dd",
      );
      const startHour = [9, 11, 14][slot % 3];
      const start = fromZonedTime(`${day}T${String(startHour).padStart(2, "0")}:00:00`, tz);
      await prisma.appointment.create({
        data: {
          companyId: c,
          workOrderId: wo.id,
          technicianId: techs[slot % techs.length].id,
          scheduledStart: start,
          scheduledEnd: new Date(start.getTime() + 2 * 3_600_000),
          status: aStatus,
        },
      });
      slot++;
    }
  }
  await prisma.numberSequence.create({ data: { companyId: c, entityType: "WO", last: 20 } });

  // ---------------------------------------------------------------- second tenant (for isolation checks)
  const acme = await prisma.company.create({
    data: {
      name: "Acme Plumbing",
      email: "hello@acme.local",
      timeZone: "America/New_York",
      currency: "USD",
      taxPercent: D(8.875),
    },
  });
  await prisma.user.create({
    data: { companyId: acme.id, fullName: "Alex Acme", email: "admin@acme.local", passwordHash, role: "ADMIN" },
  });
  for (const name of ["Brooklyn Bakery", "Queens Laundry"]) {
    await prisma.customer.create({
      data: {
        companyId: acme.id,
        name,
        type: "BUSINESS",
        addresses: { create: { companyId: acme.id, addressLine: "1 Main St", city: "New York", country: "USA" } },
      },
    });
  }

  await seedDriveSense(prisma, passwordHash);
  await backfillTimelines();
  await seedDemoLocations();

  console.log("Seed complete:");
  console.log(
    "  superadmin@fieldserve.local, admin@demo.local, dispatcher@demo.local, tech1..3@demo.local, admin@acme.local",
  );
  console.log("  password = SEED_PASSWORD from .env");
}

/** A few GPS positions so the live map is not empty in a fresh demo (only when the company has none yet). */
async function seedDemoLocations() {
  const company = await prisma.company.findFirst({ where: { email: "ops@drivesense.local" }, select: { id: true } });
  if (!company) return;
  if ((await prisma.technicianLocation.count({ where: { companyId: company.id } })) > 0) return;
  const spots: Record<string, { lat: number; lng: number; minutesAgo: number }> = {
    "imran@drivesense.local": { lat: 24.8987, lng: 66.981, minutesAgo: 3 },
    "ahsan@drivesense.local": { lat: 24.8607, lng: 67.0011, minutesAgo: 8 },
    "bilal.khi@drivesense.local": { lat: 24.8138, lng: 67.03, minutesAgo: 45 },
  };
  for (const [email, s] of Object.entries(spots)) {
    const u = await prisma.user.findFirst({ where: { companyId: company.id, email }, select: { id: true } });
    if (!u) continue;
    await prisma.technicianLocation.create({
      data: {
        companyId: company.id,
        technicianId: u.id,
        latitude: s.lat,
        longitude: s.lng,
        accuracy: 25,
        recordedAt: new Date(Date.now() - s.minutesAgo * 60_000),
      },
    });
  }
}

/** Every work order starts its status timeline at its current status. */
async function backfillTimelines() {
  await prisma.$executeRaw`
    INSERT INTO "WorkOrderStatusChange" ("id", "companyId", "workOrderId", "fromStatus", "toStatus", "changedById", "createdAt")
    SELECT gen_random_uuid()::text, w."companyId", w."id", NULL, w."status", w."createdById", w."createdAt"
    FROM "WorkOrder" w
    WHERE NOT EXISTS (SELECT 1 FROM "WorkOrderStatusChange" s WHERE s."workOrderId" = w."id")`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
