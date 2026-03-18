"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, FileUp, Filter, Loader2, Merge, SkipForward, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { checkDuplicateCustomers, importCustomers } from "@/features/customers/Actions/customerActions";

interface ParsedRow {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
}

interface DuplicateInfo {
  id: string;
  name: string;
  matchedOn: string;
  isExact: boolean;
}

type Step = "upload" | "preview" | "result";

// "skip" = don't import, "merge" = update existing, undefined = create new
type DuplicateAction = "skip" | "merge";

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((ch === "," || ch === ";") && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  const headerMap: Record<string, keyof ParsedRow> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (["name", "fullname", "contactname", "customername", "displayname", "firstname"].includes(h)) {
      headerMap[String(i)] = "name";
    } else if (["email", "emailaddress", "mail", "primaryemail", "emailaddress1"].includes(h)) {
      headerMap[String(i)] = "email";
    } else if (["phone", "phonenumber", "telephone", "mobile", "mobilenumber", "primaryphone", "businessphone", "homephone", "mobilephone"].includes(h)) {
      headerMap[String(i)] = "phone";
    } else if (["company", "companyname", "organization", "businessname", "org"].includes(h)) {
      headerMap[String(i)] = "company";
    } else if (["address", "streetaddress", "fulladdress", "mailingaddress", "homeaddress", "businessaddress"].includes(h)) {
      headerMap[String(i)] = "address";
    }
  }

  const firstNameIdx = headers.findIndex((h) => ["firstname", "givenname", "first"].includes(h));
  const lastNameIdx = headers.findIndex((h) => ["lastname", "surname", "familyname", "last"].includes(h));
  const hasFirstLast = firstNameIdx >= 0 && lastNameIdx >= 0;
  if (hasFirstLast) {
    delete headerMap[String(firstNameIdx)];
  }

  if (!headerMap[String(headers.findIndex((h) => ["name", "fullname", "contactname", "customername", "displayname"].includes(h)))] && !hasFirstLast) {
    if (Object.keys(headerMap).length === 0) {
      headerMap["0"] = "name";
      if (headers.length > 1) headerMap["1"] = "email";
      if (headers.length > 2) headerMap["2"] = "phone";
    }
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseRow(lines[i]);
    const row: Partial<ParsedRow> = {};

    if (hasFirstLast) {
      const first = (fields[firstNameIdx] || "").trim();
      const last = (fields[lastNameIdx] || "").trim();
      row.name = [first, last].filter(Boolean).join(" ");
    }

    for (const [idx, field] of Object.entries(headerMap)) {
      const val = fields[parseInt(idx)]?.trim();
      if (val) {
        if (field === "name" && !row.name) {
          row.name = val;
        } else if (field !== "name") {
          row[field] = val;
        }
      }
    }

    if (row.name) {
      rows.push(row as ParsedRow);
    }
  }

  return rows;
}

function parseVCard(text: string): ParsedRow[] {
  const cards = text.split("BEGIN:VCARD").filter((c) => c.includes("END:VCARD"));
  const rows: ParsedRow[] = [];

  for (const card of cards) {
    const lines = card.split(/\r?\n/);
    let name = "";
    let email = "";
    let phone = "";
    let company = "";
    let address = "";

    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.startsWith("FN:") || upper.startsWith("FN;")) {
        name = line.substring(line.indexOf(":") + 1).trim();
      } else if ((upper.startsWith("EMAIL:") || upper.startsWith("EMAIL;")) && !email) {
        email = line.substring(line.indexOf(":") + 1).trim();
      } else if ((upper.startsWith("TEL:") || upper.startsWith("TEL;")) && !phone) {
        phone = line.substring(line.indexOf(":") + 1).trim();
      } else if (upper.startsWith("ORG:") || upper.startsWith("ORG;")) {
        company = line.substring(line.indexOf(":") + 1).split(";")[0].trim();
      } else if ((upper.startsWith("ADR:") || upper.startsWith("ADR;")) && !address) {
        const parts = line.substring(line.indexOf(":") + 1).split(";").map((s) => s.trim()).filter(Boolean);
        address = parts.join(", ");
      }
    }

    if (name) {
      rows.push({ name, email: email || undefined, phone: phone || undefined, company: company || undefined, address: address || undefined });
    }
  }

  return rows;
}

function parseFile(content: string, fileName: string): ParsedRow[] {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "vcf" || ext === "vcard") {
    return parseVCard(content);
  }
  return parseCSV(content);
}

export function ImportCustomersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("customers.import");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ imported: number; merged: number; skipped: number; errors: { row: number; error: string }[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [duplicates, setDuplicates] = useState<Record<number, DuplicateInfo>>({});
  const [dupActions, setDupActions] = useState<Record<number, DuplicateAction>>({});
  const [showDupsOnly, setShowDupsOnly] = useState(false);

  const reset = useCallback(() => {
    setStep("upload");
    setRows([]);
    setFileName("");
    setResult(null);
    setDuplicates({});
    setDupActions({});
    setShowDupsOnly(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = useCallback((open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  }, [onOpenChange, reset]);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = parseFile(text, file.name);
    if (parsed.length === 0) {
      toast.error(t("noDataFound"));
      return;
    }

    setRows(parsed);
    setFileName(file.name);
    setChecking(true);

    const res = await checkDuplicateCustomers(
      parsed.map((r) => ({ name: r.name, email: r.email, phone: r.phone }))
    );

    if (res.success && res.data) {
      setDuplicates(res.data);
      // Auto-skip exact duplicates, default merge for partial matches
      const actions: Record<number, DuplicateAction> = {};
      for (const [idx, info] of Object.entries(res.data)) {
        actions[Number(idx)] = info.isExact ? "skip" : "merge";
      }
      setDupActions(actions);
    }

    setChecking(false);
    setStep("preview");
  }, [t]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const toggleDupAction = (idx: number) => {
    setDupActions((prev) => ({
      ...prev,
      [idx]: prev[idx] === "skip" ? "merge" : "skip",
    }));
  };

  const handleImport = async () => {
    setImporting(true);

    // Build merge map: rowIndex → customer ID (for merge) or "__skip__"
    const mergeMap: Record<number, string> = {};
    for (const [idx, action] of Object.entries(dupActions)) {
      const dup = duplicates[Number(idx)];
      if (!dup) continue;
      mergeMap[Number(idx)] = action === "merge" ? dup.id : "__skip__";
    }

    const res = await importCustomers(rows, mergeMap);
    if (res.success && res.data) {
      setResult(res.data);
      setStep("result");
      if (res.data.imported > 0 || res.data.merged > 0) {
        router.refresh();
      }
    } else {
      toast.error(res.error || t("importFailed"));
    }
    setImporting(false);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setDuplicates((prev) => {
      const next: Record<number, DuplicateInfo> = {};
      for (const [k, v] of Object.entries(prev)) {
        const ki = Number(k);
        if (ki < index) next[ki] = v;
        else if (ki > index) next[ki - 1] = v;
      }
      return next;
    });
    setDupActions((prev) => {
      const next: Record<number, DuplicateAction> = {};
      for (const [k, v] of Object.entries(prev)) {
        const ki = Number(k);
        if (ki < index) next[ki] = v;
        else if (ki > index) next[ki - 1] = v;
      }
      return next;
    });
  };

  const dupCount = Object.keys(duplicates).length;
  const newCount = rows.length - dupCount;
  const mergeCount = Object.entries(dupActions).filter(([, a]) => a === "merge").length;
  const skipCount = Object.entries(dupActions).filter(([, a]) => a === "skip").length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-7xl max-h-[85vh] !overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div
            className={`flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-10 transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {checking ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("checkingDuplicates")}</p>
              </>
            ) : (
              <>
                <FileUp className="h-10 w-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">{t("dropFile")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("supportedFormats")}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  {t("browse")}
                </Button>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.vcf,.vcard"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {step === "preview" && (
          <>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 flex-wrap text-muted-foreground">
                <span>{fileName} — {t("rowsFound", { count: rows.length })}</span>
                {dupCount > 0 && (
                  <Button
                    variant={showDupsOnly ? "default" : "outline"}
                    size="sm"
                    className={`h-7 text-xs gap-1.5 ${
                      !showDupsOnly ? "text-amber-600 border-amber-500/40 hover:bg-amber-50 dark:hover:bg-amber-950/30" : ""
                    }`}
                    onClick={() => setShowDupsOnly((v) => !v)}
                  >
                    <Filter className="h-3 w-3" />
                    {t("duplicatesFound", { count: dupCount })}
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                {t("chooseAnother")}
              </Button>
            </div>

            {dupCount > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-amber-900 dark:text-amber-200">
                    <p>{t("duplicatesBanner", { count: dupCount })}</p>
                    <p className="text-xs text-amber-800/70 dark:text-amber-300/60 mt-0.5">
                      {t("duplicatesHint")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      const actions: Record<number, DuplicateAction> = {};
                      for (const idx of Object.keys(duplicates)) actions[Number(idx)] = "skip";
                      setDupActions(actions);
                    }}
                  >
                    <SkipForward className="h-3 w-3" />
                    {t("skipAll")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      const actions: Record<number, DuplicateAction> = {};
                      for (const idx of Object.keys(duplicates)) actions[Number(idx)] = "merge";
                      setDupActions(actions);
                    }}
                  >
                    <Merge className="h-3 w-3" />
                    {t("mergeAll")}
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-lg border min-w-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>{t("colName")}</TableHead>
                      <TableHead>{t("colEmail")}</TableHead>
                      <TableHead>{t("colPhone")}</TableHead>
                      <TableHead>{t("colCompany")}</TableHead>
                      <TableHead>{t("colAddress")}</TableHead>
                      <TableHead className="w-24">{t("colStatus")}</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                </Table>
              </div>
              <div className="overflow-y-auto max-h-[50vh]">
                <div className="overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableBody>
                      {rows.map((row, i) => {
                        const dup = duplicates[i];
                        const action = dupActions[i];
                        if (showDupsOnly && !dup) return null;
                        return (
                          <TableRow key={i} className={dup ? (action === "skip" ? "opacity-50" : "") : ""}>
                            <TableCell className="w-8 text-xs text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap">
                              {row.name}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{row.email || "-"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{row.phone || "-"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">{row.company || "-"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{row.address || "-"}</TableCell>
                            <TableCell className="w-24">
                              {dup ? (
                                <button
                                  type="button"
                                  onClick={() => toggleDupAction(i)}
                                  className="inline-flex items-center"
                                >
                                  {action === "skip" ? (
                                    <Badge variant="outline" className="text-muted-foreground cursor-pointer hover:border-foreground/40 text-xs gap-1">
                                      <SkipForward className="h-3 w-3" />
                                      {t("actionSkip")}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-blue-600 border-blue-500/30 cursor-pointer hover:border-blue-500/60 text-xs gap-1">
                                      <Merge className="h-3 w-3" />
                                      {t("actionMerge")}
                                    </Badge>
                                  )}
                                </button>
                              ) : (
                                <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 text-xs">
                                  {t("actionNew")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="w-8">
                              <button
                                type="button"
                                onClick={() => removeRow(i)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                {newCount > 0 && <span>{t("summaryNew", { count: newCount })}</span>}
                {mergeCount > 0 && <span>{newCount > 0 ? " · " : ""}{t("summaryMerge", { count: mergeCount })}</span>}
                {skipCount > 0 && <span>{(newCount > 0 || mergeCount > 0) ? " · " : ""}{t("summarySkip", { count: skipCount })}</span>}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => handleClose(false)}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleImport} disabled={importing || (newCount === 0 && mergeCount === 0)}>
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("importButton", { count: newCount + mergeCount })}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium">{t("importComplete")}</p>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  {result.imported > 0 && <p>{t("resultCreated", { count: result.imported })}</p>}
                  {result.merged > 0 && <p>{t("resultMerged", { count: result.merged })}</p>}
                  {result.skipped > 0 && <p>{t("resultSkipped", { count: result.skipped })}</p>}
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  {t("skippedRows", { count: result.errors.length })}
                </div>
                <div className="max-h-32 overflow-auto rounded border p-2 text-xs text-muted-foreground">
                  {result.errors.map((err, i) => (
                    <p key={i}>{t("rowError", { row: err.row, name: rows[err.row - 1]?.name || "?", error: err.error })}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => handleClose(false)}>{t("done")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
