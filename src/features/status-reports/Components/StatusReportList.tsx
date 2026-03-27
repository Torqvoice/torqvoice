"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Copy, Send, ExternalLink, FileVideo, Video, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { CreateStatusReportDialog } from "./CreateStatusReportDialog";
import { SendStatusReportDialog } from "./SendStatusReportDialog";
import { deleteStatusReport } from "../Actions/deleteStatusReport";

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
  const [deleting, setDeleting] = useState<string | null>(null);

  function copyLink(publicToken: string) {
    const url = `${window.location.origin}/share/status-report/${organizationId}/${publicToken}`;
    navigator.clipboard.writeText(url);
    toast.success(t("linkCopied"));
  }

  function openReport(publicToken: string) {
    window.open(`/share/status-report/${organizationId}/${publicToken}`, "_blank");
  }

  async function handleDelete(reportId: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setDeleting(reportId);
    try {
      const result = await deleteStatusReport(reportId);
      if (result.success) {
        toast.success(t("deleted"));
        router.refresh();
      } else {
        toast.error(result.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <div className="space-y-3">
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">{t("title")}</TableHead>
                  <TableHead>{t("statusLabel")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("created")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("expires")}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {report.videoUrl && <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                        <span className="truncate text-sm font-medium">{report.title || t("title")}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className={`text-[10px] ${STATUS_VARIANT[report.status] || ""}`}>
                        {t(report.status as "draft" | "published" | "sent" | "viewed")}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground hidden sm:table-cell">
                      {new Date(report.createdAt).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground hidden md:table-cell">
                      {report.expiresAt
                        ? new Date(report.expiresAt).toLocaleDateString(undefined, {
                            month: "short", day: "numeric", year: "numeric",
                          })
                        : "-"}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyLink(report.publicToken)}>
                          <Copy className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline ml-1.5">{t("copyLink")}</span>
                        </Button>
                        {customer && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSendReportId(report.id)}>
                            <Send className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline ml-1.5">{t("send")}</span>
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openReport(report.publicToken)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline ml-1.5">{t("view")}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          disabled={deleting === report.id}
                          onClick={() => handleDelete(report.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline ml-1.5">{t("delete")}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
          if (customer) setSendReportId(reportId);
          else router.refresh();
        }}
      />

      {sendReportId && customer && (
        <SendStatusReportDialog
          open={!!sendReportId}
          onOpenChange={(open) => { if (!open) { setSendReportId(null); router.refresh(); } }}
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
