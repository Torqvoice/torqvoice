"use client";

import { useState, useCallback, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
import { LaborPresetForm } from "@/features/labor-presets/Components/LaborPresetForm";
import { deleteLaborPreset, getLaborPreset } from "@/features/labor-presets/Actions/laborPresetActions";
import { Loader2, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";

interface LaborPresetRow {
  id: string;
  name: string;
  description: string | null;
  _count: { items: number };
}

interface PaginatedData {
  presets: LaborPresetRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function LaborPresetsClient({
  data,
  search,
  currencyCode = "USD",
  defaultLaborRate = 0,
}: {
  data: PaginatedData;
  search: string;
  currencyCode?: string;
  defaultLaborRate?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("laborPresets");
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);
  const [showForm, setShowForm] = useState(false);
  const [editPreset, setEditPreset] = useState<{
    id: string;
    name: string;
    description: string | null;
    items: { description: string; hours: number; rate: number; sortOrder: number }[];
  } | null>(null);
  const modal = useGlassModal();
  const confirm = useConfirm();

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

  const handleEdit = async (id: string) => {
    const result = await getLaborPreset(id);
    if (result.success && result.data) {
      setEditPreset(result.data);
      setShowForm(true);
    } else {
      modal.open("error", t("errors.error"), result.error || t("errors.loadFailed"));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t("deletePreset.title"),
      description: t("deletePreset.description", { name }),
      confirmLabel: t("deletePreset.confirm"),
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteLaborPreset(id);
    if (result.success) {
      router.refresh();
    } else {
      modal.open("error", t("errors.error"), result.error || t("errors.deleteFailed"));
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
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
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("addPackage")}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("table.description")}</TableHead>
              <TableHead>{t("table.itemCount")}</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.presets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  {search ? t("empty.noMatch") : t("empty.noPresets")}
                </TableCell>
              </TableRow>
            ) : (
              data.presets.map((preset) => (
                <TableRow
                  key={preset.id}
                  className="cursor-pointer"
                  onClick={() => handleEdit(preset.id)}
                >
                  <TableCell className="font-medium">{preset.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {preset.description || "-"}
                  </TableCell>
                  <TableCell>{preset._count.items}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(preset.id)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {t("actions.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(preset.id, preset.name)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("actions.delete")}
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

      <LaborPresetForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditPreset(null);
        }}
        preset={editPreset ?? undefined}
        defaultLaborRate={defaultLaborRate}
      />
    </div>
  );
}
