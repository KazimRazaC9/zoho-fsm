"use client";

import { Check, ChevronDown, ClipboardList, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import {
  BLANK_SERVICE_FORM,
  CHECK_POINTS,
  CHECK_VALUE_LABEL,
  COMPONENTS,
  FINAL_RESULTS,
  serviceFormGaps,
  VISIT_REASONS,
  VISIT_TYPES,
  WORK_DONE,
  type CheckKey,
  type CheckValue,
  type ComponentKey,
  type ReplacedPart,
  type ServiceFormContext,
  type ServiceFormDto,
  type ServiceFormInput,
} from "@/modules/work-orders/service-form";

type Props = {
  form: ServiceFormDto | null;
  context: ServiceFormContext;
  /** Nobody can change it any more (the work order is closed or cancelled, or this user may not). */
  readOnly: boolean;
  /** "field" = the technician (the form is optional for them); "office" = everyone else. */
  audience: "field" | "office";
  hasSignature: boolean;
  save: (input: ServiceFormInput) => Promise<ActionResult<unknown>>;
};

const toInput = (f: ServiceFormDto | null): ServiceFormInput => {
  if (!f) return BLANK_SERVICE_FORM;
  const { updatedAt: _a, updatedBy: _b, ...rest } = f;
  void _a;
  void _b;
  return rest;
};

const NO_PART: ReplacedPart = { replaced: null, oldDetails: "", newDetails: "", remarks: "" };

/** An English label with its Urdu text underneath, as on the paper form. */
function Bilingual({ en, ur, className }: { en: string; ur: string; className?: string }) {
  return (
    <span className={cn("flex flex-col leading-tight", className)}>
      <span>{en}</span>
      <span lang="ur" dir="rtl" className="text-muted-foreground self-start text-xs">
        {ur}
      </span>
    </span>
  );
}

function Section({ no, en, ur, children }: { no: number; en: string; ur: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-4">
      <h4 className="flex items-baseline justify-between gap-3">
        <span className="font-medium">
          {no}. {en}
        </span>
        <span lang="ur" dir="rtl" className="text-muted-foreground text-sm">
          {ur}
        </span>
      </h4>
      {children}
    </section>
  );
}

/** A tick box drawn as a button: tapping it turns it on or off. */
function Chip({
  on,
  onClick,
  en,
  ur,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  en: string;
  ur: string;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default",
        on ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50 disabled:hover:bg-transparent",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
          on ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40",
        )}
        aria-hidden="true"
      >
        {on && <Check className="size-3" />}
      </span>
      <Bilingual en={en} ur={ur} />
    </button>
  );
}

/** A small set of answers where exactly one can be picked (tap it again to clear). */
function Answers<T extends string>({
  value,
  options,
  label,
  onChange,
  disabled,
}: {
  value: T | null | undefined;
  options: readonly { key: T; label: string }[];
  label: string;
  onChange: (v: T | null) => void;
  disabled: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          disabled={disabled}
          onClick={() => onChange(value === o.key ? null : o.key)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-default",
            value === o.key
              ? o.key === "NOT_OK" || o.key === "NO" || o.key === "NOT_RECORDING"
                ? "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400"
                : "border-emerald-600 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400"
              : "hover:bg-muted/50 disabled:hover:bg-transparent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const field = (label: string, ur: string | undefined, input: React.ReactNode) => (
  <label className="block space-y-1 text-sm">
    {ur ? <Bilingual en={label} ur={ur} /> : <span>{label}</span>}
    {input}
  </label>
);

/**
 * The DriveSense job form. Everything the system already holds (date, project, client, site, technician,
 * ticket, device) is shown at the top and not typed again. The technician may fill it (never required);
 * office staff are reminded of what is still empty before the work order is closed.
 */
export function ServiceForm({ form, context, readOnly, audience, hasSignature, save }: Props) {
  const router = useRouter();
  const saved = useMemo(() => toInput(form), [form]);
  const [values, setValues] = useState<ServiceFormInput>(saved);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(audience === "office");
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const gaps = serviceFormGaps(form);

  // Someone else saved a newer version while this one is untouched: show theirs.
  useEffect(() => {
    setValues((v) => (JSON.stringify(v) === JSON.stringify(toInput(form)) ? v : dirty ? v : toInput(form)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a newer saved version should reset the fields
  }, [form?.updatedAt]);

  const set = <K extends keyof ServiceFormInput>(key: K, value: ServiceFormInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const toggle = (key: "visitTypes" | "visitReasons" | "workDone", item: string) =>
    setValues((v) => {
      const list = v[key] as string[];
      return {
        ...v,
        [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item],
      } as ServiceFormInput;
    });
  const setCheck = (key: CheckKey, answer: CheckValue | null) =>
    setValues((v) => {
      const checks = { ...v.checks };
      if (answer) checks[key] = answer;
      else delete checks[key];
      return { ...v, checks };
    });
  const part = (key: ComponentKey) => values.replaced[key] ?? NO_PART;
  const setPart = (key: ComponentKey, patch: Partial<ReplacedPart>) =>
    setValues((v) => ({ ...v, replaced: { ...v.replaced, [key]: { ...(v.replaced[key] ?? NO_PART), ...patch } } }));

  const submit = async () => {
    setBusy(true);
    const res = await save(values);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Service form saved.");
    router.refresh();
  };

  const dis = readOnly || busy;
  const text = (key: "vehicleNumber" | "simNumber" | "driverName" | "driverMobile", props?: { inputMode?: "tel" }) => (
    <Input
      value={values[key]}
      onChange={(e) => set(key, e.target.value)}
      disabled={dis}
      maxLength={key === "driverName" ? 120 : 40}
      {...props}
    />
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="size-4" /> Service form
            <span lang="ur" dir="rtl" className="text-muted-foreground text-sm font-normal">
              سروس فارم
            </span>
          </CardTitle>
          <ChevronDown className={cn("text-muted-foreground size-4 transition-transform", open && "rotate-180")} />
        </button>
        <p className="text-muted-foreground text-xs">
          {audience === "field"
            ? "Optional for you. Fill what you can; the office completes the rest."
            : "Vehicle, visit, checks, parts and the final result of the visit."}
        </p>
        {audience === "office" && !readOnly && gaps.length > 0 && (
          <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            Still to fill: {gaps.join(", ")}.
          </p>
        )}
        {audience === "office" && gaps.length === 0 && (
          <p className="rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            The main parts of the form are filled in.
          </p>
        )}
      </CardHeader>

      {open && (
        <CardContent className="space-y-5">
          {/* 1. Basic information */}
          <Section no={1} en="Basic information" ur="بنیادی معلومات">
            <dl className="bg-muted/40 grid gap-x-4 gap-y-2 rounded-md p-3 text-sm sm:grid-cols-2">
              {(
                [
                  ["Date", context.date],
                  ["Project", context.projectName],
                  ["Client", context.clientName],
                  ["Site / location", context.siteLabel],
                  ["Technician", context.technicianName],
                  ["Ticket / complaint no.", context.ticket],
                  ["Device model", context.deviceModel],
                  ["Device serial no.", context.deviceSerial],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground text-xs">{k}</dt>
                  <dd className="font-medium">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("Vehicle number", "گاڑی نمبر", text("vehicleNumber"))}
              {field("SIM number", "سم نمبر", text("simNumber"))}
              {field("Driver name", "ڈرائیور نام", text("driverName"))}
              {field("Driver mobile", "ڈرائیور موبائل", text("driverMobile", { inputMode: "tel" }))}
            </div>
          </Section>

          {/* 2. Visit type */}
          <Section no={2} en="Visit type" ur="وزٹ کی قسم">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {VISIT_TYPES.map((t) => (
                <Chip
                  key={t.key}
                  on={values.visitTypes.includes(t.key)}
                  onClick={() => toggle("visitTypes", t.key)}
                  en={t.label}
                  ur={t.ur}
                  disabled={dis}
                />
              ))}
            </div>
          </Section>

          {/* 3. Visit reason */}
          <Section no={3} en="Visit reason" ur="وزٹ کی وجہ">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {VISIT_REASONS.map((r) => (
                <Chip
                  key={r.key}
                  on={values.visitReasons.includes(r.key)}
                  onClick={() => toggle("visitReasons", r.key)}
                  en={r.label}
                  ur={r.ur}
                  disabled={dis}
                />
              ))}
            </div>
            {field(
              "Other reason",
              undefined,
              <Input
                value={values.visitReasonOther}
                onChange={(e) => set("visitReasonOther", e.target.value)}
                disabled={dis}
                maxLength={200}
                placeholder="Anything not listed above"
              />,
            )}
          </Section>

          {/* 4. What was checked */}
          <Section no={4} en="What was checked?" ur="کیا چیک کیا گیا؟">
            <ul className="divide-y rounded-md border">
              {CHECK_POINTS.map((p) => (
                <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <Bilingual en={p.label} ur={p.ur} className="text-sm" />
                  <Answers
                    label={p.label}
                    value={values.checks[p.key] ?? null}
                    options={p.options.map((o) => ({ key: o, label: CHECK_VALUE_LABEL[o] }))}
                    onChange={(a) => setCheck(p.key, a)}
                    disabled={dis}
                  />
                </li>
              ))}
            </ul>
            {field(
              "Firmware number",
              "فرم ویئر نمبر",
              <Input
                value={values.firmwareNumber}
                onChange={(e) => set("firmwareNumber", e.target.value)}
                disabled={dis}
                maxLength={60}
              />,
            )}
          </Section>

          {/* 5. Work done */}
          <Section no={5} en="Work done by technician" ur="ٹیکنیشن نے کیا کام کیا؟">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {WORK_DONE.map((w) => (
                <Chip
                  key={w.key}
                  on={values.workDone.includes(w.key)}
                  onClick={() => toggle("workDone", w.key)}
                  en={w.label}
                  ur={w.ur}
                  disabled={dis}
                />
              ))}
            </div>
            {field(
              "Other work",
              undefined,
              <Input
                value={values.workDoneOther}
                onChange={(e) => set("workDoneOther", e.target.value)}
                disabled={dis}
                maxLength={200}
                placeholder="Anything not listed above"
              />,
            )}
          </Section>

          {/* 6. Replaced components */}
          <Section no={6} en="Replaced components" ur="تبدیل شدہ پارٹس">
            <ul className="divide-y rounded-md border">
              {COMPONENTS.map((c) => {
                const p = part(c.key);
                return (
                  <li key={c.key} className="space-y-2 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Bilingual en={c.label} ur={c.ur} className="text-sm" />
                      <Answers
                        label={`${c.label} replaced`}
                        value={p.replaced}
                        options={[
                          { key: "YES", label: "Replaced" },
                          { key: "NO", label: "Not replaced" },
                        ]}
                        onChange={(a) => setPart(c.key, { replaced: a })}
                        disabled={dis}
                      />
                    </div>
                    {p.replaced === "YES" && (
                      <div className="grid gap-2 sm:grid-cols-3">
                        {(
                          [
                            ["oldDetails", "Old serial / details"],
                            ["newDetails", "New serial / details"],
                            ["remarks", "Issue found / remarks"],
                          ] as const
                        ).map(([k, label]) => (
                          <Input
                            key={k}
                            aria-label={`${c.label}: ${label}`}
                            placeholder={label}
                            value={p[k]}
                            onChange={(e) => setPart(c.key, { [k]: e.target.value })}
                            disabled={dis}
                            maxLength={k === "remarks" ? 300 : 200}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* 8. Final result */}
          <Section no={7} en="Final result" ur="آخری نتیجہ">
            <div className="grid grid-cols-2 gap-2">
              {FINAL_RESULTS.map((r) => (
                <Chip
                  key={r.key}
                  on={values.finalResult === r.key}
                  onClick={() => set("finalResult", values.finalResult === r.key ? "" : r.key)}
                  en={r.label}
                  ur={r.ur}
                  disabled={dis}
                />
              ))}
            </div>
            {field(
              "Reason if not resolved",
              "اگر حل نہیں ہوا تو وجہ",
              <Textarea
                rows={2}
                value={values.notResolvedReason}
                onChange={(e) => set("notResolvedReason", e.target.value)}
                disabled={dis}
                maxLength={500}
              />,
            )}
            {field(
              "Final remarks",
              "آخری ریمارکس",
              <Textarea
                rows={3}
                value={values.finalRemarks}
                onChange={(e) => set("finalRemarks", e.target.value)}
                disabled={dis}
                maxLength={1000}
              />,
            )}
          </Section>

          {/* 9. Confirmation */}
          <Section no={8} en="Confirmation" ur="تصدیق">
            <div className="grid gap-3 sm:grid-cols-2">
              {field(
                "Driver / client person: name",
                "ڈرائیور / کلائنٹ نمائندہ",
                <Input
                  value={values.clientPersonName}
                  onChange={(e) => set("clientPersonName", e.target.value)}
                  disabled={dis}
                  maxLength={120}
                />,
              )}
              {field(
                "Driver / client person: mobile",
                undefined,
                <Input
                  inputMode="tel"
                  value={values.clientPersonMobile}
                  onChange={(e) => set("clientPersonMobile", e.target.value)}
                  disabled={dis}
                  maxLength={30}
                />,
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Customer signature: {hasSignature ? "captured" : "not taken yet"}. Technician:{" "}
              {context.technicianName ?? "not assigned"}
              {form
                ? `. Form saved ${new Date(form.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${form.updatedBy ? ` by ${form.updatedBy}` : ""}.`
                : "."}
            </p>
          </Section>

          {!readOnly && (
            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <span className="text-muted-foreground text-xs">
                {dirty ? "You have unsaved changes." : "All changes saved."}
              </span>
              <Button onClick={submit} disabled={busy || !dirty}>
                {busy && <Loader2 className="animate-spin" />} Save form
              </Button>
            </div>
          )}
          {readOnly && (
            <p className="text-muted-foreground border-t pt-4 text-xs">This form can no longer be changed.</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
