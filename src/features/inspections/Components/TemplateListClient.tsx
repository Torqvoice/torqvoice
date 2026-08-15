"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  ClipboardCheck,
  Copy,
  Globe2,
  LayoutTemplate,
  ListChecks,
  Loader2,
  MoreVertical,
  Pencil,
  Download,
  LibraryBig,
  Plus,
  Ruler,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  deleteTemplate,
  duplicateTemplate,
  restoreMissingPresets,
} from "../Actions/templateActions";
import { TemplateForm, type TemplateFormData } from "./TemplateForm";
import { TemplatePresetPicker } from "./TemplatePresetPicker";
import { TemplateExportDialog, TemplateImportDialog } from "./TemplatePackageDialogs";
import { TEMPLATE_COUNTRIES, TEMPLATE_PRESETS } from "../Lib/templatePresets";

interface TemplateSection {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  sortOrder: number;
  items: {
    id: string;
    name: string;
    description?: string | null;
    code?: string | null;
    sortOrder: number;
    inputType?: string | null;
    unit?: string | null;
    minValue?: number | null;
    maxValue?: number | null;
    choices?: string[];
    required?: boolean;
    photoRequired?: boolean;
    defaultSeverity?: string | null;
    defectSuggestions?: string[];
  }[];
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  country?: string | null;
  standard?: string | null;
  severityScale?: string | null;
  sections: TemplateSection[];
}

function countryName(code?: string | null) {
  if (!code) return null;
  return TEMPLATE_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

function TemplateCard({
  template,
  onEdit,
  onDuplicate,
  onExport,
  onDelete,
  isDuplicating,
}: {
  template: Template;
  onEdit: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  isDuplicating: boolean;
}) {
  const t = useTranslations("inspections.templates");
  const checkCount = template.sections.reduce((sum, s) => sum + s.items.length, 0);
  const measurementCount = template.sections.reduce(
    (sum, s) => sum + s.items.filter((i) => i.inputType === "measurement").length,
    0
  );
  const isEu = template.severityScale === "eu";
  const country = countryName(template.country);

  return (
    <article className="bg-card flex flex-col rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold">
            <span className="truncate">{template.name}</span>
            {template.isDefault && (
              <Badge variant="secondary" className="shrink-0 text-[11px]">
                {t("default")}
              </Badge>
            )}
          </h3>
          {template.description && (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
              {template.description}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label={t("actionsFor", { name: template.name })}
            >
              {isDuplicating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("export")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <dl className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
          <dt className="sr-only">Sections</dt>
          <dd>{t("sections", { count: template.sections.length })}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
          <dt className="sr-only">Checks</dt>
          <dd>{t("checks", { count: checkCount })}</dd>
        </div>
        {measurementCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
            <dt className="sr-only">Measurements</dt>
            <dd>{t("measured", { count: measurementCount })}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
        {country && (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <Globe2 className="h-3 w-3" aria-hidden="true" />
            {country}
          </Badge>
        )}
        <Badge variant="outline" className="gap-1 text-[11px]">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          {isEu ? t("euScale") : t("basicScale")}
        </Badge>
      </div>
    </article>
  );
}

export function TemplateListClient({ templates }: { templates: Template[] }) {
  const t = useTranslations("inspections.templates");
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exportTarget, setExportTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<TemplateFormData | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [isInstalling, startInstalling] = useTransition();

  // Presets a workshop would actually run; "blank" is a way to start building
  // one, not a checklist, so it is not part of the library.
  const installed = new Set(templates.map((t) => t.name.trim().toLowerCase()));
  const missing = TEMPLATE_PRESETS.filter(
    (p) => p.id !== "blank" && !installed.has(p.name.trim().toLowerCase())
  );

  const handleRestore = () => {
    startInstalling(async () => {
      const result = await restoreMissingPresets();
      if (result.success && result.data) {
        toast.success(
          result.data.added === 0
            ? t("allPresent")
            : t("restored", { count: result.data.added })
        );
        router.refresh();
      } else {
        toast.error(result.error || t("restoreFailed"));
      }
    });
  };
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleDelete = (id: string) => {
    startDeleteTransition(async () => {
      const result = await deleteTemplate(id);
      if (result.success) {
        toast.success(t("deleted"));
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(result.error || t("deleteFailed"));
      }
    });
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    const result = await duplicateTemplate(id);
    setDuplicatingId(null);
    if (result.success) {
      toast.success(t("duplicated"));
      router.refresh();
    } else {
      toast.error(result.error || t("duplicateFailed"));
    }
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template as TemplateFormData);
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingTemplate(undefined);
    setShowForm(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("description")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {t("import")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPresets(true)}>
            <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {t("browse")}
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {t("new")}
          </Button>
        </div>
      </div>

      {templates.length > 0 && missing.length > 0 && (
        <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3">
          <LibraryBig className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm">
            {t("restoreBanner", { count: missing.length })}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={handleRestore}
            disabled={isInstalling}
          >
            {isInstalling && (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            {t("restore")}
          </Button>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
          <ClipboardCheck className="text-muted-foreground/40 h-10 w-10" aria-hidden="true" />
          <h3 className="mt-4 font-medium">{t("emptyTitle")}</h3>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            {t("emptyBody")}
          </p>
          <div className="mt-5 flex gap-2">
            <Button onClick={handleRestore} disabled={isInstalling}>
              {isInstalling ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LibraryBig className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              {t("restoreChecklists")}
            </Button>
            <Button variant="outline" onClick={handleCreate}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              {t("buildMyOwn")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              isDuplicating={duplicatingId === t.id}
              onEdit={() => handleEdit(t)}
              onDuplicate={() => handleDuplicate(t.id)}
              onExport={() => setExportTarget({ id: t.id, name: t.name })}
              onDelete={() => setDeleteTarget(t)}
            />
          ))}
        </div>
      )}

      {/* Keyed on the template being edited so the editor remounts and reads
          its state from the right one. Radix only reports its own close
          actions through onOpenChange, so a form that resets there never sees
          the parent opening it and would show whatever it mounted with. */}
      <TemplateForm
        key={editingTemplate?.id ?? "new"}
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingTemplate(undefined);
        }}
        template={editingTemplate}
      />

      <TemplateExportDialog
        template={exportTarget}
        onOpenChange={(open) => !open && setExportTarget(null)}
      />

      <TemplateImportDialog open={showImport} onOpenChange={setShowImport} />

      <TemplatePresetPicker
        open={showPresets}
        onOpenChange={setShowPresets}
        installedNames={templates.map((t) => t.name)}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { name: deleteTarget?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
