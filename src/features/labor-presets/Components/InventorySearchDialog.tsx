"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search } from "lucide-react";

export interface InventoryPartOption {
  id: string;
  name: string;
  partNumber: string | null;
  sellPrice: number;
  unitCost: number;
}

interface InventorySearchDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inventoryParts: InventoryPartOption[];
  onSelect: (part: InventoryPartOption) => void;
}

export function InventorySearchDialog({
  open,
  onOpenChange,
  inventoryParts,
  onSelect,
}: InventorySearchDialogProps) {
  const t = useTranslations("laborPresets");
  const [search, setSearch] = useState("");

  const filtered = inventoryParts.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.partNumber && p.partNumber.toLowerCase().includes(q))
    );
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setSearch("");
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("form.importFromInventory")}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("form.searchInventory")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="max-h-60 overflow-y-auto space-y-1">
          {filtered.map((ip) => (
            <button
              key={ip.id}
              type="button"
              className="w-full text-left rounded-md px-2.5 py-1.5 hover:bg-accent transition-colors flex items-center justify-between gap-4"
              onClick={() => {
                onSelect(ip);
                onOpenChange(false);
              }}
            >
              <div className="min-w-0">
                <span className="font-medium text-sm truncate">{ip.name}</span>
                {ip.partNumber && (
                  <span className="ml-2 text-xs font-mono text-muted-foreground">
                    {ip.partNumber}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {ip.sellPrice > 0 ? ip.sellPrice.toFixed(2) : ip.unitCost.toFixed(2)}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("form.noPartsFound")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
