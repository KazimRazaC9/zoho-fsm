"use client";

import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field, NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { moveAssetAction } from "@/modules/assets/assets.actions";

type SiteOption = { id: string; label: string };

/** Re-assign an asset to another site (and so another project) of the same customer. */
export function MoveAssetButton({
  assetId,
  assetName,
  currentSiteId,
  sites,
}: {
  assetId: string;
  assetName: string;
  currentSiteId: string | null;
  sites: SiteOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(currentSiteId ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await moveAssetAction(assetId, target || null);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${assetName} moved.`);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative z-10 size-8"
        aria-label={`Move ${assetName}`}
        title="Move to another site"
        onClick={() => {
          setTarget(currentSiteId ?? "");
          setOpen(true);
        }}
      >
        <ArrowRightLeft />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {assetName}</DialogTitle>
            <DialogDescription>
              Pick the site it now belongs to. Its project is the project of that site.
            </DialogDescription>
          </DialogHeader>
          <Field label="Site" htmlFor="mv-site">
            <NativeSelect id="mv-site" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">No site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || target === (currentSiteId ?? "")}>
              {busy && <Loader2 className="animate-spin" />} Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
