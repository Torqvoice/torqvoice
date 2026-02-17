"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, CreditCard, Loader2, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useFormatDate } from "@/lib/use-format-date";
import { paymentStatusColors, paymentStatusLabels } from "./types";
import type { Payment } from "./types";

interface PaymentsSectionProps {
  payments: Payment[];
  paymentStatus: string;
  totalPaid: number;
  displayTotal: number;
  balanceDue: number;
  currencyCode: string;
  onCreatePayment: (data: { amount: number; date: string; method: string; note?: string }) => Promise<boolean>;
  onDeletePayment: (id: string) => void;
  paymentLoading: boolean;
  deletingPayment: string | null;
}

export function PaymentsSection({
  payments,
  paymentStatus,
  totalPaid,
  displayTotal,
  balanceDue,
  currencyCode,
  onCreatePayment,
  onDeletePayment,
  paymentLoading,
  deletingPayment,
}: PaymentsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const { formatDate } = useFormatDate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const success = await onCreatePayment({
      amount: Number(formData.get("paymentAmount")),
      date: (formData.get("paymentDate") as string) || new Date().toISOString(),
      method: formData.get("paymentMethod") as string,
      note: (formData.get("paymentNote") as string) || undefined,
    });
    if (success) setShowForm(false);
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-3.5 w-3.5" />
            Payments
          </h3>
          <Badge variant="outline" className={`text-xs ${paymentStatusColors[paymentStatus] || ""}`}>
            {paymentStatusLabels[paymentStatus] || "Unpaid"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {paymentStatus !== "paid" && balanceDue > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={paymentLoading}
              onClick={() => onCreatePayment({
                amount: balanceDue,
                date: new Date().toISOString(),
                method: "other",
                note: "Marked as paid",
              })}
            >
              {paymentLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
              Mark as Paid
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-3 w-3" />
            Record Payment
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Paid</span>
          <span className="font-medium">
            {formatCurrency(totalPaid, currencyCode)} / {formatCurrency(displayTotal, currencyCode)}
          </span>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="paymentAmount" className="text-xs">Amount</Label>
                <Input
                  id="paymentAmount" name="paymentAmount" type="number"
                  step="0.01" min="0.01" defaultValue={balanceDue > 0 ? balanceDue.toFixed(2) : ""} required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="paymentDate" className="text-xs">Date</Label>
                <Input
                  id="paymentDate" name="paymentDate" type="date"
                  defaultValue={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select name="paymentMethod" defaultValue="other">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="paymentNote" className="text-xs">Note</Label>
                <Input id="paymentNote" name="paymentNote" placeholder="Optional note" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={paymentLoading}>
                {paymentLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Save Payment
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {payments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-1.5 font-medium">Date</th>
                  <th className="pb-1.5 text-right font-medium">Amount</th>
                  <th className="pb-1.5 font-medium">Method</th>
                  <th className="pb-1.5 font-medium">Note</th>
                  <th className="pb-1.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="py-1.5">{formatDate(new Date(payment.date))}</td>
                    <td className="py-1.5 text-right font-medium">{formatCurrency(payment.amount, currencyCode)}</td>
                    <td className="py-1.5">
                      <Badge variant="outline" className="text-xs capitalize">{payment.method}</Badge>
                    </td>
                    <td className="py-1.5 text-muted-foreground">{payment.note || "-"}</td>
                    <td className="py-1.5">
                      <Button
                        variant="ghost" size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        disabled={deletingPayment === payment.id}
                        onClick={() => onDeletePayment(payment.id)}
                      >
                        {deletingPayment === payment.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Trash2 className="h-3 w-3" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
