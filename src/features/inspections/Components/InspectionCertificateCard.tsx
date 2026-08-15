"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateInspectionDetails } from "../Actions/inspectionActions";
import { VEHICLE_CATEGORIES } from "../Lib/conditions";

function toISODate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/**
 * The certificate fields Directive 2014/45/EU Annex IV requires but that cannot
 * be derived from the checks themselves — vehicle category, odometer reading at
 * the time of the test, where and by whom it was carried out, the certificate
 * number and when the next test is due.
 */
export function InspectionCertificateCard({
  inspection,
  mileageLabel,
  isCompleted,
}: {
  inspection: {
    id: string;
    mileage: number | null;
    vehicleCategory: string | null;
    certificateNumber: string | null;
    inspectorName: string | null;
    testLocation: string | null;
    nextTestDue: Date | string | null;
  };
  mileageLabel: string;
  isCompleted: boolean;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [isPending, startTransition] = useTransition();

  const [mileage, setMileage] = useState(
    inspection.mileage === null ? "" : String(inspection.mileage)
  );
  const [vehicleCategory, setVehicleCategory] = useState(inspection.vehicleCategory ?? "none");
  const [certificateNumber, setCertificateNumber] = useState(inspection.certificateNumber ?? "");
  const [inspectorName, setInspectorName] = useState(inspection.inspectorName ?? "");
  const [testLocation, setTestLocation] = useState(inspection.testLocation ?? "");
  const [nextTestDue, setNextTestDue] = useState(toISODate(inspection.nextTestDue));

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateInspectionDetails(inspection.id, {
        mileage: mileage === "" ? null : Number(mileage),
        vehicleCategory: vehicleCategory === "none" ? null : vehicleCategory,
        certificateNumber: certificateNumber || null,
        inspectorName: inspectorName || null,
        testLocation: testLocation || null,
        nextTestDue: nextTestDue ? new Date(`${nextTestDue}T00:00:00`) : null,
      });
      if (result.success) {
        toast.success("Certificate details saved");
        router.refresh();
      } else {
        toast.error(result.error || "Could not save the certificate details");
      }
    });
  };

  return (
    <section aria-labelledby={`${fieldId}-heading`} className="bg-card rounded-lg border">
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <FileCheck2 className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <h2 id={`${fieldId}-heading`} className="text-sm font-semibold">
            Certificate details
          </h2>
          <p className="text-muted-foreground text-xs">
            Required on a roadworthiness certificate under Directive 2014/45/EU, Annex IV.
          </p>
        </div>
      </header>

      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-category`}>Vehicle category</Label>
          <Select
            value={vehicleCategory}
            onValueChange={setVehicleCategory}
            disabled={isCompleted}
          >
            <SelectTrigger id={`${fieldId}-category`}>
              <SelectValue placeholder="Not recorded" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not recorded</SelectItem>
              {VEHICLE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-mileage`}>{mileageLabel} at time of test</Label>
          <Input
            id={`${fieldId}-mileage`}
            inputMode="numeric"
            value={mileage}
            onChange={(e) => /^\d*$/.test(e.target.value) && setMileage(e.target.value)}
            disabled={isCompleted}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-inspector`}>Inspector</Label>
          <Input
            id={`${fieldId}-inspector`}
            value={inspectorName}
            onChange={(e) => setInspectorName(e.target.value)}
            placeholder="Name of the tester"
            disabled={isCompleted}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-location`}>Place of test</Label>
          <Input
            id={`${fieldId}-location`}
            value={testLocation}
            onChange={(e) => setTestLocation(e.target.value)}
            placeholder="Test centre or workshop address"
            disabled={isCompleted}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-certificate`}>Certificate number</Label>
          <Input
            id={`${fieldId}-certificate`}
            value={certificateNumber}
            onChange={(e) => setCertificateNumber(e.target.value)}
            disabled={isCompleted}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-next`}>Next test due</Label>
          <DateInput
            id={`${fieldId}-next`}
            value={nextTestDue}
            onChange={setNextTestDue}
            placeholder="Not set"
          />
        </div>
      </div>

      {!isCompleted && (
        <div className="flex justify-end border-t px-4 py-3">
          <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Save details
          </Button>
        </div>
      )}
    </section>
  );
}
