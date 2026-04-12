"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Plus, Search, Trash2 } from "lucide-react";
import { InventorySearchDialog, type InventoryPartOption } from "./InventorySearchDialog";

export interface PresetPartItem {
  name: string;
  partNumber: string;
  quantity: number;
  unitPrice: number;
  inventoryPartId: string;
}

interface PresetPartsEditorProps {
  parts: PresetPartItem[];
  onPartsChange: (parts: PresetPartItem[]) => void;
  inventoryParts?: InventoryPartOption[];
  currencyCode?: string;
}

export function PresetPartsEditor({
  parts,
  onPartsChange,
  inventoryParts,
}: PresetPartsEditorProps) {
  const t = useTranslations("laborPresets");
  const [pickerOpen, setPickerOpen] = useState(false);

  const updatePart = (index: number, field: keyof PresetPartItem, value: string | number) => {
    const updated = [...parts];
    updated[index] = { ...updated[index], [field]: value };
    onPartsChange(updated);
  };

  const addPart = () => {
    onPartsChange([...parts, { name: "", partNumber: "", quantity: 1, unitPrice: 0, inventoryPartId: "" }]);
  };

  const removePart = (index: number) => {
    onPartsChange(parts.filter((_, i) => i !== index));
  };

  const handleInventorySelect = (ip: InventoryPartOption) => {
    const price = ip.sellPrice > 0 ? ip.sellPrice : ip.unitCost;
    onPartsChange([
      ...parts,
      { name: ip.name, partNumber: ip.partNumber || "", quantity: 1, unitPrice: price, inventoryPartId: ip.id },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5" />
          {t("form.partsTitle")}
        </Label>
        <div className="flex gap-1.5">
          {inventoryParts && inventoryParts.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <Search className="mr-1 h-3.5 w-3.5" />
              {t("form.importFromInventory")}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={addPart}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("form.addPart")}
          </Button>
        </div>
      </div>

      {parts.length > 0 && (
        <>
          <div className="hidden grid-cols-[2fr_1fr_0.5fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>{t("form.partName")}</span>
            <span>{t("form.partNumber")}</span>
            <span>{t("form.partQty")}</span>
            <span>{t("form.partPrice")}</span>
            <span />
          </div>

          {parts.map((part, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_0.5fr_1fr_auto]">
              <Input
                placeholder={t("form.partName")}
                value={part.name}
                onChange={(e) => updatePart(i, "name", e.target.value)}
                className="col-span-2 sm:col-span-1"
              />
              <Input
                placeholder={t("form.partNumber")}
                value={part.partNumber}
                onChange={(e) => updatePart(i, "partNumber", e.target.value)}
              />
              <Input
                type="number"
                min="0"
                step="1"
                placeholder={t("form.partQty")}
                value={part.quantity}
                onChange={(e) => updatePart(i, "quantity", e.target.value)}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder={t("form.partPrice")}
                value={part.unitPrice}
                onChange={(e) => updatePart(i, "unitPrice", e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => removePart(i)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </>
      )}

      <button
        type="button"
        className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
        onClick={addPart}
      >
        <Plus className="h-4 w-4" />
      </button>

      {inventoryParts && (
        <InventorySearchDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          inventoryParts={inventoryParts}
          onSelect={handleInventorySelect}
        />
      )}
    </div>
  );
}
