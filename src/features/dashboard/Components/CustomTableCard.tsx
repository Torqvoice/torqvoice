"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Pencil, Table2, Trash2 } from "lucide-react";
import { useFormatDate } from "@/lib/use-format-date";
import { getField, type CustomWidget } from "../custom-cards/registry";
import { runDashboardWidget } from "../Actions/customCardActions";
import type { CardRow } from "../custom-cards/server-registry";

/**
 * Renders one user-defined table card. Rows are fetched lazily through the
 * widget's server action; in edit mode the header exposes edit/delete
 * controls that sit above the drag overlay.
 */
export function CustomTableCard({
  widget,
  editing,
  onEdit,
  onDelete,
}: {
  widget: CustomWidget;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("dashboard.customCards");
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configKey = JSON.stringify(widget.config);
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    runDashboardWidget(widget.id).then((result) => {
      if (cancelled) return;
      if (result.success && result.data) setRows(result.data);
      else setError(result.error || t("loadError"));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, configKey]);

  const { entity, columns } = widget.config;

  const renderCell = (fieldId: string, value: string | number | null) => {
    if (value === null || value === "") return "-";
    const def = getField(entity, fieldId);
    if (def?.type === "date" && typeof value === "string") {
      return formatDate(new Date(value));
    }
    if (def?.type === "select" && typeof value === "string") {
      return t(`options.${value}`);
    }
    return value;
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Table2 className="h-4 w-4" />
            {widget.name}
          </CardTitle>
          {editing && (
            <div className="dashboard-no-drag relative z-20 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onEdit}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">{t("editCard")}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sr-only">{t("deleteCard")}</span>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : rows === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noResults")}</p>
        ) : (
          <>
          {/* Card list (phones + small tablets): the first column heads each
              row, the rest become label/value pairs. */}
          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => router.push(row.href)}
                className="w-full rounded-lg border p-2.5 text-left active:bg-muted/50"
              >
                {columns.map((col, i) =>
                  i === 0 ? (
                    <p key={col} className="truncate text-sm font-medium">
                      {renderCell(col, row.cells[col] ?? null)}
                    </p>
                  ) : (
                    <p key={col} className="flex justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {t(`fields.${getField(entity, col)?.labelKey ?? col}`)}
                      </span>
                      <span className="truncate">
                        {renderCell(col, row.cells[col] ?? null)}
                      </span>
                    </p>
                  )
                )}
              </button>
            ))}
          </div>

          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col} className="text-xs">
                    {t(`fields.${getField(entity, col)?.labelKey ?? col}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(row.href)}
                >
                  {columns.map((col) => (
                    <TableCell key={col} className="truncate text-sm">
                      {renderCell(col, row.cells[col] ?? null)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
