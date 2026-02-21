"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Users,
} from "lucide-react";
import { SmsConversation } from "@/features/sms/Components/SmsConversation";
import { CustomerForm } from "@/features/customers/Components/CustomerForm";
import { toast } from "sonner";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showEditForm, setShowEditForm] = useState(false);

  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "messages" && smsEnabled ? "messages" : "vehicles";

  const setActiveTab = (tab: "vehicles" | "messages") => {
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
          Back to customers
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
                      toast.success("Email copied to clipboard");
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
                      toast.success("Phone number copied to clipboard");
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
            Edit Customer
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
            Vehicles ({customer.vehicles.length})
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
              Messages
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
                    No vehicles assigned to this customer
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Plate</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead className="hidden sm:table-cell w-[100px] text-right">Mileage</TableHead>
                      <TableHead className="w-[80px] text-center">Services</TableHead>
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
      </div>
      <CustomerForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        customer={customer}
      />
    </div>
  );
}
