"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatDate } from "@/lib/use-format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useGlassModal } from "@/components/glass-modal";
import { useConfirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { deleteServiceRecord, deleteServiceAttachment, generatePublicLink, revokePublicLink } from "@/features/vehicles/Actions/serviceActions";
import { createPayment, deletePayment } from "@/features/payments/Actions/paymentActions";
import { sendInvoiceEmail } from "@/features/email/Actions/emailActions";
import { SendEmailDialog } from "@/features/email/Components/SendEmailDialog";
import { CustomFieldsDisplay } from "@/features/custom-fields/Components/CustomFieldsDisplay";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Building2,
  Camera,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  FileText,
  Globe,
  Image as ImageIcon,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Users,
  Wrench,
  X as XIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";

const typeColors: Record<string, string> = {
  maintenance: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  repair: "bg-red-500/10 text-red-500 border-red-500/20",
  upgrade: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  inspection: "bg-amber-500/10 text-amber-500 border-amber-500/20",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  "in-progress": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

interface ServiceDetail {
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
  partItems: {
    id: string;
    partNumber: string | null;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  laborItems: {
    id: string;
    description: string;
    hours: number;
    rate: number;
    total: number;
  }[];
  attachments: {
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
    category: string;
    description: string | null;
    createdAt: Date;
  }[];
  payments: {
    id: string;
    amount: number;
    date: Date;
    method: string;
    note: string | null;
    createdAt: Date;
  }[];
  vehicle: {
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
  };
}

export function ServiceDetailClient({
  record,
  vehicleId,
  organizationId,
  currencyCode = "USD",
  unitSystem = "imperial",
}: {
  record: ServiceDetail;
  vehicleId: string;
  organizationId: string;
  currencyCode?: string;
  unitSystem?: "metric" | "imperial";
}) {
  const cs = getCurrencySymbol(currencyCode);
  const distUnit = unitSystem === "metric" ? "km" : "mi";
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const modal = useGlassModal();
  const confirm = useConfirm();
  const [downloading, setDownloading] = useState(false);
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(record.publicToken);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = publicToken && organizationId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/invoice/${organizationId}/${publicToken}`
    : null;

  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    const result = await generatePublicLink(record.id);
    if (result.success && result.data) {
      setPublicToken(result.data.token);
    }
    setGeneratingLink(false);
  };

  const handleRevokeLink = async () => {
    await revokePublicLink(record.id);
    setPublicToken(null);
  };

  const handleCopyLink = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({ title: "Delete Service Record", description: "This will permanently delete this service record and all associated data. This cannot be undone.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    const result = await deleteServiceRecord(record.id);
    if (result.success) {
      router.push(`/vehicles/${vehicleId}`);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || "Failed to delete");
    }
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/services/${record.id}/pdf`);
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
        `invoice-${record.invoiceNumber || record.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      modal.open("error", "Error", "Failed to generate PDF invoice");
    }
    setDownloading(false);
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    const ok = await confirm({ title: "Delete Attachment", description: "This will permanently delete this attachment. This cannot be undone.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    setDeletingAttachment(attachmentId);
    const result = await deleteServiceAttachment(attachmentId);
    if (result.success) {
      toast.success("Attachment deleted");
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || "Failed to delete attachment");
    }
    setDeletingAttachment(null);
  };

  const handleCreatePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPaymentLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await createPayment({
      serviceRecordId: record.id,
      amount: Number(formData.get("paymentAmount")),
      date: (formData.get("paymentDate") as string) || new Date().toISOString(),
      method: formData.get("paymentMethod") as string,
      note: (formData.get("paymentNote") as string) || undefined,
    });
    if (result.success) {
      toast.success("Payment recorded");
      setShowPaymentForm(false);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || "Failed to record payment");
    }
    setPaymentLoading(false);
  };

  const handleDeletePayment = async (paymentId: string) => {
    const ok = await confirm({ title: "Delete Payment", description: "This will remove this payment record.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    setDeletingPayment(paymentId);
    const result = await deletePayment(paymentId);
    if (result.success) {
      toast.success("Payment deleted");
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || "Failed to delete payment");
    }
    setDeletingPayment(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    if (type === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
    if (type.startsWith("image/")) return <ImageIcon className="h-5 w-5 text-blue-500" />;
    return <Paperclip className="h-5 w-5 text-muted-foreground" />;
  };

  const vehicleName = `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`;
  const partsSubtotal = record.partItems.reduce((sum, p) => sum + p.total, 0);
  const laborSubtotal = record.laborItems.reduce((sum, l) => sum + l.total, 0);
  const displayTotal = record.totalAmount > 0 ? record.totalAmount : record.cost;
  const totalPaid = record.payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  const balanceDue = displayTotal - totalPaid;
  const paymentStatus = totalPaid === 0 ? "unpaid" : balanceDue <= 0 ? "paid" : "partial";

  // Image carousel helpers
  const imageAttachments = record.attachments?.filter((a) => a.category === "image") || [];
  const closeCarousel = () => setCarouselIndex(null);
  const prevImage = () => setCarouselIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  const nextImage = () =>
    setCarouselIndex((i) => (i !== null && i < imageAttachments.length - 1 ? i + 1 : i));

  useEffect(() => {
    if (carouselIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCarousel();
      else if (e.key === "ArrowLeft") prevImage();
      else if (e.key === "ArrowRight") nextImage();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [carouselIndex, imageAttachments.length]);

  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) prevImage();
      else nextImage();
    }
    touchStartX.current = null;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Sticky Header */}
      <div className="shrink-0 border-b bg-background px-4 pt-2 pb-2">
        <div className="flex items-center justify-between">
          <Link
            href={`/vehicles/${vehicleId}`}
            className="flex items-center gap-3 text-foreground transition-colors hover:text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    paymentStatus === "paid"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : paymentStatus === "partial"
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                  }`}
                >
                  {paymentStatus === "paid" ? "Paid" : paymentStatus === "partial" ? "Partial" : "Unpaid"}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-xs ${statusColors[record.status] || ""}`}
                >
                  {record.status}
                </Badge>
                <h1 className="text-lg font-semibold leading-tight">{record.title}</h1>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDate(new Date(record.serviceDate))}
                {record.shopName && ` · ${record.shopName}`}
                {record.techName && ` · Tech: ${record.techName}`}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/vehicles/${vehicleId}/service/${record.id}/edit`}>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={downloading}>
              {downloading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1 h-3.5 w-3.5" />
              )}
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowEmailDialog(true)}>
              <Mail className="mr-1 h-3.5 w-3.5" />
              Email
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowShareDialog(true)}>
              <Globe className="mr-1 h-3.5 w-3.5" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-6">
      {/* Vehicle & Customer Info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Car className="h-4 w-4" />
              Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{vehicleName}</p>
            {record.vehicle.licensePlate && (
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {record.vehicle.licensePlate}
              </p>
            )}
            {record.vehicle.vin && (
              <p className="font-mono text-xs text-muted-foreground">
                VIN: {record.vehicle.vin}
              </p>
            )}
            {record.mileage && (
              <p className="mt-1 text-sm text-muted-foreground">
                Mileage at service: {record.mileage.toLocaleString()} {distUnit}
              </p>
            )}
          </CardContent>
        </Card>

        {record.vehicle.customer && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href={`/customers/${record.vehicle.customer.id}`}
                className="font-semibold hover:underline"
              >
                {record.vehicle.customer.name}
              </Link>
              <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {record.vehicle.customer.company && (
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" />
                    {record.vehicle.customer.company}
                  </div>
                )}
                {record.vehicle.customer.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3" />
                    {record.vehicle.customer.email}
                  </div>
                )}
                {record.vehicle.customer.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3" />
                    {record.vehicle.customer.phone}
                  </div>
                )}
                {record.vehicle.customer.address && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    {record.vehicle.customer.address}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Invoice Notes */}
      {record.invoiceNotes && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Invoice Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{record.invoiceNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* Diagnostic Notes */}
      {record.diagnosticNotes && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Diagnostic Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{record.diagnosticNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* Service Images */}
      {imageAttachments.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4" />
              Service Images ({imageAttachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {imageAttachments.map((attachment, idx) => (
                  <div key={attachment.id} className="group overflow-hidden rounded-lg border">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setCarouselIndex(idx)}
                        className="block w-full cursor-zoom-in"
                      >
                        <img
                          src={attachment.fileUrl}
                          alt={attachment.description || attachment.fileName}
                          className="aspect-square w-full object-cover"
                        />
                      </button>
                      <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="secondary" size="icon" className="h-6 w-6" asChild>
                          <a href={attachment.fileUrl} download={attachment.fileName}>
                            <Download className="h-3 w-3" />
                          </a>
                        </Button>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-6 w-6 hover:text-destructive"
                          disabled={deletingAttachment === attachment.id}
                          onClick={() => handleDeleteAttachment(attachment.id)}
                        >
                          {deletingAttachment === attachment.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {attachment.description && (
                      <p className="truncate px-1.5 py-1 text-xs text-muted-foreground">{attachment.description}</p>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diagnostic Reports & Documents */}
      {record.attachments && record.attachments.filter((a) => a.category === "diagnostic" || a.category === "document").length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {record.attachments.filter((a) => a.category === "diagnostic").length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Diagnostic Reports ({record.attachments.filter((a) => a.category === "diagnostic").length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {record.attachments
                    .filter((a) => a.category === "diagnostic")
                    .map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border bg-muted/50">
                          {getFileIcon(attachment.fileType)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.fileSize)}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <a href={attachment.fileUrl} download={attachment.fileName}>
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            disabled={deletingAttachment === attachment.id}
                            onClick={() => handleDeleteAttachment(attachment.id)}
                          >
                            {deletingAttachment === attachment.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {record.attachments.filter((a) => a.category === "document").length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Paperclip className="h-4 w-4" />
                  Documents ({record.attachments.filter((a) => a.category === "document").length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {record.attachments
                    .filter((a) => a.category === "document")
                    .map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border bg-muted/50">
                          {getFileIcon(attachment.fileType)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.fileSize)}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <a href={attachment.fileUrl} download={attachment.fileName}>
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            disabled={deletingAttachment === attachment.id}
                            onClick={() => handleDeleteAttachment(attachment.id)}
                          >
                            {deletingAttachment === attachment.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Image Carousel Modal */}
      {carouselIndex !== null && imageAttachments[carouselIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeCarousel}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={closeCarousel}
            className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:top-4 sm:right-4"
          >
            <XIcon className="h-5 w-5" />
          </button>

          {/* Counter */}
          {imageAttachments.length > 1 && (
            <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white sm:top-4">
              {carouselIndex + 1} / {imageAttachments.length}
            </div>
          )}

          {/* Previous button */}
          {carouselIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevImage(); }}
              className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:left-4 sm:h-12 sm:w-12"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Next button */}
          {carouselIndex < imageAttachments.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
              className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:right-4 sm:h-12 sm:w-12"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Image */}
          <div className="flex max-h-[85vh] max-w-[90vw] flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={imageAttachments[carouselIndex].fileUrl}
              alt={imageAttachments[carouselIndex].description || imageAttachments[carouselIndex].fileName}
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
              draggable={false}
            />
            {imageAttachments[carouselIndex].description && (
              <p className="mt-2 max-w-md text-center text-sm text-white/80">
                {imageAttachments[carouselIndex].description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Parts Table */}
      {record.partItems.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4" />
              Parts ({record.partItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Part #</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">Unit Price</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {record.partItems.map((part) => (
                    <tr key={part.id}>
                      <td className="py-2 font-mono text-xs">
                        {part.partNumber || "-"}
                      </td>
                      <td className="py-2">{part.name}</td>
                      <td className="py-2 text-right">{part.quantity}</td>
                      <td className="py-2 text-right">{formatCurrency(part.unitPrice, currencyCode)}</td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(part.total, currencyCode)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={4} className="pt-2 text-right font-medium">
                      Parts Subtotal
                    </td>
                    <td className="pt-2 text-right font-bold">
                      {formatCurrency(partsSubtotal, currencyCode)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Labor Table */}
      {record.laborItems.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Labor ({record.laborItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium" style={{ width: "40%" }}>Description</th>
                    <th className="pb-2 text-right font-medium">Hours</th>
                    <th className="pb-2 text-right font-medium">Rate</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {record.laborItems.map((labor) => (
                    <tr key={labor.id}>
                      <td className="py-2 whitespace-pre-wrap">{labor.description}</td>
                      <td className="py-2 text-right">{labor.hours}</td>
                      <td className="py-2 text-right">{formatCurrency(labor.rate, currencyCode)}/hr</td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(labor.total, currencyCode)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={3} className="pt-2 text-right font-medium">
                      Labor Subtotal
                    </td>
                    <td className="pt-2 text-right font-bold">
                      {formatCurrency(laborSubtotal, currencyCode)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legacy parts/labor display for old records */}
      {record.partItems.length === 0 && record.laborItems.length === 0 && (record.parts || record.laborHours) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Service Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {record.parts && (
              <div>
                <span className="font-medium text-muted-foreground">Parts: </span>
                {record.parts}
              </div>
            )}
            {record.laborHours && (
              <div>
                <span className="font-medium text-muted-foreground">Labor Hours: </span>
                {record.laborHours}h
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Totals */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Invoice Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {record.partItems.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Parts</span>
                <span>{formatCurrency(partsSubtotal, currencyCode)}</span>
              </div>
            )}
            {record.laborItems.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Labor</span>
                <span>{formatCurrency(laborSubtotal, currencyCode)}</span>
              </div>
            )}
            {record.subtotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(record.subtotal, currencyCode)}</span>
              </div>
            )}
            {record.discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Discount{record.discountType === "percentage" ? ` (${record.discountValue}%)` : ""}
                </span>
                <span className="text-destructive">{formatCurrency(-record.discountAmount, currencyCode)}</span>
              </div>
            )}
            {record.taxRate > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({record.taxRate}%)</span>
                <span>{formatCurrency(record.taxAmount, currencyCode)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatCurrency(displayTotal, currencyCode)}</span>
            </div>
            {record.payments && record.payments.length > 0 && (
              <>
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Paid</span>
                  <span>{formatCurrency(-totalPaid, currencyCode)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Balance Due</span>
                  <span className={balanceDue <= 0 ? "text-emerald-600" : ""}>
                    {balanceDue <= 0 ? "PAID" : formatCurrency(balanceDue, currencyCode)}
                  </span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payments */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              Payments
            </CardTitle>
            <Badge
              variant="outline"
              className={
                paymentStatus === "paid"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  : paymentStatus === "partial"
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  : "bg-gray-500/10 text-gray-500 border-gray-500/20"
              }
            >
              {paymentStatus === "paid" ? "Paid" : paymentStatus === "partial" ? "Partial" : "Unpaid"}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPaymentForm(!showPaymentForm)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Record Payment
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Paid</span>
            <span className="font-medium">{formatCurrency(totalPaid, currencyCode)} / {formatCurrency(displayTotal, currencyCode)}</span>
          </div>

          {showPaymentForm && (
            <form onSubmit={handleCreatePayment} className="space-y-3 rounded-lg border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="paymentAmount" className="text-xs">Amount</Label>
                  <Input
                    id="paymentAmount"
                    name="paymentAmount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={balanceDue > 0 ? balanceDue.toFixed(2) : ""}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="paymentDate" className="text-xs">Date</Label>
                  <Input
                    id="paymentDate"
                    name="paymentDate"
                    type="date"
                    defaultValue={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Method</Label>
                  <Select name="paymentMethod" defaultValue="other">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="paymentNote" className="text-xs">Note</Label>
                  <Input id="paymentNote" name="paymentNote" placeholder="Optional note" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={paymentLoading}>
                  {paymentLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Save Payment
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowPaymentForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {record.payments && record.payments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                    <th className="pb-2 font-medium">Method</th>
                    <th className="pb-2 font-medium">Note</th>
                    <th className="pb-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {record.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-2">{formatDate(new Date(payment.date))}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(payment.amount, currencyCode)}</td>
                      <td className="py-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {payment.method}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted-foreground">{payment.note || "-"}</td>
                      <td className="py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={deletingPayment === payment.id}
                          onClick={() => handleDeletePayment(payment.id)}
                        >
                          {deletingPayment === payment.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Fields */}
      <CustomFieldsDisplay entityId={record.id} entityType="service_record" />

      {/* Additional Notes */}
      {record.description && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{record.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Email Invoice Dialog */}
      <SendEmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        defaultEmail={record.vehicle.customer?.email || ""}
        entityLabel="Invoice"
        onSend={async (email, message) => {
          return sendInvoiceEmail({ serviceRecordId: record.id, recipientEmail: email, message });
        }}
      />

      {/* Share Invoice Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Share Invoice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a public link that allows anyone to view and download this invoice without signing in.
            </p>
            {publicUrl ? (
              <>
                <div className="flex items-center gap-2">
                  <Input value={publicUrl} readOnly className="text-xs font-mono" />
                  <Button variant="outline" size="icon" onClick={handleCopyLink}>
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleRevokeLink}
                >
                  Revoke Link
                </Button>
              </>
            ) : (
              <Button onClick={handleGenerateLink} disabled={generatingLink}>
                {generatingLink && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Public Link
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
    </div>
  );
}
