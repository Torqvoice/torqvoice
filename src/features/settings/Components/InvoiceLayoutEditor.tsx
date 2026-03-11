"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Lock,
  X,
  Plus,
  Columns2,
  Square,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  BUILTIN_SECTIONS,
  SECTIONS_WITH_FIELDS,
  COLUMN_ELIGIBLE_SECTIONS,
  getBuiltinFieldsForSection,
  getBuiltinFieldName,
  isCustomFieldId,
  fromCustomFieldId,
  toCustomFieldId,
  type InvoiceLayoutConfig,
  type InvoiceSection,
  type InvoiceFieldConfig,
} from "../Schema/invoiceLayoutSchema";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FieldDef {
  id: string;
  name: string;
  label: string;
  fieldType: string;
  entityType: string;
  options: string | null;
  required: boolean;
  sortOrder: number;
  isActive: boolean;
}

interface InvoiceLayoutEditorProps {
  config: InvoiceLayoutConfig;
  onChange: (config: InvoiceLayoutConfig) => void;
  documentType: "invoice" | "quote";
  customFields?: FieldDef[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSectionName(id: string, t: ReturnType<typeof useTranslations>): string {
  const key = `layoutEditor.sections.${id}` as Parameters<typeof t>[0];
  const translated = t(key);
  // If the key is not found, next-intl returns the key itself
  if (translated !== key) return translated;
  const builtin = BUILTIN_SECTIONS.find((s) => s.id === id);
  return builtin?.name ?? id;
}

function getFieldDisplayName(
  fieldId: string,
  t: ReturnType<typeof useTranslations>,
  customFields?: FieldDef[],
): string {
  if (isCustomFieldId(fieldId)) {
    const defId = fromCustomFieldId(fieldId);
    const def = customFields?.find((cf) => cf.id === defId);
    return def?.label ?? def?.name ?? fieldId;
  }
  const key = `layoutEditor.fields.${fieldId}` as Parameters<typeof t>[0];
  const translated = t(key);
  if (translated !== key) return translated;
  return getBuiltinFieldName(fieldId) ?? fieldId;
}

function getAssignedCustomFieldIds(config: InvoiceLayoutConfig): Set<string> {
  const assigned = new Set<string>();
  for (const section of config.sections) {
    if (section.fields) {
      for (const field of section.fields) {
        if (isCustomFieldId(field.id)) {
          assigned.add(fromCustomFieldId(field.id));
        }
      }
    }
  }
  return assigned;
}

// ---------------------------------------------------------------------------
// SortableField
// ---------------------------------------------------------------------------

function SortableField({
  field,
  sectionId,
  isBuiltin,
  customFields,
  onToggleVisibility,
  onRemove,
  t,
}: {
  field: InvoiceFieldConfig;
  sectionId: string;
  isBuiltin: boolean;
  customFields?: FieldDef[];
  onToggleVisibility: (sectionId: string, fieldId: string) => void;
  onRemove: (sectionId: string, fieldId: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `field::${sectionId}::${field.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        "flex items-center gap-3 rounded-md border border-dashed px-3 py-2 transition-colors",
        isBuiltin ? "bg-muted/30" : "bg-accent/20 border-accent/40",
        !field.visible && "opacity-60",
        isDragging && "z-10 shadow-md",
      )}
    >
      <button
        type="button"
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <span className="flex-1 text-sm text-muted-foreground">
        {getFieldDisplayName(field.id, t, customFields)}
        {!isBuiltin && (
          <span className="ml-1.5 text-xs text-muted-foreground/60">
            ({t('layoutEditor.custom')})
          </span>
        )}
      </span>

      <div className="flex items-center gap-2">
        {field.visible ? (
          <Eye className="h-3 w-3 text-muted-foreground" />
        ) : (
          <EyeOff className="h-3 w-3 text-muted-foreground" />
        )}
        <Switch
          size="sm"
          checked={field.visible}
          onCheckedChange={() => onToggleVisibility(sectionId, field.id)}
        />
        {isBuiltin ? (
          <Lock className="h-3 w-3 text-muted-foreground/50" />
        ) : (
          <button
            type="button"
            onClick={() => onRemove(sectionId, field.id)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddCustomFieldButton
// ---------------------------------------------------------------------------

function AddCustomFieldButton({
  sectionId,
  availableFields,
  onAdd,
  t,
}: {
  sectionId: string;
  availableFields: FieldDef[];
  onAdd: (sectionId: string, definitionId: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(false);

  if (availableFields.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('layoutEditor.addField')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <div className="max-h-48 overflow-y-auto">
          {availableFields.map((cf) => (
            <button
              key={cf.id}
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                onAdd(sectionId, cf.id);
                setOpen(false);
              }}
            >
              {cf.label || cf.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// FieldsPanel – expandable field list inside a section card
// ---------------------------------------------------------------------------

function FieldsPanel({
  section,
  customFields,
  availableCustomFields,
  onToggleFieldVisibility,
  onRemoveField,
  onAddCustomField,
  onReorderFields,
  t,
}: {
  section: InvoiceSection;
  customFields?: FieldDef[];
  availableCustomFields: FieldDef[];
  onToggleFieldVisibility: (sectionId: string, fieldId: string) => void;
  onRemoveField: (sectionId: string, fieldId: string) => void;
  onAddCustomField: (sectionId: string, definitionId: string) => void;
  onReorderFields: (sectionId: string, oldIndex: number, newIndex: number) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const builtinFields = getBuiltinFieldsForSection(section.id);
  const builtinFieldIds = new Set(builtinFields.map((f) => f.id));
  const fields = section.fields ?? [];

  const fieldSortableIds: UniqueIdentifier[] = fields.map(
    (f) => `field::${section.id}::${f.id}`,
  );

  const fieldSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const prefix = `field::${section.id}::`;
    const activeFieldId = String(active.id).replace(prefix, "");
    const overFieldId = String(over.id).replace(prefix, "");
    const oldIndex = fields.findIndex((f) => f.id === activeFieldId);
    const newIndex = fields.findIndex((f) => f.id === overFieldId);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderFields(section.id, oldIndex, newIndex);
    }
  };

  return (
    <div className="mt-1 space-y-1">
      <DndContext
        id={`layout-fields-${section.id}`}
        sensors={fieldSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleFieldDragEnd}
      >
        <SortableContext
          items={fieldSortableIds}
          strategy={verticalListSortingStrategy}
        >
          {fields.map((field) => (
            <SortableField
              key={field.id}
              field={field}
              sectionId={section.id}
              isBuiltin={builtinFieldIds.has(field.id)}
              customFields={customFields}
              onToggleVisibility={onToggleFieldVisibility}
              onRemove={onRemoveField}
              t={t}
            />
          ))}
        </SortableContext>
      </DndContext>
      <AddCustomFieldButton
        sectionId={section.id}
        availableFields={availableCustomFields}
        onAdd={onAddCustomField}
        t={t}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Width toggle – simple "full" or "half (L/R)" selector
// ---------------------------------------------------------------------------

function WidthToggle({
  column,
  onChange,
  t,
}: {
  column: "left" | "right" | undefined;
  onChange: (column: "left" | "right" | undefined) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  // Cycle: undefined (full) → left → right → undefined
  const isHalf = column === "left" || column === "right";

  return (
    <button
      type="button"
      title={
        isHalf
          ? t('layoutEditor.halfWidthHint', { column: column === "left" ? t('layoutEditor.left') : t('layoutEditor.right') })
          : t('layoutEditor.fullWidthHint')
      }
      onClick={() => {
        if (!column) onChange("left");
        else if (column === "left") onChange("right");
        else onChange(undefined);
      }}
      className={cn(
        "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
        isHalf
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-transparent bg-muted text-muted-foreground hover:bg-muted/80",
      )}
    >
      {isHalf ? (
        <>
          <Columns2 className="h-3 w-3" />
          <span className="uppercase">{column === "left" ? t('layoutEditor.L') : t('layoutEditor.R')}</span>
        </>
      ) : (
        <>
          <Square className="h-3 w-3" />
          <span>{t('layoutEditor.full')}</span>
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SectionCard – single section row in the list
// ---------------------------------------------------------------------------

function SectionCard({
  section,
  customFields,
  onToggleVisibility,
  onToggleFieldVisibility,
  onRemoveField,
  onAddCustomField,
  onReorderFields,
  onSetColumn,
  isExpanded,
  onToggleExpand,
  availableCustomFields,
  t,
}: {
  section: InvoiceSection;
  customFields?: FieldDef[];
  onToggleVisibility: (sectionId: string) => void;
  onToggleFieldVisibility: (sectionId: string, fieldId: string) => void;
  onRemoveField: (sectionId: string, fieldId: string) => void;
  onAddCustomField: (sectionId: string, definitionId: string) => void;
  onReorderFields: (sectionId: string, oldIndex: number, newIndex: number) => void;
  onSetColumn: (sectionId: string, column: "left" | "right" | undefined) => void;
  isExpanded: boolean;
  onToggleExpand: (sectionId: string) => void;
  availableCustomFields: FieldDef[];
  t: ReturnType<typeof useTranslations>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasFields = SECTIONS_WITH_FIELDS.has(section.id);
  const isColumnEligible = COLUMN_ELIGIBLE_SECTIONS.has(section.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(isDragging && "z-10 opacity-50")}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-colors",
          !section.visible && "opacity-50",
        )}
      >
        {/* Drag handle */}
        <button
          type="button"
          {...listeners}
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Expand toggle for sections with fields */}
        {hasFields && (
          <button
            type="button"
            onClick={() => onToggleExpand(section.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Section name */}
        <span className="flex-1 text-sm font-medium">
          {getSectionName(section.id, t)}
        </span>

        {/* Width toggle (only for column-eligible sections) */}
        {isColumnEligible && (
          <WidthToggle
            column={section.column}
            onChange={(col) => onSetColumn(section.id, col)}
            t={t}
          />
        )}

        {/* Visibility toggle */}
        <div className="flex items-center gap-1.5 ml-1">
          {section.visible ? (
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Switch
            size="sm"
            checked={section.visible}
            onCheckedChange={() => onToggleVisibility(section.id)}
          />
        </div>
      </div>

      {/* Expandable fields panel */}
      {hasFields && isExpanded && (
        <div className="ml-6">
          <FieldsPanel
            section={section}
            customFields={customFields}
            availableCustomFields={availableCustomFields}
            onToggleFieldVisibility={onToggleFieldVisibility}
            onRemoveField={onRemoveField}
            onAddCustomField={onAddCustomField}
            onReorderFields={onReorderFields}
            t={t}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InvoiceLayoutEditor
// ---------------------------------------------------------------------------

export function InvoiceLayoutEditor({
  config,
  onChange,
  documentType,
  customFields,
}: InvoiceLayoutEditorProps) {
  const t = useTranslations('settings');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortedSections = useMemo(
    () => [...config.sections].sort((a, b) => a.order - b.order),
    [config.sections],
  );

  const availableCustomFields = useMemo(() => {
    if (!customFields) return [];
    const assigned = getAssignedCustomFieldIds(config);
    return customFields.filter(
      (cf) => cf.isActive && !assigned.has(cf.id),
    );
  }, [customFields, config]);

  const toggleExpand = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  // --- Handlers ---

  const handleToggleVisibility = useCallback(
    (sectionId: string) => {
      const updatedSections = config.sections.map((s) =>
        s.id === sectionId ? { ...s, visible: !s.visible } : s,
      );
      onChange({ sections: updatedSections });
    },
    [config, onChange],
  );

  const handleToggleFieldVisibility = useCallback(
    (sectionId: string, fieldId: string) => {
      const updatedSections = config.sections.map((s) => {
        if (s.id !== sectionId || !s.fields) return s;
        return {
          ...s,
          fields: s.fields.map((f) =>
            f.id === fieldId ? { ...f, visible: !f.visible } : f,
          ),
        };
      });
      onChange({ sections: updatedSections });
    },
    [config, onChange],
  );

  const handleRemoveField = useCallback(
    (sectionId: string, fieldId: string) => {
      const updatedSections = config.sections.map((s) => {
        if (s.id !== sectionId || !s.fields) return s;
        return { ...s, fields: s.fields.filter((f) => f.id !== fieldId) };
      });
      onChange({ sections: updatedSections });
    },
    [config, onChange],
  );

  const handleAddCustomField = useCallback(
    (sectionId: string, definitionId: string) => {
      const cfId = toCustomFieldId(definitionId);
      const updatedSections = config.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const currentFields = s.fields ?? [];
        return { ...s, fields: [...currentFields, { id: cfId, visible: true }] };
      });
      onChange({ sections: updatedSections });
    },
    [config, onChange],
  );

  const handleReorderFields = useCallback(
    (sectionId: string, oldIndex: number, newIndex: number) => {
      const updatedSections = config.sections.map((s) => {
        if (s.id !== sectionId || !s.fields) return s;
        return { ...s, fields: arrayMove(s.fields, oldIndex, newIndex) };
      });
      onChange({ sections: updatedSections });
    },
    [config, onChange],
  );

  const handleSetColumn = useCallback(
    (sectionId: string, column: "left" | "right" | undefined) => {
      const updatedSections = config.sections.map((s) =>
        s.id === sectionId ? { ...s, column } : s,
      );
      onChange({ sections: updatedSections });
    },
    [config, onChange],
  );

  // --- Drag reorder (single flat list) ---

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sortedSections.findIndex((s) => s.id === active.id);
      const newIndex = sortedSections.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(sortedSections, oldIndex, newIndex);
      const updatedSections = config.sections.map((s) => {
        const idx = reordered.findIndex((r) => r.id === s.id);
        return { ...s, order: idx };
      });
      onChange({ sections: updatedSections });
    },
    [config, onChange, sortedSections],
  );

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-2">
        {t('layoutEditor.helpText')}
      </p>

      <DndContext
        id="layout-sections"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedSections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {sortedSections.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              customFields={customFields}
              onToggleVisibility={handleToggleVisibility}
              onToggleFieldVisibility={handleToggleFieldVisibility}
              onRemoveField={handleRemoveField}
              onAddCustomField={handleAddCustomField}
              onReorderFields={handleReorderFields}
              onSetColumn={handleSetColumn}
              isExpanded={expandedSections.has(section.id)}
              onToggleExpand={toggleExpand}
              availableCustomFields={availableCustomFields}
              t={t}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
