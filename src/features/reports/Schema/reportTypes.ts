export interface MonthlyRevenue {
  month: string;
  revenue: number;
  collected: number;
  count: number;
}

export interface RevenueByType {
  type: string;
  revenue: number;
  count: number;
}

export interface RevenueSummary {
  totalRevenue: number;
  totalCollected: number;
  outstanding: number;
  totalCount: number;
}

export interface RevenueReport {
  monthly: MonthlyRevenue[];
  byType: RevenueByType[];
  summary: RevenueSummary;
}

export interface ServiceByStatus {
  status: string;
  count: number;
}

export interface ServiceByType {
  type: string;
  count: number;
}

export interface ServiceReport {
  totalServices: number;
  byStatus: ServiceByStatus[];
  byType: ServiceByType[];
}

export interface TopCustomer {
  id: string;
  name: string;
  company: string | null;
  totalSpent: number;
  serviceCount: number;
}

export interface CustomerReport {
  totalCustomers: number;
  activeCustomers: number;
  topCustomers: TopCustomer[];
}

export interface LowStockPart {
  id: string;
  name: string;
  partNumber: string | null;
  quantity: number;
  unitCost: number | null;
  minQuantity: number | null;
}

export interface InventoryReport {
  totalParts: number;
  totalItems: number;
  totalValue: number;
  lowStock: LowStockPart[];
}

// Enhanced report types

export interface TechnicianMetrics {
  techName: string;
  jobCount: number;
  totalRevenue: number;
  avgRevenue: number;
  totalLaborHours: number;
  avgHours: number;
}

export interface TechnicianReport {
  technicians: TechnicianMetrics[];
  totalJobs: number;
  totalRevenue: number;
}

export interface PartUsage {
  name: string;
  partNumber: string | null;
  usageCount: number;
  totalQuantity: number;
  totalRevenue: number;
}

export interface PartsUsageReport {
  parts: PartUsage[];
  totalPartsRevenue: number;
  totalPartsUsed: number;
}

export interface DayOfWeekDistribution {
  day: string;
  count: number;
}

export interface MonthlyTrend {
  month: string;
  count: number;
  revenue: number;
}

export interface ServiceTypeAnalytics {
  type: string;
  count: number;
  avgValue: number;
  avgHours: number;
}

export interface JobAnalyticsReport {
  avgJobValue: number;
  totalJobs: number;
  topServiceTypes: ServiceTypeAnalytics[];
  dayOfWeek: DayOfWeekDistribution[];
  monthlyTrend: MonthlyTrend[];
}

export interface RetentionCustomer {
  id: string;
  name: string;
  company: string | null;
  visitCount: number;
  totalSpent: number;
  avgTimeBetweenVisits: number | null;
}

export interface CustomerRetentionReport {
  returningCustomers: number;
  newCustomers: number;
  totalActive: number;
  avgTimeBetweenVisits: number | null;
  topReturning: RetentionCustomer[];
}
