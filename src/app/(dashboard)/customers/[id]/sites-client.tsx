"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, FolderKanban, Loader2, MapPin, MapPinOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AddressFields } from "@/components/forms/address-fields";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field, NativeSelect } from "@/components/forms/field";
import { PinsMap, type LatLng } from "@/components/maps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteAddressAction,
  deleteProjectAction,
  saveAddressAction,
  saveProjectAction,
} from "@/modules/customers/customers.actions";
import {
  addressSchema,
  addressToInput,
  BLANK_ADDRESS,
  BLANK_PROJECT,
  mapsUrl,
  projectSchema,
  type AddressDto,
  type AddressInput,
  type ProjectDto,
  type ProjectInput,
} from "@/modules/customers/customers.schema";

type SiteEdit = { address?: AddressDto; projectId: string };

/**
 * Customer → projects → sites. Each project (e.g. "Water DC", "Drift Vans") lists its own sites;
 * sites that belong to no project sit under "No project". A customer without projects looks as before.
 */
export function SitesSection({
  customerId,
  projects,
  addresses,
  focus = null,
}: {
  customerId: string;
  projects: ProjectDto[];
  addresses: AddressDto[];
  /** Show only one project's sites (its id), or the sites without a project ("none"); null shows all. */
  focus?: string | null;
}) {
  const [siteEdit, setSiteEdit] = useState<SiteEdit | null>(null);
  const [deletingSite, setDeletingSite] = useState<AddressDto | null>(null);
  const [projectEdit, setProjectEdit] = useState<ProjectDto | "new" | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectDto | null>(null);

  const inFocus = (a: AddressDto) => (focus === null ? true : focus === "none" ? !a.projectId : a.projectId === focus);
  const pins = addresses
    .filter((a) => inFocus(a) && a.latitude != null && a.longitude != null)
    .map((a) => ({ id: a.id, lat: a.latitude!, lng: a.longitude!, label: a.label ?? a.addressLine }));

  const unassigned = addresses.filter((a) => !a.projectId);
  const hasProjects = projects.length > 0;
  const shownProjects = focus === null ? projects : focus === "none" ? [] : projects.filter((p) => p.id === focus);
  const showUnassigned = focus === null ? !hasProjects || unassigned.length > 0 : focus === "none";

  const siteCard = (a: AddressDto) => {
    const pinned = a.latitude != null && a.longitude != null;
    return (
      <div key={a.id} className="flex items-start gap-3 rounded-lg border p-3">
        {pinned ? (
          <MapPin className="mt-0.5 size-4 shrink-0 text-blue-600" aria-label="Pinned" />
        ) : (
          <MapPinOff className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-label="Not pinned" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{a.label ?? "Site"}</p>
          <p className="text-muted-foreground text-sm">{a.fullAddress}</p>
          <p className="text-muted-foreground mt-1 text-xs tabular-nums">
            {pinned ? `${a.latitude!.toFixed(5)}, ${a.longitude!.toFixed(5)}` : "No map pin"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <a href={mapsUrl(a)} target="_blank" rel="noreferrer" aria-label="Open in Google Maps">
              <ExternalLink />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Edit address"
            onClick={() => setSiteEdit({ address: a, projectId: a.projectId ?? "" })}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Delete address"
            onClick={() => setDeletingSite(a)}
            disabled={addresses.length <= 1}
            title={addresses.length <= 1 ? "A customer needs at least one address" : undefined}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          {focus !== null
            ? `Sites (${addresses.filter(inFocus).length})`
            : hasProjects
              ? `Projects (${projects.length}) and sites (${addresses.length})`
              : `Service addresses (${addresses.length})`}
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setProjectEdit("new")}>
            <FolderKanban /> Add project
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSiteEdit({ projectId: "" })}>
            <Plus /> Add address
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {pins.length > 0 && (
          <div className="isolate h-64 overflow-hidden rounded-md border">
            <PinsMap pins={pins} />
          </div>
        )}

        {shownProjects.map((p) => {
          const sites = addresses.filter((a) => a.projectId === p.id);
          return (
            <section key={p.id} className="space-y-3" aria-label={`Project ${p.name}`}>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <FolderKanban className="text-muted-foreground size-4" /> {p.name}
                    <span className="text-muted-foreground text-sm font-normal">
                      {sites.length} site{sites.length === 1 ? "" : "s"}
                    </span>
                  </h3>
                  {p.description && <p className="text-muted-foreground text-sm">{p.description}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setSiteEdit({ projectId: p.id })}>
                    <Plus /> Add site
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Edit project ${p.name}`}
                    onClick={() => setProjectEdit(p)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Delete project ${p.name}`}
                    onClick={() => setDeletingProject(p)}
                    disabled={sites.length > 0}
                    title={sites.length > 0 ? "Move or delete its sites first" : undefined}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {sites.length === 0 ? (
                <p className="text-muted-foreground text-sm">No sites in this project yet.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">{sites.map(siteCard)}</div>
              )}
            </section>
          );
        })}

        {showUnassigned && (
          <section className="space-y-3" aria-label="Sites without a project">
            {hasProjects && <h3 className="text-muted-foreground border-b pb-2 font-semibold">No project</h3>}
            <div className="grid gap-3 md:grid-cols-2">{unassigned.map(siteCard)}</div>
          </section>
        )}
      </CardContent>

      <AddressDialog
        customerId={customerId}
        projects={projects}
        edit={siteEdit}
        onOpenChange={(o) => !o && setSiteEdit(null)}
        fallbackCenter={pins[0] ?? null}
      />
      <ProjectDialog
        customerId={customerId}
        project={projectEdit === "new" ? undefined : (projectEdit ?? undefined)}
        open={projectEdit !== null}
        onOpenChange={(o) => !o && setProjectEdit(null)}
      />
      <ConfirmDialog
        open={!!deletingSite}
        onOpenChange={(o) => !o && setDeletingSite(null)}
        title="Delete this address?"
        description="Assets at this site stay with the customer, without a site. Past jobs keep the address."
        confirmLabel="Delete address"
        destructive
        onConfirm={async () => {
          if (!deletingSite) return;
          const res = await deleteAddressAction(customerId, deletingSite.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success("Address deleted.");
        }}
      />
      <ConfirmDialog
        open={!!deletingProject}
        onOpenChange={(o) => !o && setDeletingProject(null)}
        title={`Delete ${deletingProject?.name ?? "this project"}?`}
        description="Only an empty project can be deleted. Its sites must be moved or deleted first."
        confirmLabel="Delete project"
        destructive
        onConfirm={async () => {
          if (!deletingProject) return;
          const res = await deleteProjectAction(customerId, deletingProject.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success("Project deleted.");
        }}
      />
    </Card>
  );
}

function ProjectDialog({
  customerId,
  project,
  open,
  onOpenChange,
}: {
  customerId: string;
  project?: ProjectDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<ProjectInput>({ resolver: zodResolver(projectSchema), defaultValues: BLANK_PROJECT });
  const { register, handleSubmit, reset, setError, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) reset(project ? { name: project.name, description: project.description ?? "" } : BLANK_PROJECT);
  }, [open, project, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveProjectAction(customerId, project?.id ?? null, v);
    if (handleResult(res, setError, project ? "Project saved." : "Project added.")) onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "Add project"}</DialogTitle>
          <DialogDescription>
            A customer can run several projects, for example Water DC and Drift Vans. Each project has its own sites.
          </DialogDescription>
        </DialogHeader>
        <form id="project-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Project name" htmlFor="prj-name" error={e.name?.message}>
            <Input id="prj-name" placeholder="e.g. Water DC" autoFocus {...register("name")} aria-invalid={!!e.name} />
          </Field>
          <Field label="Description" htmlFor="prj-desc" hint="Optional" error={e.description?.message}>
            <Textarea id="prj-desc" rows={3} {...register("description")} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {project ? "Save project" : "Add project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddressDialog({
  customerId,
  projects,
  edit,
  onOpenChange,
  fallbackCenter,
}: {
  customerId: string;
  projects: ProjectDto[];
  edit: SiteEdit | null;
  onOpenChange: (open: boolean) => void;
  fallbackCenter: LatLng | null;
}) {
  const open = edit !== null;
  const address = edit?.address;
  const form = useForm<AddressInput>({ resolver: zodResolver(addressSchema), defaultValues: BLANK_ADDRESS });
  const { register, handleSubmit, reset, setError, formState } = form;

  useEffect(() => {
    if (edit) reset(edit.address ? addressToInput(edit.address) : { ...BLANK_ADDRESS, projectId: edit.projectId });
  }, [edit, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveAddressAction(customerId, address?.id ?? null, v);
    if (handleResult(res, setError, address ? "Address saved." : "Address added.")) onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{address ? "Edit address" : "Add address"}</DialogTitle>
          <DialogDescription>Pin it on the map so it shows on the dispatch board and in Google Maps.</DialogDescription>
        </DialogHeader>
        <form id="address-form" onSubmit={onSubmit} noValidate className="space-y-4">
          {projects.length > 0 && (
            <Field label="Project" htmlFor="addr-project" hint="Which of this customer's projects the site belongs to.">
              <NativeSelect id="addr-project" {...register("projectId")}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <AddressFields form={form} name="" idPrefix="addr" fallbackCenter={fallbackCenter} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="address-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {address ? "Save address" : "Add address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
