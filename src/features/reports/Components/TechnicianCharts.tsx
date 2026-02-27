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
import type { TechnicianMetrics } from "../Schema/reportTypes";

interface TechnicianBarChartProps {
  data: TechnicianMetrics[];
  formatCurrency: (value: number) => string;
  labels?: { revenue: string };
}

export function TechnicianBarChart({ data, formatCurrency, labels }: TechnicianBarChartProps) {
  if (data.length === 0) return null;

  const chartData = data.slice(0, 10).map((t) => ({
    name: t.techName.length > 20 ? t.techName.slice(0, 18) + "\u2026" : t.techName,
    totalRevenue: t.totalRevenue,
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
        <Bar dataKey="totalRevenue" name={labels?.revenue ?? "Revenue"} fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
