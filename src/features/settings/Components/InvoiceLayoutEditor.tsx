"use client";

import { useState, useCallback, useMemo } from "react";
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

function getSectionName(id: string): string {
  const builtin = BUILTIN_SECTIONS.find((s) => s.id === id);
  return builtin?.name ?? id;
}

function getFieldDisplayName(
  fieldId: string,
  customFields?: FieldDef[],
): string {
  if (isCustomFieldId(fieldId)) {
    const defId = fromCustomFieldId(fieldId);
    const def = customFields?.find((cf) => cf.id === defId);
    return def?.label ?? def?.name ?? fieldId;
  }
  return getBuiltinFieldName(fieldId) ?? fieldId;
}

/**
 * Collect all cf_ field IDs already assigned to any section in the config.
 */
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
// SortableField (draggable field within a section)
// ---------------------------------------------------------------------------

function SortableField({
  field,
  sectionId,
  isBuiltin,
  customFields,
  onToggleVisibility,
  onRemove,
}: {
  field: InvoiceFieldConfig;
  sectionId: string;
  isBuiltin: boolean;
  customFields?: FieldDef[];
  onToggleVisibility: (sectionId: string, fieldId: string) => void;
  onRemove: (sectionId: string, fieldId: string) => void;
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
        {getFieldDisplayName(field.id, customFields)}
        {!isBuiltin && (
          <span className="ml-1.5 text-xs text-muted-foreground/60">
            (custom)
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
}: {
  sectionId: string;
  availableFields: FieldDef[];
  onAdd: (sectionId: string, definitionId: string) => void;
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
          Add field
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
// SortableSection
// ---------------------------------------------------------------------------

function SortableSection({
  section,
  config,
  customFields,
  onToggleVisibility,
  onToggleFieldVisibility,
  onRemoveField,
  onAddCustomField,
  onReorderFields,
  isExpanded,
  onToggleExpand,
  availableCustomFields,
}: {
  section: InvoiceSection;
  config: InvoiceLayoutConfig;
  customFields?: FieldDef[];
  onToggleVisibility: (sectionId: string) => void;
  onToggleFieldVisibility: (sectionId: string, fieldId: string) => void;
  onRemoveField: (sectionId: string, fieldId: string) => void;
  onAddCustomField: (sectionId: string, definitionId: string) => void;
  onReorderFields: (sectionId: string, oldIndex: number, newIndex: number) => void;
  isExpanded: boolean;
  onToggleExpand: (sectionId: string) => void;
  availableCustomFields: FieldDef[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasFields = SECTIONS_WITH_FIELDS.has(section.id);
  const builtinFields = getBuiltinFieldsForSection(section.id);
  const builtinFieldIds = new Set(builtinFields.map((f) => f.id));

  const fields = section.fields ?? [];

  // Create sortable item IDs for the nested context
  const fieldSortableIds: UniqueIdentifier[] = fields.map(
    (f) => `field::${section.id}::${f.id}`,
  );

  const sensors = useSensors(
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
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors",
          !section.visible && "opacity-60",
        )}
      >
        <button
          type="button"
          {...listeners}
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

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

        <span className="flex-1 text-sm font-medium">
          {getSectionName(section.id)}
        </span>

        <div className="flex items-center gap-2">
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

      {/* Expandable fields for sections with configurable child fields */}
      {hasFields && isExpanded && (
        <div className="ml-8 mt-1 space-y-1">
          <DndContext
            sensors={sensors}
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
                />
              ))}
            </SortableContext>
          </DndContext>

          <AddCustomFieldButton
            sectionId={section.id}
            availableFields={availableCustomFields}
            onAdd={onAddCustomField}
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Sort sections by order for display
  const sortedSections = [...config.sections].sort(
    (a, b) => a.order - b.order,
  );

  // Compute available (unassigned) custom fields
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
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

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
        return {
          ...s,
          fields: s.fields.filter((f) => f.id !== fieldId),
        };
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
        return {
          ...s,
          fields: [...currentFields, { id: cfId, visible: true }],
        };
      });
      onChange({ sections: updatedSections });
    },
    [config, onChange],
  );

  const handleReorderFields = useCallback(
    (sectionId: string, oldIndex: number, newIndex: number) => {
      const updatedSections = config.sections.map((s) => {
        if (s.id !== sectionId || !s.fields) return s;
        return {
          ...s,
          fields: arrayMove(s.fields, oldIndex, newIndex),
        };
      });
      onChange({ sections: updatedSections });
    },
    [config, onChange],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedSections.findIndex((s) => s.id === active.id);
    const newIndex = sortedSections.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(sortedSections, oldIndex, newIndex);

    // Reassign order values based on new positions
    const updatedSections = reordered.map((section, index) => ({
      ...section,
      order: index,
    }));

    onChange({ sections: updatedSections });
  };

  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedSections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {sortedSections.map((section) => (
            <SortableSection
              key={section.id}
              section={section}
              config={config}
              customFields={customFields}
              onToggleVisibility={handleToggleVisibility}
              onToggleFieldVisibility={handleToggleFieldVisibility}
              onRemoveField={handleRemoveField}
              onAddCustomField={handleAddCustomField}
              onReorderFields={handleReorderFields}
              isExpanded={expandedSections.has(section.id)}
              onToggleExpand={toggleExpand}
              availableCustomFields={availableCustomFields}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
