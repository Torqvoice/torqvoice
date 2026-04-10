"use client";

import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";
import { netLineTotal } from "@/lib/tax";

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
  taxInclusive: boolean;
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
  taxInclusive,
  displayTotal,
  totalPaid,
  balanceDue,
  hasPayments,
  currencyCode,
}: InvoiceSummaryProps) {
  const t = useTranslations("service.invoice");

  // Universal display: net per category, net subtotal, net discount, tax, gross total.
  // No-op for exclusive records; back-calculates the net portions for inclusive records.
  const displayPartsSubtotal = netLineTotal(partsSubtotal, taxRate, taxInclusive);
  const displayLaborSubtotal = netLineTotal(laborSubtotal, taxRate, taxInclusive);
  const displaySubtotal = netLineTotal(subtotal, taxRate, taxInclusive);
  const displayDiscountAmount = netLineTotal(discountAmount, taxRate, taxInclusive);

  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 text-sm font-semibold">{t("title")}</h3>
      <div className="space-y-1.5">
        {hasPartItems && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("parts")}</span>
            <span>{formatCurrency(displayPartsSubtotal, currencyCode)}</span>
          </div>
        )}
        {hasLaborItems && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("labor")}</span>
            <span>{formatCurrency(displayLaborSubtotal, currencyCode)}</span>
          </div>
        )}
        {displaySubtotal > 0 && ((hasPartItems && hasLaborItems) || displayDiscountAmount > 0 || taxRate > 0) && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("subtotal")}</span>
            <span>{formatCurrency(displaySubtotal, currencyCode)}</span>
          </div>
        )}
        {displayDiscountAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t("discount")}{discountType === "percentage" ? ` (${discountValue}%)` : ""}
            </span>
            <span className="text-destructive">{formatCurrency(-displayDiscountAmount, currencyCode)}</span>
          </div>
        )}
        {taxRate > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t("tax", { rate: taxRate })}
            </span>
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
