"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

/** A filter dropdown synced to one URL search param; resets to page 1. */
export function UrlSelect({
  param,
  label,
  options,
  allLabel = "All",
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(param) ?? ALL;

  const onChange = (v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v === ALL) next.delete(param);
    else next.set(param, v);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-40" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
