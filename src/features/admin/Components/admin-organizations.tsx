"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTablePagination } from "@/components/data-table-pagination";
import { Loader2, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { deleteOrganization } from "../Actions/deleteOrganization";

type OrgRow = {
  id: string;
  name: string;
  createdAt: string;
  memberCount: number;
  ownerName: string;
  ownerEmail: string;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
};

type PaginatedData = {
  organizations: OrgRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function AdminOrganizations({
  data,
  search,
}: {
  data: PaginatedData;
  search: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      }
      if (!("page" in params) && "search" in params) {
        newParams.delete("page");
      }
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      navigate({ search: searchInput || undefined });
    },
    [navigate, searchInput],
  );

  const handleDelete = async (org: OrgRow) => {
    const confirmed = await confirm({
      title: "Delete Organization",
      description: `Are you sure you want to permanently delete "${org.name}" and all its data? This action cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });

    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteOrganization({ organizationId: org.id });
      if (result.success) {
        toast.success("Organization deleted successfully");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to delete organization");
      }
    });
  };

  const statusVariant = (status: string | null) => {
    switch (status) {
      case "active":
        return "default" as const;
      case "trialing":
        return "secondary" as const;
      case "past_due":
        return "destructive" as const;
      case "canceled":
        return "outline" as const;
      default:
        return "secondary" as const;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by organization name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </form>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-center">Members</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.organizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {search ? "No organizations match your search." : "No organizations found."}
                </TableCell>
              </TableRow>
            ) : (
              data.organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{org.ownerName}</p>
                      <p className="text-xs text-muted-foreground">{org.ownerEmail}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{org.memberCount}</TableCell>
                  <TableCell>
                    {org.subscriptionStatus ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusVariant(org.subscriptionStatus)}>
                          {org.subscriptionStatus}
                        </Badge>
                        {org.subscriptionPlan && (
                          <span className="text-xs text-muted-foreground">
                            {org.subscriptionPlan}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(org.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isPending}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDelete(org)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Organization
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        onNavigate={navigate}
      />
    </div>
  );
}
