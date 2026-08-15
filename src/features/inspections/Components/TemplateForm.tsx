"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  Copy,
  ListOrdered,
  GripVertical,
  Loader2,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createTemplate, updateTemplate } from "../Actions/templateActions";
import { COMMON_UNITS, INPUT_TYPES, type InputType, type SeverityScale } from "../Lib/conditions";
import { TEMPLATE_COUNTRIES } from "../Lib/templatePresets";

/**
 * Sections and checks are lists, so sideways movement during a drag is only
 * noise. @dnd-kit/modifiers is not a dependency here and this is the whole of
 * what it would provide.
 */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/* -------------------------------------------------------------------------- */
/* Editor state                                                               */
/* -------------------------------------------------------------------------- */

export interface EditorItem {
  /** Client-only key so drag-and-drop and React keys survive reordering. */
  key: string;
  name: string;
  description: string;
  code: string;
  inputType: InputType;
  unit: string;
  minValue: string;
  maxValue: string;
  choices: string;
  required: boolean;
  photoRequired: boolean;
  defaultSeverity: "" | "attention" | "fail" | "dangerous";
  /** One phrase per line, which is how it is edited and stored. */
  defectSuggestions: string;
}

export interface EditorSection {
  key: string;
  name: string;
  description: string;
  code: string;
  items: EditorItem[];
}

export interface TemplateFormData {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  country?: string | null;
  standard?: string | null;
  severityScale?: string | null;
  sections: {
    id?: string;
    name: string;
    description?: string | null;
    code?: string | null;
    sortOrder: number;
    items: {
      id?: string;
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
  }[];
}

let keyCounter = 0;
const nextKey = () => `k${++keyCounter}`;

/**
 * References are filled in as rows are added, so a checklist built from scratch
 * numbers itself. Only blank codes are ever written: on a regulatory template
 * these are Annex I references like "1.1.13", and renumbering them sequentially
 * would destroy the link to the regulation.
 */
export function nextSectionCode(sections: EditorSection[]): string {
  const highest = sections.reduce((max, section) => {
    const leading = Number.parseInt(section.code.trim(), 10);
    return Number.isNaN(leading) ? max : Math.max(max, leading);
  }, 0);
  return String(highest + 1);
}

export function nextItemCode(section: EditorSection, sectionIndex: number): string {
  const prefix = section.code.trim() || String(sectionIndex + 1);
  const highest = section.items.reduce((max, item) => {
    const code = item.code.trim();
    if (!code.startsWith(`${prefix}.`)) return max;
    const tail = Number.parseInt(code.slice(prefix.length + 1), 10);
    return Number.isNaN(tail) ? max : Math.max(max, tail);
  }, 0);
  return `${prefix}.${highest + 1}`;
}

/** Renumbers everything sequentially — 1, 1.1, 1.2, 2, 2.1 … */
export function renumber(sections: EditorSection[]): EditorSection[] {
  return sections.map((section, sIdx) => {
    const code = String(sIdx + 1);
    return {
      ...section,
      code,
      items: section.items.map((item, iIdx) => ({ ...item, code: `${code}.${iIdx + 1}` })),
    };
  });
}

const NUMBER_FIELD = /^-?\d*\.?\d*$/;

function blankItem(name = ""): EditorItem {
  return {
    key: nextKey(),
    name,
    description: "",
    code: "",
    inputType: "condition",
    unit: "",
    minValue: "",
    maxValue: "",
    choices: "",
    required: false,
    photoRequired: false,
    defaultSeverity: "",
    defectSuggestions: "",
  };
}

export function blankSection(code = ""): EditorSection {
  return {
    key: nextKey(),
    name: "",
    description: "",
    code,
    // A section always starts with one check, and it belongs to the section's
    // numbering just as much as any check added afterwards.
    items: [{ ...blankItem(), code: code ? `${code}.1` : "" }],
  };
}

function toEditorState(template?: TemplateFormData): EditorSection[] {
  if (!template) return [blankSection("1")];
  return template.sections.map((s) => ({
    key: nextKey(),
    name: s.name,
    description: s.description ?? "",
    code: s.code ?? "",
    items: s.items.map((i) => ({
      key: nextKey(),
      name: i.name,
      description: i.description ?? "",
      code: i.code ?? "",
      inputType: (i.inputType as InputType) || "condition",
      unit: i.unit ?? "",
      minValue: i.minValue === null || i.minValue === undefined ? "" : String(i.minValue),
      maxValue: i.maxValue === null || i.maxValue === undefined ? "" : String(i.maxValue),
      choices: (i.choices ?? []).join(", "),
      required: i.required ?? false,
      photoRequired: i.photoRequired ?? false,
      defaultSeverity: (i.defaultSeverity as EditorItem["defaultSeverity"]) || "",
      defectSuggestions: (i.defectSuggestions ?? []).join("\n"),
    })),
  }));
}

/* -------------------------------------------------------------------------- */
/* Sortable primitives                                                        */
/* -------------------------------------------------------------------------- */

function useSortableRow(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return {
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition } as React.CSSProperties,
    isDragging,
    handleProps: { ...attributes, ...listeners },
  };
}

/** Drag handles are real buttons so the keyboard sensor can pick them up. */
function DragHandle({
  label,
  className = "",
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing ${className}`}
      {...props}
    >
      <GripVertical className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Check row                                                                  */
/* -------------------------------------------------------------------------- */

function CheckRow({
  item,
  sectionIndex,
  index,
  canDelete,
  onChange,
  onDuplicate,
  onDelete,
}: {
  item: EditorItem;
  sectionIndex: number;
  index: number;
  canDelete: boolean;
  onChange: (patch: Partial<EditorItem>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("inspections.builder");
  const [expanded, setExpanded] = useState(false);
  const fieldId = useId();
  const { setNodeRef, style, isDragging, handleProps } = useSortableRow(item.key);
  const panelId = `${fieldId}-panel`;

  const isMeasurement = item.inputType === "measurement";
  const isChoice = item.inputType === "choice";
  const typeLabel = t(`inputType.${item.inputType}`);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`bg-background rounded-md border ${isDragging ? "ring-primary/40 shadow-lg ring-2" : ""}`}
    >
      <div className="flex items-center gap-1.5 p-1.5">
        <DragHandle
          label={t("reorderCheck", { name: item.name || String(index + 1) })}
          {...handleProps}
        />
        <Input
          value={item.code}
          onChange={(e) => onChange({ code: e.target.value })}
          placeholder={t("ref")}
          aria-label={`Regulation reference for check ${index + 1}`}
          className="h-9 w-20 shrink-0 font-mono text-xs"
        />
        <Input
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t("checkName")}
          aria-label={`Name of check ${index + 1} in section ${sectionIndex + 1}`}
          className="h-9"
          required
        />
        <Badge variant="secondary" className="hidden shrink-0 text-[11px] lg:inline-flex">
          {typeLabel}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          <span className="sr-only">
            {expanded
              ? t("hideSettings", { name: item.name || String(index + 1) })
              : t("configure", { name: item.name || String(index + 1) })}
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onDuplicate}
          aria-label={t("duplicateCheck", { name: item.name || String(index + 1) })}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive h-9 w-9 shrink-0"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label={t("removeCheck", { name: item.name || String(index + 1) })}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      {expanded && (
        <div id={panelId} className="bg-muted/30 space-y-4 border-t px-3 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-type`}>{t("howRecorded")}</Label>
              <Select
                value={item.inputType}
                onValueChange={(v) => onChange({ inputType: v as InputType })}
              >
                <SelectTrigger id={`${fieldId}-type`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INPUT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {t(`inputType.${type.value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {t(`inputHint.${item.inputType}`)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-desc`}>{t("guidance")}</Label>
              <Textarea
                id={`${fieldId}-desc`}
                value={item.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder={t("guidancePlaceholder")}
                className="min-h-[64px] text-sm"
              />
            </div>
          </div>

          {isMeasurement && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">{t("measurement")}</legend>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`${fieldId}-unit`}>{t("unit")}</Label>
                  <Input
                    id={`${fieldId}-unit`}
                    value={item.unit}
                    onChange={(e) => onChange({ unit: e.target.value })}
                    list={`${fieldId}-units`}
                    placeholder="mm"
                  />
                  <datalist id={`${fieldId}-units`}>
                    {COMMON_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${fieldId}-min`}>{t("minimum")}</Label>
                  <Input
                    id={`${fieldId}-min`}
                    inputMode="decimal"
                    value={item.minValue}
                    onChange={(e) =>
                      NUMBER_FIELD.test(e.target.value) && onChange({ minValue: e.target.value })
                    }
                    placeholder="1.6"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${fieldId}-max`}>{t("maximum")}</Label>
                  <Input
                    id={`${fieldId}-max`}
                    inputMode="decimal"
                    value={item.maxValue}
                    onChange={(e) =>
                      NUMBER_FIELD.test(e.target.value) && onChange({ maxValue: e.target.value })
                    }
                    placeholder="8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${fieldId}-sev`}>{t("outOfRange")}</Label>
                  <Select
                    value={item.defaultSeverity || "fail"}
                    onValueChange={(v) =>
                      onChange({ defaultSeverity: v as EditorItem["defaultSeverity"] })
                    }
                  >
                    <SelectTrigger id={`${fieldId}-sev`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="attention">{t("severityAttention")}</SelectItem>
                      <SelectItem value="fail">{t("severityFail")}</SelectItem>
                      <SelectItem value="dangerous">{t("severityDangerous")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                {t("rangeHelp")}
              </p>
            </fieldset>
          )}

          {isChoice && (
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-choices`}>{t("answers")}</Label>
              <Input
                id={`${fieldId}-choices`}
                value={item.choices}
                onChange={(e) => onChange({ choices: e.target.value })}
                placeholder="Full, Partial, None"
              />
              <p className="text-muted-foreground text-xs">{t("answersHelp")}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-suggestions`}>{t("commonWording")}</Label>
            <Textarea
              id={`${fieldId}-suggestions`}
              value={item.defectSuggestions}
              onChange={(e) => onChange({ defectSuggestions: e.target.value })}
              placeholder={"Worn below minimum\nContaminated with oil\nSeized"}
              className="min-h-[76px] text-sm"
            />
            <p className="text-muted-foreground text-xs">
              {t("commonWordingHelp")}
            </p>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id={`${fieldId}-required`}
                checked={item.required}
                onCheckedChange={(v) => onChange({ required: v })}
              />
              <Label htmlFor={`${fieldId}-required`} className="font-normal">
                {t("mustComplete")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id={`${fieldId}-photo`}
                checked={item.photoRequired}
                onCheckedChange={(v) => onChange({ photoRequired: v })}
              />
              <Label htmlFor={`${fieldId}-photo`} className="font-normal">
                {t("photoRequired")}
              </Label>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Section card                                                               */
/* -------------------------------------------------------------------------- */

function SectionCard({
  section,
  index,
  canDelete,
  onChange,
  onDelete,
  onAddItem,
  onItemChange,
  onItemDuplicate,
  onItemDelete,
  onItemsReorder,
}: {
  section: EditorSection;
  index: number;
  canDelete: boolean;
  onChange: (patch: Partial<EditorSection>) => void;
  onDelete: () => void;
  onAddItem: () => void;
  onItemChange: (itemIndex: number, patch: Partial<EditorItem>) => void;
  onItemDuplicate: (itemIndex: number) => void;
  onItemDelete: (itemIndex: number) => void;
  onItemsReorder: (from: number, to: number) => void;
}) {
  const t = useTranslations("inspections.builder");
  const fieldId = useId();
  const { setNodeRef, style, isDragging, handleProps } = useSortableRow(section.key);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = section.items.findIndex((i) => i.key === active.id);
    const to = section.items.findIndex((i) => i.key === over.id);
    if (from !== -1 && to !== -1) onItemsReorder(from, to);
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      aria-labelledby={`${fieldId}-name`}
      className={`bg-card rounded-lg border ${isDragging ? "ring-primary/40 shadow-lg ring-2" : ""}`}
    >
      <header className="flex items-start gap-1.5 border-b p-3">
        <DragHandle label={t("reorderSection", { name: section.name || String(index + 1) })} {...handleProps} />
        <div className="grid flex-1 gap-2 sm:grid-cols-[5rem_1fr]">
          <Input
            value={section.code}
            onChange={(e) => onChange({ code: e.target.value })}
            placeholder={t("ref")}
            aria-label={`Regulation reference for section ${index + 1}`}
            className="font-mono text-xs"
          />
          <Input
            id={`${fieldId}-name`}
            value={section.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t("sectionName")}
            aria-label={`Name of section ${index + 1}`}
            className="font-medium"
            required
          />
          <Input
            value={section.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={t("sectionNote")}
            aria-label={`Description of section ${index + 1}`}
            className="text-sm sm:col-span-2"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive h-9 w-9 shrink-0"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label={t("removeSection", { name: section.name || String(index + 1) })}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleItemDragEnd}
        >
          <SortableContext
            items={section.items.map((i) => i.key)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1.5">
              {section.items.map((item, itemIndex) => (
                <CheckRow
                  key={item.key}
                  item={item}
                  sectionIndex={index}
                  index={itemIndex}
                  canDelete={section.items.length > 1}
                  onChange={(patch) => onItemChange(itemIndex, patch)}
                  onDuplicate={() => onItemDuplicate(itemIndex)}
                  onDelete={() => onItemDelete(itemIndex)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onAddItem}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {t("addCheck")}
        </Button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Builder                                                                    */
/* -------------------------------------------------------------------------- */

export function TemplateForm({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateFormData;
}) {
  const t = useTranslations("inspections.builder");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!template;

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [country, setCountry] = useState(template?.country ?? "none");
  const [severityScale, setSeverityScale] = useState<SeverityScale>(
    (template?.severityScale as SeverityScale) || "eu"
  );
  const [sections, setSections] = useState<EditorSection[]>(() => toEditorState(template));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const patchSection = (index: number, patch: Partial<EditorSection>) =>
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const patchItem = (sectionIndex: number, itemIndex: number, patch: Partial<EditorItem>) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? { ...s, items: s.items.map((it, j) => (j === itemIndex ? { ...it, ...patch } : it)) }
          : s
      )
    );

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSections((prev) => {
      const from = prev.findIndex((s) => s.key === active.id);
      const to = prev.findIndex((s) => s.key === over.id);
      return from === -1 || to === -1 ? prev : arrayMove(prev, from, to);
    });
  };

  const totalChecks = sections.reduce((sum, s) => sum + s.items.length, 0);
  // A reference with more than one dot is an Annex I citation, not a position
  // in the list, so warn before offering to overwrite it.
  const hasRegulationCodes = sections.some((section) =>
    section.items.some((item) => (item.code.match(/\./g)?.length ?? 0) >= 2)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      ...(isEdit ? { id: template.id } : {}),
      name,
      description: description || undefined,
      isDefault,
      country: country === "none" ? null : country,
      standard: template?.standard ?? "custom",
      severityScale,
      sections: sections.map((s, sIdx) => ({
        name: s.name,
        description: s.description || undefined,
        code: s.code || undefined,
        sortOrder: sIdx,
        items: s.items.map((i, iIdx) => ({
          name: i.name,
          description: i.description || undefined,
          code: i.code || undefined,
          sortOrder: iIdx,
          inputType: i.inputType,
          unit: i.unit || undefined,
          // Empty strings mean "no bound", which is not the same as zero.
          minValue: i.minValue === "" ? null : Number(i.minValue),
          maxValue: i.maxValue === "" ? null : Number(i.maxValue),
          choices:
            i.inputType === "choice"
              ? i.choices
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean)
              : [],
          required: i.required,
          photoRequired: i.photoRequired,
          defaultSeverity:
            i.inputType === "measurement" ? i.defaultSeverity || "fail" : null,
          defectSuggestions: i.defectSuggestions
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        })),
      })),
    };

    startTransition(async () => {
      const result = isEdit ? await updateTemplate(payload) : await createTemplate(payload);
      if (result.success) {
        toast.success(isEdit ? t("updated") : t("created"));
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || t("saveFailed"));
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-5xl"
        aria-describedby="template-builder-description"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{isEdit ? t("editTitle") : t("newTitle")}</SheetTitle>
          <SheetDescription id="template-builder-description">
            {t("description")}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 lg:grid-cols-[20rem_1fr]">
            {/* Settings */}
            <div className="space-y-5 overflow-y-auto border-b p-6 lg:border-r lg:border-b-0">
              <div className="space-y-2">
                <Label htmlFor="template-name">{t("name")}</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-desc">{t("templateDescription")}</Label>
                <Textarea
                  id="template-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("descriptionPlaceholder")}
                  className="min-h-[72px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-country">{t("country")}</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger id="template-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("notCountrySpecific")}</SelectItem>
                    {TEMPLATE_COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  {t("countryHelp")}
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("defectScale")}</legend>
                <Select
                  value={severityScale}
                  onValueChange={(v) => setSeverityScale(v as SeverityScale)}
                >
                  <SelectTrigger aria-label={t("defectScale")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eu">{t("scaleEu")}</SelectItem>
                    <SelectItem value="basic">{t("scaleBasic")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  {severityScale === "eu"
                    ? t("scaleEuHelp")
                    : t("scaleBasicHelp")}
                </p>
              </fieldset>

              <div className="flex items-start gap-2 rounded-lg border p-3">
                <Switch
                  id="template-default"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="template-default">{t("defaultTemplate")}</Label>
                  <p className="text-muted-foreground text-xs">
                    {t("defaultHelp")}
                  </p>
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("summary", { sections: sections.length, checks: totalChecks })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setSections((prev) => renumber(prev))}
                >
                  <ListOrdered className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t("renumber")}
                </Button>
                <p className="text-muted-foreground text-xs">
                  {t("renumberHelp")}
                  {hasRegulationCodes && (
                    <strong className="text-foreground block pt-1">
                      {t("renumberWarning")}
                    </strong>
                  )}
                </p>
              </div>
            </div>

            {/* Checklist */}
            <div className="bg-muted/20 min-h-0 overflow-y-auto p-6">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleSectionDragEnd}
              >
                <SortableContext
                  items={sections.map((s) => s.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {sections.map((section, index) => (
                      <SectionCard
                        key={section.key}
                        section={section}
                        index={index}
                        canDelete={sections.length > 1}
                        onChange={(patch) => patchSection(index, patch)}
                        onDelete={() =>
                          setSections((prev) => prev.filter((_, i) => i !== index))
                        }
                        onAddItem={() =>
                          patchSection(index, {
                            items: [
                              ...section.items,
                              { ...blankItem(), code: nextItemCode(section, index) },
                            ],
                          })
                        }
                        onItemChange={(itemIndex, patch) => patchItem(index, itemIndex, patch)}
                        onItemDuplicate={(itemIndex) => {
                          const source = section.items[itemIndex];
                          const copy = {
                            ...source,
                            key: nextKey(),
                            code: nextItemCode(section, index),
                          };
                          const items = [...section.items];
                          items.splice(itemIndex + 1, 0, copy);
                          patchSection(index, { items });
                        }}
                        onItemDelete={(itemIndex) =>
                          patchSection(index, {
                            items: section.items.filter((_, j) => j !== itemIndex),
                          })
                        }
                        onItemsReorder={(from, to) =>
                          patchSection(index, { items: arrayMove(section.items, from, to) })
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full"
                onClick={() =>
                  setSections((prev) => [
                    ...prev,
                    blankSection(nextSectionCode(prev)),
                  ])
                }
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                {t("addSection")}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {isEdit ? t("saveChanges") : t("create")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
