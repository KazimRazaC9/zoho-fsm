import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import { AddUserButton, UserRowActions } from "./users-client";
import { Pagination } from "@/components/data-table/pagination";
import { SearchInput } from "@/components/data-table/search-input";
import { UrlSelect } from "@/components/data-table/url-select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { companiesService } from "@/modules/companies";
import { STAFF_ROLES, userListQuerySchema, usersService } from "@/modules/users";
import { rolesService } from "@/modules/roles";

export const metadata: Metadata = { title: "Users & technicians" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  requireRole(user, ["ADMIN"]);
  requirePagePermission(user, "/users");
  const db = dbFor(user);

  const q = userListQuerySchema.parse(sp);
  const [result, company, customRoles] = await Promise.all([
    usersService.list(db, q),
    companiesService.getSettings(db, user),
    rolesService.list(db),
  ]);
  const availableRoles = customRoles.map(({ id, name, baseRole }) => ({ id, name, baseRole }));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users & technicians</h1>
          <p className="text-muted-foreground text-sm">Staff who can sign in to {company.name}.</p>
        </div>
        <AddUserButton currency={company.currency} customRoles={availableRoles} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search name, email, phone" />
        <UrlSelect
          param="role"
          label="Role"
          allLabel="All roles"
          options={STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
        />
        <UrlSelect
          param="status"
          label="Status"
          allLabel="Any status"
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden lg:table-cell">Skills / hours</TableHead>
              <TableHead className="hidden sm:table-cell">Last sign-in</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                  No users match these filters.
                </TableCell>
              </TableRow>
            )}
            {result.items.map((u) => (
              <TableRow key={u.id} className={u.isActive ? undefined : "opacity-60"}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {u.technicianProfile && (
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: u.technicianProfile.color }}
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {u.fullName}
                        {u.id === user.id && <span className="text-muted-foreground font-normal"> (you)</span>}
                      </p>
                      <p className="text-muted-foreground truncate text-xs md:hidden">{u.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                    {u.customRoleName ?? ROLE_LABEL[u.role]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm lg:table-cell">
                  {u.technicianProfile
                    ? `${u.technicianProfile.skills.join(", ") || "—"} · ${u.technicianProfile.workStart}–${u.technicianProfile.workEnd}`
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                  {u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true }) : "Never"}
                </TableCell>
                <TableCell>
                  <Badge variant={u.isActive ? "outline" : "destructive"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <UserRowActions
                    user={u}
                    currency={company.currency}
                    customRoles={availableRoles}
                    isSelf={u.id === user.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Pagination
        page={q.page}
        pageSize={q.pageSize}
        totalCount={result.totalCount}
        basePath="/users"
        searchParams={sp}
      />
    </div>
  );
}
