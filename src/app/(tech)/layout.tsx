import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, KeyRound, LogOut, Wrench } from "lucide-react";
import { auth } from "@/auth";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/modules/auth/auth.actions";

/** Technician field app frame: mobile-first header + bottom navigation (PWA in Phase 5). */
export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Live account check: a deactivated technician is signed out right away.
  if (!(await getCurrentUser())) redirect("/api/session/end");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background/95 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
        <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
          <Wrench className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{session.user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{session.user.companyName}</p>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 p-4 pb-24">{children}</main>

      <nav className="bg-background fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t" aria-label="Field app">
        <Link href="/my-jobs" className="flex flex-col items-center gap-1 py-3 text-xs font-medium">
          <CalendarCheck className="size-5" /> My jobs
        </Link>
        <Link href="/account" className="flex flex-col items-center gap-1 py-3 text-xs">
          <KeyRound className="size-5" /> Account
        </Link>
        <form action={logoutAction} className="contents">
          <button type="submit" className="flex flex-col items-center gap-1 py-3 text-xs">
            <LogOut className="size-5" /> Sign out
          </button>
        </form>
      </nav>
    </div>
  );
}
