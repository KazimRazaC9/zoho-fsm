"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** A page that was opened before the server was updated asks for an action the server no longer knows. */
const isStaleApp = (error: Error) =>
  /UnrecognizedActionError|was not found on the server|Failed to find Server Action/i.test(
    `${error.name} ${error.message}`,
  );

const RELOADED_AT = "fs.staleReloadAt";

/**
 * Last-resort screen for errors in any page. The one error it handles quietly is the stale-page one
 * (after an update, "Server Action ... was not found on the server"): it reloads the page once to get
 * the new version, instead of leaving the user on an error.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleApp(error);

  useEffect(() => {
    if (!stale) return;
    try {
      // At most one automatic reload per 30 seconds, so a real fault can never cause a reload loop.
      const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
      if (Date.now() - last < 30_000) return;
      sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [stale]);

  return (
    <main className="grid min-h-svh place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">{stale ? "Updating the app…" : "Something went wrong"}</h1>
        <p className="text-muted-foreground text-sm">
          {stale
            ? "A newer version is available. This page will reload by itself; if it does not, press Reload."
            : "Please try again. If it keeps happening, tell your administrator."}
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => (stale ? window.location.reload() : reset())}>{stale ? "Reload" : "Try again"}</Button>
          <Button variant="outline" onClick={() => window.location.assign("/login")}>
            Go to sign in
          </Button>
        </div>
      </div>
    </main>
  );
}
