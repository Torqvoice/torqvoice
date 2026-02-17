export const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  "in-progress": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

export const paymentStatusColors: Record<string, string> = {
  paid: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  partial: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  unpaid: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

export const paymentStatusLabels: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
};

export interface ServiceDetail {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  cost: number;
  mileage: number | null;
  serviceDate: Date;
  shopName: string | null;
  techName: string | null;
  parts: string | null;
  laborHours: number | null;
  diagnosticNotes: string | null;
  invoiceNotes: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  invoiceNumber: string | null;
  discountType: string | null;
  discountValue: number;
  discountAmount: number;
  publicToken: string | null;
  partItems: PartItem[];
  laborItems: LaborItem[];
  attachments: Attachment[];
  payments: Payment[];
  vehicle: Vehicle;
}

export interface PartItem {
  id: string;
  partNumber: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface LaborItem {
  id: string;
  description: string;
  hours: number;
  rate: number;
  total: number;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  category: string;
  description: string | null;
  createdAt: Date;
}

export interface Payment {
  id: string;
  amount: number;
  date: Date;
  method: string;
  note: string | null;
  createdAt: Date;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  licensePlate: string | null;
  mileage: number;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    company: string | null;
  } | null;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
