"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { changePasswordAction, type ChangePasswordState } from "@/modules/auth/auth.actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(changePasswordAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success("Password changed.");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={action} className="space-y-4" noValidate>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Field
            name="currentPassword"
            label="Current password"
            autoComplete="current-password"
            errors={state.fieldErrors?.currentPassword}
          />
          <Field
            name="newPassword"
            label="New password"
            autoComplete="new-password"
            errors={state.fieldErrors?.newPassword}
            hint="At least 8 characters with upper and lower case, a number and a symbol."
          />
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field(props: { name: string; label: string; autoComplete: string; errors?: string[]; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{props.label}</Label>
      <PasswordInput
        id={props.name}
        name={props.name}
        autoComplete={props.autoComplete}
        aria-invalid={!!props.errors}
      />
      {props.errors ? (
        <p className="text-destructive text-sm">{props.errors[0]}</p>
      ) : (
        props.hint && <p className="text-muted-foreground text-xs">{props.hint}</p>
      )}
    </div>
  );
}
