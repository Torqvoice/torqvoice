"use client";

import { memo, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, Plus, Trash2 } from "lucide-react";
import { useFormatCurrency } from '@/components/currency-settings-context'
import { InventoryPickerDialog } from "@/features/vehicles/Components/service-edit/InventoryPickerDialog";
import type { InventoryPartOption } from "@/features/vehicles/Components/service-edit/form-types";
import type { QuotePartInput } from "./quote-page-types";
import {
  PartNameSuggestions,
  type PartSuggestion,
} from "@/features/inventory/Components/PartNameSuggestions";
import { resolvePartPrice } from "@/features/inventory/Lib/partPricing";

const QuotePartRow = memo(function QuotePartRow({
  part,
  index,
  currencyCode,
  onUpdate,
  onDelete,
  tPartNumber,
  tNamePlaceholder,
  tDeleteRow,
  tExcludeFromTotal,
  inventoryParts,
  onSelectSuggestion,
}: {
  part: QuotePartInput;
  index: number;
  currencyCode: string;
  onUpdate: (index: number, field: keyof QuotePartInput, value: string | number | boolean) => void;
  onDelete: (index: number) => void;
  inventoryParts: PartSuggestion[];
  onSelectSuggestion: (index: number, part: PartSuggestion) => void;
  tPartNumber: string;
  tNamePlaceholder: string;
  tDeleteRow: string;
  tExcludeFromTotal: string;
}) {
  const formatCurrency = useFormatCurrency();
  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto] ${part.excluded ? "line-through opacity-50" : ""}`}>
      <Input placeholder={tPartNumber} value={part.partNumber ?? ""} onChange={(e) => onUpdate(index, "partNumber", e.target.value)} />
      <div className="relative">
        <Input placeholder={tNamePlaceholder} value={part.name} onChange={(e) => onUpdate(index, "name", e.target.value)} />
        <PartNameSuggestions
          query={part.name}
          parts={inventoryParts}
          disabled={!!part.inventoryPartId}
          currencyCode={currencyCode}
          onSelect={(picked) => onSelectSuggestion(index, picked)}
        />
      </div>
      <Input type="number" min="0" step="1" value={part.quantity} onChange={(e) => onUpdate(index, "quantity", e.target.value)} />
      <Input type="number" min="0" step="0.01" value={part.unitPrice} onChange={(e) => onUpdate(index, "unitPrice", e.target.value)} />
      <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">{formatCurrency(part.total, currencyCode)}</div>
      <div className="flex items-center gap-1">
        <input type="checkbox" checked={part.excluded ?? false} onChange={(e) => onUpdate(index, "excluded", e.target.checked)} className="h-4 w-4 rounded border-gray-300" title={tExcludeFromTotal} aria-label={tExcludeFromTotal} />
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => onDelete(index)} aria-label={tDeleteRow}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
});

interface QuotePartsEditorProps {
  partItems: QuotePartInput[];
  currencyCode: string;
  partsSubtotal: number;
  onUpdate: (index: number, field: keyof QuotePartInput, value: string | number | boolean) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  onAddBulk?: (items: QuotePartInput[]) => void;
  inventoryParts?: InventoryPartOption[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: any) => string;
}

export const QuotePartsEditor = memo(function QuotePartsEditor({
  partItems,
  currencyCode,
  partsSubtotal,
  onUpdate,
  onDelete,
  onAdd,
  onAddBulk,
  inventoryParts = [],
  t,
}: QuotePartsEditorProps) {
  const formatCurrency = useFormatCurrency()
  const [pickerOpen, setPickerOpen] = useState(false)
  const canPickFromStock = inventoryParts.length > 0 && !!onAddBulk

  // Applying a suggestion touches five fields. onUpdate handles one at a time,
  // so call it per field rather than leaving the row half-populated; the
  // inventory link is what makes the job deduct stock on conversion.
  const handleSelectSuggestion = useCallback(
    (index: number, picked: PartSuggestion) => {
      const current = partItems[index]
      const quantity = current?.quantity || 1
      // Quotes carry no cost/markup model, so this resolves to the part's sell
      // price, falling back to cost rather than billing at zero.
      const { unitPrice } = resolvePartPrice(picked)
      onUpdate(index, "name", picked.name)
      onUpdate(index, "partNumber", picked.partNumber ?? "")
      onUpdate(index, "unitPrice", unitPrice)
      onUpdate(index, "total", quantity * unitPrice)
      onUpdate(index, "inventoryPartId", picked.id)
    },
    [onUpdate, partItems],
  )

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("parts.title")}</h3>
        <div className="flex items-center gap-2">
          {canPickFromStock && (
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <Package className="mr-1 h-3.5 w-3.5" /> {t("parts.addFromInventory")}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" /> {t("parts.addPart")}
          </Button>
        </div>
      </div>
      {partItems.length > 0 && (
        <>
          <div className="hidden grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>{t("parts.partNumber")}</span><span>{t("parts.name")}</span><span>{t("parts.qty")}</span><span>{t("parts.unitPrice")}</span><span>{t("parts.total")}</span><span />
          </div>
          {partItems.map((part, i) => (
            <QuotePartRow
              key={i}
              part={part}
              index={i}
              currencyCode={currencyCode}
              onUpdate={onUpdate}
              onDelete={onDelete}
              inventoryParts={inventoryParts}
              onSelectSuggestion={handleSelectSuggestion}
              tPartNumber={t("parts.partNumber")}
              tNamePlaceholder={t("parts.namePlaceholder")}
              tDeleteRow={t("parts.deleteRow")}
              tExcludeFromTotal={t("parts.excludeFromTotal")}
            />
          ))}
          <button type="button" className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={onAdd}><Plus className="h-4 w-4" /></button>
          <div className="flex justify-end pt-1 text-sm"><span className="font-medium">{t("parts.subtotal", { amount: formatCurrency(partsSubtotal, currencyCode) })}</span></div>
        </>
      )}
      {canPickFromStock && (
        <InventoryPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          inventoryParts={inventoryParts}
          currencyCode={currencyCode}
          onSelectPart={(picked) => {
            onAddBulk?.([
              {
                partNumber: picked.partNumber ?? "",
                name: picked.name,
                quantity: picked.quantity,
                unitPrice: picked.unitPrice,
                total: picked.quantity * picked.unitPrice,
                excluded: false,
                inventoryPartId: picked.inventoryPartId ?? null,
              },
            ])
          }}
        />
      )}
      {partItems.length === 0 && (
        <button type="button" className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" /><span className="text-sm">{t("parts.addPart")}</span>
        </button>
      )}
    </div>
  );
});
