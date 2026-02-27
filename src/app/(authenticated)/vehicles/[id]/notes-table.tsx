"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { useFormatDate } from "@/lib/use-format-date";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  MoreVertical,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface NoteRow {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Date;
}

interface NotesTableProps {
  vehicleId: string;
  records: NoteRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onSelectNote: (note: NoteRow) => void;
  onAddNote: () => void;
  onTogglePin: (id: string) => void;
  onDeleteNote: (id: string) => void;
}

export function NotesTable({
  vehicleId,
  records,
  total,
  page,
  pageSize,
  totalPages,
  onSelectNote,
  onAddNote,
  onTogglePin,
  onDeleteNote,
}: NotesTableProps) {
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("vehicles.notes");

  const createUrl = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set("tab", "notes");
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      }
      // Reset to page 1 when page size changes (unless explicitly setting page)
      if (!("notesPage" in params) && "notesPageSize" in params) {
        newParams.delete("notesPage");
      }
      return `${pathname}?${newParams.toString()}`;
    },
    [pathname, searchParams]
  );

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      startTransition(() => {
        router.push(createUrl(params));
      });
    },
    [router, createUrl]
  );

  const handlePageSizeChange = useCallback(
    (newSize: string) => {
      navigate({ notesPageSize: newSize, notesPage: 1 });
    },
    [navigate]
  );

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto">
          <Button size="sm" onClick={onAddNote}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("addNote")}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-7.5"></TableHead>
              <TableHead className="w-40">{t("table.title")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("table.content")}</TableHead>
              <TableHead className="w-30">{t("table.date")}</TableHead>
              <TableHead className="w-12.5"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              records.map((n) => (
                <TableRow key={n.id} className="cursor-pointer" onClick={() => onSelectNote(n)}>
                  <TableCell className="w-[30px] px-2">
                    {n.isPinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                  </TableCell>
                  <TableCell className="font-medium">{n.title}</TableCell>
                  <TableCell className="hidden max-w-0 sm:table-cell">
                    <p className="truncate text-sm text-muted-foreground">
                      {n.content.replace(/<[^>]*>/g, "")}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDate(new Date(n.createdAt))}
                  </TableCell>
                  <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onTogglePin(n.id)}>
                          {n.isPinned ? (
                            <PinOff className="mr-2 h-4 w-4" />
                          ) : (
                            <Pin className="mr-2 h-4 w-4" />
                          )}
                          {n.isPinned ? t("unpin") : t("pin")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => onDeleteNote(n.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {t("showing", { start: startItem, end: endItem, total })}
            </span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <span>{t("perPage")}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => navigate({ notesPage: 1 })}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => navigate({ notesPage: page - 1 })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm">
              {t("page", { page, totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => navigate({ notesPage: page + 1 })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => navigate({ notesPage: totalPages })}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
