"use client";

import { KeyRound, MoreHorizontal, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { UserSheet } from "./user-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteUserAction, setUserActiveAction } from "@/modules/users/users.actions";
import type { UserDto } from "@/modules/users/users.schema";

export function AddUserButton({ currency }: { currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Add user
      </Button>
      <UserSheet open={open} onOpenChange={setOpen} currency={currency} />
    </>
  );
}

type Dialog = "edit" | "reset" | "toggle" | "delete" | null;

export function UserRowActions({ user, currency, isSelf }: { user: UserDto; currency: string; isSelf: boolean }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = (o: boolean) => !o && setDialog(null);

  const toggle = async () => {
    const res = await setUserActiveAction(user.id, !user.isActive);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(
      user.isActive ? `${user.fullName} was deactivated and signed out.` : `${user.fullName} can sign in again.`,
    );
  };

  const remove = async () => {
    const res = await deleteUserAction(user.id);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(`${user.fullName} was deleted.`);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${user.fullName}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("reset")}>
            <KeyRound /> Reset password
          </DropdownMenuItem>
          {!isSelf && (
            <>
              <DropdownMenuItem onSelect={() => setDialog("toggle")}>
                <Power /> {user.isActive ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <UserSheet open={dialog === "edit"} onOpenChange={close} user={user} currency={currency} isSelf={isSelf} />
      <ResetPasswordDialog user={user} open={dialog === "reset"} onOpenChange={close} />
      <ConfirmDialog
        open={dialog === "toggle"}
        onOpenChange={close}
        title={user.isActive ? `Deactivate ${user.fullName}?` : `Activate ${user.fullName}?`}
        description={
          user.isActive
            ? "They are signed out at once and cannot sign in until reactivated. Their history is kept."
            : "They will be able to sign in again with their current password."
        }
        confirmLabel={user.isActive ? "Deactivate" : "Activate"}
        destructive={user.isActive}
        onConfirm={toggle}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={`Delete ${user.fullName}?`}
        description="The user is removed from lists and signed out. Records they created keep their history."
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
