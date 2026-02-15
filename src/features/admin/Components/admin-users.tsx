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
import { Loader2, MoreHorizontal, Search, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { toggleSuperAdmin } from "../Actions/toggleSuperAdmin";
import { deleteUser } from "../Actions/deleteUser";

type UserRow = {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  createdAt: string;
  organizationCount: number;
};

type PaginatedData = {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function AdminUsers({
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

  const handleToggleSuperAdmin = async (user: UserRow) => {
    const action = user.isSuperAdmin ? "demote" : "promote";
    const confirmed = await confirm({
      title: `${action === "promote" ? "Promote" : "Demote"} User`,
      description: `Are you sure you want to ${action} "${user.name}" ${action === "promote" ? "to" : "from"} super admin?`,
      confirmLabel: action === "promote" ? "Promote" : "Demote",
      destructive: action === "demote",
    });

    if (!confirmed) return;

    startTransition(async () => {
      const result = await toggleSuperAdmin({
        userId: user.id,
        isSuperAdmin: !user.isSuperAdmin,
      });

      if (result.success) {
        toast.success(`User ${action}d successfully`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to update user");
      }
    });
  };

  const handleDeleteUser = async (user: UserRow) => {
    const confirmed = await confirm({
      title: "Delete User",
      description: `Are you sure you want to permanently delete "${user.name}" (${user.email})? This action cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });

    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteUser({ userId: user.id });
      if (result.success) {
        toast.success("User deleted successfully");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to delete user");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
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
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-center">Orgs</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {search ? "No users match your search." : "No users found."}
                </TableCell>
              </TableRow>
            ) : (
              data.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {user.isSuperAdmin ? (
                      <Badge variant="default" className="gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        Super Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary">User</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{user.organizationCount}</TableCell>
                  <TableCell>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isPending}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleToggleSuperAdmin(user)}>
                          {user.isSuperAdmin ? (
                            <>
                              <ShieldOff className="mr-2 h-4 w-4" />
                              Demote from Super Admin
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Promote to Super Admin
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteUser(user)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete User
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
