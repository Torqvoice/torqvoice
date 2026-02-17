"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useGlassModal } from "@/components/glass-modal";
import { toast } from "sonner";
import { Download, Loader2, Save } from "lucide-react";

interface EditActionsProps {
  serviceRecordId: string;
}

export function EditActions({ serviceRecordId }: EditActionsProps) {
  const [downloading, setDownloading] = useState(false);
  const modal = useGlassModal();
  const pathname = usePathname();
  const isDetailsTab = pathname.endsWith("/edit");

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/services/${serviceRecordId}/pdf`);
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
        `invoice-${serviceRecordId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      modal.open("error", "Error", "Failed to generate PDF invoice");
    }
    setDownloading(false);
  };

  return (
    <div className="flex items-center gap-2">
      {isDetailsTab ? (
        <Button type="submit" form="service-record-form" size="sm">
          <Save className="mr-1 h-3.5 w-3.5" />
          Update
        </Button>
      ) : (
        <Button size="sm" onClick={() => toast.success("All changes saved")}>
          <Save className="mr-1 h-3.5 w-3.5" />
          Done
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDownloadPDF}
        disabled={downloading}
      >
        {downloading ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="mr-1 h-3.5 w-3.5" />
        )}
        PDF Invoice
      </Button>
    </div>
  );
}
