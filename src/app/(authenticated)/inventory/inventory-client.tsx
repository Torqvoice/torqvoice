"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { DataTablePagination } from "@/components/data-table-pagination";
import { useGlassModal } from "@/components/glass-modal";
import { useConfirm } from "@/components/confirm-dialog";
import { InventoryPartForm } from "@/features/inventory/Components/InventoryPartForm";
import { deleteInventoryPart } from "@/features/inventory/Actions/inventoryActions";
import {
  ExternalLink,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface InventoryPart {
  id: string;
  partNumber: string | null;
  name: string;
  description: string | null;
  category: string | null;
  quantity: number;
  minQuantity: number;
  unitCost: number;
  supplier: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  supplierUrl: string | null;
  imageUrl: string | null;
  location: string | null;
}

interface PaginatedData {
  parts: InventoryPart[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function InventoryClient({
  data,
  search,
  category,
  categories,
  currencyCode = "USD",
}: {
  data: PaginatedData;
  search: string;
  category: string;
  categories: string[];
  currencyCode?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);
  const [showForm, setShowForm] = useState(false);
  const [editPart, setEditPart] = useState<InventoryPart | null>(null);
  const modal = useGlassModal();
  const confirm = useConfirm();

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      }
      if (!("page" in params) && ("search" in params || "category" in params)) {
        newParams.delete("page");
      }
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`);
      });
    },
    [router, pathname, searchParams]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      navigate({ search: searchInput || undefined });
    },
    [navigate, searchInput]
  );

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: "Delete Part",
      description: `Delete "${name}" from inventory? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteInventoryPart(id);
    if (result.success) {
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || "Failed to delete part");
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search parts..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </form>
          <Select
            value={category || "all"}
            onValueChange={(v) => navigate({ category: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Part
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part #</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead>In Stock</TableHead>
              <TableHead className="text-right">Unit Cost</TableHead>
              <TableHead className="hidden md:table-cell">Supplier</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.parts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {search || category ? "No parts match your search." : "No parts in inventory yet."}
                </TableCell>
              </TableRow>
            ) : (
              data.parts.map((part) => {
                const isLow = part.minQuantity > 0 && part.quantity <= part.minQuantity;
                return (
                  <TableRow
                    key={part.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setEditPart(part);
                      setShowForm(true);
                    }}
                  >
                    <TableCell>
                      {part.partNumber ? (
                        <span className="font-mono text-sm">{part.partNumber}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {part.imageUrl && (
                          <img
                            src={part.imageUrl}
                            alt={part.name}
                            className="h-8 w-8 rounded object-cover"
                          />
                        )}
                        {part.name}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {part.category || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{part.quantity}</span>
                        {isLow && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Low
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(part.unitCost, currencyCode)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {part.supplier || "-"}
                        {part.supplierUrl && (
                          <a
                            href={part.supplierUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {part.location || "-"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditPart(part);
                              setShowForm(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(part.id, part.name)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        onNavigate={navigate}
      />

      <InventoryPartForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditPart(null);
        }}
        part={editPart ?? undefined}
      />
    </div>
  );
}
