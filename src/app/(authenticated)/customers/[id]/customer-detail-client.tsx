"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
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
  Phone,
  Users,
} from "lucide-react";

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
          <div>
            <h1 className="text-2xl font-bold">{customer.name}</h1>
            {customer.company && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {customer.company}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {customer.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{customer.email}</span>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.address && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{customer.address}</span>
              </div>
            )}
            {customer.company && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>{customer.company}</span>
              </div>
            )}
          </div>
          {customer.notes && (
            <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap border-t pt-3">
              {customer.notes}
            </p>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
