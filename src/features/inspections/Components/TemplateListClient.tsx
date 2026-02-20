"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTemplate } from "../Actions/templateActions";
import { TemplateForm } from "./TemplateForm";

interface TemplateSection {
  id: string;
  name: string;
  sortOrder: number;
  items: { id: string; name: string; sortOrder: number }[];
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  sections: TemplateSection[];
}

export function TemplateListClient({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleDelete = (id: string) => {
    startDeleteTransition(async () => {
      const result = await deleteTemplate(id);
      if (result.success) {
        toast.success("Template deleted");
        setDeleteId(null);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to delete template");
      }
    });
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingTemplate(undefined);
    setShowForm(true);
  };

  const totalItems = (t: Template) => t.sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Inspection Templates</h2>
          <p className="text-sm text-muted-foreground">
            Define multi-point inspection checklists for technicians
          </p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Template
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Sections</TableHead>
              <TableHead className="w-28">Items</TableHead>
              <TableHead className="w-28">Default</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No templates yet. Create your first inspection template.
                </TableCell>
              </TableRow>
            ) : (
              templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-xs">
                          {t.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{t.sections.length}</TableCell>
                  <TableCell>{totalItems(t)}</TableCell>
                  <TableCell>
                    {t.isDefault && (
                      <Badge variant="secondary" className="text-xs">Default</Badge>
                    )}
                  </TableCell>
                  <TableCell className="px-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(t)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(t.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
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

      <TemplateForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingTemplate(undefined);
        }}
        template={editingTemplate}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this inspection template. Existing inspections
              created from this template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
