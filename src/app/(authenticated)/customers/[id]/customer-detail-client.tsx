"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Pencil,
  Phone,
  Users,
} from "lucide-react";
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

export function CustomerDetailClient({ customer, unitSystem = "imperial" }: { customer: CustomerDetail; unitSystem?: "metric" | "imperial" }) {
  const router = useRouter();
  const [showEditForm, setShowEditForm] = useState(false);

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

      {/* Vehicles */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">
          Vehicles ({customer.vehicles.length})
        </h2>

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
      </div>
      <CustomerForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        customer={customer}
      />
    </div>
  );
}
