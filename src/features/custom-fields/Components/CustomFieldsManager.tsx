"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGlassModal } from "@/components/glass-modal";
import { useConfirm } from "@/components/confirm-dialog";
import {
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
} from "@/features/custom-fields/Actions/customFieldActions";
import type { FieldType, EntityType } from "@/features/custom-fields/Schema/customFieldSchema";
import { GripVertical, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

interface FieldDef {
  id: string;
  name: string;
  label: string;
  fieldType: string;
  options: string | null;
  required: boolean;
  entityType: string;
  sortOrder: number;
  isActive: boolean;
}

export function CustomFieldsManager({
  initialFields = [],
}: {
  initialFields?: FieldDef[];
}) {
  const router = useRouter();
  const t = useTranslations('settings');
  const modal = useGlassModal();
  const confirm = useConfirm();
  const [fields] = useState(initialFields);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<FieldDef | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterEntity, setFilterEntity] = useState<string>("all");

  const [formData, setFormData] = useState({
    name: "",
    label: "",
    fieldType: "text" as FieldType,
    options: "",
    required: false,
    entityType: "service_record" as EntityType,
    sortOrder: 0,
    isActive: true,
  });

  const fieldTypeLabels: Record<string, string> = {
    text: t('customFields.fieldTypes.text'),
    number: t('customFields.fieldTypes.number'),
    date: t('customFields.fieldTypes.date'),
    select: t('customFields.fieldTypes.select'),
    checkbox: t('customFields.fieldTypes.checkbox'),
    textarea: t('customFields.fieldTypes.textarea'),
  };

  const entityTypeLabels: Record<string, string> = {
    service_record: t('customFields.serviceRecord'),
    quote: t('customFields.quote'),
  };

  const resetForm = () => {
    setFormData({
      name: "",
      label: "",
      fieldType: "text",
      options: "",
      required: false,
      entityType: "service_record",
      sortOrder: 0,
      isActive: true,
    });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (field: FieldDef) => {
    setEditing(field);
    setFormData({
      name: field.name,
      label: field.label,
      fieldType: field.fieldType as FieldType,
      options: field.options || "",
      required: field.required,
      entityType: field.entityType as EntityType,
      sortOrder: field.sortOrder,
      isActive: field.isActive,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    setLoading(true);
    const payload = {
      ...formData,
      options: formData.fieldType === "select" ? formData.options : undefined,
    };

    const result = editing
      ? await updateFieldDefinition({ id: editing.id, ...payload })
      : await createFieldDefinition(payload);

    if (result.success) {
      toast.success(editing ? t('customFields.fieldUpdated') : t('customFields.fieldCreated'));
      setShowDialog(false);
      resetForm();
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t('customFields.failedSave'));
    }
    setLoading(false);
  };

  const handleDelete = async (field: FieldDef) => {
    const ok = await confirm({
      title: t('customFields.deleteTitle'),
      description: t('customFields.deleteDescription', { label: field.label }),
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteFieldDefinition(field.id);
    if (result.success) {
      toast.success(t('customFields.fieldDeleted'));
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t('customFields.failedDelete'));
    }
  };

  const filtered = filterEntity === "all" ? fields : fields.filter((f) => f.entityType === filterEntity);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('customFields.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('customFields.description')}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> {t('customFields.addField')}
        </Button>
      </div>

      <div className="flex gap-2">
        {["all", "service_record", "quote"].map((key) => (
          <Button
            key={key}
            variant={filterEntity === key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterEntity(key)}
          >
            {key === "all" ? t('customFields.filterAll') : entityTypeLabels[key]}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('customFields.emptyState')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((field) => (
            <Card key={field.id} className="border-0 shadow-sm">
              <CardContent className="flex items-center gap-4 py-3">
                <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{field.label}</span>
                    <Badge variant="outline" className="text-xs">
                      {fieldTypeLabels[field.fieldType] || field.fieldType}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {entityTypeLabels[field.entityType]}
                    </Badge>
                    {field.required && (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/20 bg-amber-500/10">
                        {t('customFields.required')}
                      </Badge>
                    )}
                    {!field.isActive && (
                      <Badge variant="outline" className="text-xs text-gray-500">
                        {t('customFields.inactive')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{field.name}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(field)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(field)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('customFields.editField') : t('customFields.newField')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('customFields.label')}</Label>
              <Input
                placeholder={t('customFields.labelPlaceholder')}
                value={formData.label}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    label: e.target.value,
                    name: editing ? formData.name : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
                  });
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('customFields.fieldName')}</Label>
              <Input
                placeholder={t('customFields.fieldNamePlaceholder')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={!!editing}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{t('customFields.fieldNameHint')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('customFields.fieldType')}</Label>
                <Select
                  value={formData.fieldType}
                  onValueChange={(v) => setFormData({ ...formData, fieldType: v as FieldType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{t('customFields.fieldTypes.text')}</SelectItem>
                    <SelectItem value="number">{t('customFields.fieldTypes.number')}</SelectItem>
                    <SelectItem value="date">{t('customFields.fieldTypes.date')}</SelectItem>
                    <SelectItem value="select">{t('customFields.fieldTypes.select')}</SelectItem>
                    <SelectItem value="checkbox">{t('customFields.fieldTypes.checkbox')}</SelectItem>
                    <SelectItem value="textarea">{t('customFields.fieldTypes.textarea')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('customFields.entityType')}</Label>
                <Select
                  value={formData.entityType}
                  onValueChange={(v) => setFormData({ ...formData, entityType: v as EntityType })}
                  disabled={!!editing}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service_record">{t('customFields.serviceRecord')}</SelectItem>
                    <SelectItem value="quote">{t('customFields.quote')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.fieldType === "select" && (
              <div className="space-y-2">
                <Label>{t('customFields.optionsLabel')}</Label>
                <Input
                  placeholder={t('customFields.optionsPlaceholder')}
                  value={formData.options}
                  onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.required}
                  onCheckedChange={(checked) => setFormData({ ...formData, required: checked })}
                />
                <Label>{t('customFields.required')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label>{t('customFields.active')}</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setShowDialog(false); resetForm(); }}>
                {t('customFields.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={loading || !formData.name || !formData.label}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? t('customFields.update') : t('customFields.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
