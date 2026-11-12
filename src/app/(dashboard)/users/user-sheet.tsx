"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { TechnicianProfileFields } from "./technician-profile-fields";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { generatePassword } from "@/lib/password";
import { ROLE_LABEL } from "@/lib/roles";
import { createUserAction, updateTechnicianProfileAction, updateUserAction } from "@/modules/users/users.actions";
import {
  createUserSchema,
  DEFAULT_TECHNICIAN_PROFILE,
  STAFF_ROLES,
  technicianProfileSchema,
  updateUserSchema,
  type StaffRole,
  type TechnicianProfileInput,
  type UserDto,
} from "@/modules/users/users.schema";

type CustomRoleOption = { id: string; name: string; baseRole: StaffRole };

type FormValues = {
  fullName: string;
  email: string;
  phone: string;
  role: StaffRole;
  customRoleId: string | null;
  password: string;
  technicianProfile: TechnicianProfileInput;
};

const createForm = createUserSchema.extend({ technicianProfile: technicianProfileSchema });
const editForm = updateUserSchema.extend({ password: z.string(), technicianProfile: technicianProfileSchema });

const defaults = (user?: UserDto): FormValues => ({
  fullName: user?.fullName ?? "",
  email: user?.email ?? "",
  phone: user?.phone ?? "",
  role: user?.role ?? "TECHNICIAN",
  customRoleId: user?.customRoleId ?? null,
  password: "",
  technicianProfile: user?.technicianProfile ?? DEFAULT_TECHNICIAN_PROFILE,
});

/** Add or edit a staff member; technicians also get their profile here. */
export function UserSheet({
  open,
  onOpenChange,
  user,
  currency,
  customRoles,
  isSelf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserDto;
  currency: string;
  customRoles: CustomRoleOption[];
  isSelf?: boolean;
}) {
  const editing = !!user;
  const [shownPassword, setShownPassword] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(editing ? editForm : createForm) as unknown as Resolver<FormValues>,
    defaultValues: defaults(user),
  });
  const { register, control, handleSubmit, setValue, setError, reset, watch, formState } = form;
  const role = watch("role");
  const customRoleId = watch("customRoleId");

  useEffect(() => {
    if (open) {
      reset(defaults(user));
      setShownPassword(false);
    }
  }, [open, user, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const profile = { ...v.technicianProfile, skills: v.technicianProfile.skills.map((s) => s.trim()).filter(Boolean) };

    if (!editing) {
      const res = await createUserAction({
        fullName: v.fullName,
        email: v.email,
        phone: v.phone,
        role: v.role,
        customRoleId: v.customRoleId,
        password: v.password,
        technicianProfile: v.role === "TECHNICIAN" ? profile : undefined,
      });
      if (handleResult(res, setError, `${v.fullName} was added. Share the password with them securely.`))
        onOpenChange(false);
      return;
    }

    const res = await updateUserAction(user.id, {
      fullName: v.fullName,
      email: v.email,
      phone: v.phone,
      role: v.role,
      customRoleId: v.customRoleId,
    });
    if (!handleResult(res, setError)) return;
    if (v.role === "TECHNICIAN") {
      const p = await updateTechnicianProfileAction(user.id, profile);
      if (!handleResult(p, setError)) return;
    }
    handleResult(res, undefined, "Changes saved.");
    onOpenChange(false);
  });

  const e = formState.errors;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{editing ? `Edit ${user.fullName}` : "Add user"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Update details, role and technician profile."
              : "Create a login for a dispatcher, technician or admin."}
          </SheetDescription>
        </SheetHeader>

        <form id="user-form" onSubmit={onSubmit} className="space-y-4 px-4" noValidate>
          <Field label="Full name" htmlFor="fullName" error={e.fullName?.message}>
            <Input id="fullName" autoComplete="off" {...register("fullName")} aria-invalid={!!e.fullName} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" error={e.email?.message}>
              <Input id="email" type="email" autoComplete="off" {...register("email")} aria-invalid={!!e.email} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={e.phone?.message}>
              <Input id="phone" type="tel" {...register("phone")} />
            </Field>
          </div>

          <Field label="Role" error={e.role?.message} hint={isSelf ? "You cannot change your own role." : undefined}>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select
                  value={customRoleId ? `custom:${customRoleId}` : `builtin:${field.value}`}
                  onValueChange={(value) => {
                    if (value.startsWith("custom:")) {
                      const selected = customRoles.find((item) => item.id === value.slice("custom:".length));
                      if (!selected) return;
                      setValue("customRoleId", selected.id, { shouldValidate: true });
                      setValue("role", selected.baseRole, { shouldValidate: true });
                    } else {
                      setValue("customRoleId", null, { shouldValidate: true });
                      field.onChange(value.slice("builtin:".length));
                    }
                  }}
                  disabled={isSelf}
                >
                  <SelectTrigger className="w-full" aria-label="Role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((r) => (
                      <SelectItem key={r} value={`builtin:${r}`}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                    {customRoles.map((customRole) => (
                      <SelectItem key={customRole.id} value={`custom:${customRole.id}`}>
                        {customRole.name} · {ROLE_LABEL[customRole.baseRole]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {!editing && (
            <Field
              label="Initial password"
              htmlFor="password"
              error={e.password?.message}
              hint="At least 8 characters with upper and lower case, a number and a symbol."
            >
              <div className="flex gap-2">
                <PasswordInput
                  id="password"
                  visible={shownPassword}
                  onVisibleChange={setShownPassword}
                  autoComplete="new-password"
                  {...register("password")}
                  aria-invalid={!!e.password}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setValue("password", generatePassword(), { shouldValidate: true });
                    setShownPassword(true);
                  }}
                >
                  <Wand2 /> Generate
                </Button>
              </div>
            </Field>
          )}

          {role === "TECHNICIAN" && (
            <TechnicianProfileFields
              control={control}
              register={register}
              errors={e.technicianProfile}
              currency={currency}
            />
          )}
        </form>

        <SheetFooter>
          <Button type="submit" form="user-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {editing ? "Save changes" : "Add user"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
