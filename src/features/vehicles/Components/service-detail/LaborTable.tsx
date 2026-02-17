"use client";

import { formatCurrency } from "@/lib/format";
import type { LaborItem } from "./types";

interface LaborTableProps {
  laborItems: LaborItem[];
  laborSubtotal: number;
  currencyCode: string;
}

export function LaborTable({ laborItems, laborSubtotal, currencyCode }: LaborTableProps) {
  if (laborItems.length === 0) return null;

  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 text-sm font-semibold">Labor ({laborItems.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-1.5 font-medium" style={{ width: "40%" }}>Description</th>
              <th className="pb-1.5 text-right font-medium">Hours</th>
              <th className="pb-1.5 text-right font-medium">Rate</th>
              <th className="pb-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {laborItems.map((labor) => (
              <tr key={labor.id}>
                <td className="py-1.5 whitespace-pre-wrap">{labor.description}</td>
                <td className="py-1.5 text-right">{labor.hours}</td>
                <td className="py-1.5 text-right">{formatCurrency(labor.rate, currencyCode)}/hr</td>
                <td className="py-1.5 text-right font-medium">{formatCurrency(labor.total, currencyCode)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td colSpan={3} className="pt-1.5 text-right text-xs font-medium">Labor Subtotal</td>
              <td className="pt-1.5 text-right text-sm font-bold">{formatCurrency(laborSubtotal, currencyCode)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
