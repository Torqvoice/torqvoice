"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MonthlyTax } from "../Schema/reportTypes";

interface TaxBarChartProps {
  data: MonthlyTax[];
  formatCurrency: (value: number) => string;
  labels?: { taxCollected: string };
}

export function TaxBarChart({ data, formatCurrency, labels }: TaxBarChartProps) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="month"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
        />
        <YAxis
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => formatCurrency(v)}
        />
        <Tooltip
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--popover-foreground))",
          }}
        />
        <Bar dataKey="taxCollected" name={labels?.taxCollected ?? "Tax Collected"} fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
