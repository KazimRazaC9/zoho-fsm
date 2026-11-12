/**
 * Two Nestle accounts for the DriveSense tenant, each with projects, sites and the devices on their vehicles:
 *  - "Nestle Dedicated": a fleet that only carries Nestle goods. Two projects: Water DC and Drift Vans.
 *  - "Nestle Non-Dedicated": shared or contracted vehicles that also carry other customers' cargo (2 sites).
 *
 * Customer -> Project -> Site -> Asset. Names, addresses and serial numbers are illustrative.
 * Dates are relative to the day the seed runs. Safe to re-run: whatever already exists is left alone,
 * and projects are added to an existing Nestle Dedicated customer too.
 */
import { type PrismaClient } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

const COMPANY_EMAIL = "ops@drivesense.local";
const TZ = "Asia/Karachi";

type Site = {
  label: string;
  line: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  /** Name of the project this site belongs to. */
  project?: string;
};
/** [site index, device, vehicle plate, brand, model, serial, warranty: days from today, status] */
type Asset = [number, string, string, string, string, string, number, "ACTIVE" | "IN_REPAIR"];
type Account = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  projects?: { name: string; description: string }[];
  sites: Site[];
  assets: Asset[];
};

const ACCOUNTS: Account[] = [
  {
    name: "Nestle Dedicated",
    email: "dedicated.fleet@nestle.example",
    phone: "+92-42-3500-2001",
    notes: "Dedicated fleet: these vehicles carry Nestle goods only. Cold-chain alarms go to the plant control room.",
    projects: [
      { name: "Water DC", description: "Water distribution centres and the vehicles that serve them." },
      { name: "Drift Vans", description: "Dedicated delivery vans." },
    ],
    sites: [
      {
        label: "Sheikhupura factory",
        line: "Nestle Pakistan Factory, Sheikhupura Road",
        city: "Sheikhupura",
        state: "Punjab",
        lat: 31.7131,
        lng: 73.9783,
        project: "Water DC",
      },
      {
        label: "Lahore distribution centre",
        line: "Plot 14, Kot Lakhpat Industrial Area",
        city: "Lahore",
        state: "Punjab",
        lat: 31.4628,
        lng: 74.3343,
        project: "Water DC",
      },
      {
        label: "Karachi depot",
        line: "Plot B-12, Korangi Industrial Area",
        city: "Karachi",
        state: "Sindh",
        lat: 24.8296,
        lng: 67.1226,
        project: "Drift Vans",
      },
      {
        label: "Lahore van yard",
        line: "Plot 7, Ferozepur Road Transport Yard",
        city: "Lahore",
        state: "Punjab",
        lat: 31.4894,
        lng: 74.3194,
        project: "Drift Vans",
      },
    ],
    assets: [
      [0, "MDVR 4CH", "NSD-1101", "Howen", "Hero-ME41", "HW41-NES-0101", 540, "ACTIVE"],
      [0, "Temperature sensor", "NSD-1101", "Escort", "TD-BLE", "ESC-NES-0102", 540, "ACTIVE"],
      [0, "ADAS camera", "NSD-1102", "Jimi IoT", "JC450", "JC450-NES-0103", 40, "ACTIVE"],
      [1, "GPS tracker", "NSD-1203", "Teltonika", "FMC130", "352094-NES-0201", 610, "ACTIVE"],
      [1, "Temperature sensor", "NSD-1203", "Escort", "TD-BLE", "ESC-NES-0202", 610, "ACTIVE"],
      [2, "MDVR 8CH", "NSD-1305", "Howen", "Hero-ME81", "HW81-NES-0301", 365, "ACTIVE"],
      [2, "DMS camera", "NSD-1305", "Jimi IoT", "JC450-DMS", "JCD-NES-0302", 365, "IN_REPAIR"],
      [3, "GPS tracker", "NSD-1410", "Teltonika", "FMB920", "350424-NES-0601", 500, "ACTIVE"],
      [3, "DMS camera", "NSD-1410", "Jimi IoT", "JC450-DMS", "JCD-NES-0602", 500, "ACTIVE"],
    ],
  },
  {
    name: "Nestle Non-Dedicated",
    email: "contract.fleet@nestle.example",
    phone: "+92-51-2700-3002",
    notes:
      "Shared and contracted vehicles: they also carry other customers' cargo. Confirm the vehicle is free before booking.",
    sites: [
      {
        label: "Islamabad distribution point",
        line: "Street 7, I-9 Industrial Area",
        city: "Islamabad",
        state: "Islamabad Capital Territory",
        lat: 33.6561,
        lng: 73.0643,
      },
      {
        label: "Faisalabad depot",
        line: "Plot 31, Sargodha Road Industrial Estate",
        city: "Faisalabad",
        state: "Punjab",
        lat: 31.4504,
        lng: 73.135,
      },
    ],
    assets: [
      [0, "GPS tracker", "ICT-9051", "Teltonika", "FMB920", "350424-NES-0401", 300, "ACTIVE"],
      [0, "Temperature sensor", "ICT-9051", "Escort", "TD-BLE", "ESC-NES-0402", 18, "ACTIVE"],
      [0, "MDVR 4CH", "ICT-9060", "Howen", "Hero-ME41", "HW41-NES-0403", 220, "ACTIVE"],
      [1, "GPS tracker", "FSA-3318", "Teltonika", "FMC130", "352094-NES-0501", 480, "ACTIVE"],
      [1, "Temperature sensor", "FSA-3318", "Escort", "TD-BLE", "ESC-NES-0502", -30, "ACTIVE"],
    ],
  },
];

export async function seedNestle(prisma: PrismaClient) {
  const company = await prisma.company.findFirst({ where: { email: COMPANY_EMAIL }, select: { id: true } });
  if (!company) return;
  const c = company.id;
  const today = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  const dayFromToday = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };
  const admin = await prisma.user.findFirst({
    where: { companyId: c, email: "admin@drivesense.local" },
    select: { id: true },
  });
  const createdById = admin?.id;

  const createSite = (customerId: string, s: Site, projectId: string | null) =>
    prisma.serviceAddress.create({
      data: {
        companyId: c,
        customerId,
        projectId,
        label: s.label,
        addressLine: s.line,
        city: s.city,
        state: s.state,
        country: "Pakistan",
        latitude: s.lat,
        longitude: s.lng,
        createdById,
      },
    });

  const createAsset = (customerId: string, addressId: string, a: Asset) => {
    const [, device, plate, brand, model, serial, warrantyDays, status] = a;
    const warrantyEnd = dayFromToday(warrantyDays);
    return prisma.asset.create({
      data: {
        companyId: c,
        customerId,
        addressId,
        name: `${device} — ${plate}`,
        category: device.replace(/ \dCH$/, ""),
        brand,
        model,
        serialNo: serial,
        // Typical device warranty is 2 years from installation.
        installDate: new Date(warrantyEnd.getTime() - 730 * 86_400_000),
        warrantyEndDate: warrantyEnd,
        status,
        createdById,
      },
    });
  };

  for (const acc of ACCOUNTS) {
    let customer = await prisma.customer.findFirst({ where: { companyId: c, name: acc.name, deletedAt: null } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          companyId: c,
          type: "BUSINESS",
          name: acc.name,
          email: acc.email,
          phone: acc.phone,
          notes: acc.notes,
          createdById,
        },
      });
      console.log(`${acc.name}: created.`);
    }

    // Projects first, so every site can be filed under its project.
    const projectIds = new Map<string, string>();
    for (const p of acc.projects ?? []) {
      const existing = await prisma.project.findFirst({
        where: { companyId: c, customerId: customer.id, name: p.name, deletedAt: null },
      });
      const project =
        existing ??
        (await prisma.project.create({
          data: { companyId: c, customerId: customer.id, name: p.name, description: p.description, createdById },
        }));
      projectIds.set(p.name, project.id);
    }

    // Sites: add the missing ones (with their devices) and file existing ones under their project.
    for (const [index, s] of acc.sites.entries()) {
      const projectId = s.project ? (projectIds.get(s.project) ?? null) : null;
      const found = await prisma.serviceAddress.findFirst({
        where: { companyId: c, customerId: customer.id, label: s.label, deletedAt: null },
      });
      if (!found) {
        const site = await createSite(customer.id, s, projectId);
        for (const a of acc.assets.filter((x) => x[0] === index)) await createAsset(customer.id, site.id, a);
        console.log(`${acc.name}: added site ${s.label}.`);
      } else if (projectId && found.projectId !== projectId) {
        await prisma.serviceAddress.update({ where: { id: found.id }, data: { projectId } });
        console.log(`${acc.name}: ${s.label} filed under ${s.project}.`);
      }
    }
  }
}
