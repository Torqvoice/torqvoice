'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { TechnicianMetrics, TechnicianTimeMetrics } from '../Schema/reportTypes'

interface TechnicianBarChartProps {
  data: TechnicianMetrics[]
  formatCurrency: (value: number) => string
  labels?: { revenue: string }
}

export function TechnicianBarChart({ data, formatCurrency, labels }: TechnicianBarChartProps) {
  if (data.length === 0) return null

  const chartData = data.slice(0, 10).map((t) => ({
    name: t.techName.length > 20 ? t.techName.slice(0, 18) + '\u2026' : t.techName,
    totalRevenue: t.totalRevenue,
  }))

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
          wrapperStyle={{ outline: 'none' }}
          contentStyle={{
            backgroundColor: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--popover-foreground)',
          }}
        />
        <Bar
          dataKey="totalRevenue"
          name={labels?.revenue ?? 'Revenue'}
          fill="#8b5cf6"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface TechnicianTimeChartProps {
  data: TechnicianTimeMetrics[]
  labels: { clocked: string; billed: string }
}

/** Clocked beside billed, one pair of bars per technician; the gap is the story. */
export function TechnicianTimeChart({ data, labels }: TechnicianTimeChartProps) {
  if (data.length === 0) return null

  const chartData = data.slice(0, 10).map((t) => ({
    name: t.techName.length > 20 ? `${t.techName.slice(0, 18)}\u2026` : t.techName,
    clocked: Math.round((t.clockedMinutes / 60) * 10) / 10,
    billed: Math.round(t.billedHours * 10) / 10,
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 48)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        barGap={2}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          type="number"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => `${v} h`}
        />
        <YAxis
          type="category"
          dataKey="name"
          className="text-xs fill-muted-foreground"
          tick={{ fontSize: 12 }}
          width={140}
        />
        <Tooltip
          formatter={(value) => `${Number(value).toFixed(1)} h`}
          wrapperStyle={{ outline: 'none' }}
          contentStyle={{
            backgroundColor: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--popover-foreground)',
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="clocked" name={labels.clocked} fill="var(--primary)" radius={[0, 4, 4, 0]} />
        <Bar dataKey="billed" name={labels.billed} fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
