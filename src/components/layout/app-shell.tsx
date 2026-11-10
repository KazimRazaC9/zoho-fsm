"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu, type MenuUser } from "./user-menu";
import { Button } from "@/components/ui/button";

/** Dashboard frame: collapsible sidebar (overlay on phones) + top bar. */
export function AppShell({ user, children }: { user: MenuUser; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-svh overflow-hidden">
      <AppSidebar role={user.role} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      {mobileOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex h-svh min-w-0 flex-1 flex-col">
        <header className="bg-background z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <div className="text-muted-foreground truncate text-sm">{user.companyName ?? "FieldServe platform"}</div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
