import type { QuotePartInput, QuoteLaborInput } from "@/features/quotes/Schema/quoteSchema";

export type { QuotePartInput, QuoteLaborInput };

export interface CustomerOption {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

export interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customerId: string | null;
  customerName: string | null;
}

export interface QuoteAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  category: string;
  description: string | null;
  includeInInvoice: boolean;
}

export type TabType = "details" | "images" | "documents";

export interface QuoteRecord {
  id: string;
  quoteNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  validUntil: Date | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountType: string | null;
  discountValue: number;
  discountAmount: number;
  totalAmount: number;
  notes: string | null;
  customerMessage: string | null;
  publicToken: string | null;
  sharedAt: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
  convertedToId: string | null;
  inspectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  partItems: { id: string; partNumber: string | null; name: string; quantity: number; unitPrice: number; total: number; excluded?: boolean }[];
  laborItems: { id: string; description: string; hours: number; rate: number; total: number; excluded?: boolean }[];
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null; company: string | null } | null;
  vehicle: { id: string; make: string; model: string; year: number; vin: string | null; licensePlate: string | null; mileage: number } | null;
}

export const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  sent: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  accepted: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-500 border-red-500/20",
  expired: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  converted: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  changes_requested: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

export const emptyPart = (): QuotePartInput => ({
  partNumber: "",
  name: "",
  quantity: 1,
  unitPrice: 0,
  total: 0,
  excluded: false,
});

export const makeEmptyLabor = (defaultRate: number): QuoteLaborInput => ({
  description: "",
  hours: 0,
  rate: defaultRate,
  total: 0,
  excluded: false,
});
