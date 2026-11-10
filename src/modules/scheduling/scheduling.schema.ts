import type { AppointmentStatus, Priority, WorkOrderStatus } from "@prisma/client";
import { z } from "zod";
import { idParam } from "@/lib/validation";

/** Local date-time "YYYY-MM-DDTHH:mm" in the company's time zone. */
const startLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a start date and time.");

export const scheduleSchema = z.object({
  technicianId: idParam,
  start: startLocal,
  durationMin: z
    .number({ invalid_type_error: "Enter the duration in minutes." })
    .int("Use whole minutes.")
    .min(15, "At least 15 minutes.")
    .max(720, "At most 12 hours."),
});
export type ScheduleInput = z.infer<typeof scheduleSchema>;

export const boardQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export type BoardAppointment = {
  id: string;
  workOrderId: string;
  number: string;
  title: string;
  customerName: string;
  siteLabel: string | null;
  priority: Priority;
  workOrderStatus: WorkOrderStatus;
  status: AppointmentStatus;
  start: string;
  end: string;
  /** Minutes from midnight (company zone), clipped to the day; the board positions blocks with these. */
  startMin: number;
  endMin: number;
  startLocal: string;
  durationMin: number;
};

export type BoardTechnician = {
  id: string;
  name: string;
  color: string;
  workStart: string;
  workEnd: string;
  /** False when this weekday is not one of the technician's working days. */
  working: boolean;
  appointments: BoardAppointment[];
};

export type UnscheduledJob = {
  id: string;
  number: string;
  title: string;
  customerName: string;
  siteLabel: string | null;
  priority: Priority;
  dueDate: string | null;
  overdue: boolean;
};

export type Board = {
  date: string;
  today: string;
  timeZone: string;
  technicians: BoardTechnician[];
  unscheduled: UnscheduledJob[];
};

export type AppointmentDto = {
  id: string;
  technicianId: string;
  technicianName: string;
  status: AppointmentStatus;
  start: string;
  end: string;
  startLocal: string;
  durationMin: number;
};
