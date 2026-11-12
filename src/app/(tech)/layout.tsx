import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, KeyRound, LogOut, Wrench } from "lucide-react";
import { LocationSharing, PwaRegister } from "./field-runtime";
import { auth } from "@/auth";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FieldServe", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-192.png" },
};

/** Technician field app frame: mobile-first header + bottom navigation, installable as a PWA. */
export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Live account check: a deactivated technician is signed out right away.
  if (!(await getCurrentUser())) redirect("/api/session/end?reason=inactive");

  return (
    <div className="flex min-h-svh flex-col">
      <PwaRegister />
      <header className="bg-background/95 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
        <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
          <Wrench className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{session.user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{session.user.companyName}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <LocationSharing />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 p-4 pb-24">{children}</main>

      <nav className="bg-background fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t" aria-label="Field app">
        <Link href="/my-jobs" className="flex flex-col items-center gap-1 py-3 text-xs font-medium">
          <CalendarCheck className="size-5" /> My jobs
        </Link>
        <Link href="/account" className="flex flex-col items-center gap-1 py-3 text-xs">
          <KeyRound className="size-5" /> Account
        </Link>
        <Link href="/api/session/end" className="flex flex-col items-center gap-1 py-3 text-xs">
          <LogOut className="size-5" /> Sign out
        </Link>
      </nav>
    </div>
  );
}
