"use client";

import { useState, useCallback, useTransition } from "react";
import { BarcodeScannerDialog } from '@/components/barcode-scanner-dialog';
import { BarcodeScanActionDialog } from '@/features/inventory/Components/BarcodeScanActionDialog';
import { useHardwareScanner } from '@/hooks/use-hardware-scanner';
import { lookupPartByBarcode } from '@/features/inventory/Actions/lookupPartByBarcode';
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
  ChevronLeft,
  ChevronRight,
  Plus,
  ScanBarcode,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface InventoryPart {
  id: string;
  partNumber: string | null;
  barcode: string | null;
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
  gallery: { id: string; url: string; fileName: string | null; description: string | null; sortOrder: number }[];
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
  const [showScanner, setShowScanner] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [scannedPart, setScannedPart] = useState<{
    id: string;
    name: string;
    partNumber: string | null;
    barcode: string | null;
    quantity: number;
    category: string | null;
  } | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [showScanActions, setShowScanActions] = useState(false);
  const modal = useGlassModal();
  const confirm = useConfirm();

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const result = await lookupPartByBarcode(barcode);
    setScannedBarcode(barcode);
    if (result.success && result.data) {
      setScannedPart(result.data);
    } else {
      setScannedPart(null);
    }
    setShowScanActions(true);
  }, []);

  useHardwareScanner({ onScan: handleBarcodeScan });

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
            <SelectTrigger className="w-[120px] sm:w-[150px]">
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
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowScanner(true)}>
            <ScanBarcode className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">{t('scanBarcode')}</span>
          </Button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowMarkup(true)}>
              <Percent className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t('applyMarkup')}</span>
            </Button>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t('addPart')}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.partNumber')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('table.barcode')}</TableHead>
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
                <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
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
                    <TableCell className="hidden lg:table-cell">
                      {part.barcode ? (
                        <span className="font-mono text-sm">{part.barcode}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {(part.gallery[0]?.url || part.imageUrl) && (
                          <img
                            src={part.gallery[0]?.url || part.imageUrl!}
                            alt={part.name}
                            className="h-8 w-8 cursor-pointer rounded object-cover hover:opacity-80"
                            onClick={(e) => {
                              e.stopPropagation();
                              const imgs = part.gallery.length > 0
                                ? part.gallery.map(g => g.url)
                                : part.imageUrl ? [part.imageUrl] : [];
                              if (imgs.length === 0) return;
                              setGalleryImages(imgs);
                              setGalleryIndex(0);
                            }}
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
        key={editPart?.id ?? scannedBarcode ?? 'new'}
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) {
            setEditPart(null);
            setScannedBarcode('');
          }
        }}
        part={editPart ?? undefined}
        markupMultiplier={initialMarkup}
        initialBarcode={!editPart ? scannedBarcode : undefined}
        onViewImages={(urls, startIndex) => {
          setGalleryImages(urls);
          setGalleryIndex(startIndex);
        }}
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

      <BarcodeScannerDialog
        open={showScanner}
        onOpenChange={setShowScanner}
        onScan={handleBarcodeScan}
        title={t('scanBarcode')}
      />

      <BarcodeScanActionDialog
        open={showScanActions}
        onOpenChange={setShowScanActions}
        part={scannedPart}
        barcode={scannedBarcode}
        onEditPart={(partId) => {
          const part = data.parts.find((p) => p.id === partId);
          if (part) {
            setEditPart(part);
            setShowForm(true);
          }
        }}
        onCreatePart={(barcode) => {
          setEditPart(null);
          setScannedBarcode(barcode);
          setShowForm(true);
        }}
      />

      {galleryIndex !== null && galleryImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setGalleryIndex(null)}
        >
          <button
            type="button"
            onClick={() => setGalleryIndex(null)}
            className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <X className="h-5 w-5" />
          </button>
          {galleryImages.length > 1 && (
            <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white">
              {galleryIndex + 1} / {galleryImages.length}
            </div>
          )}
          {galleryIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setGalleryIndex(galleryIndex - 1); }}
              className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 sm:left-4 sm:h-12 sm:w-12"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {galleryIndex < galleryImages.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setGalleryIndex(galleryIndex + 1); }}
              className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 sm:right-4 sm:h-12 sm:w-12"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
          <img
            src={galleryImages[galleryIndex]}
            alt={`Image ${galleryIndex + 1}`}
            className="max-h-[85vh] max-w-[90vw] object-contain"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
