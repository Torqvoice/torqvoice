"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { createTemplate, updateTemplate } from "../Actions/templateActions";

interface TemplateSection {
  id?: string;
  name: string;
  sortOrder: number;
  items: { id?: string; name: string; sortOrder: number }[];
}

interface TemplateData {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  sections: TemplateSection[];
}

export function TemplateForm({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!template;

  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [isDefault, setIsDefault] = useState(template?.isDefault || false);
  const [sections, setSections] = useState<TemplateSection[]>(
    template?.sections.map((s, sIdx) => ({
      name: s.name,
      sortOrder: s.sortOrder ?? sIdx,
      items: s.items.map((i, iIdx) => ({ name: i.name, sortOrder: i.sortOrder ?? iIdx })),
    })) || [{ name: "", sortOrder: 0, items: [{ name: "", sortOrder: 0 }] }]
  );

  // Reset form when template changes
  const resetForm = () => {
    setName(template?.name || "");
    setDescription(template?.description || "");
    setIsDefault(template?.isDefault || false);
    setSections(
      template?.sections.map((s, sIdx) => ({
        name: s.name,
        sortOrder: s.sortOrder ?? sIdx,
        items: s.items.map((i, iIdx) => ({ name: i.name, sortOrder: i.sortOrder ?? iIdx })),
      })) || [{ name: "", sortOrder: 0, items: [{ name: "", sortOrder: 0 }] }]
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (open) resetForm();
    onOpenChange(open);
  };

  const addSection = () => {
    setSections([...sections, { name: "", sortOrder: sections.length, items: [{ name: "", sortOrder: 0 }] }]);
  };

  const removeSection = (idx: number) => {
    setSections(sections.filter((_, i) => i !== idx));
  };

  const updateSectionName = (idx: number, val: string) => {
    const updated = [...sections];
    updated[idx] = { ...updated[idx], name: val };
    setSections(updated);
  };

  const addItem = (sectionIdx: number) => {
    const updated = [...sections];
    updated[sectionIdx] = {
      ...updated[sectionIdx],
      items: [...updated[sectionIdx].items, { name: "", sortOrder: updated[sectionIdx].items.length }],
    };
    setSections(updated);
  };

  const removeItem = (sectionIdx: number, itemIdx: number) => {
    const updated = [...sections];
    updated[sectionIdx] = {
      ...updated[sectionIdx],
      items: updated[sectionIdx].items.filter((_, i) => i !== itemIdx),
    };
    setSections(updated);
  };

  const updateItemName = (sectionIdx: number, itemIdx: number, val: string) => {
    const updated = [...sections];
    const items = [...updated[sectionIdx].items];
    items[itemIdx] = { ...items[itemIdx], name: val };
    updated[sectionIdx] = { ...updated[sectionIdx], items };
    setSections(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      ...(isEdit ? { id: template!.id } : {}),
      name,
      description: description || undefined,
      isDefault,
      sections: sections.map((s, sIdx) => ({
        name: s.name,
        sortOrder: sIdx,
        items: s.items.map((i, iIdx) => ({
          name: i.name,
          sortOrder: iIdx,
        })),
      })),
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateTemplate(payload)
        : await createTemplate(payload);

      if (result.success) {
        toast.success(isEdit ? "Template updated" : "Template created");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to save template");
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-6">
        <SheetHeader className="mb-6">
          <SheetTitle>{isEdit ? "Edit Template" : "New Template"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Multi-Point Inspection"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-desc">Description</Label>
            <Input
              id="template-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch id="template-default" checked={isDefault} onCheckedChange={setIsDefault} />
            <Label htmlFor="template-default">Set as default template</Label>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Sections</Label>
              <Button type="button" variant="outline" size="sm" onClick={addSection}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Section
              </Button>
            </div>

            {sections.map((section, sIdx) => (
              <div key={sIdx} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    value={section.name}
                    onChange={(e) => updateSectionName(sIdx, e.target.value)}
                    placeholder="Section name (e.g. Exterior)"
                    className="font-medium"
                    required
                  />
                  {sections.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => removeSection(sIdx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className="space-y-2 ml-6">
                  {section.items.map((item, iIdx) => (
                    <div key={iIdx} className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      <Input
                        value={item.name}
                        onChange={(e) => updateItemName(sIdx, iIdx, e.target.value)}
                        placeholder="Item name (e.g. Body condition)"
                        className="text-sm"
                        required
                      />
                      {section.items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(sIdx, iIdx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => addItem(sIdx)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Item
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Update" : "Create"} Template
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
