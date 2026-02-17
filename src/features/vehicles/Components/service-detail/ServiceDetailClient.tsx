"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGlassModal } from "@/components/glass-modal";
import { useConfirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { deleteServiceRecord, deleteServiceAttachment } from "@/features/vehicles/Actions/serviceActions";
import { createPayment, deletePayment } from "@/features/payments/Actions/paymentActions";
import { sendInvoiceEmail } from "@/features/email/Actions/emailActions";
import { SendEmailDialog } from "@/features/email/Components/SendEmailDialog";
import { useFormatDate } from "@/lib/use-format-date";
import type { ServiceDetail } from "./types";
import { ServiceDetailHeader } from "./ServiceDetailHeader";
import { PartsTable } from "./PartsTable";
import { LaborTable } from "./LaborTable";
import { InvoiceSummary } from "./InvoiceSummary";
import { PaymentsSection } from "./PaymentsSection";
import { ServiceSidebar } from "./ServiceSidebar";
import { ServiceAttachments } from "./ServiceAttachments";
import { ImageCarousel } from "./ImageCarousel";
import { ShareDialog } from "./ShareDialog";
import { ServiceDetailContent } from "./ServiceDetailContent";

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
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const modal = useGlassModal();
  const confirm = useConfirm();
  const distUnit = unitSystem === "metric" ? "km" : "mi";

  const [downloading, setDownloading] = useState(false);
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const partsSubtotal = record.partItems.reduce((sum, p) => sum + p.total, 0);
  const laborSubtotal = record.laborItems.reduce((sum, l) => sum + l.total, 0);
  const displayTotal = record.totalAmount > 0 ? record.totalAmount : record.cost;
  const totalPaid = record.payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  const balanceDue = displayTotal - totalPaid;
  const paymentStatus = totalPaid === 0 ? "unpaid" : balanceDue <= 0 ? "paid" : "partial";
  const imageAttachments = record.attachments?.filter((a) => a.category === "image") || [];
  const vehicleName = `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`;

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete Service Record",
      description: "This will permanently delete this service record and all associated data. This cannot be undone.",
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    const result = await deleteServiceRecord(record.id);
    if (result.success) { router.push(`/vehicles/${vehicleId}`); router.refresh(); }
    else modal.open("error", "Error", result.error || "Failed to delete");
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/services/${record.id}/pdf`);
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1]
        || `invoice-${record.invoiceNumber || record.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { modal.open("error", "Error", "Failed to generate PDF invoice"); }
    setDownloading(false);
  };

  const handleDeleteAttachment = async (id: string) => {
    const ok = await confirm({
      title: "Delete Attachment",
      description: "This will permanently delete this attachment. This cannot be undone.",
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    setDeletingAttachment(id);
    const result = await deleteServiceAttachment(id);
    if (result.success) { toast.success("Attachment deleted"); router.refresh(); }
    else modal.open("error", "Error", result.error || "Failed to delete attachment");
    setDeletingAttachment(null);
  };

  const handleCreatePayment = async (data: { amount: number; date: string; method: string; note?: string }) => {
    setPaymentLoading(true);
    const result = await createPayment({ serviceRecordId: record.id, ...data });
    setPaymentLoading(false);
    if (result.success) { toast.success("Payment recorded"); router.refresh(); return true; }
    modal.open("error", "Error", result.error || "Failed to record payment");
    return false;
  };

  const handleDeletePayment = async (id: string) => {
    const ok = await confirm({
      title: "Delete Payment",
      description: "This will remove this payment record.",
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    setDeletingPayment(id);
    const result = await deletePayment(id);
    if (result.success) { toast.success("Payment deleted"); router.refresh(); }
    else modal.open("error", "Error", result.error || "Failed to delete payment");
    setDeletingPayment(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ServiceDetailHeader
        vehicleId={vehicleId} recordId={record.id} title={record.title}
        status={record.status} serviceDate={formatDate(new Date(record.serviceDate))}
        shopName={record.shopName} techName={record.techName} paymentStatus={paymentStatus}
        downloading={downloading} onDownloadPDF={handleDownloadPDF} onDelete={handleDelete}
        onShowEmail={() => setShowEmailDialog(true)} onShowShare={() => setShowShareDialog(true)}
      />
      <ServiceDetailContent
        leftColumn={
          <>
            <PartsTable parts={record.partItems} partsSubtotal={partsSubtotal} currencyCode={currencyCode} />
            <LaborTable laborItems={record.laborItems} laborSubtotal={laborSubtotal} currencyCode={currencyCode} />
            {record.partItems.length === 0 && record.laborItems.length === 0 && (record.parts || record.laborHours) && (
              <div className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Service Details</h3>
                <div className="space-y-1 text-sm">
                  {record.parts && <div><span className="font-medium text-muted-foreground">Parts: </span>{record.parts}</div>}
                  {record.laborHours && <div><span className="font-medium text-muted-foreground">Labor Hours: </span>{record.laborHours}h</div>}
                </div>
              </div>
            )}
            <InvoiceSummary
              hasPartItems={record.partItems.length > 0} hasLaborItems={record.laborItems.length > 0}
              partsSubtotal={partsSubtotal} laborSubtotal={laborSubtotal} subtotal={record.subtotal}
              discountAmount={record.discountAmount} discountType={record.discountType}
              discountValue={record.discountValue} taxRate={record.taxRate} taxAmount={record.taxAmount}
              displayTotal={displayTotal} totalPaid={totalPaid} balanceDue={balanceDue}
              hasPayments={(record.payments?.length ?? 0) > 0} currencyCode={currencyCode}
            />
            <PaymentsSection
              payments={record.payments || []} paymentStatus={paymentStatus}
              totalPaid={totalPaid} displayTotal={displayTotal} balanceDue={balanceDue}
              currencyCode={currencyCode} onCreatePayment={handleCreatePayment}
              onDeletePayment={handleDeletePayment} paymentLoading={paymentLoading}
              deletingPayment={deletingPayment}
            />
          </>
        }
        rightColumn={
          <>
            <ServiceSidebar
              recordId={record.id} vehicle={record.vehicle} vehicleName={vehicleName}
              distUnit={distUnit} mileage={record.mileage} invoiceNotes={record.invoiceNotes}
              diagnosticNotes={record.diagnosticNotes} description={record.description}
            />
            <ServiceAttachments
              attachments={record.attachments || []} imageAttachments={imageAttachments}
              onImageClick={setCarouselIndex} onDeleteAttachment={handleDeleteAttachment}
              deletingAttachment={deletingAttachment}
            />
          </>
        }
      />
      <ImageCarousel
        images={imageAttachments} currentIndex={carouselIndex}
        onClose={() => setCarouselIndex(null)} onChangeIndex={setCarouselIndex}
      />
      <SendEmailDialog
        open={showEmailDialog} onOpenChange={setShowEmailDialog}
        defaultEmail={record.vehicle.customer?.email || ""} entityLabel="Invoice"
        onSend={async (email, message) => sendInvoiceEmail({ serviceRecordId: record.id, recipientEmail: email, message })}
      />
      <ShareDialog
        open={showShareDialog} onOpenChange={setShowShareDialog}
        recordId={record.id} organizationId={organizationId} initialToken={record.publicToken}
      />
    </div>
  );
}
