"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, User, Calendar, Wrench, CarFront } from "lucide-react";
import { submitStatusReportFeedback } from "@/features/status-reports/Actions/submitFeedback";

interface StatusReportViewProps {
  report: {
    id: string;
    title: string | null;
    message: string | null;
    videoUrl: string | null;
    videoFileName: string | null;
    status: string;
    createdAt: string;
    customerFeedback: string | null;
    feedbackAt: string | null;
  };
  vehicle: { make: string; model: string; year: number; licensePlate: string | null };
  serviceTitle: string;
  technicianName: string | null;
  workshopName: string;
  workshopPhone: string;
  primaryColor: string;
  token: string;
  showBranding: boolean;
}

export function StatusReportView({
  report, vehicle, serviceTitle, technicianName,
  workshopName, workshopPhone, primaryColor, token, showBranding,
}: StatusReportViewProps) {
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!report.customerFeedback);

  const createdDate = new Date(report.createdAt).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
  const vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  async function handleSubmitFeedback() {
    if (!feedback.trim()) return;
    setSubmitting(true);
    try {
      await submitStatusReportFeedback({ token, feedback: feedback.trim() });
      setSubmitted(true);
    } catch {
      // Allow retry on failure
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div style={{ backgroundColor: primaryColor }} className="text-white">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <h1 className="text-xl font-bold">{workshopName}</h1>
          {workshopPhone && <p className="mt-1 text-sm text-white/80">{workshopPhone}</p>}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Vehicle & Service Info */}
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-start gap-3">
              <Wrench className="mt-0.5 h-5 w-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-sm text-gray-500">Service</p>
                <p className="font-medium">{serviceTitle}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CarFront className="mt-0.5 h-5 w-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-sm text-gray-500">Vehicle</p>
                <p className="font-medium">{vehicleLabel}</p>
                {vehicle.licensePlate && (
                  <p className="text-sm text-gray-500">Plate: {vehicle.licensePlate}</p>
                )}
              </div>
            </div>
            {report.title && (
              <div className="pt-2 border-t">
                <p className="font-semibold text-lg">{report.title}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Video */}
        {report.videoUrl && (
          <Card>
            <CardContent className="pt-6">
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                <video className="h-full w-full" controls preload="metadata" playsInline>
                  <source src={report.videoUrl} />
                  Your browser does not support the video element.
                </video>
              </div>
              {report.videoFileName && (
                <p className="mt-2 text-xs text-gray-400">{report.videoFileName}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Message */}
        {report.message && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Message from technician
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {report.message}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Technician & date info */}
        <div className="flex items-center gap-4 text-sm text-gray-500">
          {technicianName && (
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" /> {technicianName}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" /> {createdDate}
          </span>
        </div>

        {/* Feedback */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Your Feedback
            </h2>
            {submitted ? (
              <div className="flex items-start gap-3 rounded-lg bg-green-50 p-4">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">Thank you for your feedback!</p>
                  <p className="mt-1 text-sm text-green-700 whitespace-pre-wrap">
                    {report.customerFeedback || feedback}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Textarea
                  placeholder="Let us know your thoughts or concerns..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                />
                <Button
                  onClick={handleSubmitFeedback}
                  disabled={submitting || !feedback.trim()}
                  style={{ backgroundColor: primaryColor }}
                  className="text-white hover:opacity-90"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Submit Feedback
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        {showBranding && (
          <p className="text-center text-xs text-gray-400 py-4">Powered by Torqvoice</p>
        )}
      </div>
    </div>
  );
}
