"use client";

import { Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABEL } from "@/lib/roles";
import { PERMISSION_ACTIONS, PERMISSION_EXTRAS, PERMISSION_RESOURCES, type AppPermission } from "@/lib/permissions";
import { createCustomRoleAction, deleteCustomRoleAction, updateCustomRoleAction } from "@/modules/roles/roles.actions";
import type { CustomRoleDto, CustomRoleInput } from "@/modules/roles/roles.schema";
import { STAFF_ROLES, type StaffRole } from "@/modules/users/users.schema";

const emptyRole: CustomRoleInput = {
  name: "",
  description: "",
  baseRole: "DISPATCHER",
  permissions: [],
};
const actionLabels = { view: "View", create: "Create", edit: "Edit", delete: "Delete" } as const;

export function RolesManager({ roles }: { roles: CustomRoleDto[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomRoleDto | null>(null);
  const [form, setForm] = useState<CustomRoleInput>(emptyRole);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CustomRoleDto | null>(null);

  const openNew = () => {
    setEditing(null);
    setForm(emptyRole);
    setDialogOpen(true);
  };
  const openEdit = (role: CustomRoleDto) => {
    setEditing(role);
    setForm({
      name: role.name,
      description: role.description ?? "",
      baseRole: role.baseRole,
      permissions: role.permissions as AppPermission[],
    });
    setDialogOpen(true);
  };

  const togglePermission = (permission: AppPermission, checked: boolean) => {
    setForm((current) => ({
      ...current,
      permissions: checked
        ? [...current.permissions, permission]
        : current.permissions.filter((value) => value !== permission),
    }));
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const result = editing ? await updateCustomRoleAction(editing.id, form) : await createCustomRoleAction(form);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? "Role updated." : "Role created.");
    setDialogOpen(false);
  };

  const remove = async () => {
    if (!deleting) return false;
    const result = await deleteCustomRoleAction(deleting.id);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success(`${deleting.name} deleted.`);
    setDeleting(null);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Custom roles</h2>
          <p className="text-muted-foreground text-sm">Built-in roles remain unchanged.</p>
        </div>
        <Button onClick={openNew}>
          <Plus /> Create role
        </Button>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-12 text-center">
          <ShieldCheck className="text-muted-foreground mx-auto mb-3 size-8" />
          <h3 className="font-medium">No custom roles yet</h3>
          <p className="text-muted-foreground mt-1 text-sm">Create a role to define access for a group of staff.</p>
          <Button className="mt-4" variant="outline" onClick={openNew}>
            <Plus /> Create your first role
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Staff type</th>
                <th className="px-4 py-3 font-medium">Permissions</th>
                <th className="px-4 py-3 font-medium">Members</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-t">
                  <td className="px-4 py-3">
                    <p className="font-medium">{role.name}</p>
                    <p className="text-muted-foreground max-w-xs truncate text-xs">
                      {role.description || "No description"}
                    </p>
                  </td>
                  <td className="px-4 py-3">{ROLE_LABEL[role.baseRole]}</td>
                  <td className="px-4 py-3">{role.permissions.length} permissions</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="text-muted-foreground size-4" />
                      {role.memberCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${role.name}`}
                        onClick={() => openEdit(role)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${role.name}`}
                        onClick={() => setDeleting(role)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "Create custom role"}</DialogTitle>
            <DialogDescription>
              Staff type sets the available workspace. Selected permissions then control what the role can do there.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                Role name
                <Input
                  autoFocus
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Service Coordinator"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Staff type
                <Select
                  value={form.baseRole}
                  onValueChange={(value) => setForm((current) => ({ ...current, baseRole: value as StaffRole }))}
                  disabled={!!editing && editing.memberCount > 0}
                >
                  <SelectTrigger className="w-full" aria-label="Staff type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editing && editing.memberCount > 0 && (
                  <span className="text-muted-foreground block text-xs">
                    Reassign current members to change the staff type.
                  </span>
                )}
              </label>
            </div>
            <label className="space-y-1.5 text-sm font-medium">
              Description
              <Textarea
                maxLength={300}
                value={form.description ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="What this role is responsible for"
              />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Permissions</h3>
                <span className="text-muted-foreground text-xs">{form.permissions.length} selected</span>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Area</th>
                      {PERMISSION_ACTIONS.map((action) => (
                        <th key={action} className="px-3 py-2 text-center font-medium">
                          {actionLabels[action]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_RESOURCES.map((resource) => (
                      <tr key={resource.key} className="border-t">
                        <th scope="row" className="px-3 py-2 text-left font-medium">
                          {resource.label}
                        </th>
                        {PERMISSION_ACTIONS.map((action) => {
                          const permission = `${resource.key}:${action}` as AppPermission;
                          const checked = form.permissions.includes(permission);
                          return (
                            <td key={permission} className="px-3 py-2 text-center">
                              <Checkbox
                                aria-label={`${actionLabels[action]} ${resource.label}`}
                                checked={checked}
                                onCheckedChange={(value) => togglePermission(permission, value === true)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 space-y-2 rounded-lg border p-3">
                <h4 className="text-sm font-semibold">Special permissions</h4>
                {PERMISSION_EXTRAS.map((extra) => (
                  <label key={extra.key} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      aria-label={extra.label}
                      checked={form.permissions.includes(extra.key)}
                      onCheckedChange={(value) => togglePermission(extra.key, value === true)}
                    />
                    <span>
                      <span className="font-medium">{extra.label}</span>
                      <span className="text-muted-foreground block text-xs">{extra.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {form.permissions.length === 0 && (
                <p className="text-destructive mt-1 text-xs">Choose at least one permission to continue.</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || form.permissions.length === 0}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "role"}?`}
        description={
          deleting?.memberCount
            ? "This role has assigned users. Reassign them before deleting this role."
            : "This role will be permanently removed."
        }
        confirmLabel="Delete role"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
