"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  BUILTIN_SECTIONS,
  BUILTIN_INFO_FIELDS,
  BUILTIN_HEADER_FIELDS,
  BUILTIN_BANK_ACCOUNT_FIELDS,
  type InvoiceLayoutConfig,
  type InvoiceSection,
  type InvoiceFieldConfig,
} from "../Schema/invoiceLayoutSchema";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InvoiceLayoutEditorProps {
  config: InvoiceLayoutConfig;
  onChange: (config: InvoiceLayoutConfig) => void;
  documentType: "invoice" | "quote";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSectionName(id: string): string {
  const builtin = BUILTIN_SECTIONS.find((s) => s.id === id);
  return builtin?.name ?? id;
}

function getFieldName(id: string, sectionId?: string): string {
  if (sectionId === "header") {
    const builtin = BUILTIN_HEADER_FIELDS.find((f) => f.id === id);
    if (builtin) return builtin.name;
  }
  if (sectionId === "bank_account") {
    const builtin = BUILTIN_BANK_ACCOUNT_FIELDS.find((f) => f.id === id);
    if (builtin) return builtin.name;
  }
  const builtin = BUILTIN_INFO_FIELDS.find((f) => f.id === id);
  return builtin?.name ?? id;
}

const SECTIONS_WITH_FIELDS = new Set(["info", "header", "bank_account"]);

// ---------------------------------------------------------------------------
// SortableSection
// ---------------------------------------------------------------------------

function SortableSection({
  section,
  onToggleVisibility,
  onToggleFieldVisibility,
  isExpanded,
  onToggleExpand,
}: {
  section: InvoiceSection;
  onToggleVisibility: (sectionId: string) => void;
  onToggleFieldVisibility: (sectionId: string, fieldId: string) => void;
  isExpanded: boolean;
  onToggleExpand: (sectionId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasFields = SECTIONS_WITH_FIELDS.has(section.id);
  const isCustomFields = section.id === "custom_fields";

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
      {hasFields && isExpanded && section.fields && (
        <div className="ml-8 mt-1 space-y-1">
          {section.fields.map((field) => (
            <div
              key={field.id}
              className={cn(
                "flex items-center gap-3 rounded-md border border-dashed bg-muted/30 px-3 py-2 transition-colors",
                !field.visible && "opacity-60",
              )}
            >
              <span className="flex-1 text-sm text-muted-foreground">
                {getFieldName(field.id, section.id)}
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
                  onCheckedChange={() =>
                    onToggleFieldVisibility(section.id, field.id)
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom fields note */}
      {isCustomFields && section.visible && (
        <div className="ml-8 mt-1 rounded-md border border-dashed bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Custom fields are configured in Settings &rarr; Custom Fields.
          </p>
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

  const toggleExpand = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const handleToggleVisibility = (sectionId: string) => {
    const updatedSections = config.sections.map((s) =>
      s.id === sectionId ? { ...s, visible: !s.visible } : s,
    );
    onChange({ sections: updatedSections });
  };

  const handleToggleFieldVisibility = (
    sectionId: string,
    fieldId: string,
  ) => {
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
  };

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
              onToggleVisibility={handleToggleVisibility}
              onToggleFieldVisibility={handleToggleFieldVisibility}
              isExpanded={expandedSections.has(section.id)}
              onToggleExpand={toggleExpand}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
