"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { MonthlyRevenue, RevenueByType } from "../Schema/reportTypes";

const CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#f43f5e",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

interface RevenueBarChartProps {
  data: MonthlyRevenue[];
  formatCurrency: (value: number) => string;
  labels?: { revenue: string; collected: string; netProfit?: string };
}

export function RevenueBarChart({ data, formatCurrency, labels }: RevenueBarChartProps) {
  if (data.length === 0) return null;

  const compactCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return value.toString();
  };

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={1} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis
          dataKey="month"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 11 }}
          tickFormatter={compactCurrency}
          axisLine={false}
          tickLine={false}
          width={45}
        />
        <Tooltip
          formatter={(value) => formatCurrency(Number(value))}
          wrapperStyle={{ outline: "none" }}
          contentStyle={{
            backgroundColor: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--popover-foreground)",
            fontSize: "13px",
          }}
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
        />
        <Legend
          formatter={(value) => (
            <span className="text-xs text-muted-foreground">{value}</span>
          )}
        />
        <Bar dataKey="revenue" name={labels?.revenue ?? "Revenue"} fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="collected" name={labels?.collected ?? "Collected"} fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="netProfit" name={labels?.netProfit ?? "Net Profit"} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface RevenueTypeDonutProps {
  data: RevenueByType[];
  formatCurrency: (value: number) => string;
}

export function RevenueTypeDonut({ data, formatCurrency }: RevenueTypeDonutProps) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="revenue"
          nameKey="type"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatCurrency(Number(value))}
          wrapperStyle={{ outline: "none" }}
          contentStyle={{
            backgroundColor: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--popover-foreground)",
          }}
        />
        <Legend
          formatter={(value) => (
            <span className="text-xs text-muted-foreground">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
