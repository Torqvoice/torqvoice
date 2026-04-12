"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGlassModal } from "@/components/glass-modal";
import { createLaborPreset, updateLaborPreset } from "../Actions/laborPresetActions";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { PresetPartsEditor } from "./PresetPartsEditor";
import type { PresetPartItem } from "./PresetPartsEditor";

type PricingType = "hourly" | "service";

interface PresetItem {
  description: string;
  hours: number;
  rate: number;
  pricingType: PricingType;
}

interface SingleItem {
  name: string;
  description: string;
  hours: number;
  rate: number;
  pricingType: PricingType;
}

interface LaborPresetData {
  id: string;
  name: string;
  description: string | null;
  items: { description: string; hours: number; rate: number; pricingType?: string; sortOrder: number }[];
  parts?: { name: string; partNumber: string | null; quantity: number; unitPrice: number; inventoryPartId: string | null; sortOrder: number }[];
}

type PresetMode = "single" | "package";

interface LaborPresetFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset?: LaborPresetData;
  defaultLaborRate?: number;
  inventoryParts?: { id: string; name: string; partNumber: string | null; sellPrice: number; unitCost: number }[];
  currencyCode?: string;
}

function detectMode(preset?: LaborPresetData): PresetMode {
  if (!preset) return "single";
  if (preset.items.length === 1 && preset.name === preset.items[0].description) return "single";
  return "package";
}

function PricingTypeToggle({ value, onChange, tHourly, tService }: { value: PricingType; onChange: (v: PricingType) => void; tHourly: string; tService: string }) {
  return (
    <button
      type="button"
      className={`shrink-0 rounded-md border px-2 text-[10px] font-medium transition-colors ${
        value === "service"
          ? "border-blue-500/30 bg-blue-500/10 text-blue-600"
          : "border-muted text-muted-foreground hover:text-foreground"
      }`}
      onClick={() => onChange(value === "service" ? "hourly" : "service")}
    >
      {value === "service" ? tService : tHourly}
    </button>
  );
}

export function LaborPresetForm({ open, onOpenChange, preset, defaultLaborRate = 0, inventoryParts, currencyCode }: LaborPresetFormProps) {
  const router = useRouter();
  const modal = useGlassModal();
  const t = useTranslations("laborPresets");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<PresetMode>(() => detectMode(preset));

  // Package mode state
  const [name, setName] = useState(preset?.name ?? "");
  const [description, setDescription] = useState(preset?.description ?? "");
  const [items, setItems] = useState<PresetItem[]>(
    preset?.items.map((i) => ({ description: i.description, hours: i.hours, rate: i.rate, pricingType: (i.pricingType as PricingType) || "hourly" })) ?? [
      { description: "", hours: 0, rate: defaultLaborRate, pricingType: "hourly" },
    ]
  );

  // Single item mode state
  const [singleItems, setSingleItems] = useState<SingleItem[]>(() => {
    if (preset && detectMode(preset) === "single") {
      return [{ name: preset.items[0].description, description: preset.description ?? "", hours: preset.items[0].hours, rate: preset.items[0].rate, pricingType: (preset.items[0].pricingType as PricingType) || "hourly" }];
    }
    return [{ name: "", description: "", hours: 0, rate: defaultLaborRate, pricingType: "hourly" }];
  });

  const [parts, setParts] = useState<PresetPartItem[]>(
    preset?.parts?.map((p) => ({
      name: p.name,
      partNumber: p.partNumber || "",
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      inventoryPartId: p.inventoryPartId || "",
    })) ?? []
  );

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      const detectedMode = detectMode(preset);
      setMode(detectedMode);
      setName(preset?.name ?? "");
      setDescription(preset?.description ?? "");
      setItems(
        preset?.items.map((i) => ({ description: i.description, hours: i.hours, rate: i.rate, pricingType: (i.pricingType as PricingType) || "hourly" })) ?? [
          { description: "", hours: 0, rate: defaultLaborRate, pricingType: "hourly" },
        ]
      );
      if (detectedMode === "single" && preset) {
        setSingleItems([{ name: preset.items[0].description, description: preset.description ?? "", hours: preset.items[0].hours, rate: preset.items[0].rate, pricingType: (preset.items[0].pricingType as PricingType) || "hourly" }]);
      } else {
        setSingleItems([{ name: "", description: "", hours: 0, rate: defaultLaborRate, pricingType: "hourly" }]);
      }
      setParts(
        preset?.parts?.map((p) => ({
          name: p.name,
          partNumber: p.partNumber || "",
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          inventoryPartId: p.inventoryPartId || "",
        })) ?? []
      );
    }
    onOpenChange(isOpen);
  };

  const handleModeChange = (newMode: PresetMode) => {
    setMode(newMode);
  };

  // Package mode helpers
  const updateItem = (index: number, field: keyof PresetItem, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { description: "", hours: 0, rate: defaultLaborRate, pricingType: "hourly" }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Single item mode helpers
  const updateSingleItem = (index: number, field: keyof SingleItem, value: string | number) => {
    setSingleItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addSingleItem = () => {
    setSingleItems((prev) => [...prev, { name: "", description: "", hours: 0, rate: defaultLaborRate, pricingType: "hourly" }]);
  };

  const removeSingleItem = (index: number) => {
    setSingleItems((prev) => prev.filter((_, i) => i !== index));
  };

  const buildPartsPayload = () =>
    parts.filter((p) => p.name.trim()).map((part, index) => ({
      name: part.name,
      partNumber: part.partNumber || undefined,
      quantity: Number(part.quantity) || 1,
      unitPrice: Number(part.unitPrice) || 0,
      inventoryPartId: part.inventoryPartId || undefined,
      sortOrder: index,
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const partsPayload = buildPartsPayload();

    if (mode === "single") {
      const validItems = singleItems.filter((i) => i.name.trim());
      if (validItems.length === 0) {
        modal.open("error", t("errors.error"), t("errors.noItems"));
        setLoading(false);
        return;
      }

      if (preset) {
        const item = validItems[0];
        const result = await updateLaborPreset({
          id: preset.id,
          name: "",
          description: item.description || undefined,
          items: [{ description: item.name, hours: Number(item.hours) || 0, rate: Number(item.rate) || 0, pricingType: item.pricingType, sortOrder: 0 }],
          parts: partsPayload,
        });
        if (result.success) { onOpenChange(false); router.refresh(); }
        else { modal.open("error", t("errors.error"), result.error || t("errors.saveFailed")); }
      } else {
        let allSuccess = true;
        for (const item of validItems) {
          const result = await createLaborPreset({
            name: "",
            description: item.description || undefined,
            items: [{ description: item.name, hours: Number(item.hours) || 0, rate: Number(item.rate) || 0, pricingType: item.pricingType, sortOrder: 0 }],
            parts: partsPayload,
          });
          if (!result.success) { modal.open("error", t("errors.error"), result.error || t("errors.saveFailed")); allSuccess = false; break; }
        }
        if (allSuccess) { onOpenChange(false); router.refresh(); }
      }
    } else {
      const validItems = items.filter((i) => i.description.trim());
      if (validItems.length === 0) {
        modal.open("error", t("errors.error"), t("errors.noItems"));
        setLoading(false);
        return;
      }

      const data = {
        name,
        description: description || undefined,
        items: validItems.map((item, index) => ({
          description: item.description, hours: Number(item.hours) || 0, rate: Number(item.rate) || 0, pricingType: item.pricingType, sortOrder: index,
        })),
        parts: partsPayload,
      };

      const result = preset ? await updateLaborPreset({ ...data, id: preset.id }) : await createLaborPreset(data);
      if (result.success) { onOpenChange(false); router.refresh(); }
      else { modal.open("error", t("errors.error"), result.error || t("errors.saveFailed")); }
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {preset ? t("form.editPackage") : t("form.addPackage")}
          </DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex rounded-lg border p-0.5 bg-muted/50">
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "single"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => handleModeChange("single")}
          >
            {t("form.singleItem")}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "package"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => handleModeChange("package")}
          >
            {t("form.package")}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "single" ? (
            <div className="space-y-2">
              <div className="hidden grid-cols-[2fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>{t("form.singleNameLabel")}</span>
                <span>{t("form.itemQtyOrHours")}</span>
                <span>{t("form.itemRate")}</span>
                <span />
              </div>

              {singleItems.map((item, i) => (
                <div key={i} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                    <div className="col-span-2 flex gap-2 sm:col-span-1">
                      <Input
                        placeholder={t("form.singleNamePlaceholder")}
                        value={item.name}
                        onChange={(e) => updateSingleItem(i, "name", e.target.value)}
                        className="flex-1"
                      />
                      <PricingTypeToggle
                        value={item.pricingType}
                        onChange={(v) => updateSingleItem(i, "pricingType", v)}
                        tHourly={t("form.hourlyTag")}
                        tService={t("form.serviceTag")}
                      />
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step={item.pricingType === "service" ? "1" : "any"}
                      placeholder={item.pricingType === "service" ? t("form.itemQty") : t("form.itemHours")}
                      value={item.hours}
                      onChange={(e) => updateSingleItem(i, "hours", e.target.value)}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.rate}
                      onChange={(e) => updateSingleItem(i, "rate", e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => removeSingleItem(i)}
                      disabled={singleItems.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder={t("form.descriptionPlaceholder")}
                    value={item.description}
                    onChange={(e) => updateSingleItem(i, "description", e.target.value)}
                    rows={2}
                  />
                </div>
              ))}

              <button
                type="button"
                className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                onClick={addSingleItem}
              >
                <Plus className="h-4 w-4" />
              </button>

              <PresetPartsEditor
                parts={parts}
                onPartsChange={setParts}
                inventoryParts={inventoryParts}
                currencyCode={currencyCode}
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="preset-name">{t("form.nameLabel")}</Label>
                <Input
                  id="preset-name"
                  placeholder={t("form.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="preset-description">{t("form.descriptionLabel")}</Label>
                <Textarea
                  id="preset-description"
                  placeholder={t("form.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("form.itemsTitle")}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t("form.addItem")}
                  </Button>
                </div>

                <div className="hidden grid-cols-[2fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                  <span>{t("form.itemDescription")}</span>
                  <span>{t("form.itemQtyOrHours")}</span>
                  <span>{t("form.itemRate")}</span>
                  <span />
                </div>

                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                    <div className="col-span-2 flex gap-2 sm:col-span-1">
                      <Input
                        placeholder={t("form.itemDescriptionPlaceholder")}
                        value={item.description}
                        onChange={(e) => updateItem(i, "description", e.target.value)}
                        className="flex-1"
                      />
                      <PricingTypeToggle
                        value={item.pricingType}
                        onChange={(v) => updateItem(i, "pricingType", v)}
                        tHourly={t("form.hourlyTag")}
                        tService={t("form.serviceTag")}
                      />
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step={item.pricingType === "service" ? "1" : "any"}
                      placeholder={item.pricingType === "service" ? t("form.itemQty") : t("form.itemHours")}
                      value={item.hours}
                      onChange={(e) => updateItem(i, "hours", e.target.value)}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.rate}
                      onChange={(e) => updateItem(i, "rate", e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(i)}
                      disabled={items.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <button
                  type="button"
                  className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                  onClick={addItem}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <PresetPartsEditor
                parts={parts}
                onPartsChange={setParts}
                inventoryParts={inventoryParts}
                currencyCode={currencyCode}
              />
            </>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("form.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {preset ? t("form.saveChanges") : t("form.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
