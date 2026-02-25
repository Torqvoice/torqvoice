"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Building2,
  Car,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SmsConversation } from "@/features/sms/Components/SmsConversation";
import { CustomerForm } from "@/features/customers/Components/CustomerForm";
import { updateServiceRequest, createWorkOrderFromRequest } from "@/features/customers/Actions/customerActions";
import { SendSmsDialog } from "@/features/sms/Components/SendSmsDialog";
import { toast } from "sonner";

interface ServiceRequestItem {
  id: string;
  description: string;
  preferredDate: Date | null;
  status: string;
  adminNotes: string | null;
  createdAt: Date;
  vehicle: { id: string; make: string; model: string; year: number };
}

interface CustomerDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  company: string | null;
  notes: string | null;
  vehicles: {
    id: string;
    make: string;
    model: string;
    year: number;
    mileage: number;
    licensePlate: string | null;
    _count: { serviceRecords: number };
  }[];
  serviceRequests?: ServiceRequestItem[];
}

interface SmsMessage {
  id: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string | Date;
  fromNumber: string;
  toNumber: string;
}

export function CustomerDetailClient({
  customer,
  unitSystem = "imperial",
  smsEnabled = false,
  smsMessages = [],
  smsNextCursor = null,
}: {
  customer: CustomerDetail;
  unitSystem?: "metric" | "imperial";
  smsEnabled?: boolean;
  smsMessages?: SmsMessage[];
  smsNextCursor?: string | null;
}) {
  const t = useTranslations("customers.detail");
  const ts = useTranslations("customers.serviceRequests");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showEditForm, setShowEditForm] = useState(false);

  const tabParam = searchParams.get("tab");
  const activeTab =
    tabParam === "messages" && smsEnabled
      ? "messages"
      : tabParam === "requests"
        ? "requests"
        : "vehicles";

  const setActiveTab = (tab: "vehicles" | "messages" | "requests") => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "vehicles") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.replace(`/customers/${customer.id}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const hasContactInfo = customer.email || customer.phone || customer.address || customer.company || customer.notes;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link
          href="/customers"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToCustomers")}
        </Link>

        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{customer.name}</h1>
            {hasContactInfo && (
              <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                {customer.company && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>{customer.company}</span>
                  </div>
                )}
                {customer.email && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(customer.email!);
                      toast.success(t("emailCopied"));
                    }}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>{customer.email}</span>
                  </button>
                )}
                {customer.phone && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(customer.phone!);
                      toast.success(t("phoneCopied"));
                    }}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    <span>{customer.phone}</span>
                  </button>
                )}
                {customer.address && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{customer.address}</span>
                  </div>
                )}
              </div>
            )}
            {customer.notes && (
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {customer.notes}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowEditForm(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            {t("editCustomer")}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b mb-4">
          <button
            type="button"
            onClick={() => setActiveTab("vehicles")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "vehicles"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Car className="h-4 w-4" />
            {t("tabs.vehicles", { count: customer.vehicles.length })}
          </button>
          {smsEnabled && (
            <button
              type="button"
              onClick={() => setActiveTab("messages")}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === "messages"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <MessageSquare className="h-4 w-4" />
              {t("tabs.messages")}
            </button>
          )}
          {(customer.serviceRequests?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("requests")}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === "requests"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Wrench className="h-4 w-4" />
              {t("tabs.requests", { count: customer.serviceRequests!.length })}
            </button>
          )}
        </div>

        {activeTab === "vehicles" && (
          <>
            {customer.vehicles.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center py-12">
                  <Car className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {t("noVehicles")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">{t("vehicleTable.plate")}</TableHead>
                      <TableHead>{t("vehicleTable.vehicle")}</TableHead>
                      <TableHead className="hidden sm:table-cell w-[100px] text-right">{t("vehicleTable.mileage")}</TableHead>
                      <TableHead className="w-[80px] text-center">{t("vehicleTable.services")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.vehicles.map((v) => (
                      <TableRow
                        key={v.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/vehicles/${v.id}`)}
                      >
                        <TableCell className="font-mono text-sm">
                          {v.licensePlate || "-"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {v.year} {v.make} {v.model}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-right font-mono text-sm">
                          {v.mileage.toLocaleString()} {unitSystem === "metric" ? "km" : "mi"}
                        </TableCell>
                        <TableCell className="text-center">{v._count.serviceRecords}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {activeTab === "messages" && smsEnabled && (
          <Card>
            <CardContent className="p-0">
              <SmsConversation
                customerId={customer.id}
                customerName={customer.name}
                customerPhone={customer.phone}
                initialMessages={smsMessages}
                initialNextCursor={smsNextCursor}
              />
            </CardContent>
          </Card>
        )}

        {activeTab === "requests" && customer.serviceRequests && (
          <div className="space-y-3">
            {customer.serviceRequests.map((req) => (
              <ServiceRequestCard
                key={req.id}
                request={req}
                smsEnabled={smsEnabled}
                customerPhone={customer.phone}
                customerName={customer.name}
                customerId={customer.id}
              />
            ))}
          </div>
        )}
      </div>
      <CustomerForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        customer={customer}
      />
    </div>
  );
}

function ServiceRequestCard({
  request,
  smsEnabled,
  customerPhone,
  customerName,
  customerId,
}: {
  request: ServiceRequestItem;
  smsEnabled: boolean;
  customerPhone: string | null;
  customerName: string;
  customerId: string;
}) {
  const t = useTranslations("customers.serviceRequests");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(request.adminNotes ?? "");
  const [showNotes, setShowNotes] = useState(false);
  const [showSmsDialog, setShowSmsDialog] = useState(false);

  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline"; icon: React.ReactNode }> = {
    pending: { label: t("statusNew"), variant: "secondary", icon: <Clock className="h-3 w-3" /> },
    converted: { label: t("statusConverted"), variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
    dismissed: { label: t("statusDismissed"), variant: "outline", icon: <X className="h-3 w-3" /> },
  };

  const config = statusConfig[request.status] ?? statusConfig.pending;

  const workOrderId = (() => {
    if (!request.adminNotes) return null;
    const match = request.adminNotes.match(/Work Order: (\S+)/);
    return match ? match[1] : null;
  })();

  const handleCreateWorkOrder = () => {
    startTransition(async () => {
      const result = await createWorkOrderFromRequest(request.id);
      if (result.success && result.data) {
        toast.success(t("workOrderCreated"));
        router.push(`/vehicles/${result.data.vehicleId}/service/${result.data.serviceRecordId}`);
      } else {
        toast.error(result.error ?? t("workOrderError"));
      }
    });
  };

  const handleDismiss = () => {
    startTransition(async () => {
      const result = await updateServiceRequest(request.id, {
        status: "dismissed",
        adminNotes: notes || undefined,
      });
      if (result.success) {
        toast.success(t("requestDismissed"));
        router.refresh();
      } else {
        toast.error(result.error ?? t("dismissError"));
      }
    });
  };

  const handleSaveNotes = () => {
    startTransition(async () => {
      const result = await updateServiceRequest(request.id, {
        adminNotes: notes || undefined,
      });
      if (result.success) {
        toast.success(t("notesSaved"));
        router.refresh();
      } else {
        toast.error(result.error ?? t("notesSaveError"));
      }
    });
  };

  const canSms = smsEnabled && !!customerPhone;
  const vehicleDisplay = `${request.vehicle.year} ${request.vehicle.make} ${request.vehicle.model}`;

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">
                  {vehicleDisplay}
                </p>
                <Badge variant={config.variant} className="gap-1">
                  {config.icon}
                  {config.label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                {request.description}
              </p>
              <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                <span>{t("submitted", { date: new Date(request.createdAt).toLocaleDateString() })}</span>
                {request.preferredDate && (
                  <span>{t("preferred", { date: new Date(request.preferredDate).toLocaleDateString() })}</span>
                )}
              </div>
              {request.adminNotes && !showNotes && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium">{t("staffNotes")}</span> {request.adminNotes}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            {request.status === "pending" && (
              <>
                <Button
                  size="sm"
                  onClick={handleCreateWorkOrder}
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
                  {t("createWorkOrder")}
                </Button>
                {canSms && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSmsDialog(true)}
                    disabled={isPending}
                  >
                    <MessageSquare className="mr-1 h-3 w-3" />
                    {t("contactCustomer")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                  disabled={isPending}
                >
                  <X className="mr-1 h-3 w-3" />
                  {t("dismiss")}
                </Button>
              </>
            )}
            {request.status === "converted" && workOrderId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/vehicles/${request.vehicle.id}/service/${workOrderId}`)}
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                {t("viewWorkOrder")}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowNotes(!showNotes)}
            >
              <Pencil className="mr-1 h-3 w-3" />
              {showNotes ? t("hideNotes") : t("notes")}
            </Button>
          </div>

          {showNotes && (
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder={t("notesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
              <Button size="sm" onClick={handleSaveNotes} disabled={isPending}>
                {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {t("saveNotes")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canSms && (
        <SendSmsDialog
          open={showSmsDialog}
          onOpenChange={setShowSmsDialog}
          customerId={customerId}
          customerName={customerName}
          customerPhone={customerPhone!}
          entityLabel={t("smsLabel")}
          defaultMessage={t("smsDefault", { name: customerName, vehicle: vehicleDisplay })}
          relatedEntityType="service_request"
          relatedEntityId={request.id}
        />
      )}
    </>
  );
}
