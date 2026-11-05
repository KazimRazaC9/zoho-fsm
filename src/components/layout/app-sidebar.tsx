"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { NAV_ICONS } from "./nav-icons";
import { Button } from "@/components/ui/button";
import { navFor, type NavItem } from "@/lib/nav";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "fieldserve.sidebar.collapsed";

export function AppSidebar({
  role,
  mobileOpen,
  onNavigate,
}: {
  role: AppRole;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* storage unavailable: keep expanded */
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const groups = navFor(role).reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  return (
    <aside
      className={cn(
        "bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 z-40 flex flex-col border-r transition-[width,transform] duration-200 md:static md:translate-x-0",
        collapsed ? "md:w-16" : "md:w-64",
        mobileOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full",
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
          <Wrench className="size-4" />
        </div>
        {!collapsed && <span className="font-semibold">FieldServe</span>}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2" aria-label="Main">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="space-y-1">
            {!collapsed && (
              <p className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">{group}</p>
            )}
            {items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 rounded-md px-2 py-2 text-sm",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                    collapsed && "md:justify-center",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className={cn(collapsed && "md:hidden")}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="hidden border-t p-2 md:block">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-3" onClick={toggle}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && "Collapse"}
        </Button>
      </div>
    </aside>
  );
}
