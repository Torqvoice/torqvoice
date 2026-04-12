"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

export interface LaborPresetOption {
  id: string;
  name: string;
  description: string | null;
  items: { description: string; hours: number; rate: number; pricingType?: string; sortOrder: number }[];
  parts?: { name: string; partNumber: string | null; quantity: number; unitPrice: number; inventoryPartId: string | null; sortOrder: number }[];
}

interface LaborPresetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  laborPresets: LaborPresetOption[];
  onSelectPreset: (preset: LaborPresetOption) => void;
}

export function LaborPresetPickerDialog({
  open,
  onOpenChange,
  laborPresets,
  onSelectPreset,
}: LaborPresetPickerDialogProps) {
  const t = useTranslations("laborPresets.picker");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = laborPresets.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setSearch("");
          setExpandedId(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="max-h-75 overflow-y-auto space-y-1">
          {filtered.map((preset) => {
            const hourlyItems = preset.items.filter((i) => i.pricingType !== "service");
            const serviceItems = preset.items.filter((i) => i.pricingType === "service");
            const totalHours = hourlyItems.reduce((sum, i) => sum + i.hours, 0);
            const totalUnits = serviceItems.reduce((sum, i) => sum + i.hours, 0);
            const isExpanded = expandedId === preset.id;
            const hasDetails = preset.items.length > 1 || (preset.parts && preset.parts.length > 0);

            return (
              <div key={preset.id} className="rounded-md border border-transparent hover:border-border">
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full text-left rounded-md px-2.5 py-2 hover:bg-accent transition-colors flex items-center justify-between gap-4 cursor-pointer"
                  onClick={() => {
                    onSelectPreset(preset);
                    onOpenChange(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectPreset(preset);
                      onOpenChange(false);
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{preset.name}</span>
                    </div>
                    {preset.description && (
                      <p className="text-xs text-muted-foreground truncate">{preset.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    {hasDetails && <span>{t("items", { count: preset.items.length })}</span>}
                    {totalHours > 0 && <span>{t("totalHours", { hours: totalHours.toFixed(1) })}</span>}
                    {totalUnits > 0 && <span>{t("totalUnits", { units: totalUnits })}</span>}
                    {preset.parts && preset.parts.length > 0 && (
                      <span>{t("totalParts", { count: preset.parts.length })}</span>
                    )}
                    {hasDetails && (
                      <button
                        type="button"
                        className="p-1 hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(isExpanded ? null : preset.id);
                        }}
                      >
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && hasDetails && (
                  <div className="px-3 pb-2 space-y-0.5">
                    {preset.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-muted-foreground py-0.5 pl-2 border-l-2 border-muted">
                        <span className="truncate">{item.description}</span>
                        <span className="shrink-0 ml-2">{item.pricingType === "service" ? `${item.hours} unit${item.hours !== 1 ? "s" : ""}` : `${item.hours}h`}</span>
                      </div>
                    ))}
                    {preset.parts && preset.parts.length > 0 && (
                      <>
                        {preset.parts.map((part, i) => (
                          <div key={`part-${i}`} className="flex items-center justify-between text-xs text-muted-foreground py-0.5 pl-2 border-l-2 border-blue-400/50">
                            <span className="truncate">{part.name}{part.partNumber ? ` (${part.partNumber})` : ''}</span>
                            <span className="shrink-0 ml-2">x{part.quantity}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noPackages")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
