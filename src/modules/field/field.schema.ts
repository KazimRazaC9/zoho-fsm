import type { AppointmentStatus, AttachmentKind, Priority, WorkOrderStatus } from "@prisma/client";
import { z } from "zod";
import { idParam, optionalText } from "@/lib/validation";
import type { EvidenceDto, IssueDto } from "@/modules/work-orders";

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

/** A GPS reading from the technician's phone. */
export const locationSchema = z.object({
  latitude: num(-90, 90),
  longitude: num(-180, 180),
  accuracy: num(0, 1_000_000).nullish(),
  speed: num(0, 1_000).nullish(),
  heading: num(0, 360).nullish(),
});
export type LocationInput = z.infer<typeof locationSchema>;

export const FIELD_ACTIONS = ["on-my-way", "start", "hold", "resume", "complete"] as const;
export type FieldAction = (typeof FIELD_ACTIONS)[number];

export const transitionSchema = z.object({
  action: z.enum(FIELD_ACTIONS),
  reason: optionalText(1000).optional(),
  location: locationSchema.nullish(),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

export const FIELD_ACTION_LABEL: Record<FieldAction, string> = {
  "on-my-way": "On my way",
  start: "Start work",
  hold: "Put on hold",
  resume: "Resume work",
  complete: "Complete job",
};

export const noteInputSchema = z.object({ text: z.string().trim().min(1, "Write a note.").max(4000) });

export const addPartSchema = z.object({
  serviceItemId: idParam,
  qty: z
    .number({ invalid_type_error: "Enter a quantity." })
    .gt(0, "Quantity must be more than 0.")
    .max(1000, "Too large.")
    .refine((n) => Number.isInteger(Number((n * 100).toFixed(6))), "Use at most 2 decimals."),
});
export type AddPartInput = z.infer<typeof addPartSchema>;

export type FieldJob = {
  workOrderId: string;
  number: string;
  title: string;
  status: WorkOrderStatus;
  visitStatus: AppointmentStatus;
  priority: Priority;
  customerName: string;
  customerPhone: string | null;
  siteLabel: string | null;
  assetName: string | null;
  /** "yyyy-MM-dd" in the company zone. */
  day: string;
  startTime: string;
  endTime: string;
};

export type FieldJobList = { today: string; timeZone: string; jobs: FieldJob[] };

export type FieldJobDetail = {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: WorkOrderStatus;
  priority: Priority;
  customer: { name: string; phone: string | null };
  address: { label: string | null; fullAddress: string; latitude: number | null; longitude: number | null } | null;
  assetName: string | null;
  visit: { day: string; startTime: string; endTime: string; status: AppointmentStatus };
  actions: FieldAction[];
  checkedInAt: string | null;
  checklist: { id: string; text: string; isDone: boolean }[];
  parts: { id: string; description: string; qty: number }[];
  notes: { id: string; text: string; author: string | null; createdAt: string; mine: boolean }[];
  /** Ordinary photos and the signature (not before/after proof). */
  photos: { id: string; fileName: string; kind: AttachmentKind }[];
  /** Before/after proof of the reported problem. */
  evidence: EvidenceDto;
  /** Extra problems found on site, each with its own proof. */
  issues: IssueDto[];
  /** The signed-in technician (they may remove only their own files). */
  meId: string;
  requireSignature: boolean;
  hasSignature: boolean;
  closed: boolean;
};

export type PartOption = { id: string; name: string; sku: string | null };

export type LiveTechnician = {
  id: string;
  name: string;
  color: string;
  location: { latitude: number; longitude: number; recordedAt: string; accuracy: number | null } | null;
  job: { number: string; title: string; customerName: string; status: AppointmentStatus } | null;
};
