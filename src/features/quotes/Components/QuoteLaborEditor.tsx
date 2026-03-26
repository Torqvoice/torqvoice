"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layers, Plus, Trash2, Wrench } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { QuoteLaborInput } from "./quote-page-types";

const QuoteLaborRow = memo(function QuoteLaborRow({
  labor,
  index,
  currencyCode,
  onUpdate,
  onDelete,
  tDescriptionPlaceholder,
  tHourlyTag,
  tServiceTag,
  tSwitchToHourly,
  tSwitchToService,
  tQty,
  tHours,
}: {
  labor: QuoteLaborInput;
  index: number;
  currencyCode: string;
  onUpdate: (index: number, field: keyof QuoteLaborInput, value: string | number | boolean) => void;
  onDelete: (index: number) => void;
  tDescriptionPlaceholder: string;
  tHourlyTag: string;
  tServiceTag: string;
  tSwitchToHourly: string;
  tSwitchToService: string;
  tQty: string;
  tHours: string;
}) {
  const isService = labor.pricingType === "service";
  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]${labor.excluded ? " line-through opacity-50" : ""}`}>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <Input placeholder={tDescriptionPlaceholder} value={labor.description} onChange={(e) => onUpdate(index, "description", e.target.value)} className="flex-1" />
        <button
          type="button"
          className={`shrink-0 rounded-md border px-2 text-[10px] font-medium transition-colors ${
            isService
              ? "border-blue-500/30 bg-blue-500/10 text-blue-600"
              : "border-muted text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onUpdate(index, "pricingType", isService ? "hourly" : "service")}
          title={isService ? tSwitchToHourly : tSwitchToService}
        >
          {isService ? tServiceTag : tHourlyTag}
        </button>
      </div>
      <Input type="number" min="0" step={isService ? "1" : "0.1"} placeholder={isService ? tQty : tHours} value={labor.hours} onChange={(e) => onUpdate(index, "hours", e.target.value)} />
      <Input type="number" min="0" step="0.01" value={labor.rate} onChange={(e) => onUpdate(index, "rate", e.target.value)} />
      <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">{formatCurrency(labor.total, currencyCode)}</div>
      <div className="flex items-center gap-1">
        <input type="checkbox" checked={labor.excluded ?? false} onChange={(e) => onUpdate(index, "excluded", e.target.checked)} className="h-4 w-4 rounded border-gray-300" title="Exclude from total" />
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => onDelete(index)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
});

interface QuoteLaborEditorProps {
  laborItems: QuoteLaborInput[];
  currencyCode: string;
  cs: string;
  laborSubtotal: number;
  onUpdate: (index: number, field: keyof QuoteLaborInput, value: string | number | boolean) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  onAddService?: () => void;
  hasPresets?: boolean;
  onOpenPresets?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: any) => string;
}

export const QuoteLaborEditor = memo(function QuoteLaborEditor({
  laborItems,
  currencyCode,
  cs,
  laborSubtotal,
  onUpdate,
  onDelete,
  onAdd,
  onAddService,
  hasPresets,
  onOpenPresets,
  t,
}: QuoteLaborEditorProps) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("labor.title")}</h3>
        <div className="flex gap-2">
          {hasPresets && onOpenPresets && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenPresets}>
              <Layers className="mr-1 h-3.5 w-3.5" />
              {t("labor.fromPresets")}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onAdd}><Plus className="mr-1 h-3.5 w-3.5" /> {t("labor.addLabor")}</Button>
          {onAddService && (
            <Button type="button" variant="outline" size="sm" onClick={onAddService}><Wrench className="mr-1 h-3.5 w-3.5" /> {t("labor.addService")}</Button>
          )}
        </div>
      </div>
      {laborItems.length > 0 && (
        <>
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>{t("labor.description")}</span><span>{t("labor.qtyOrHours")}</span><span>{t("labor.rate", { currency: cs })}</span><span>{t("labor.total")}</span><span />
          </div>
          {laborItems.map((labor, i) => (
            <QuoteLaborRow
              key={i}
              labor={labor}
              index={i}
              currencyCode={currencyCode}
              onUpdate={onUpdate}
              onDelete={onDelete}
              tDescriptionPlaceholder={t("labor.descriptionPlaceholder")}
              tHourlyTag={t("labor.hourlyTag")}
              tServiceTag={t("labor.serviceTag")}
              tSwitchToHourly={t("labor.switchToHourly")}
              tSwitchToService={t("labor.switchToService")}
              tQty={t("labor.qty")}
              tHours={t("labor.hours")}
            />
          ))}
          <button type="button" className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={onAdd}><Plus className="h-4 w-4" /></button>
          <div className="flex justify-end pt-1 text-sm"><span className="font-medium">{t("labor.subtotal", { amount: formatCurrency(laborSubtotal, currencyCode) })}</span></div>
        </>
      )}
      {laborItems.length === 0 && (
        <div className="flex gap-2">
          <button type="button" className="flex flex-1 items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" /><span className="text-sm">{t("labor.addLabor")}</span>
          </button>
          {onAddService && (
            <button type="button" className="flex flex-1 items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={onAddService}>
              <Wrench className="mr-1 h-4 w-4" /><span className="text-sm">{t("labor.addService")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});
