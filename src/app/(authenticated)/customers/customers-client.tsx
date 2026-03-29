"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useGlassModal } from "@/components/glass-modal";
import { useConfirm } from "@/components/confirm-dialog";
import { CustomerForm } from "@/features/customers/Components/CustomerForm";
import { ImportCustomersDialog } from "@/features/customers/Components/ImportCustomersDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { deleteCustomer, deleteCustomers } from "@/features/customers/Actions/customerActions";
import { toast } from "sonner";
import {
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  company: string | null;
  notes: string | null;
  _count: { vehicles: number };
}

interface PaginatedData {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function CustomersClient({
  data,
  search,
}: {
  data: PaginatedData;
  search: string;
}) {
  const t = useTranslations("customers.list");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const modal = useGlassModal();
  const confirm = useConfirm();

  useEffect(() => {
    if (searchParams.get("create") === "true") {
      setShowForm(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("create");
      const cleanUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, [searchParams, pathname]);

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
    [router, pathname, searchParams]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      navigate({ search: searchInput || undefined });
    },
    [navigate, searchInput]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === data.customers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.customers.map((c) => c.id)));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t("deleteTitle"),
      description: t("deleteDescription", { name }),
      confirmLabel: tc("buttons.delete"),
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteCustomer(id);
    if (result.success) {
      router.refresh();
    } else {
      modal.open("error", tc("errors.error"), result.error || t("deleteError"));
    }
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: t("batchDeleteTitle"),
      description: t("batchDeleteDescription", { count: selected.size }),
      confirmLabel: tc("buttons.delete"),
      destructive: true,
    });
    if (!ok) return;
    setIsDeleting(true);
    const result = await deleteCustomers(Array.from(selected));
    if (result.success) {
      toast.success(t("batchDeleteSuccess", { count: result.data?.deleted ?? selected.size }));
      setSelected(new Set());
      router.refresh();
    } else {
      modal.open("error", tc("errors.error"), result.error || t("deleteError"));
    }
    setIsDeleting(false);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        {selected.size > 0 ? (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{t("selectedCount", { count: selected.size })}</span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                {t("clearSelection")}
              </Button>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBatchDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t("batchDelete", { count: selected.size })}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-1 items-center gap-2">
              <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("searchPlaceholder")}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </form>
              {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
                <Upload className="mr-1 h-3.5 w-3.5" />
                {t("importCustomers")}
              </Button>
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t("addCustomer")}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Table - only this scrolls */}
      <div className="overflow-auto rounded-lg border max-h-[calc(100vh-220px)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={
                    data.customers.length > 0 && selected.size === data.customers.length
                      ? true
                      : selected.size > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleSelectAll}
                  onClick={(e) => e.stopPropagation()}
                />
              </TableHead>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("table.company")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("table.phone")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("table.email")}</TableHead>
              <TableHead className="w-[80px] text-center">{t("table.vehicles")}</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {search ? t("emptySearch") : t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              data.customers.map((c) => (
                <TableRow
                  key={c.id}
                  className={`cursor-pointer ${selected.has(c.id) ? "bg-muted/50" : ""}`}
                  onClick={() => router.push(`/customers/${c.id}`)}
                >
                  <TableCell className="w-[40px]">
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {c.company || "-"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {c.phone || "-"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {c.email || "-"}
                  </TableCell>
                  <TableCell className="text-center">{c._count.vehicles}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditCustomer(c);
                            setShowForm(true);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {tc("buttons.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(c.id, c.name);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {tc("buttons.delete")}
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

      <CustomerForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditCustomer(null);
        }}
        customer={editCustomer ?? undefined}
      />

      <ImportCustomersDialog
        open={showImport}
        onOpenChange={setShowImport}
      />
    </div>
  );
}
