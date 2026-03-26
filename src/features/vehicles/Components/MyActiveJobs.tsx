"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, ImageIcon, Loader2, Wrench, Clock, Pause, ScanBarcode, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { compressImage } from "@/lib/compress-image";
import { addServiceAttachment } from "@/features/vehicles/Actions/addServiceAttachment";
import { addPartToServiceRecord } from "@/features/vehicles/Actions/addPartToServiceRecord";
import { lookupPartByBarcode } from "@/features/inventory/Actions/lookupPartByBarcode";
import { BarcodeScannerDialog } from "@/components/barcode-scanner-dialog";
import { CreatePartDialog } from "./CreatePartDialog";
import type { MyActiveJob } from "@/features/vehicles/Actions/getMyActiveJobs";

interface MyActiveJobsProps {
  jobs: MyActiveJob[];
}

const STATUS_ICON: Record<string, typeof Wrench> = {
  "in-progress": Wrench,
  pending: Clock,
  "waiting-parts": Pause,
};

const STATUS_COLOR: Record<string, string> = {
  "in-progress": "bg-blue-500/10 text-blue-600",
  pending: "bg-amber-500/10 text-amber-600",
  "waiting-parts": "bg-orange-500/10 text-orange-600",
};

export function MyActiveJobs({ jobs }: MyActiveJobsProps) {
  const t = useTranslations("dashboard.myJobs");
  const router = useRouter();
  const [uploading, setUploading] = useState<string | null>(null);
  const [imageCounts, setImageCounts] = useState<Record<string, number>>(
    () => Object.fromEntries(jobs.map((j) => [j.id, j.imageCount]))
  );
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Barcode scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanJobId, setScanJobId] = useState<string | null>(null);
  const [createPartOpen, setCreatePartOpen] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState("");
  const [partCounts, setPartCounts] = useState<Record<string, number>>(
    () => Object.fromEntries(jobs.map((j) => [j.id, j.partCount]))
  );

  if (jobs.length === 0) return null;

  const handleCameraClick = (jobId: string) => {
    fileInputRefs.current[jobId]?.click();
  };

  const handleScanClick = (jobId: string) => {
    setScanJobId(jobId);
    setScannerOpen(true);
  };

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    if (!scanJobId) return;
    setScannerOpen(false);

    const result = await lookupPartByBarcode(barcode);
    if (result.success && result.data) {
      const part = result.data;
      const price = part.sellPrice > 0 ? part.sellPrice : part.unitCost;
      const addResult = await addPartToServiceRecord({
        serviceRecordId: scanJobId,
        partNumber: part.partNumber || undefined,
        name: part.name,
        quantity: 1,
        unitPrice: price,
        total: price,
        unitCost: part.unitCost,
        inventoryPartId: part.id,
      });
      if (addResult.success) {
        toast.success(t("partAdded", { name: part.name }));
        setPartCounts((prev) => ({ ...prev, [scanJobId]: (prev[scanJobId] || 0) + 1 }));
        router.refresh();
      } else {
        toast.error(addResult.error || t("partAddFailed"));
      }
    } else {
      // Part not found — offer to create it
      setPendingBarcode(barcode);
      setCreatePartOpen(true);
    }
  }, [scanJobId, t, router]);

  const handlePartCreated = useCallback(async (part: { id: string; name: string; partNumber: string | null; sellPrice: number; unitCost: number }) => {
    if (!scanJobId) return;
    setCreatePartOpen(false);

    const price = part.sellPrice > 0 ? part.sellPrice : part.unitCost;
    const addResult = await addPartToServiceRecord({
      serviceRecordId: scanJobId,
      partNumber: part.partNumber || undefined,
      name: part.name,
      quantity: 1,
      unitPrice: price,
      total: price,
      unitCost: part.unitCost,
      inventoryPartId: part.id,
    });
    if (addResult.success) {
      toast.success(t("partAdded", { name: part.name }));
      setPartCounts((prev) => ({ ...prev, [scanJobId]: (prev[scanJobId] || 0) + 1 }));
      router.refresh();
    } else {
      toast.error(addResult.error || t("partAddFailed"));
    }
  }, [scanJobId, t, router]);

  const handleFileSelect = async (jobId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(jobId);

    let uploaded = 0;
    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      if (!file.type.startsWith("image/")) continue;

      try {
        file = await compressImage(file);
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/protected/upload/service-files", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error || t("uploadFailed"));
          continue;
        }

        const data = await res.json();
        await addServiceAttachment({
          serviceRecordId: jobId,
          attachment: {
            fileName: data.fileName,
            fileUrl: data.url,
            fileType: data.fileType,
            fileSize: data.fileSize,
            category: "image",
            includeInInvoice: true,
          },
        });
        uploaded++;
      } catch {
        toast.error(t("uploadFailed"));
      }
    }

    if (uploaded > 0) {
      toast.success(t("uploadSuccess", { count: uploaded }));
      setImageCounts((prev) => ({
        ...prev,
        [jobId]: (prev[jobId] || 0) + uploaded,
      }));
      router.refresh();
    }

    setUploading(null);
    const input = fileInputRefs.current[jobId];
    if (input) input.value = "";
  };

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="px-4 pb-1 pt-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            {t("title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {jobs.map((job) => {
              const StatusIcon = STATUS_ICON[job.status] || Wrench;
              const statusColor = STATUS_COLOR[job.status] || "bg-muted text-muted-foreground";
              const isUploading = uploading === job.id;
              const imgCount = imageCounts[job.id] || 0;
              const prtCount = partCounts[job.id] || 0;

              return (
                <div
                  key={job.id}
                  className="px-4 py-2"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-80"
                      onClick={() => router.push(`/vehicles/${job.vehicleId}/service/${job.id}`)}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${statusColor}`}>
                        <StatusIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {job.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
                          {job.vehicle.licensePlate && ` · ${job.vehicle.licensePlate}`}
                        </p>
                      </div>
                    </div>
                    {/* Desktop: inline buttons */}
                    <div className="shrink-0 ml-3 hidden sm:flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {imgCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <ImageIcon className="h-3 w-3" />
                            {imgCount}
                          </span>
                        )}
                        {prtCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Package className="h-3 w-3" />
                            {prtCount}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        disabled={isUploading}
                        onClick={() => handleCameraClick(job.id)}
                        title={t("takePhoto")}
                      >
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => handleScanClick(job.id)}
                        title={t("scanPart")}
                      >
                        <ScanBarcode className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Mobile: counters only */}
                    <div className="shrink-0 ml-3 flex sm:hidden items-center gap-1.5 text-xs text-muted-foreground">
                      {imgCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <ImageIcon className="h-3 w-3" />
                          {imgCount}
                        </span>
                      )}
                      {prtCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Package className="h-3 w-3" />
                          {prtCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Mobile: action buttons on second line */}
                  <div className="flex gap-2 mt-2 sm:hidden">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9"
                      disabled={isUploading}
                      onClick={() => handleCameraClick(job.id)}
                    >
                      {isUploading ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="mr-1.5 h-4 w-4" />
                      )}
                      {t("takePhoto")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9"
                      onClick={() => handleScanClick(job.id)}
                    >
                      <ScanBarcode className="mr-1.5 h-4 w-4" />
                      {t("scanPart")}
                    </Button>
                  </div>
                  <input
                    ref={(el) => { fileInputRefs.current[job.id] = el; }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileSelect(job.id, e.target.files)}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleBarcodeScan}
        title={t("scanPart")}
      />

      <CreatePartDialog
        open={createPartOpen}
        onOpenChange={setCreatePartOpen}
        barcode={pendingBarcode}
        onCreated={handlePartCreated}
      />
    </>
  );
}
