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
import type { TopCustomer } from "../Schema/reportTypes";

interface TopCustomersChartProps {
  data: TopCustomer[];
  formatCurrency: (value: number) => string;
  labels?: { totalSpent: string };
}

export function TopCustomersChart({ data, formatCurrency, labels }: TopCustomersChartProps) {
  if (data.length === 0) return null;

  const chartData = data.slice(0, 10).map((c) => ({
    name: c.name.length > 20 ? c.name.slice(0, 18) + "\u2026" : c.name,
    totalSpent: c.totalSpent,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          type="number"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => formatCurrency(v)}
        />
        <YAxis
          type="category"
          dataKey="name"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
          width={140}
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
        <Bar dataKey="totalSpent" name={labels?.totalSpent ?? "Total Spent"} fill="#3b82f6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
