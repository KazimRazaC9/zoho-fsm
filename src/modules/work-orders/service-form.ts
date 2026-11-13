/**
 * The DriveSense job form (dashcam installation, service, troubleshooting, replacement and closure) as
 * data: its lists, its rules and what counts as "filled in". No database here, so the server checks it
 * and the screens draw it from the same lists. Every label has its Urdu text, as on the paper form.
 *
 * Not repeated here, because the system already holds it: date, project, client, site, technician,
 * ticket / complaint number, device model and serial number. The form shows them from the job.
 */
import { z } from "zod";
import { optionalText } from "@/lib/validation";

export type Choice = { key: string; label: string; ur: string };

export const VISIT_TYPES = [
  { key: "NEW_INSTALLATION", label: "New Installation", ur: "نئی تنصیب" },
  { key: "REINSTALLATION", label: "Reinstallation", ur: "دوبارہ تنصیب" },
  { key: "UNINSTALLATION", label: "Uninstallation", ur: "تنصیب ہٹانا" },
  { key: "TAMPERING", label: "Tampering", ur: "چھیڑ چھاڑ" },
  { key: "REDO", label: "Redo", ur: "دوبارہ کام" },
  { key: "SERVICING", label: "Servicing", ur: "سروسنگ" },
] as const satisfies readonly Choice[];

export const VISIT_REASONS = [
  { key: "VEHICLE_OFFLINE", label: "Vehicle Offline", ur: "گاڑی آف لائن" },
  { key: "CAMERA_NOT_WORKING", label: "Camera Not Working", ur: "کیمرہ کام نہیں کر رہا" },
  { key: "GPS_ISSUE", label: "GPS Issue", ur: "GPS مسئلہ" },
  { key: "EVIDENCE_NOT_UPLOADING", label: "Evidence Not Uploading", ur: "ایویڈنس اپلوڈ نہیں" },
  { key: "WRONG_ALERTS", label: "Wrong Alerts", ur: "غلط الرٹس" },
  { key: "DEVICE_NOT_POWERING_ON", label: "Device Not Powering On", ur: "ڈیوائس آن نہیں" },
  { key: "CAMERA_FALLEN_LOOSE", label: "Camera Fallen / Loose", ur: "کیمرہ ڈھیلا / گرا" },
  { key: "BACK_CAMERA_ISSUE", label: "Back Camera Issue", ur: "بیک کیمرہ مسئلہ" },
  { key: "WIRING_ISSUE", label: "Wiring Issue", ur: "وائرنگ مسئلہ" },
  { key: "DEVICE_REPLACEMENT", label: "Device Replacement", ur: "ڈیوائس تبدیلی" },
  { key: "TAMPERING", label: "Tampering", ur: "چھیڑ چھاڑ" },
] as const satisfies readonly Choice[];

export const CHECK_VALUE_LABEL = {
  OK: "OK",
  NOT_OK: "Not OK",
  NA: "N/A",
  YES: "Yes",
  NO: "No",
  RECORDING: "Recording",
  NOT_RECORDING: "Not Recording",
} as const;
export type CheckValue = keyof typeof CHECK_VALUE_LABEL;
export const CHECK_VALUES = Object.keys(CHECK_VALUE_LABEL) as [CheckValue, ...CheckValue[]];

const OK_NOT_OK: CheckValue[] = ["OK", "NOT_OK"];

/** What was checked: each point has its own answers. */
export const CHECK_POINTS = [
  { key: "DEVICE_POWER", label: "Device Power", ur: "ڈیوائس پاور", options: OK_NOT_OK },
  { key: "CAMERA_VIEW", label: "Camera View", ur: "کیمرہ ویو", options: OK_NOT_OK },
  { key: "CAMERA_ANGLE", label: "Camera Angle", ur: "کیمرہ اینگل", options: OK_NOT_OK },
  { key: "GPS_LOCATION", label: "GPS Location", ur: "GPS لوکیشن", options: OK_NOT_OK },
  { key: "SIM_NETWORK", label: "SIM / Network", ur: "سم / نیٹ ورک", options: OK_NOT_OK },
  { key: "WIRING", label: "Wiring", ur: "وائرنگ", options: OK_NOT_OK },
  { key: "DEVICE_MOUNTING", label: "Device Mounting", ur: "ڈیوائس فٹنگ", options: OK_NOT_OK },
  { key: "BACK_CAMERA", label: "Back Camera", ur: "بیک کیمرہ", options: ["OK", "NOT_OK", "NA"] as CheckValue[] },
  {
    key: "ONLINE_ON_PORTAL",
    label: "Vehicle Online on Portal",
    ur: "پورٹل پر گاڑی آن لائن",
    options: ["YES", "NO"] as CheckValue[],
  },
  {
    key: "RECORDING_STATUS",
    label: "Recording Status",
    ur: "ریکارڈنگ اسٹیٹس",
    options: ["RECORDING", "NOT_RECORDING"] as CheckValue[],
  },
] as const;
export type CheckKey = (typeof CHECK_POINTS)[number]["key"];

export const WORK_DONE = [
  { key: "DEVICE_RESTARTED", label: "Device Restarted", ur: "ڈیوائس ری اسٹارٹ" },
  { key: "WIRING_FIXED", label: "Wiring Fixed", ur: "وائرنگ ٹھیک" },
  { key: "CAMERA_ADJUSTED", label: "Camera Adjusted", ur: "کیمرہ ایڈجسٹ" },
  { key: "CAMERA_CLEANED", label: "Camera Cleaned", ur: "کیمرہ صاف" },
  { key: "SIM_CHECKED", label: "SIM Checked", ur: "سم چیک" },
  { key: "SD_CARD_CHECKED", label: "SD Card Checked", ur: "SD کارڈ چیک" },
  { key: "DEVICE_RECONFIGURED", label: "Device Reconfigured", ur: "ڈیوائس کنفیگر" },
  { key: "DEVICE_REPLACED", label: "Device Replaced", ur: "ڈیوائس تبدیل" },
  { key: "CAMERA_REPLACED", label: "Camera Replaced", ur: "کیمرہ تبدیل" },
  { key: "BACK_CAMERA_FIXED", label: "Back Camera Fixed", ur: "بیک کیمرہ ٹھیک" },
  { key: "PORTAL_CHECKED", label: "Portal Checked", ur: "پورٹل چیک" },
  { key: "TEST_COMPLETED", label: "Test Completed", ur: "ٹیسٹ مکمل" },
] as const satisfies readonly Choice[];

export const COMPONENTS = [
  { key: "DEVICE", label: "Device", ur: "ڈیوائس" },
  { key: "DSM_CAMERA", label: "DSM Camera", ur: "DSM کیمرہ" },
  { key: "BACK_CAMERA", label: "Back Camera", ur: "بیک کیمرہ" },
  { key: "WIRES", label: "Wires - specify wire", ur: "وائر - کون سی وائر" },
  { key: "SIM", label: "SIM", ur: "سم" },
  { key: "SD_CARD", label: "SD Card", ur: "SD کارڈ" },
  { key: "FUSE", label: "Fuse", ur: "فیوز" },
  { key: "POWER_CABLE", label: "Power Cable", ur: "پاور کیبل" },
  { key: "GPS", label: "GPS", ur: "GPS" },
] as const satisfies readonly Choice[];
export type ComponentKey = (typeof COMPONENTS)[number]["key"];

export const FINAL_RESULTS = [
  { key: "RESOLVED", label: "Issue Resolved", ur: "مسئلہ حل" },
  { key: "PARTIAL", label: "Partially Resolved", ur: "کچھ حد تک حل" },
  { key: "NOT_RESOLVED", label: "Not Resolved", ur: "حل نہیں ہوا" },
  { key: "OBSERVATION", label: "Vehicle Under Observation", ur: "گاڑی آبزرویشن میں" },
] as const satisfies readonly Choice[];
export type FinalResultKey = (typeof FINAL_RESULTS)[number]["key"];

const keys = <T extends readonly { key: string }[]>(list: T) =>
  list.map((x) => x.key) as [T[number]["key"], ...T[number]["key"][]];

/** One replaced (or not replaced) part. */
export const replacedPartSchema = z.object({
  replaced: z.enum(["YES", "NO"]).nullable(),
  oldDetails: optionalText(200),
  newDetails: optionalText(200),
  remarks: optionalText(300),
});
export type ReplacedPart = z.infer<typeof replacedPartSchema>;

export const serviceFormSchema = z
  .object({
    vehicleNumber: optionalText(30),
    simNumber: optionalText(40),
    driverName: optionalText(120),
    driverMobile: optionalText(30),
    visitTypes: z.array(z.enum(keys(VISIT_TYPES))).max(VISIT_TYPES.length),
    visitReasons: z.array(z.enum(keys(VISIT_REASONS))).max(VISIT_REASONS.length),
    visitReasonOther: optionalText(200),
    checks: z.record(z.enum(keys(CHECK_POINTS)), z.enum(CHECK_VALUES)),
    firmwareNumber: optionalText(60),
    workDone: z.array(z.enum(keys(WORK_DONE))).max(WORK_DONE.length),
    workDoneOther: optionalText(200),
    replaced: z.record(z.enum(keys(COMPONENTS)), replacedPartSchema),
    finalResult: z.union([z.literal(""), z.enum(keys(FINAL_RESULTS))]),
    notResolvedReason: optionalText(500),
    finalRemarks: optionalText(1000),
    clientPersonName: optionalText(120),
    clientPersonMobile: optionalText(30),
  })
  .superRefine((form, ctx) => {
    // Each check point accepts only its own answers (Back Camera may be N/A, Online is Yes/No, ...).
    for (const [key, value] of Object.entries(form.checks)) {
      const point = CHECK_POINTS.find((p) => p.key === key);
      if (point && !(point.options as readonly string[]).includes(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["checks", key],
          message: `${point.label}: "${CHECK_VALUE_LABEL[value]}" is not one of its answers.`,
        });
      }
    }
  });
export type ServiceFormInput = z.infer<typeof serviceFormSchema>;

export const BLANK_SERVICE_FORM: ServiceFormInput = {
  vehicleNumber: "",
  simNumber: "",
  driverName: "",
  driverMobile: "",
  visitTypes: [],
  visitReasons: [],
  visitReasonOther: "",
  checks: {},
  firmwareNumber: "",
  workDone: [],
  workDoneOther: "",
  replaced: {},
  finalResult: "",
  notResolvedReason: "",
  finalRemarks: "",
  clientPersonName: "",
  clientPersonMobile: "",
};

/** The saved form as the screens receive it. */
export type ServiceFormDto = ServiceFormInput & { updatedAt: string; updatedBy: string | null };

/** What the system already knows about the job, shown at the top of the form (nothing to type again). */
export type ServiceFormContext = {
  date: string;
  projectName: string | null;
  clientName: string;
  siteLabel: string | null;
  technicianName: string | null;
  ticket: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
};

/**
 * What office staff are asked to fill in before closing, from the form's own "field rule": vehicle
 * number, visit type, the issue (visit reason) and the final result. Returns the labels still empty.
 * It is a reminder, never a lock.
 */
export function serviceFormGaps(
  form: Pick<
    ServiceFormInput,
    "vehicleNumber" | "visitTypes" | "visitReasons" | "visitReasonOther" | "finalResult"
  > | null,
): string[] {
  if (!form) return ["Vehicle number", "Visit type", "Visit reason", "Final result"];
  const gaps: string[] = [];
  if (!form.vehicleNumber.trim()) gaps.push("Vehicle number");
  if (form.visitTypes.length === 0) gaps.push("Visit type");
  if (form.visitReasons.length === 0 && !form.visitReasonOther.trim()) gaps.push("Visit reason");
  if (!form.finalResult) gaps.push("Final result");
  return gaps;
}

/** A replaced-parts entry only counts when something was said about it. */
export function cleanReplaced(replaced: ServiceFormInput["replaced"]): ServiceFormInput["replaced"] {
  const out: ServiceFormInput["replaced"] = {};
  for (const [key, part] of Object.entries(replaced)) {
    const has = part.replaced !== null || part.oldDetails.trim() || part.newDetails.trim() || part.remarks.trim();
    if (has) out[key as ComponentKey] = part;
  }
  return out;
}
