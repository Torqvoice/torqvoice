"use client";

import { memo } from "react";
import { FileText } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/features/vehicles/Components/service-edit/RichTextEditor";

interface QuoteNotesEditorProps {
  noteType: "public" | "internal";
  onNoteTypeChange: (v: "public" | "internal") => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  t: (key: string) => string;
}

export const QuoteNotesEditor = memo(function QuoteNotesEditor({
  noteType,
  onNoteTypeChange,
  description,
  onDescriptionChange,
  notes,
  onNotesChange,
  t,
}: QuoteNotesEditorProps) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-3.5 w-3.5" />{t("notes.title")}</h3>
        <Select value={noteType} onValueChange={(v) => onNoteTypeChange(v as "public" | "internal")}>
          <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="public">{t("notes.public")}</SelectItem>
            <SelectItem value="internal">{t("notes.internal")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {noteType === "public" && (
        <div className="space-y-1">
          <RichTextEditor content={description} onChange={onDescriptionChange} placeholder={t("notes.publicPlaceholder")} />
          <p className="text-xs text-muted-foreground">{t("notes.publicHelper")}</p>
        </div>
      )}
      {noteType === "internal" && (
        <div className="space-y-1">
          <RichTextEditor content={notes} onChange={onNotesChange} placeholder={t("notes.internalPlaceholder")} />
          <p className="text-xs text-muted-foreground">{t("notes.internalHelper")}</p>
        </div>
      )}
    </div>
  );
});
