"use client";

import { Wrench } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { PartItem } from "./types";

interface PartsTableProps {
  parts: PartItem[];
  partsSubtotal: number;
  currencyCode: string;
}

export function PartsTable({ parts, partsSubtotal, currencyCode }: PartsTableProps) {
  if (parts.length === 0) return null;

  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Wrench className="h-3.5 w-3.5" />
        Parts ({parts.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-1.5 font-medium">Part #</th>
              <th className="pb-1.5 font-medium">Name</th>
              <th className="pb-1.5 text-right font-medium">Qty</th>
              <th className="pb-1.5 text-right font-medium">Unit Price</th>
              <th className="pb-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {parts.map((part) => (
              <tr key={part.id}>
                <td className="py-1.5 font-mono text-xs">{part.partNumber || "-"}</td>
                <td className="py-1.5">{part.name}</td>
                <td className="py-1.5 text-right">{part.quantity}</td>
                <td className="py-1.5 text-right">{formatCurrency(part.unitPrice, currencyCode)}</td>
                <td className="py-1.5 text-right font-medium">{formatCurrency(part.total, currencyCode)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td colSpan={4} className="pt-1.5 text-right text-xs font-medium">Parts Subtotal</td>
              <td className="pt-1.5 text-right text-sm font-bold">{formatCurrency(partsSubtotal, currencyCode)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
