"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, ImageIcon, Loader2, Wrench, Clock, Pause } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { compressImage } from "@/lib/compress-image";
import { addServiceAttachment } from "@/features/vehicles/Actions/addServiceAttachment";
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

  if (jobs.length === 0) return null;

  const handleCameraClick = (jobId: string) => {
    fileInputRefs.current[jobId]?.click();
  };

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
    // Reset the input so the same file can be selected again
    const input = fileInputRefs.current[jobId];
    if (input) input.value = "";
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
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
            const count = imageCounts[job.id] || 0;

            return (
              <div
                key={job.id}
                className="flex items-center justify-between px-5 py-3"
              >
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
                <div className="shrink-0 ml-3 flex items-center gap-2">
                  {count > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ImageIcon className="h-3 w-3" />
                      {count}
                    </span>
                  )}
                  <input
                    ref={(el) => { fileInputRefs.current[job.id] = el; }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileSelect(job.id, e.target.files)}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    disabled={isUploading}
                    onClick={() => handleCameraClick(job.id)}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
