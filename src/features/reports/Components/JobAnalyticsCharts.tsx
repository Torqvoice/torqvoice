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
  LineChart,
  Line,
} from "recharts";
import type { DayOfWeekDistribution, ServiceTypeAnalytics, MonthlyTrend } from "../Schema/reportTypes";

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

interface DayOfWeekChartProps {
  data: DayOfWeekDistribution[];
  labels?: { jobs: string };
}

export function DayOfWeekChart({ data, labels }: DayOfWeekChartProps) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="day"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => v.slice(0, 3)}
        />
        <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--popover-foreground))",
          }}
        />
        <Bar dataKey="count" name={labels?.jobs ?? "Jobs"} fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface ServiceTypeDonutProps {
  data: ServiceTypeAnalytics[];
}

export function ServiceTypeAnalyticsDonut({ data }: ServiceTypeDonutProps) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
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
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--popover-foreground))",
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

interface MonthlyTrendChartProps {
  data: MonthlyTrend[];
  formatCurrency: (value: number) => string;
  labels?: { jobs: string; revenue: string };
}

export function MonthlyTrendChart({ data, formatCurrency, labels }: MonthlyTrendChartProps) {
  if (data.length === 0) return null;

  const jobsLabel = labels?.jobs ?? "Jobs";
  const revenueLabel = labels?.revenue ?? "Revenue";

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="month"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
        />
        <YAxis
          yAxisId="left"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => formatCurrency(v)}
        />
        <Tooltip
          formatter={(value, name) =>
            name === revenueLabel ? formatCurrency(Number(value)) : value
          }
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--popover-foreground))",
          }}
        />
        <Line yAxisId="left" type="monotone" dataKey="count" name={jobsLabel} stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="revenue" name={revenueLabel} stroke="#10b981" strokeWidth={2} dot={false} />
        <Legend
          formatter={(value) => (
            <span className="text-xs text-muted-foreground">{value}</span>
          )}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
