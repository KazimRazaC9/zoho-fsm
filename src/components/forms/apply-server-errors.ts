import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** Puts a failed server action's field errors on the form and toasts the message. Returns true on success. */
export function handleResult<T, F extends FieldValues>(
  res: ActionResult<T>,
  setError?: UseFormSetError<F>,
  successMessage?: string,
): res is { ok: true; data: T } {
  if (res.ok) {
    if (successMessage) toast.success(successMessage);
    return true;
  }
  if (setError && res.fieldErrors) {
    for (const [name, messages] of Object.entries(res.fieldErrors)) {
      setError(name as Path<F>, { type: "server", message: messages[0] });
    }
  }
  toast.error(res.error);
  return false;
}
