"use client";

import { Printer } from "lucide-react";

export function PrintBar() {
  return (
    <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-8 print:hidden">
      <p className="text-sm text-neutral-600">Choose “Save as PDF” as the destination to download a copy.</p>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
      >
        <Printer className="size-4" /> Print / Save as PDF
      </button>
    </div>
  );
}
