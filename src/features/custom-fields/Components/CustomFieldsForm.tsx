"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCustomFieldValues, saveCustomFieldValues, getFieldDefinitions } from "@/features/custom-fields/Actions/customFieldActions";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldWithValue {
  id: string;
  name: string;
  label: string;
  fieldType: string;
  options: string | null;
  required: boolean;
  value: string;
}

export function CustomFieldsForm({
  entityId,
  entityType,
  onValuesReady,
  onChange,
}: {
  entityId?: string;
  entityType: "service_record" | "quote";
  onValuesReady?: (save: () => Promise<{ valid: boolean }>) => void;
  onChange?: () => void;
}) {
  const [fields, setFields] = useState<FieldWithValue[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (entityId) {
        const result = await getCustomFieldValues(entityId, entityType);
        if (result.success && result.data) {
          setFields(result.data);
          const v: Record<string, string> = {};
          for (const f of result.data) v[f.id] = f.value;
          setValues(v);
        }
      } else {
        const result = await getFieldDefinitions(entityType);
        if (result.success && result.data) {
          setFields(result.data.filter((d) => d.isActive).map((d) => ({ ...d, value: "" })));
        }
      }
      setLoading(false);
    }
    load();
  }, [entityId, entityType]);

  const validate = useCallback((): Record<string, string> => {
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && field.fieldType !== "checkbox") {
        const val = values[field.id] ?? field.value ?? "";
        if (!val.trim()) {
          newErrors[field.id] = `${field.label} is required`;
        }
      }
    }
    return newErrors;
  }, [fields, values]);

  useEffect(() => {
    if (onValuesReady) {
      onValuesReady(async () => {
        const validationErrors = validate();
        if (Object.keys(validationErrors).length > 0) {
          setErrors(validationErrors);
          return { valid: false };
        }
        setErrors({});
        if (entityId && Object.keys(values).length > 0) {
          await saveCustomFieldValues(entityId, entityType, values);
        }
        return { valid: true };
      });
    }
  }, [onValuesReady, entityId, entityType, values, validate]);

  const updateValue = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    // Clear error for field when user types
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
    onChange?.();
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (fields.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Custom Fields</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((field) => {
          const val = values[field.id] ?? field.value ?? "";
          const hasError = !!errors[field.id];
          return (
            <div key={field.id} className="space-y-1.5">
              {field.fieldType !== "checkbox" && (
                <Label className={cn(hasError && "text-destructive")}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
              )}

              {field.fieldType === "text" && (
                <Input
                  value={val}
                  onChange={(e) => updateValue(field.id, e.target.value)}
                  className={cn(hasError && "border-destructive focus-visible:ring-destructive")}
                />
              )}

              {field.fieldType === "number" && (
                <Input
                  type="number"
                  value={val}
                  onChange={(e) => updateValue(field.id, e.target.value)}
                  className={cn(hasError && "border-destructive focus-visible:ring-destructive")}
                />
              )}

              {field.fieldType === "date" && (
                <Input
                  type="date"
                  value={val}
                  onChange={(e) => updateValue(field.id, e.target.value)}
                  className={cn(hasError && "border-destructive focus-visible:ring-destructive")}
                />
              )}

              {field.fieldType === "textarea" && (
                <Textarea
                  value={val}
                  onChange={(e) => updateValue(field.id, e.target.value)}
                  rows={3}
                  className={cn(hasError && "border-destructive focus-visible:ring-destructive")}
                />
              )}

              {field.fieldType === "checkbox" && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={val === "true"}
                    onCheckedChange={(checked) => updateValue(field.id, String(checked))}
                  />
                  <Label>{field.label}</Label>
                </div>
              )}

              {field.fieldType === "select" && (
                <Select value={val || "none"} onValueChange={(v) => updateValue(field.id, v === "none" ? "" : v)}>
                  <SelectTrigger className={cn(hasError && "border-destructive focus-visible:ring-destructive")}>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {!field.required && <SelectItem value="none">None</SelectItem>}
                    {(field.options || "")
                      .split(",")
                      .map((o) => o.trim())
                      .filter(Boolean)
                      .map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              {hasError && (
                <p className="text-xs text-destructive">{errors[field.id]}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * Returns the current custom field values as a Record<fieldId, value>.
 * Useful for saving after form submission.
 */
export function useCustomFieldValues() {
  const [values, setValues] = useState<Record<string, string>>({});
  return { values, setValues };
}
