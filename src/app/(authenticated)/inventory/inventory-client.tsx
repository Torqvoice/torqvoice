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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { DataTablePagination } from "@/components/data-table-pagination";
import { useGlassModal } from "@/components/glass-modal";
import { useConfirm } from "@/components/confirm-dialog";
import { InventoryPartForm } from "@/features/inventory/Components/InventoryPartForm";
import { deleteInventoryPart, applyMarkupToAll } from "@/features/inventory/Actions/inventoryActions";
import { setSetting } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import {
  Dialog as MarkupDialog,
  DialogContent as MarkupDialogContent,
  DialogHeader as MarkupDialogHeader,
  DialogTitle as MarkupDialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ExternalLink,
  Loader2,
  MoreVertical,
  Pencil,
  Percent,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface InventoryPart {
  id: string;
  partNumber: string | null;
  name: string;
  description: string | null;
  category: string | null;
  quantity: number;
  minQuantity: number;
  unitCost: number;
  sellPrice: number;
  supplier: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  supplierUrl: string | null;
  imageUrl: string | null;
  location: string | null;
}

interface PaginatedData {
  parts: InventoryPart[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function InventoryClient({
  data,
  search,
  category,
  categories,
  currencyCode = "USD",
  markupMultiplier: initialMarkup = 1.0,
}: {
  data: PaginatedData;
  search: string;
  category: string;
  categories: string[];
  currencyCode?: string;
  markupMultiplier?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('inventory');
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);
  const [showForm, setShowForm] = useState(false);
  const [editPart, setEditPart] = useState<InventoryPart | null>(null);
  const [showMarkup, setShowMarkup] = useState(false);
  const [markupValue, setMarkupValue] = useState(String(initialMarkup));
  const [applyingMarkup, setApplyingMarkup] = useState(false);
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
      if (!("page" in params) && ("search" in params || "category" in params)) {
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

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('deletePart.title'),
      description: t('deletePart.description', { name }),
      confirmLabel: t('deletePart.confirm'),
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteInventoryPart(id);
    if (result.success) {
      router.refresh();
    } else {
      modal.open("error", t('errors.error'), result.error || t('errors.deleteFailed'));
    }
  };

  const handleApplyMarkup = async () => {
    const multiplier = Number(markupValue);
    if (!multiplier || multiplier <= 0) {
      modal.open("error", t('errors.error'), t('errors.multiplierPositive'));
      return;
    }
    setApplyingMarkup(true);
    try {
      const [result] = await Promise.all([
        applyMarkupToAll({ multiplier }),
        setSetting(SETTING_KEYS.INVENTORY_MARKUP_MULTIPLIER, String(multiplier)),
      ]);
      if (result.success) {
        setShowMarkup(false);
        router.refresh();
      } else {
        modal.open("error", t('errors.error'), result.error || t('errors.applyFailed'));
      }
    } catch {
      modal.open("error", t('errors.error'), t('errors.applyFailed'));
    } finally {
      setApplyingMarkup(false);
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
              placeholder={t('searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </form>
          <Select
            value={category || "all"}
            onValueChange={(v) => navigate({ category: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={t('categoryPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allCategories')}</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowMarkup(true)}>
            <Percent className="mr-1 h-3.5 w-3.5" />
            {t('applyMarkup')}
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('addPart')}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.partNumber')}</TableHead>
              <TableHead>{t('table.name')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('table.category')}</TableHead>
              <TableHead>{t('table.inStock')}</TableHead>
              <TableHead className="text-right">{t('table.unitCost')}</TableHead>
              <TableHead className="text-right">{t('table.sellPrice')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('table.supplier')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('table.location')}</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.parts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  {search || category ? t('empty.noMatch') : t('empty.noParts')}
                </TableCell>
              </TableRow>
            ) : (
              data.parts.map((part) => {
                const isLow = part.minQuantity > 0 && part.quantity <= part.minQuantity;
                return (
                  <TableRow
                    key={part.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setEditPart(part);
                      setShowForm(true);
                    }}
                  >
                    <TableCell>
                      {part.partNumber ? (
                        <span className="font-mono text-sm">{part.partNumber}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {part.imageUrl && (
                          <img
                            src={part.imageUrl}
                            alt={part.name}
                            className="h-8 w-8 rounded object-cover"
                          />
                        )}
                        {part.name}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {part.category || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{part.quantity}</span>
                        {isLow && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            {t('table.low')}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(part.unitCost, currencyCode)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const effective = part.sellPrice > 0 ? part.sellPrice : part.unitCost;
                        const margin = effective > 0 && part.unitCost > 0 && effective !== part.unitCost
                          ? Math.round(((effective - part.unitCost) / part.unitCost) * 100)
                          : null;
                        return (
                          <div>
                            {formatCurrency(effective, currencyCode)}
                            {margin !== null && (
                              <span className="block text-[10px] text-muted-foreground">
                                {margin}%
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {part.supplier || "-"}
                        {part.supplierUrl && (
                          <a
                            href={part.supplierUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {part.location || "-"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditPart(part);
                              setShowForm(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('actions.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(part.id, part.name)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('actions.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
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

      <InventoryPartForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditPart(null);
        }}
        part={editPart ?? undefined}
        markupMultiplier={initialMarkup}
      />

      {/* Bulk Markup Dialog */}
      <MarkupDialog open={showMarkup} onOpenChange={setShowMarkup}>
        <MarkupDialogContent className="sm:max-w-sm">
          <MarkupDialogHeader>
            <MarkupDialogTitle>{t('markup.title')}</MarkupDialogTitle>
          </MarkupDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="markupMultiplier">{t('markup.multiplierLabel')}</Label>
              <Input
                id="markupMultiplier"
                type="number"
                min="0.01"
                step="0.01"
                value={markupValue}
                onChange={(e) => setMarkupValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('markup.description', { multiplier: markupValue || "?", count: data.total })}
                {Number(markupValue) > 1 && ` ${t('markup.percentage', { percent: Math.round((Number(markupValue) - 1) * 100) })}`}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowMarkup(false)}>
                {t('markup.cancel')}
              </Button>
              <Button size="sm" onClick={handleApplyMarkup} disabled={applyingMarkup}>
                {applyingMarkup && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('markup.apply')}
              </Button>
            </div>
          </div>
        </MarkupDialogContent>
      </MarkupDialog>
    </div>
  );
}
