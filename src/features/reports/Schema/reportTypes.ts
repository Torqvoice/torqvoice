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
