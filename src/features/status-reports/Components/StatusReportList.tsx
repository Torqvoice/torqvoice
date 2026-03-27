"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Copy, Send, ExternalLink, FileVideo, Video, Trash2, MessageCircle } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { CreateStatusReportDialog } from "./CreateStatusReportDialog";
import { SendStatusReportDialog } from "./SendStatusReportDialog";
import { deleteStatusReport } from "../Actions/deleteStatusReport";

interface StatusReportSummary {
  id: string;
  title: string | null;
  message: string | null;
  status: string;
  videoUrl: string | null;
  createdAt: string;
  expiresAt: string | null;
  publicToken: string;
  customerFeedback: string | null;
  feedbackAt: string | null;
  sentVia: string | null;
  sentAt: string | null;
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
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailReport, setDetailReport] = useState<StatusReportSummary | null>(null);

  function copyLink(publicToken: string) {
    const url = `${window.location.origin}/share/status-report/${organizationId}/${publicToken}`;
    navigator.clipboard.writeText(url);
    toast.success(t("linkCopied"));
  }

  function openReport(publicToken: string) {
    window.open(`/share/status-report/${organizationId}/${publicToken}`, "_blank");
  }

  async function confirmDelete() {
    if (!deleteReportId) return;
    setDeleting(true);
    try {
      const result = await deleteStatusReport(deleteReportId);
      if (result.success) {
        toast.success(t("deleted"));
        router.refresh();
      } else {
        toast.error(result.error || t("deleteFailed"));
      }
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setDeleting(false);
      setDeleteReportId(null);
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
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
                  <TableHead className="w-[35%]">{t("title")}</TableHead>
                  <TableHead>{t("statusLabel")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("created")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("feedback")}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialReports.map((report) => (
                  <TableRow
                    key={report.id}
                    className="cursor-pointer"
                    onClick={() => setDetailReport(report)}
                  >
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
                    <TableCell className="py-2 text-xs text-muted-foreground hidden sm:table-cell" suppressHydrationWarning>
                      {new Date(report.createdAt).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="py-2 hidden md:table-cell">
                      {report.customerFeedback ? (
                        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600">
                          <MessageCircle className="h-3 w-3 mr-1" />
                          {t("hasComment")}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
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
                          onClick={() => setDeleteReportId(report.id)}
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

      {/* Detail dialog */}
      <Dialog open={!!detailReport} onOpenChange={(open) => { if (!open) setDetailReport(null); }}>
        <DialogContent className="sm:max-w-lg">
          {detailReport && (
            <>
              <DialogHeader>
                <DialogTitle>{detailReport.title || t("title")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Status & dates */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("statusLabel")}</p>
                    <Badge variant="outline" className={`mt-0.5 text-[10px] ${STATUS_VARIANT[detailReport.status] || ""}`}>
                      {t(detailReport.status as "draft" | "published" | "sent" | "viewed")}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("created")}</p>
                    <p className="mt-0.5">{fmtDate(detailReport.createdAt)}</p>
                  </div>
                  {detailReport.sentAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("sentAt")}</p>
                      <p className="mt-0.5">{fmtDate(detailReport.sentAt)}</p>
                    </div>
                  )}
                  {detailReport.sentVia && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("sentVia")}</p>
                      <p className="mt-0.5 capitalize">{detailReport.sentVia}</p>
                    </div>
                  )}
                  {detailReport.expiresAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("expires")}</p>
                      <p className="mt-0.5">{new Date(detailReport.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
                    </div>
                  )}
                </div>

                {/* Message */}
                {detailReport.message && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("messageLabel")}</p>
                    <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3">{detailReport.message}</p>
                  </div>
                )}

                {/* Video */}
                {detailReport.videoUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("videoLabel")}</p>
                    <video src={detailReport.videoUrl} controls preload="metadata" playsInline className="w-full rounded-md max-h-64" />
                  </div>
                )}

                {/* Customer feedback */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("feedback")}</p>
                  {detailReport.customerFeedback ? (
                    <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-3">
                      <p className="text-sm whitespace-pre-wrap">{detailReport.customerFeedback}</p>
                      {detailReport.feedbackAt && (
                        <p className="mt-2 text-xs text-muted-foreground">{fmtDate(detailReport.feedbackAt)}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noFeedback")}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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

      <AlertDialog open={!!deleteReportId} onOpenChange={(open) => { if (!open) setDeleteReportId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
