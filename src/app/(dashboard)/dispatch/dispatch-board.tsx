"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, ExternalLink, Loader2, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Field, NativeSelect } from "@/components/forms/field";
import { PriorityText } from "@/components/domain/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  scheduleSchema,
  type Board,
  type BoardAppointment,
  type BoardTechnician,
  type UnscheduledJob,
} from "@/modules/scheduling/scheduling.schema";
import { scheduleWorkOrderAction, unscheduleWorkOrderAction } from "@/modules/scheduling/scheduling.actions";
import { changeWorkOrderStatusAction } from "@/modules/work-orders/work-orders.actions";

const FIRST_HOUR = 7;
const LAST_HOUR = 21;
const HOUR_PX = 84;
const ROW_PX = 72;
const SNAP_MIN = 30;
const WIDTH = (LAST_HOUR - FIRST_HOUR) * HOUR_PX;
const DURATIONS = [30, 45, 60, 90, 120, 180, 240, 360, 480];

const px = (min: number) => ((min - FIRST_HOUR * 60) / 60) * HOUR_PX;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const shiftDay = (day: string, by: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};
const nowMinutes = (tz: string) => {
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date())
    .replace(/^24/, "00");
  return toMin(t);
};
const timeText = (a: BoardAppointment) => `${hhmm(a.startMin)}–${hhmm(a.endMin === 1440 ? 1439 : a.endMin)}`;

const durationText = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

type SlotDraft = { workOrderId: string; technicianId: string; start: string; durationMin: number; locked: boolean };

export function DispatchBoard({ board }: { board: Board }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SlotDraft | null>(null);
  const [selected, setSelected] = useState<BoardAppointment | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(nowMinutes(board.timeZone));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [board.timeZone]);

  const go = (day: string) => router.push(day === board.today ? "/dispatch" : `/dispatch?date=${day}`);
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const jobsById = new Map(board.unscheduled.map((j) => [j.id, j]));

  /** Minutes (snapped) under the pointer inside a technician's track. */
  const minuteAt = (e: React.MouseEvent | React.DragEvent, el: HTMLElement) => {
    const x = e.clientX - el.getBoundingClientRect().left;
    const raw = FIRST_HOUR * 60 + (x / HOUR_PX) * 60;
    return Math.min(LAST_HOUR * 60 - SNAP_MIN, Math.max(FIRST_HOUR * 60, Math.floor(raw / SNAP_MIN) * SNAP_MIN));
  };

  const openSlot = (technicianId: string, min: number, workOrderId = "") =>
    setDraft({ workOrderId, technicianId, start: `${board.date}T${hhmm(min)}`, durationMin: 60, locked: false });

  const onDrop = (e: React.DragEvent<HTMLDivElement>, t: BoardTechnician) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!jobsById.has(id)) return;
    openSlot(t.id, minuteAt(e, e.currentTarget), id);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      {/* Waiting jobs */}
      <Card className="h-fit gap-0 py-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="text-sm font-semibold">Unscheduled</h2>
          <Badge variant="secondary">{board.unscheduled.length}</Badge>
        </div>
        <div className="max-h-[32rem] space-y-2 overflow-y-auto p-2">
          {board.unscheduled.length === 0 && (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">Every new job has a technician.</p>
          )}
          {board.unscheduled.map((j) => (
            <JobCard
              key={j.id}
              job={j}
              onSchedule={() =>
                setDraft({
                  workOrderId: j.id,
                  technicianId: board.technicians[0]?.id ?? "",
                  start: `${board.date}T09:00`,
                  durationMin: 60,
                  locked: false,
                })
              }
            />
          ))}
        </div>
      </Card>

      {/* Day grid */}
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => go(shiftDay(board.date, -1))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" disabled={board.date === board.today} onClick={() => go(board.today)}>
            Today
          </Button>
          <Button variant="outline" size="icon" aria-label="Next day" onClick={() => go(shiftDay(board.date, 1))}>
            <ChevronRight />
          </Button>
          <Input
            type="date"
            aria-label="Go to date"
            className="w-40"
            value={board.date}
            onChange={(e) => e.target.value && go(e.target.value)}
          />
          <p className="text-muted-foreground ml-1 text-sm">
            {new Date(`${board.date}T12:00:00Z`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </p>
        </div>

        <Card className="gap-0 overflow-hidden py-0">
          {board.technicians.length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-sm">
              No active technicians yet. Add some under Users &amp; technicians.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ width: WIDTH + 160 }}>
                {/* Hour header */}
                <div className="bg-muted/40 flex border-b">
                  <div className="bg-muted/40 sticky left-0 z-20 w-40 shrink-0 border-r px-3 py-2 text-xs font-medium">
                    Technician
                  </div>
                  <div className="relative h-8" style={{ width: WIDTH }}>
                    {hours.map((h) => (
                      <span
                        key={h}
                        className="text-muted-foreground absolute top-2 border-l pl-1 text-xs"
                        style={{ left: (h - FIRST_HOUR) * HOUR_PX }}
                      >
                        {String(h).padStart(2, "0")}:00
                      </span>
                    ))}
                  </div>
                </div>

                {board.technicians.map((t) => {
                  const ws = Math.max(FIRST_HOUR * 60, toMin(t.workStart));
                  const we = Math.min(LAST_HOUR * 60, toMin(t.workEnd));
                  const load = t.appointments.filter((a) => a.status !== "COMPLETED").length;
                  return (
                    <div key={t.id} className="flex border-b last:border-b-0" style={{ height: ROW_PX }}>
                      <div className="bg-background sticky left-0 z-20 flex w-40 shrink-0 flex-col justify-center border-r px-3">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                          <span className="truncate text-sm font-medium">{t.name}</span>
                        </div>
                        <span className="text-muted-foreground pl-4.5 text-xs">
                          {t.working ? `${t.workStart}–${t.workEnd}` : "Day off"} · {load} job{load === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "bg-muted/50 relative cursor-cell",
                          dragOver === t.id && "ring-primary ring-2 ring-inset",
                        )}
                        style={{ width: WIDTH }}
                        onClick={(e) => openSlot(t.id, minuteAt(e, e.currentTarget))}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(t.id);
                        }}
                        onDragLeave={() => setDragOver((d) => (d === t.id ? null : d))}
                        onDrop={(e) => onDrop(e, t)}
                        data-testid={`track-${t.id}`}
                      >
                        {t.working && we > ws && (
                          <div
                            data-slot="work"
                            className="bg-background absolute inset-y-0"
                            style={{ left: px(ws), width: px(we) - px(ws) }}
                          />
                        )}
                        {hours.map((h) => (
                          <div
                            key={h}
                            className="border-border/60 pointer-events-none absolute inset-y-0 border-l"
                            style={{ left: (h - FIRST_HOUR) * HOUR_PX }}
                          />
                        ))}
                        {board.date === board.today &&
                          now !== null &&
                          now >= FIRST_HOUR * 60 &&
                          now < LAST_HOUR * 60 && (
                            <div
                              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red-500"
                              style={{ left: px(now) }}
                            />
                          )}
                        {t.appointments.map((a) => {
                          const left = Math.max(0, px(a.startMin));
                          const right = Math.min(WIDTH, px(a.endMin));
                          if (right <= left) return null;
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(a);
                              }}
                              className={cn(
                                "absolute top-1.5 bottom-1.5 z-[5] overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs shadow-sm transition hover:brightness-95 focus-visible:ring-2 focus-visible:outline-none",
                                a.status === "COMPLETED" && "opacity-60",
                              )}
                              style={{
                                left,
                                width: right - left,
                                borderLeftColor: t.color,
                                background: `${t.color}26`,
                              }}
                              title={`${a.number} · ${a.title}`}
                            >
                              <span className="block truncate font-semibold">
                                {a.number} · {a.customerName}
                              </span>
                              <span className="text-muted-foreground block truncate">
                                {timeText(a)}
                                {a.status === "EN_ROUTE" && " · en route"}
                                {a.status === "ON_SITE" && " · on site"}
                                {a.status === "COMPLETED" && " · done"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      <ScheduleDialog
        key={draft ? `${draft.workOrderId}-${draft.technicianId}-${draft.start}` : "closed"}
        board={board}
        draft={draft}
        onClose={() => setDraft(null)}
        onDone={() => {
          setDraft(null);
          router.refresh();
        }}
      />
      <AppointmentDialog
        appt={selected}
        technician={board.technicians.find((t) => t.appointments.some((a) => a.id === selected?.id))}
        onClose={() => setSelected(null)}
        onReschedule={(a, t) => {
          setSelected(null);
          setDraft({
            workOrderId: a.workOrderId,
            technicianId: t.id,
            start: a.startLocal,
            durationMin: a.durationMin,
            locked: true,
          });
        }}
        onChanged={() => {
          setSelected(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function JobCard({ job, onSchedule }: { job: UnscheduledJob; onSchedule: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", job.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="bg-card hover:border-primary/50 cursor-grab space-y-1 rounded-md border p-2.5 text-sm active:cursor-grabbing"
      data-testid={`job-${job.number}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground font-mono text-xs">{job.number}</span>
        <PriorityText priority={job.priority} />
      </div>
      <p className="leading-snug font-medium">{job.title}</p>
      <p className="text-muted-foreground truncate text-xs">{job.customerName}</p>
      {job.dueDate && (
        <p className={cn("text-xs", job.overdue ? "font-medium text-red-600" : "text-muted-foreground")}>
          {job.overdue ? "Overdue · " : "Due "}
          {new Date(job.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </p>
      )}
      <Button size="sm" variant="outline" className="mt-1 h-7 w-full" onClick={onSchedule}>
        <CalendarClock /> Schedule
      </Button>
    </div>
  );
}

function ScheduleDialog({
  board,
  draft,
  onClose,
  onDone,
}: {
  board: Board;
  draft: SlotDraft | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [v, setV] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = draft !== null && v !== null;
  const durations =
    v && !DURATIONS.includes(v.durationMin) ? [...DURATIONS, v.durationMin].sort((a, b) => a - b) : DURATIONS;
  const job = v ? board.unscheduled.find((j) => j.id === v.workOrderId) : undefined;

  const save = async () => {
    if (!v) return;
    if (!v.workOrderId) return setError("Choose the job to schedule.");
    const parsed = scheduleSchema.safeParse({
      technicianId: v.technicianId,
      start: v.start,
      durationMin: v.durationMin,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the details.");
    setBusy(true);
    setError(null);
    const res = await scheduleWorkOrderAction(v.workOrderId, parsed.data);
    setBusy(false);
    if (!res.ok) return setError(res.fieldErrors?.start?.[0] ?? res.error);
    toast.success(job ? `${job.number} scheduled.` : "Visit moved.");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{v?.locked ? "Reschedule visit" : "Schedule a job"}</DialogTitle>
          <DialogDescription>
            Pick the technician and time. A technician cannot be booked for two jobs at once.
          </DialogDescription>
        </DialogHeader>
        {v && (
          <div className="space-y-4">
            {!v.locked && (
              <Field label="Job" htmlFor="sd-job">
                <NativeSelect
                  id="sd-job"
                  value={v.workOrderId}
                  onChange={(e) => setV({ ...v, workOrderId: e.target.value })}
                >
                  <option value="">Choose a job…</option>
                  {board.unscheduled.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.number} · {j.title} ({j.customerName})
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="Technician" htmlFor="sd-tech">
              <NativeSelect
                id="sd-tech"
                value={v.technicianId}
                onChange={(e) => setV({ ...v, technicianId: e.target.value })}
              >
                <option value="">Choose a technician…</option>
                {board.technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start" htmlFor="sd-start">
                <Input
                  id="sd-start"
                  type="datetime-local"
                  step={900}
                  value={v.start}
                  onChange={(e) => setV({ ...v, start: e.target.value })}
                />
              </Field>
              <Field label="Duration" htmlFor="sd-dur">
                <NativeSelect
                  id="sd-dur"
                  value={v.durationMin}
                  onChange={(e) => setV({ ...v, durationMin: Number(e.target.value) })}
                >
                  {durations.map((m) => (
                    <option key={m} value={m}>
                      {durationText(m)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {v?.locked ? "Move visit" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppointmentDialog({
  appt,
  technician,
  onClose,
  onReschedule,
  onChanged,
}: {
  appt: BoardAppointment | null;
  technician?: BoardTechnician;
  onClose: () => void;
  onReschedule: (a: BoardAppointment, t: BoardTechnician) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"dispatch" | "unschedule" | null>(null);
  const movable = appt && ["NEW", "SCHEDULED", "DISPATCHED", "ON_HOLD"].includes(appt.workOrderStatus);

  const run = async (kind: "dispatch" | "unschedule") => {
    if (!appt) return;
    setBusy(kind);
    const res =
      kind === "dispatch"
        ? await changeWorkOrderStatusAction(appt.workOrderId, { status: "DISPATCHED", reason: "" })
        : await unscheduleWorkOrderAction(appt.workOrderId);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(kind === "dispatch" ? `${appt.number} dispatched.` : `${appt.number} is unscheduled.`);
    onChanged();
  };

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {appt && (
          <>
            <DialogHeader>
              <DialogTitle>
                {appt.number} · {appt.title}
              </DialogTitle>
              <DialogDescription>
                {appt.customerName}
                {appt.siteLabel ? ` — ${appt.siteLabel}` : ""}
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Technician</dt>
              <dd>{technician?.name}</dd>
              <dt className="text-muted-foreground">When</dt>
              <dd>
                {appt.startLocal.replace("T", " ")} · {appt.durationMin} min
              </dd>
              <dt className="text-muted-foreground">Priority</dt>
              <dd>
                <PriorityText priority={appt.priority} />
              </dd>
              <dt className="text-muted-foreground">Job status</dt>
              <dd>{appt.workOrderStatus.replace("_", " ").toLowerCase()}</dd>
            </dl>
            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" asChild>
                <Link href={`/work-orders/${appt.workOrderId}`}>
                  <ExternalLink /> Open work order
                </Link>
              </Button>
              <div className="flex flex-wrap gap-2">
                {movable && technician && (
                  <Button variant="outline" onClick={() => onReschedule(appt, technician)}>
                    <CalendarClock /> Reschedule
                  </Button>
                )}
                {(appt.workOrderStatus === "SCHEDULED" || appt.workOrderStatus === "ON_HOLD") && (
                  <Button variant="outline" disabled={busy !== null} onClick={() => run("unschedule")}>
                    {busy === "unschedule" ? <Loader2 className="animate-spin" /> : <Undo2 />} Unschedule
                  </Button>
                )}
                {appt.workOrderStatus === "SCHEDULED" && (
                  <Button disabled={busy !== null} onClick={() => run("dispatch")}>
                    {busy === "dispatch" ? <Loader2 className="animate-spin" /> : <Send />} Dispatch
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
