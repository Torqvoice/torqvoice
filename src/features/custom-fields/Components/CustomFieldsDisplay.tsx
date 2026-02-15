"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCustomFieldValues } from "@/features/custom-fields/Actions/customFieldActions";
import { Loader2 } from "lucide-react";

interface FieldWithValue {
  id: string;
  name: string;
  label: string;
  fieldType: string;
  value: string;
}

export function CustomFieldsDisplay({
  entityId,
  entityType,
}: {
  entityId: string;
  entityType: "service_record" | "quote";
}) {
  const [fields, setFields] = useState<FieldWithValue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await getCustomFieldValues(entityId, entityType);
      if (result.success && result.data) {
        setFields(result.data.filter((f) => f.value));
      }
      setLoading(false);
    }
    load();
  }, [entityId, entityType]);

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
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.id} className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
              {field.fieldType === "checkbox" ? (
                <Badge variant="outline" className={field.value === "true" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}>
                  {field.value === "true" ? "Yes" : "No"}
                </Badge>
              ) : (
                <p className="text-sm">{field.value}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
