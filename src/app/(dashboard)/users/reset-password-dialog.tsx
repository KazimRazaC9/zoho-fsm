"use client";

import { Copy, Loader2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PasswordInput } from "@/components/ui/password-input";
import { generatePassword } from "@/lib/password";
import { passwordPolicy } from "@/modules/auth/auth.schema";
import { resetUserPasswordAction } from "@/modules/users/users.actions";
import type { UserDto } from "@/modules/users/users.schema";

/** Admin sets a new password for a user; the user is signed out of every device. */
export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // A freshly generated password is shown so the admin can read it out; the eye button hides it.
  const [shown, setShown] = useState(true);

  useEffect(() => {
    if (open) {
      setPassword(generatePassword());
      setShown(true);
      setError(undefined);
    }
  }, [open]);

  const submit = async () => {
    const check = passwordPolicy.safeParse(password);
    if (!check.success) return setError(check.error.issues[0]?.message);
    setBusy(true);
    const res = await resetUserPasswordAction(user.id, password);
    setBusy(false);
    if (!res.ok) return setError(res.fieldErrors?.password?.[0] ?? res.error);
    toast.success(`Password reset for ${user.fullName}.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {user.fullName}. They will be signed out everywhere and must use the new password.
          </DialogDescription>
        </DialogHeader>
        <Field label="New password" htmlFor="new-password" error={error}>
          <div className="flex gap-2">
            <PasswordInput
              id="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              visible={shown}
              onVisibleChange={setShown}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Generate"
              onClick={() => setPassword(generatePassword())}
            >
              <Wand2 />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Copy"
              onClick={() => navigator.clipboard.writeText(password).then(() => toast.success("Copied."))}
            >
              <Copy />
            </Button>
          </div>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
