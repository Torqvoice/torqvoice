"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { QuotePartInput } from "./quote-page-types";

const QuotePartRow = memo(function QuotePartRow({
  part,
  index,
  currencyCode,
  onUpdate,
  onDelete,
  tPartNumber,
  tNamePlaceholder,
}: {
  part: QuotePartInput;
  index: number;
  currencyCode: string;
  onUpdate: (index: number, field: keyof QuotePartInput, value: string | number | boolean) => void;
  onDelete: (index: number) => void;
  tPartNumber: string;
  tNamePlaceholder: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto]${part.excluded ? " line-through opacity-50" : ""}`}>
      <Input placeholder={tPartNumber} value={part.partNumber ?? ""} onChange={(e) => onUpdate(index, "partNumber", e.target.value)} />
      <Input placeholder={tNamePlaceholder} value={part.name} onChange={(e) => onUpdate(index, "name", e.target.value)} />
      <Input type="number" min="0" step="1" value={part.quantity} onChange={(e) => onUpdate(index, "quantity", e.target.value)} />
      <Input type="number" min="0" step="0.01" value={part.unitPrice} onChange={(e) => onUpdate(index, "unitPrice", e.target.value)} />
      <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">{formatCurrency(part.total, currencyCode)}</div>
      <div className="flex items-center gap-1">
        <input type="checkbox" checked={part.excluded ?? false} onChange={(e) => onUpdate(index, "excluded", e.target.checked)} className="h-4 w-4 rounded border-gray-300" title="Exclude from total" />
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => onDelete(index)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
});

interface QuotePartsEditorProps {
  partItems: QuotePartInput[];
  currencyCode: string;
  partsSubtotal: number;
  aiEnabled: boolean;
  onUpdate: (index: number, field: keyof QuotePartInput, value: string | number | boolean) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  onOpenAiBuild: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: any) => string;
}

export const QuotePartsEditor = memo(function QuotePartsEditor({
  partItems,
  currencyCode,
  partsSubtotal,
  aiEnabled,
  onUpdate,
  onDelete,
  onAdd,
  onOpenAiBuild,
  t,
}: QuotePartsEditorProps) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("parts.title")}</h3>
        <div className="flex items-center gap-2">
          {aiEnabled && (
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onOpenAiBuild}>
              <Sparkles className="h-3.5 w-3.5" /> {t("page.aiBuild")}
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
              tPartNumber={t("parts.partNumber")}
              tNamePlaceholder={t("parts.namePlaceholder")}
            />
          ))}
          <button type="button" className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={onAdd}><Plus className="h-4 w-4" /></button>
          <div className="flex justify-end pt-1 text-sm"><span className="font-medium">{t("parts.subtotal", { amount: formatCurrency(partsSubtotal, currencyCode) })}</span></div>
        </>
      )}
      {partItems.length === 0 && (
        <button type="button" className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" /><span className="text-sm">{t("parts.addPart")}</span>
        </button>
      )}
    </div>
  );
});
