"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { DataTablePagination } from "@/components/data-table-pagination";
import { InventoryPartForm } from "@/features/inventory/Components/InventoryPartForm";
import { STOCK_MOVEMENT_REASONS } from "@/features/inventory/Lib/stockMovementReasons";
import { isLow as isLowStock } from "@/features/inventory/Lib/lowStockAlerts";
import { useFormatCurrency } from "@/components/currency-settings-context";
import { ArrowLeft, ArrowUpRight, Pencil } from "lucide-react";

interface Movement {
  id: string;
  delta: number;
  quantityAfter: number;
  reason: string;
  note: string | null;
  createdAt: string;
  /** Pre-formatted on the server so SSR and hydration agree. */
  createdAtLabel: string;
  userName: string | null;
  serviceRecordId: string | null;
  vehicleId: string | null;
  label: string | null;
  vehicle: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Part = any;

export function PartDetailClient({
  part,
  movements,
  total,
  page,
  pageSize,
  totalPages,
  reason,
  currencyCode,
  markupMultiplier,
  categories,
  lowStockDefault,
}: {
  part: Part;
  movements: Movement[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  reason: string;
  currencyCode: string;
  markupMultiplier: number;
  categories: string[];
  lowStockDefault: number;
}) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const formatCurrency = useFormatCurrency();
  const [showForm, setShowForm] = useState(false);

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      // Changing the filter invalidates the current page offset.
      if (!("page" in params) && "reason" in params) next.delete("page");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  // Same rule as the alert engine, so the badge never disagrees with alerts.
  const isLow = isLowStock(part, lowStockDefault);

  const reasonLabel = (value: string) => {
    switch (value) {
      case "service_record":
        return t("history.reasons.service_record");
      case "service_record_deleted":
        return t("history.reasons.service_record_deleted");
      case "quote_conversion":
        return t("history.reasons.quote_conversion");
      case "manual_adjustment":
        return t("history.reasons.manual_adjustment");
      case "bulk_markup":
        return t("history.reasons.bulk_markup");
      default:
        // A row written by a newer build may carry a reason this one has no
        // translation for; show the raw value rather than an empty cell.
        return value;
    }
  };

  return (
    <div className="space-y-6 p-4 pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-2 h-7">
            <Link href="/inventory">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              {t("history.backToInventory")}
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{part.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[part.partNumber, part.category, part.location]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          {t("actions.edit")}
        </Button>
      </div>

      {/* Summary — the context you need while reading the ledger below. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("table.inStock")}</p>
          <p className={`text-lg font-bold ${isLow ? "text-destructive" : ""}`}>
            {part.quantity}
            {isLow && (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0 text-[10px]">
                {t("table.low")}
              </Badge>
            )}
          </p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("form.minQty")}</p>
          <p className="text-lg font-bold">{part.minQuantity}</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("table.unitCost")}</p>
          <p className="text-lg font-bold">{formatCurrency(part.unitCost, currencyCode)}</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("table.sellPrice")}</p>
          <p className="text-lg font-bold">{formatCurrency(part.sellPrice, currencyCode)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{t("history.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("history.description", { name: part.name })}
            </p>
          </div>
          <Select
            value={reason || "all"}
            onValueChange={(v) => navigate({ reason: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("history.allReasons")}</SelectItem>
              {STOCK_MOVEMENT_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {reasonLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("history.when")}</TableHead>
                <TableHead>{t("history.change")}</TableHead>
                <TableHead>{t("history.balance")}</TableHead>
                <TableHead>{t("history.usedOn")}</TableHead>
                <TableHead>{t("history.reason")}</TableHead>
                <TableHead>{t("history.by")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    {t("history.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {m.createdAtLabel}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          m.delta < 0
                            ? "border-destructive/40 text-destructive"
                            : "border-green-500/40 text-green-600"
                        }
                      >
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{m.quantityAfter}</TableCell>
                    <TableCell>
                      {m.serviceRecordId && m.vehicleId ? (
                        <Link
                          href={`/vehicles/${m.vehicleId}/service/${m.serviceRecordId}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {m.label}
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{m.label ?? "—"}</span>
                      )}
                      {m.vehicle && (
                        <span className="block text-xs text-muted-foreground">{m.vehicle}</span>
                      )}
                      {m.note && (
                        <span className="block text-xs text-muted-foreground">{m.note}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {reasonLabel(m.reason)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.userName ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DataTablePagination
          total={total}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          onNavigate={navigate}
        />
      </div>

      {/* Same form the list uses for quick edits — one component, two places. */}
      <InventoryPartForm
        key={part.id}
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) router.refresh();
        }}
        part={part}
        markupMultiplier={markupMultiplier}
        categories={categories}
      />
    </div>
  );
}
