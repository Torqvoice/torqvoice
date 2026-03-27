"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Copy, Send, ExternalLink, FileVideo } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreateStatusReportDialog } from "./CreateStatusReportDialog";
import { SendStatusReportDialog } from "./SendStatusReportDialog";

interface StatusReportSummary {
  id: string;
  title: string | null;
  status: string;
  videoUrl: string | null;
  createdAt: string;
  expiresAt: string | null;
  publicToken: string;
}

interface StatusReportListProps {
  serviceRecordId: string;
  organizationId: string;
  vehicleName: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    telegramChatId: string | null;
  } | null;
  smsEnabled: boolean;
  emailEnabled: boolean;
  telegramEnabled: boolean;
  initialReports: StatusReportSummary[];
}

const STATUS_VARIANT: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-blue-500/10 text-blue-600",
  sent: "bg-green-500/10 text-green-600",
  viewed: "bg-purple-500/10 text-purple-600",
};

export function StatusReportList({
  serviceRecordId,
  organizationId,
  vehicleName,
  customer,
  smsEnabled,
  emailEnabled,
  telegramEnabled,
  initialReports,
}: StatusReportListProps) {
  const t = useTranslations("statusReport.list");
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [sendReportId, setSendReportId] = useState<string | null>(null);

  function copyLink(publicToken: string) {
    const url = `${window.location.origin}/share/status-report/${organizationId}/${publicToken}`;
    navigator.clipboard.writeText(url);
    toast.success(t("linkCopied"));
  }

  function openReport(publicToken: string) {
    window.open(`/share/status-report/${organizationId}/${publicToken}`, "_blank");
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t("title")}</h3>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("newReport")}
          </Button>
        </div>

        {initialReports.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <FileVideo className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium text-sm">{t("empty")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyDescription")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {initialReports.map((report) => (
              <Card key={report.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {report.title || t("title")}
                      </p>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${STATUS_VARIANT[report.status] || ""}`}>
                        {t(report.status as "draft" | "published" | "sent" | "viewed")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(report.createdAt).toLocaleDateString(undefined, {
                        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                    {report.expiresAt && (
                      <p className="text-xs text-muted-foreground">
                        {t("expires")}: {new Date(report.expiresAt).toLocaleDateString(undefined, {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(report.publicToken)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {customer && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSendReportId(report.id)}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openReport(report.publicToken)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateStatusReportDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        serviceRecordId={serviceRecordId}
        vehicleName={vehicleName}
        customer={customer}
        smsEnabled={smsEnabled}
        emailEnabled={emailEnabled}
        telegramEnabled={telegramEnabled}
        onCreated={(reportId) => {
          router.refresh();
          if (customer) setSendReportId(reportId);
        }}
      />

      {sendReportId && customer && (
        <SendStatusReportDialog
          open={!!sendReportId}
          onOpenChange={(open) => { if (!open) setSendReportId(null); }}
          reportId={sendReportId}
          customer={customer}
          smsEnabled={smsEnabled}
          emailEnabled={emailEnabled}
          telegramEnabled={telegramEnabled}
        />
      )}
    </>
  );
}
