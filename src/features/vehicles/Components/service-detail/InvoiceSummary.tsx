"use client";

import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";

interface InvoiceSummaryProps {
  hasPartItems: boolean;
  hasLaborItems: boolean;
  partsSubtotal: number;
  laborSubtotal: number;
  subtotal: number;
  discountAmount: number;
  discountType: string | null;
  discountValue: number;
  taxRate: number;
  taxAmount: number;
  displayTotal: number;
  totalPaid: number;
  balanceDue: number;
  hasPayments: boolean;
  currencyCode: string;
}

export function InvoiceSummary({
  hasPartItems,
  hasLaborItems,
  partsSubtotal,
  laborSubtotal,
  subtotal,
  discountAmount,
  discountType,
  discountValue,
  taxRate,
  taxAmount,
  displayTotal,
  totalPaid,
  balanceDue,
  hasPayments,
  currencyCode,
}: InvoiceSummaryProps) {
  const t = useTranslations("service.invoice");
  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 text-sm font-semibold">{t("title")}</h3>
      <div className="space-y-1.5">
        {hasPartItems && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("parts")}</span>
            <span>{formatCurrency(partsSubtotal, currencyCode)}</span>
          </div>
        )}
        {hasLaborItems && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("labor")}</span>
            <span>{formatCurrency(laborSubtotal, currencyCode)}</span>
          </div>
        )}
        {subtotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("subtotal")}</span>
            <span>{formatCurrency(subtotal, currencyCode)}</span>
          </div>
        )}
        {discountAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t("discount")}{discountType === "percentage" ? ` (${discountValue}%)` : ""}
            </span>
            <span className="text-destructive">{formatCurrency(-discountAmount, currencyCode)}</span>
          </div>
        )}
        {taxRate > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("tax", { rate: taxRate })}</span>
            <span>{formatCurrency(taxAmount, currencyCode)}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-bold">
          <span>{t("total")}</span>
          <span>{formatCurrency(displayTotal, currencyCode)}</span>
        </div>
        {hasPayments && (
          <>
            <div className="flex justify-between text-sm text-emerald-600">
              <span>{t("paid")}</span>
              <span>{formatCurrency(-totalPaid, currencyCode)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>{t("balanceDue")}</span>
              <span className={balanceDue <= 0 ? "text-emerald-600" : ""}>
                {balanceDue <= 0 ? t("paidBadge") : formatCurrency(balanceDue, currencyCode)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
