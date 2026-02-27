"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
  lastSeen: string | null;
  organizationCount: number;
};

function OnlineDot({ lastSeen }: { lastSeen: string | null }) {
  if (!lastSeen) return null;
  const isOnline = Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  if (!isOnline) return null;
  return (
    <span className="relative flex h-2 w-2" title="Online">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
    </span>
  );
}

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
  const t = useTranslations("admin");
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
      title: action === "promote" ? t("users.promoteTitle") : t("users.demoteTitle"),
      description: action === "promote" ? t("users.promoteConfirm", { name: user.name }) : t("users.demoteConfirm", { name: user.name }),
      confirmLabel: action === "promote" ? t("users.promote") : t("users.demote"),
      destructive: action === "demote",
    });

    if (!confirmed) return;

    startTransition(async () => {
      const result = await toggleSuperAdmin({
        userId: user.id,
        isSuperAdmin: !user.isSuperAdmin,
      });

      if (result.success) {
        toast.success(action === "promote" ? t("users.promotedSuccess") : t("users.demotedSuccess"));
        router.refresh();
      } else {
        toast.error(result.error ?? t("users.failedUpdate"));
      }
    });
  };

  const handleDeleteUser = async (user: UserRow) => {
    const confirmed = await confirm({
      title: t("users.deleteTitle"),
      description: t("users.deleteConfirm", { name: user.name, email: user.email }),
      confirmLabel: t("users.delete"),
      destructive: true,
    });

    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteUser({ userId: user.id });
      if (result.success) {
        toast.success(t("users.deletedSuccess"));
        router.refresh();
      } else {
        toast.error(result.error ?? t("users.failedDelete"));
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("users.searchPlaceholder")}
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
              <TableHead>{t("users.name")}</TableHead>
              <TableHead>{t("users.email")}</TableHead>
              <TableHead>{t("users.role")}</TableHead>
              <TableHead className="text-center">{t("users.orgs")}</TableHead>
              <TableHead>{t("users.created")}</TableHead>
              <TableHead>{t("users.lastSeen")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {search ? t("users.noResults") : t("users.noUsers")}
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
                        {t("users.superAdmin")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t("users.user")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{user.organizationCount}</TableCell>
                  <TableCell>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {user.lastSeen && Date.now() - new Date(user.lastSeen).getTime() < 5 * 60 * 1000 ? (
                      <span className="flex items-center gap-1.5">
                        <OnlineDot lastSeen={user.lastSeen} />
                        <span className="text-sm text-green-600 dark:text-green-400">{t("users.online")}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {user.lastSeen ? new Date(user.lastSeen).toLocaleString() : "—"}
                      </span>
                    )}
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
                              {t("users.demoteFromSuperAdmin")}
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              {t("users.promoteToSuperAdmin")}
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteUser(user)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("users.deleteUser")}
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
