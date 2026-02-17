"use client";

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
  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 text-sm font-semibold">Invoice Summary</h3>
      <div className="space-y-1.5">
        {hasPartItems && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Parts</span>
            <span>{formatCurrency(partsSubtotal, currencyCode)}</span>
          </div>
        )}
        {hasLaborItems && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Labor</span>
            <span>{formatCurrency(laborSubtotal, currencyCode)}</span>
          </div>
        )}
        {subtotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(subtotal, currencyCode)}</span>
          </div>
        )}
        {discountAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Discount{discountType === "percentage" ? ` (${discountValue}%)` : ""}
            </span>
            <span className="text-destructive">{formatCurrency(-discountAmount, currencyCode)}</span>
          </div>
        )}
        {taxRate > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax ({taxRate}%)</span>
            <span>{formatCurrency(taxAmount, currencyCode)}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span>{formatCurrency(displayTotal, currencyCode)}</span>
        </div>
        {hasPayments && (
          <>
            <div className="flex justify-between text-sm text-emerald-600">
              <span>Paid</span>
              <span>{formatCurrency(-totalPaid, currencyCode)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Balance Due</span>
              <span className={balanceDue <= 0 ? "text-emerald-600" : ""}>
                {balanceDue <= 0 ? "PAID" : formatCurrency(balanceDue, currencyCode)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
