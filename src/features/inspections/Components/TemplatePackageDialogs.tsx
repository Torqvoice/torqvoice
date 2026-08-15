"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Download, FileJson, Loader2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { exportTemplatePackage, importTemplatePackage } from "../Actions/packageActions";
import { packageFileName, parsePackage, PackageFormatError } from "@/lib/packages/format";
import { reviewContents, type ReviewedContent } from "@/lib/packages/registry";
// Registers the inspection-template content type with the package registry.
import "../Lib/inspectionTemplatePackage";

function DetailList({ details }: { details: string[] }) {
  return (
    <ul className="text-muted-foreground grid gap-1 text-sm sm:grid-cols-2">
      {details.map((detail) => (
        <li key={detail} className="flex items-baseline gap-1.5">
          <span aria-hidden="true" className="bg-muted-foreground/50 h-1 w-1 shrink-0 rounded-full" />
          {detail}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

export function TemplateExportDialog({
  template,
  onOpenChange,
}: {
  template: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [includeWording, setIncludeWording] = useState(false);
  const [author, setAuthor] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (template) {
      setIncludeWording(false);
      setAuthor("");
    }
  }, [template]);

  const handleExport = () => {
    if (!template) return;
    startTransition(async () => {
      const result = await exportTemplatePackage(template.id, {
        includeCustomWording: includeWording,
        author,
      });
      if (!result.success || !result.data) {
        toast.error(result.error || "Could not export this template");
        return;
      }

      const blob = new Blob([JSON.stringify(result.data.manifest, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = packageFileName(result.data.manifest);
      link.click();
      URL.revokeObjectURL(url);

      toast.success("Template exported");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export &ldquo;{template?.name}&rdquo;</DialogTitle>
          <DialogDescription>
            Downloads the whole checklist as a file — sections, checks, units and limits. Anyone
            running Torqvoice can import it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Switch
              id="include-wording"
              checked={includeWording}
              onCheckedChange={setIncludeWording}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="include-wording">Include your own defect wording</Label>
              <p className="text-muted-foreground mt-0.5 text-xs">
                The phrases your workshop added to checks. Useful to whoever receives this, but
                they are free text typed at a bench and can name a customer, a colleague or a
                local arrangement. Off unless you have read them.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="package-author">Attribute it to (optional)</Label>
            <Input
              id="package-author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Egeland Auto"
              maxLength={120}
            />
            <p className="text-muted-foreground text-xs">
              Written into the file so whoever installs it can see where it came from. Nothing is
              taken from your account.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleExport} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Import                                                                     */
/* -------------------------------------------------------------------------- */

interface Preview {
  raw: unknown;
  name: string;
  author?: string;
  contents: ReviewedContent[];
}

export function TemplateImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
    }
  }, [open]);

  // Parsed and validated in the browser so the file can be shown before it is
  // sent anywhere. The server re-validates: this is for the reader, not a check.
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    try {
      const raw = JSON.parse(await file.text());
      const manifest = parsePackage(raw);
      setPreview({
        raw,
        name: manifest.name,
        author: manifest.author,
        contents: reviewContents(manifest.contents),
      });
    } catch (err) {
      setError(
        err instanceof PackageFormatError
          ? err.message
          : "That file could not be read. A Torqvoice package is a .json file exported from a template."
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImport = () => {
    if (!preview) return;
    startTransition(async () => {
      const result = await importTemplatePackage(preview.raw);
      if (result.success && result.data) {
        toast.success(
          `Imported ${result.data.templates.length} template${
            result.data.templates.length === 1 ? "" : "s"
          }`
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "Could not import this package");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a checklist</DialogTitle>
          <DialogDescription>
            Adds a checklist from a Torqvoice package file. It arrives as a normal template you
            can edit, and never replaces one you already have.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full flex-col gap-1 border-dashed py-6"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-5 w-5" aria-hidden="true" />
            <span>{preview ? "Choose a different file" : "Choose a package file"}</span>
            <span className="text-muted-foreground text-xs font-normal">.json</span>
          </Button>

          {error && (
            <p className="text-destructive flex items-start gap-2 text-sm" role="alert">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {preview && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start gap-2">
                <FileJson className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium">{preview.name}</p>
                  {preview.author && (
                    <p className="text-muted-foreground text-xs">From {preview.author}</p>
                  )}
                </div>
              </div>
              {preview.contents.map((content) => (
                <DetailList key={content.type} details={content.details} />
              ))}
              <p className="text-muted-foreground border-t pt-3 text-xs">
                Limits in a shared checklist are whatever its author set. Check them against your
                national rules before issuing anything from it.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleImport} disabled={!preview || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
