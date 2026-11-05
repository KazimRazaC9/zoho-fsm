import type { Metadata } from "next";
import { format } from "date-fns";
import { CompanyStatusButton, NewCompanyButton } from "./companies-client";
import { SearchInput } from "@/components/data-table/search-input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { companiesService } from "@/modules/companies";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { search } = await searchParams;
  const user = await requireUser();
  requireRole(user, ["SUPER_ADMIN"]);
  const companies = await companiesService.list(dbFor(user), user, search?.trim() || undefined);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-muted-foreground text-sm">
            Every tenant on the platform. Disabling one signs out all its users.
          </p>
        </div>
        <NewCompanyButton />
      </div>

      <SearchInput placeholder="Search companies" />

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead className="hidden md:table-cell">Admins</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead className="hidden lg:table-cell">Region</TableHead>
              <TableHead className="hidden sm:table-cell">Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                  No companies found.
                </TableCell>
              </TableRow>
            )}
            {companies.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="font-medium">{c.name}</p>
                  {c.email && <p className="text-muted-foreground text-xs">{c.email}</p>}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                  {c.adminEmails.join(", ") || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.userCount}</TableCell>
                <TableCell className="text-muted-foreground hidden text-sm lg:table-cell">
                  {c.timeZone} · {c.currency} · {c.taxPercent}% tax
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                  {format(new Date(c.createdAt), "dd MMM yyyy")}
                </TableCell>
                <TableCell>
                  <Badge variant={c.isActive ? "outline" : "destructive"}>{c.isActive ? "Active" : "Disabled"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <CompanyStatusButton company={c} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
