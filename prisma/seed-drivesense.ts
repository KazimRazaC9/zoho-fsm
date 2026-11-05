/**
 * "DriveSense Field Services": a realistic tenant modelled on DriveSense's own field work —
 * installing and maintaining fleet-safety telematics (MDVR video recorders, ADAS/DMS AI cameras,
 * GPS trackers, BLE temperature sensors) on customer vehicles at their depots.
 *
 * Customer and vehicle names are illustrative, not real accounts. Dates are relative to the day
 * the seed runs, so warranty states, overdue jobs and this week's appointments always look live.
 * Safe to re-run: it does nothing if the tenant already exists.
 */
import { Prisma, type AppointmentStatus, type Priority, type PrismaClient, type WorkOrderStatus } from "@prisma/client";
import { addDays, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const D = (v: number) => new Prisma.Decimal(v);
const TZ = "Asia/Karachi";
const COMPANY_EMAIL = "ops@drivesense.local";

type Site = { label: string; line: string; city: string; state: string; lat: number; lng: number };
type CustomerDef = {
  key: string;
  name: string;
  type: "BUSINESS" | "INDIVIDUAL";
  email: string;
  phone: string;
  notes?: string;
  sites: Site[];
};

const CUSTOMERS: CustomerDef[] = [
  {
    key: "indus",
    name: "Indus Cold Chain Logistics",
    type: "BUSINESS",
    email: "fleet@induscoldchain.example",
    phone: "+92-42-3578-1100",
    notes: "40 reefer trucks. Temperature alarms go to the night supervisor. Gate pass needed at Port Qasim.",
    sites: [
      {
        label: "Lahore depot",
        line: "Plot 88, Sundar Industrial Estate",
        city: "Lahore",
        state: "Punjab",
        lat: 31.3046,
        lng: 74.1905,
      },
      {
        label: "Karachi cold store",
        line: "Survey 112, Port Qasim Industrial Zone",
        city: "Karachi",
        state: "Sindh",
        lat: 24.7801,
        lng: 67.3378,
      },
    ],
  },
  {
    key: "margalla",
    name: "Margalla Express Coaches",
    type: "BUSINESS",
    email: "maintenance@margallaexpress.example",
    phone: "+92-51-4440-220",
    notes: "Intercity buses. Install only between 22:00 and 05:00 when coaches are parked.",
    sites: [
      {
        label: "Islamabad terminal",
        line: "Faizabad Bus Terminal, Murree Road",
        city: "Islamabad",
        state: "ICT",
        lat: 33.6602,
        lng: 73.0841,
      },
      {
        label: "Lahore terminal",
        line: "Thokar Niaz Baig, Multan Road",
        city: "Lahore",
        state: "Punjab",
        lat: 31.4705,
        lng: 74.2399,
      },
    ],
  },
  {
    key: "ravi",
    name: "Ravi Petroleum Carriers",
    type: "BUSINESS",
    email: "hse@ravipetroleum.example",
    phone: "+92-56-3810-455",
    notes: "Oil tankers. HSE induction (30 min) before entering the yard. No phones near the filling bay.",
    sites: [
      {
        label: "Sheikhupura yard",
        line: "Lahore–Sheikhupura Road, Km 26",
        city: "Sheikhupura",
        state: "Punjab",
        lat: 31.7167,
        lng: 74.0272,
      },
      {
        label: "Keamari depot",
        line: "Oil Installation Area, Keamari",
        city: "Karachi",
        state: "Sindh",
        lat: 24.8197,
        lng: 66.9858,
      },
    ],
  },
  {
    key: "sapphire",
    name: "Sapphire Dairy Distribution",
    type: "BUSINESS",
    email: "transport@sapphiredairy.example",
    phone: "+92-41-8550-300",
    sites: [
      {
        label: "Faisalabad plant",
        line: "Sargodha Road, Near Chak 7",
        city: "Faisalabad",
        state: "Punjab",
        lat: 31.4504,
        lng: 73.135,
      },
      {
        label: "Lahore distribution",
        line: "Quaid-e-Azam Industrial Estate, Kot Lakhpat",
        city: "Lahore",
        state: "Punjab",
        lat: 31.4697,
        lng: 74.3241,
      },
    ],
  },
  {
    key: "crescent",
    name: "Crescent Cement Haulage",
    type: "BUSINESS",
    email: "logistics@crescenthaulage.example",
    phone: "+92-543-660-910",
    notes: "Bulkers run 24/7. Dusty cabins: clean camera lenses on every visit.",
    sites: [
      {
        label: "Chakwal plant",
        line: "Kallar Kahar Road, Dhudial",
        city: "Chakwal",
        state: "Punjab",
        lat: 32.9328,
        lng: 72.8536,
      },
    ],
  },
  {
    key: "metrolink",
    name: "MetroLink School Transport",
    type: "BUSINESS",
    email: "admin@metrolinkschools.example",
    phone: "+92-42-3569-7000",
    notes: "Vans are free only 09:00–12:30 on school days.",
    sites: [
      { label: "DHA yard", line: "Sector C, DHA Phase 6", city: "Lahore", state: "Punjab", lat: 31.4707, lng: 74.4573 },
    ],
  },
  {
    key: "kcm",
    name: "Karachi Container Movers",
    type: "BUSINESS",
    email: "ops@kcmovers.example",
    phone: "+92-21-3256-4400",
    sites: [
      { label: "SITE yard", line: "Plot F-41, SITE Area", city: "Karachi", state: "Sindh", lat: 24.8935, lng: 66.9969 },
      {
        label: "Port Qasim bay",
        line: "Berth Road, Port Qasim",
        city: "Karachi",
        state: "Sindh",
        lat: 24.7733,
        lng: 67.3487,
      },
    ],
  },
  {
    key: "pharma",
    name: "Punjab Pharma Distributors",
    type: "BUSINESS",
    email: "coldchain@punjabpharma.example",
    phone: "+92-42-3540-1212",
    notes: "Vaccine vans must stay at 2–8 °C. Sensor swaps need a QA sign-off on site.",
    sites: [
      {
        label: "Head office warehouse",
        line: "21-A Ferozepur Road, Kot Lakhpat",
        city: "Lahore",
        state: "Punjab",
        lat: 31.4628,
        lng: 74.3343,
      },
    ],
  },
  {
    key: "greenvalley",
    name: "Green Valley Agri Logistics",
    type: "BUSINESS",
    email: "fleet@greenvalleyagri.example",
    phone: "+92-61-4570-880",
    sites: [
      {
        label: "Multan depot",
        line: "Vehari Road, Near Grain Market",
        city: "Multan",
        state: "Punjab",
        lat: 30.1801,
        lng: 71.5036,
      },
    ],
  },
  {
    key: "asif",
    name: "Muhammad Asif (owner-operator)",
    type: "INDIVIDUAL",
    email: "asif.trucks@example.com",
    phone: "+92-321-6450-778",
    notes: "Single truck. Calls in Urdu preferred.",
    sites: [
      {
        label: "Home parking",
        line: "Street 9, Satellite Town",
        city: "Gujranwala",
        state: "Punjab",
        lat: 32.1797,
        lng: 74.1883,
      },
    ],
  },
];

/** [customer key, site index, device, vehicle plate, brand, model, serial, warranty: days from today (null = none), status] */
type AssetDef = [
  string,
  number,
  string,
  string,
  string,
  string,
  string,
  number | null,
  "ACTIVE" | "IN_REPAIR" | "RETIRED",
];
const ASSETS: AssetDef[] = [
  ["indus", 0, "MDVR 4CH", "LES-2231", "Howen", "Hero-ME41", "HW41-220931", 420, "ACTIVE"],
  ["indus", 0, "Temperature sensor", "LES-2231", "Escort", "TD-BLE", "ESC-TB-55102", 18, "ACTIVE"],
  ["indus", 0, "MDVR 4CH", "LES-4410", "Howen", "Hero-ME41", "HW41-220957", 420, "IN_REPAIR"],
  ["indus", 0, "Temperature sensor", "LES-4410", "Escort", "TD-BLE", "ESC-TB-55187", -40, "ACTIVE"],
  ["indus", 1, "GPS tracker", "KAA-2187", "Teltonika", "FMC130", "352094087731205", 600, "ACTIVE"],
  ["indus", 1, "Temperature sensor", "KAA-2187", "Escort", "TD-BLE", "ESC-TB-55233", 600, "ACTIVE"],
  ["margalla", 0, "ADAS camera", "ICT-7720", "Jimi IoT", "JC450", "JC450-8813021", 250, "ACTIVE"],
  ["margalla", 0, "DMS camera", "ICT-7720", "Jimi IoT", "JC450-DMS", "JCD-8813022", 250, "ACTIVE"],
  ["margalla", 0, "MDVR 8CH", "ICT-7721", "Howen", "Hero-ME81", "HW81-310044", 25, "ACTIVE"],
  ["margalla", 1, "DMS camera", "LEB-1907", "Jimi IoT", "JC450-DMS", "JCD-8813140", 250, "IN_REPAIR"],
  ["ravi", 0, "MDVR 4CH", "SKP-6612", "Howen", "Hero-ME41", "HW41-221410", -120, "ACTIVE"],
  ["ravi", 0, "ADAS camera", "SKP-6612", "Jimi IoT", "JC450", "JC450-8820117", -120, "ACTIVE"],
  ["ravi", 0, "GPS tracker", "SKP-6618", "Teltonika", "FMB920", "350424069918731", 300, "ACTIVE"],
  ["ravi", 1, "DMS camera", "TKD-4471", "Jimi IoT", "JC450-DMS", "JCD-8820244", 300, "ACTIVE"],
  ["sapphire", 0, "Temperature sensor", "FDA-905", "Escort", "TD-BLE", "ESC-TB-56010", 9, "ACTIVE"],
  ["sapphire", 0, "GPS tracker", "FDA-905", "Teltonika", "FMC130", "352094087731866", 480, "ACTIVE"],
  ["sapphire", 1, "Temperature sensor", "LEC-3381", "Escort", "TD-BLE", "ESC-TB-56044", 480, "ACTIVE"],
  ["crescent", 0, "MDVR 4CH", "CKL-110", "Howen", "Hero-ME41", "HW41-222018", 150, "ACTIVE"],
  ["crescent", 0, "ADAS camera", "CKL-110", "Jimi IoT", "JC450", "JC450-8831002", 150, "ACTIVE"],
  ["crescent", 0, "DMS camera", "CKL-114", "Jimi IoT", "JC450-DMS", "JCD-8831010", null, "RETIRED"],
  ["metrolink", 0, "Dashcam (AI)", "LEF-5520", "Jimi IoT", "JC400", "JC400-7710083", 330, "ACTIVE"],
  ["metrolink", 0, "Dashcam (AI)", "LEF-5521", "Jimi IoT", "JC400", "JC400-7710084", 330, "ACTIVE"],
  ["kcm", 0, "MDVR 4CH", "JU-4410", "Howen", "Hero-ME41", "HW41-223377", 70, "ACTIVE"],
  ["kcm", 1, "GPS tracker", "JU-4415", "Teltonika", "FMB920", "350424069920114", -10, "ACTIVE"],
  ["pharma", 0, "Temperature sensor", "LEA-8831", "Escort", "TD-BLE", "ESC-TB-57001", 700, "ACTIVE"],
  ["pharma", 0, "Temperature sensor", "LEA-8832", "Escort", "TD-BLE", "ESC-TB-57002", 700, "ACTIVE"],
  ["greenvalley", 0, "GPS tracker", "MNA-332", "Teltonika", "FMC130", "352094087734410", 200, "ACTIVE"],
  ["asif", 0, "Dashcam (AI)", "GAA-610", "Jimi IoT", "JC400", "JC400-7712290", 365, "ACTIVE"],
];

/** [key, name, type, sku, price PKR, stock (null for services / untracked)] */
const ITEMS: [string, string, "SERVICE" | "PART", string, number, number | null][] = [
  ["inst_mdvr", "MDVR installation (4/8 channel)", "SERVICE", "SRV-INS-MDVR", 8500, null],
  ["inst_adas", "ADAS + DMS installation & calibration", "SERVICE", "SRV-INS-ADAS", 12000, null],
  ["inst_gps", "GPS tracker installation", "SERVICE", "SRV-INS-GPS", 3500, null],
  ["inst_temp", "BLE temperature sensor installation", "SERVICE", "SRV-INS-TEMP", 4000, null],
  ["pm", "Preventive maintenance visit (per vehicle)", "SERVICE", "SRV-PM", 2500, null],
  ["diag", "Device health check / troubleshooting", "SERVICE", "SRV-DIAG", 2000, null],
  ["realign", "Camera re-alignment & recalibration", "SERVICE", "SRV-CAL", 1500, null],
  ["transfer", "Device removal & transfer to another vehicle", "SERVICE", "SRV-XFER", 3000, null],
  ["training", "Driver safety training session (per batch)", "SERVICE", "SRV-TRAIN", 15000, null],
  ["mdvr", "MDVR 4CH unit (Howen Hero-ME41)", "PART", "PRT-MDVR4", 65000, 18],
  ["adas_cam", "ADAS camera (Jimi JC450)", "PART", "PRT-ADAS", 38000, 9],
  ["dms_cam", "DMS camera (Jimi JC450-DMS)", "PART", "PRT-DMS", 32000, 6],
  ["dashcam", "AI dashcam (Jimi JC400)", "PART", "PRT-JC400", 27500, 14],
  ["tracker", "GPS tracker (Teltonika FMC130)", "PART", "PRT-FMC130", 14500, 40],
  ["temp", "BLE temperature sensor (Escort TD-BLE)", "PART", "PRT-TDBLE", 9500, 25],
  ["sd", "256 GB high-endurance SD card", "PART", "PRT-SD256", 6500, 4],
  ["sim", "M2M data SIM (activation)", "PART", "PRT-SIM", 800, 120],
  ["panic", "Panic button", "PART", "PRT-PANIC", 1200, 35],
  ["cable", "Camera extension cable 5 m", "PART", "PRT-CBL5", 900, 60],
  ["harness", "Fuse & wiring harness kit", "PART", "PRT-HARN", 1500, 8],
];

type Line = [string, number];
type JobDef = {
  customer: string;
  site: number;
  asset?: string; // asset serial
  title: string;
  description: string;
  priority: Priority;
  status: WorkOrderStatus;
  dueInDays: number;
  completedDaysAgo?: number;
  lines: Line[];
  tech?: number; // technician index
  /** Appointment: day offset from Monday this week, start hour. */
  appt?: [number, number, number]; // [dayOffset, startHour, hours]
  notes?: string[];
  fromRequest?: "PHONE" | "EMAIL" | "WEB" | "WHATSAPP";
};

const JOBS: JobDef[] = [
  // ---- history (completed / cancelled) builds each asset's service record
  {
    customer: "indus",
    site: 0,
    asset: "HW41-220931",
    title: "Install MDVR + temperature sensor on LES-2231",
    description: "New reefer. 4 cameras (front, cabin, left, rear) and one BLE sensor in the cargo box.",
    priority: "MEDIUM",
    status: "COMPLETED",
    dueInDays: -60,
    completedDaysAgo: 61,
    tech: 0,
    lines: [
      ["inst_mdvr", 1],
      ["inst_temp", 1],
      ["mdvr", 1],
      ["temp", 1],
      ["sd", 1],
      ["sim", 1],
    ],
    notes: ["All channels recording. Customer signed the handover sheet."],
  },
  {
    customer: "margalla",
    site: 0,
    asset: "JC450-8813021",
    title: "ADAS + DMS on coach ICT-7720",
    description: "Night installation at Faizabad terminal. Calibrate ADAS on the motorway run next morning.",
    priority: "MEDIUM",
    status: "COMPLETED",
    dueInDays: -45,
    completedDaysAgo: 44,
    tech: 1,
    lines: [
      ["inst_adas", 1],
      ["adas_cam", 1],
      ["dms_cam", 1],
      ["harness", 1],
    ],
    notes: ["Calibration done at 80 km/h on M-2. Lane warnings verified."],
  },
  {
    customer: "ravi",
    site: 0,
    asset: "HW41-221410",
    title: "SD card failure — no video on SKP-6612",
    description: "Dashboard shows 'storage error' since 3 days. Video needed for an incident review.",
    priority: "HIGH",
    status: "COMPLETED",
    dueInDays: -20,
    completedDaysAgo: 21,
    tech: 0,
    fromRequest: "PHONE",
    lines: [
      ["diag", 1],
      ["sd", 1],
    ],
    notes: ["Card worn out (2 years). Replaced; old card handed to HSE officer."],
  },
  {
    customer: "sapphire",
    site: 0,
    asset: "ESC-TB-56010",
    title: "Temperature sensor offline — FDA-905",
    description: "No temperature readings for 6 hours on a milk route.",
    priority: "HIGH",
    status: "COMPLETED",
    dueInDays: -9,
    completedDaysAgo: 9,
    tech: 2,
    fromRequest: "WHATSAPP",
    lines: [["diag", 1]],
    notes: ["Battery cover loose after washing. Resealed; readings back within 2 minutes."],
  },
  {
    customer: "crescent",
    site: 0,
    asset: "JC450-8831002",
    title: "Quarterly preventive maintenance — bulkers",
    description: "Clean lenses, check mounts and wiring, verify GPS fix and video upload on all bulkers.",
    priority: "LOW",
    status: "COMPLETED",
    dueInDays: -5,
    completedDaysAgo: 4,
    tech: 1,
    lines: [["pm", 6]],
    notes: ["Two lenses heavily dusted. Recommended weekly wipe by drivers."],
  },
  {
    customer: "kcm",
    site: 1,
    asset: "350424069920114",
    title: "Move tracker from JU-4415 to new prime mover",
    description: "Old truck sold. Customer will tell the new plate on the day.",
    priority: "LOW",
    status: "CANCELLED",
    dueInDays: -12,
    tech: 3,
    lines: [["transfer", 1]],
    notes: ["Customer cancelled: the sale fell through."],
  },
  // ---- this week (on the dispatch board)
  {
    customer: "indus",
    site: 0,
    asset: "HW41-220957",
    title: "MDVR rebooting on LES-4410",
    description: "Unit restarts every few minutes while driving. Suspect ignition wire or power supply.",
    priority: "HIGH",
    status: "IN_PROGRESS",
    dueInDays: 0,
    tech: 0,
    appt: [0, 10, 3],
    fromRequest: "PHONE",
    lines: [
      ["diag", 1],
      ["harness", 1],
    ],
    notes: ["Voltage drops to 9 V on crank. Replacing the harness."],
  },
  {
    customer: "margalla",
    site: 1,
    asset: "JCD-8813140",
    title: "False fatigue alarms — DMS on LEB-1907",
    description: "Driver gets 'eyes closed' alarms in daylight. Camera may have moved after cleaning.",
    priority: "MEDIUM",
    status: "DISPATCHED",
    dueInDays: 1,
    tech: 1,
    appt: [1, 22, 1],
    fromRequest: "EMAIL",
    lines: [["realign", 1]],
  },
  {
    customer: "pharma",
    site: 0,
    title: "Install temperature sensors on 4 vaccine vans",
    description: "LEA-8833 to LEA-8836. QA officer must witness the probe placement.",
    priority: "HIGH",
    status: "SCHEDULED",
    dueInDays: 2,
    tech: 2,
    appt: [2, 9, 4],
    lines: [
      ["inst_temp", 4],
      ["temp", 4],
    ],
  },
  {
    customer: "metrolink",
    site: 0,
    title: "AI dashcams on 6 school vans",
    description: "LEF-5522 to LEF-5527. Vans free 09:00–12:30 only.",
    priority: "MEDIUM",
    status: "SCHEDULED",
    dueInDays: 3,
    tech: 3,
    appt: [3, 9, 3],
    lines: [
      ["inst_gps", 6],
      ["dashcam", 6],
      ["sim", 6],
    ],
  },
  {
    customer: "ravi",
    site: 1,
    asset: "JCD-8820244",
    title: "Driver safety training — Keamari drivers",
    description: "Explain fatigue, phone and smoking alarms; show the driver scorecard.",
    priority: "LOW",
    status: "SCHEDULED",
    dueInDays: 4,
    tech: 1,
    appt: [4, 14, 2],
    lines: [["training", 1]],
  },
  // ---- backlog (not scheduled yet)
  {
    customer: "kcm",
    site: 0,
    asset: "HW41-223377",
    title: "Rear camera blank on JU-4410",
    description: "Channel 4 shows 'no signal'. Likely the extension cable at the trailer coupling.",
    priority: "MEDIUM",
    status: "NEW",
    dueInDays: 5,
    fromRequest: "WEB",
    lines: [
      ["diag", 1],
      ["cable", 1],
    ],
  },
  {
    customer: "greenvalley",
    site: 0,
    title: "Install GPS trackers on 10 harvest trucks",
    description: "Season starts in two weeks. Panic buttons on all ten.",
    priority: "MEDIUM",
    status: "NEW",
    dueInDays: 12,
    lines: [
      ["inst_gps", 10],
      ["tracker", 10],
      ["panic", 10],
      ["sim", 10],
    ],
  },
  {
    customer: "indus",
    site: 1,
    asset: "352094087731205",
    title: "GPS not reporting — KAA-2187",
    description: "Last position 2 days ago at Port Qasim. SIM may be out of data.",
    priority: "HIGH",
    status: "NEW",
    dueInDays: -1,
    fromRequest: "PHONE",
    lines: [["diag", 1]],
    notes: ["Asked the telecom team to check the SIM before we send someone."],
  },
  {
    customer: "asif",
    site: 0,
    asset: "JC400-7712290",
    title: "Dashcam app not showing live video",
    description: "Owner cannot see live view on his phone since the app update.",
    priority: "LOW",
    status: "ON_HOLD",
    dueInDays: 2,
    fromRequest: "WHATSAPP",
    lines: [["diag", 1]],
    notes: ["Waiting for the owner to share his login; may be an account issue, not hardware."],
  },
];

/** New requests not yet turned into work orders (Phase 3 intake queue). */
const OPEN_REQUESTS: {
  customer: string;
  site: number;
  title: string;
  source: string;
  priority: Priority;
  asset?: string;
}[] = [
  {
    customer: "sapphire",
    site: 1,
    title: "Quote for MDVR on 12 distribution vans",
    source: "EMAIL",
    priority: "MEDIUM",
  },
  {
    customer: "margalla",
    site: 0,
    title: "ICT-7721 MDVR warranty ends soon — renewal?",
    source: "PHONE",
    priority: "LOW",
    asset: "HW41-310044",
  },
  {
    customer: "crescent",
    site: 0,
    title: "Replace retired DMS camera on CKL-114",
    source: "WEB",
    priority: "MEDIUM",
    asset: "JCD-8831010",
  },
];

export async function seedDriveSense(prisma: PrismaClient, passwordHash: string) {
  if (await prisma.company.findFirst({ where: { email: COMPANY_EMAIL } })) {
    console.log("DriveSense tenant already exists — skipped.");
    return;
  }
  const today = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  const dayFromToday = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };

  const company = await prisma.company.create({
    data: {
      name: "DriveSense Field Services",
      email: COMPANY_EMAIL,
      phone: "+92-42-111-374-837",
      address: "Arfa Software Technology Park, Ferozepur Road, Lahore",
      timeZone: TZ,
      currency: "PKR",
      taxPercent: D(16),
    },
  });
  const c = company.id;

  const admin = await prisma.user.create({
    data: {
      companyId: c,
      fullName: "Kazim Raza",
      email: "admin@drivesense.local",
      phone: "+92-300-1110001",
      passwordHash,
      role: "ADMIN",
    },
  });
  await prisma.user.create({
    data: {
      companyId: c,
      fullName: "Talha Hamid",
      email: "dispatcher@drivesense.local",
      phone: "+92-300-1110002",
      passwordHash,
      role: "DISPATCHER",
    },
  });
  const techDefs = [
    {
      fullName: "Imran Installer",
      email: "imran@drivesense.local",
      skills: ["MDVR", "Wiring", "Temperature sensors"],
      color: "#2563eb",
      start: "09:00",
      end: "18:00",
    },
    {
      fullName: "Waqas Installer",
      email: "waqas@drivesense.local",
      skills: ["ADAS/DMS calibration", "MDVR", "Driver training"],
      color: "#16a34a",
      start: "14:00",
      end: "23:59",
    },
    {
      fullName: "Ahsan Installer",
      email: "ahsan@drivesense.local",
      skills: ["Temperature sensors", "GPS trackers", "Cold chain"],
      color: "#d97706",
      start: "09:00",
      end: "18:00",
    },
    {
      fullName: "Bilal Installer (Karachi)",
      email: "bilal.khi@drivesense.local",
      skills: ["GPS trackers", "Dashcams", "MDVR"],
      color: "#9333ea",
      start: "09:00",
      end: "18:00",
    },
  ];
  const techs = [];
  for (const [i, t] of techDefs.entries()) {
    techs.push(
      await prisma.user.create({
        data: {
          companyId: c,
          fullName: t.fullName,
          email: t.email,
          phone: `+92-300-11100${i + 3}`,
          passwordHash,
          role: "TECHNICIAN",
          technicianProfile: {
            create: {
              companyId: c,
              skills: t.skills,
              hourlyRate: D(1200 + i * 100),
              workStart: t.start,
              workEnd: t.end,
              workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
              color: t.color,
            },
          },
        },
      }),
    );
  }

  // ---------------------------------------------------------------- customers + depots
  const customers = new Map<string, { id: string; sites: string[] }>();
  for (const def of CUSTOMERS) {
    const cust = await prisma.customer.create({
      data: {
        companyId: c,
        type: def.type,
        name: def.name,
        email: def.email,
        phone: def.phone,
        notes: def.notes ?? null,
        createdById: admin.id,
      },
    });
    const sites: string[] = [];
    for (const s of def.sites) {
      const a = await prisma.serviceAddress.create({
        data: {
          companyId: c,
          customerId: cust.id,
          label: s.label,
          addressLine: s.line,
          city: s.city,
          state: s.state,
          country: "Pakistan",
          latitude: D(s.lat),
          longitude: D(s.lng),
          createdById: admin.id,
        },
      });
      sites.push(a.id);
    }
    customers.set(def.key, { id: cust.id, sites });
  }

  // ---------------------------------------------------------------- devices on vehicles
  const assets = new Map<string, string>(); // serial → id
  for (const [key, site, device, plate, brand, model, serial, warrantyDays, status] of ASSETS) {
    const cust = customers.get(key)!;
    const warrantyEnd = warrantyDays == null ? null : dayFromToday(warrantyDays);
    // Typical device warranty is 2 years from installation.
    const installed = warrantyEnd ? new Date(warrantyEnd.getTime() - 730 * 86_400_000) : dayFromToday(-900);
    const a = await prisma.asset.create({
      data: {
        companyId: c,
        customerId: cust.id,
        addressId: cust.sites[site],
        name: `${device} — ${plate}`,
        category: device.replace(/ \(.*\)$/, "").replace(/ \dCH$/, ""),
        brand,
        model,
        serialNo: serial,
        installDate: installed,
        warrantyEndDate: warrantyEnd,
        status,
        createdById: admin.id,
      },
    });
    assets.set(serial, a.id);
  }

  // ---------------------------------------------------------------- price list
  const items = new Map<string, { id: string; name: string; price: Prisma.Decimal }>();
  for (const [key, name, type, sku, price, stock] of ITEMS) {
    const it = await prisma.serviceItem.create({
      data: {
        companyId: c,
        name,
        type,
        sku,
        unitPrice: D(price),
        taxPercent: D(16),
        stockQty: stock == null ? null : D(stock),
      },
    });
    items.set(key, { id: it.id, name, price: it.unitPrice });
  }

  // ---------------------------------------------------------------- checklist
  await prisma.checklistTemplate.create({
    data: {
      companyId: c,
      name: "Telematics installation checklist",
      items: {
        create: [
          "Photo of vehicle plate and odometer before work",
          "Device mounted firmly; cables routed and tied away from heat",
          "Power on constant + ignition lines, fused",
          "All camera channels show live video",
          "GPS fix and first position received on the platform",
          "ADAS/DMS calibrated and test alarms triggered",
          "Customer representative signed the handover",
        ].map((text, i) => ({ companyId: c, text, sortOrder: i + 1 })),
      },
    },
  });

  // ---------------------------------------------------------------- requests, work orders, appointments
  const apptStatus: Partial<Record<WorkOrderStatus, AppointmentStatus>> = {
    SCHEDULED: "SCHEDULED",
    DISPATCHED: "EN_ROUTE",
    IN_PROGRESS: "ON_SITE",
    COMPLETED: "COMPLETED",
  };
  const mondayLocal = formatInTimeZone(startOfWeek(new Date(), { weekStartsOn: 1 }), TZ, "yyyy-MM-dd");
  const at = (dayOffset: number, hour: number) => {
    const day = formatInTimeZone(addDays(fromZonedTime(`${mondayLocal}T12:00:00`, TZ), dayOffset), TZ, "yyyy-MM-dd");
    return fromZonedTime(`${day}T${String(hour).padStart(2, "0")}:00:00`, TZ);
  };

  let sr = 0;
  for (const [i, j] of JOBS.entries()) {
    const cust = customers.get(j.customer)!;
    const assetId = j.asset ? assets.get(j.asset)! : null;
    const created = addDays(new Date(), Math.min(j.dueInDays, 0) - 3);

    let requestId: string | null = null;
    if (j.fromRequest) {
      sr++;
      const r = await prisma.serviceRequest.create({
        data: {
          companyId: c,
          number: `SR-${String(sr).padStart(6, "0")}`,
          customerId: cust.id,
          addressId: cust.sites[j.site],
          assetId,
          title: j.title,
          description: j.description,
          priority: j.priority,
          source: j.fromRequest,
          status: "CONVERTED",
          createdAt: created,
          createdById: admin.id,
        },
      });
      requestId = r.id;
    }

    const wo = await prisma.workOrder.create({
      data: {
        companyId: c,
        number: `WO-${String(i + 1).padStart(6, "0")}`,
        customerId: cust.id,
        addressId: cust.sites[j.site],
        assetId,
        requestId,
        title: j.title,
        description: j.description,
        priority: j.priority,
        status: j.status,
        dueDate: addDays(new Date(), j.dueInDays),
        completedAt: j.completedDaysAgo != null ? addDays(new Date(), -j.completedDaysAgo) : null,
        createdAt: created,
        createdById: admin.id,
        lines: {
          create: j.lines.map(([key, qty], n) => {
            const it = items.get(key)!;
            return {
              companyId: c,
              serviceItemId: it.id,
              description: it.name,
              qty: D(qty),
              unitPrice: it.price,
              taxPercent: D(16),
              lineTotal: it.price.mul(qty),
              sortOrder: n + 1,
            };
          }),
        },
        notes: j.notes ? { create: j.notes.map((text) => ({ companyId: c, text, createdById: admin.id })) } : undefined,
      },
    });

    const aStatus = apptStatus[j.status];
    if (aStatus && j.tech != null) {
      const start =
        j.appt != null
          ? at(j.appt[0], j.appt[1])
          : fromZonedTime(`${formatInTimeZone(wo.completedAt!, TZ, "yyyy-MM-dd")}T10:00:00`, TZ);
      const hours = j.appt?.[2] ?? 3;
      await prisma.appointment.create({
        data: {
          companyId: c,
          workOrderId: wo.id,
          technicianId: techs[j.tech].id,
          scheduledStart: start,
          scheduledEnd: new Date(start.getTime() + hours * 3_600_000),
          status: aStatus,
        },
      });
    }
  }

  for (const r of OPEN_REQUESTS) {
    sr++;
    const cust = customers.get(r.customer)!;
    await prisma.serviceRequest.create({
      data: {
        companyId: c,
        number: `SR-${String(sr).padStart(6, "0")}`,
        customerId: cust.id,
        addressId: cust.sites[r.site],
        assetId: r.asset ? assets.get(r.asset)! : null,
        title: r.title,
        priority: r.priority,
        source: r.source,
        status: "NEW",
        createdById: admin.id,
      },
    });
  }

  await prisma.numberSequence.createMany({
    data: [
      { companyId: c, entityType: "WO", last: JOBS.length },
      { companyId: c, entityType: "SR", last: sr },
    ],
  });

  console.log(
    `DriveSense tenant: ${CUSTOMERS.length} customers, ${ASSETS.length} devices, ${ITEMS.length} catalog items, ${JOBS.length} work orders, ${sr} requests.`,
  );
  console.log("  admin@drivesense.local, dispatcher@drivesense.local, imran/waqas/ahsan/bilal.khi@drivesense.local");
}
