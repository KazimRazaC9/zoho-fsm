"use client";

import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import type { AppPermission } from "@/lib/permissions";

export type MenuUser = {
  name: string;
  email: string;
  role: AppRole;
  customRoleId: string | null;
  customRoleName: string | null;
  permissions: AppPermission[];
  companyName: string | null;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

export function UserMenu({ user }: { user: MenuUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2" aria-label="Account menu">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs font-normal">{user.email}</p>
          <p className="text-muted-foreground text-xs font-normal">
            {user.customRoleName ?? ROLE_LABEL[user.role]}
            {user.companyName ? ` · ${user.companyName}` : ""}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <KeyRound /> Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          {/* A plain anchor on purpose: next/link would prefetch this URL and sign the user out as the menu opens. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/session/end">
            <LogOut /> Sign out
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
