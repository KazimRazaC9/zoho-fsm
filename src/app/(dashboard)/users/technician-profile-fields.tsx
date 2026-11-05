"use client";

import { Controller, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Field } from "@/components/forms/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { WEEK_DAYS, type TechnicianProfileInput } from "@/modules/users/users.schema";

type WithProfile = { technicianProfile: TechnicianProfileInput };

const DAY_LABEL: Record<(typeof WEEK_DAYS)[number], string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

/** Skills, hourly rate, working hours/days and calendar colour of a technician. */
export function TechnicianProfileFields<T extends WithProfile>({
  control,
  register,
  errors,
  currency,
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
  errors: FieldErrors<WithProfile>["technicianProfile"];
  currency: string;
}) {
  // Narrow the generic form to the profile part (react-hook-form paths are typed per form).
  const c = control as unknown as Control<WithProfile>;
  const r = register as unknown as UseFormRegister<WithProfile>;

  return (
    <fieldset className="space-y-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">Technician profile</legend>

      <Field
        label="Skills"
        htmlFor="skills"
        hint="Comma separated, e.g. HVAC, Electrical"
        error={errors?.skills?.message ?? errors?.skills?.[0]?.message}
      >
        <Controller
          control={c}
          name="technicianProfile.skills"
          render={({ field }) => (
            <Input
              id="skills"
              value={field.value.join(",")}
              onChange={(e) => field.onChange(e.target.value.split(","))}
              onBlur={() => field.onChange(field.value.map((s) => s.trim()).filter(Boolean))}
              placeholder="HVAC, Refrigeration"
            />
          )}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Hourly rate (${currency})`} htmlFor="hourlyRate" error={errors?.hourlyRate?.message}>
          <Input
            id="hourlyRate"
            type="number"
            min={0}
            step="0.01"
            {...r("technicianProfile.hourlyRate", { valueAsNumber: true })}
          />
        </Field>
        <Field label="Day starts" htmlFor="workStart" error={errors?.workStart?.message}>
          <Input id="workStart" type="time" {...r("technicianProfile.workStart")} />
        </Field>
        <Field label="Day ends" htmlFor="workEnd" error={errors?.workEnd?.message}>
          <Input id="workEnd" type="time" {...r("technicianProfile.workEnd")} />
        </Field>
      </div>

      <Field label="Working days" error={errors?.workingDays?.message}>
        <Controller
          control={c}
          name="technicianProfile.workingDays"
          render={({ field }) => (
            <div className="flex flex-wrap gap-3">
              {WEEK_DAYS.map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={field.value.includes(d)}
                    onCheckedChange={(on) =>
                      field.onChange(
                        on
                          ? WEEK_DAYS.filter((x) => x === d || field.value.includes(x))
                          : field.value.filter((x) => x !== d),
                      )
                    }
                  />
                  {DAY_LABEL[d]}
                </label>
              ))}
            </div>
          )}
        />
      </Field>

      <Field label="Calendar colour" htmlFor="color" error={errors?.color?.message}>
        <Input id="color" type="color" className="h-9 w-20 p-1" {...r("technicianProfile.color")} />
      </Field>
    </fieldset>
  );
}
