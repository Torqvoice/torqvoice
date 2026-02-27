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
import type { RetentionCustomer } from "../Schema/reportTypes";

interface RetentionBarChartProps {
  data: RetentionCustomer[];
  formatCurrency: (value: number) => string;
  labels?: { visits: string; totalSpent: string };
}

export function RetentionBarChart({ data, formatCurrency, labels }: RetentionBarChartProps) {
  if (data.length === 0) return null;

  const totalSpentLabel = labels?.totalSpent ?? "Total Spent";

  const chartData = data.slice(0, 10).map((c) => ({
    name: c.name.length > 20 ? c.name.slice(0, 18) + "\u2026" : c.name,
    visitCount: c.visitCount,
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
        />
        <YAxis
          type="category"
          dataKey="name"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
          width={140}
        />
        <Tooltip
          formatter={(value, name) =>
            name === totalSpentLabel ? formatCurrency(Number(value)) : value
          }
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--popover-foreground))",
          }}
        />
        <Bar dataKey="visitCount" name={labels?.visits ?? "Visits"} fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
