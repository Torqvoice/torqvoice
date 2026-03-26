"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { createInventoryPart } from "@/features/inventory/Actions/inventoryActions";
import { toast } from "sonner";

interface CreatePartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barcode: string;
  onCreated: (part: {
    id: string;
    name: string;
    partNumber: string | null;
    sellPrice: number;
    unitCost: number;
  }) => void;
}

export function CreatePartDialog({
  open,
  onOpenChange,
  barcode,
  onCreated,
}: CreatePartDialogProps) {
  const t = useTranslations("dashboard.myJobs.createPart");
  const [name, setName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setName("");
      setPartNumber("");
      setSellPrice("");
      setUnitCost("");
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const result = await createInventoryPart({
      name: name.trim(),
      partNumber: partNumber.trim() || undefined,
      barcode: barcode || undefined,
      sellPrice: Number(sellPrice) || 0,
      unitCost: Number(unitCost) || 0,
      quantity: 1,
    });

    setLoading(false);

    if (result.success && result.data) {
      onCreated({
        id: result.data.id,
        name: result.data.name,
        partNumber: result.data.partNumber ?? null,
        sellPrice: result.data.sellPrice,
        unitCost: result.data.unitCost,
      });
    } else {
      toast.error(result.error || t("failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("description", { barcode })}
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="part-name">{t("name")}</Label>
            <Input
              id="part-name"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="part-number">{t("partNumber")}</Label>
            <Input
              id="part-number"
              placeholder={t("partNumberPlaceholder")}
              value={partNumber}
              onChange={(e) => setPartNumber(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="part-cost">{t("cost")}</Label>
              <Input
                id="part-cost"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="part-price">{t("sellPrice")}</Label>
              <Input
                id="part-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
