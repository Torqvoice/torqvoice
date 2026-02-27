"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGlassModal } from "@/components/glass-modal";
import { toast } from "sonner";
import { createNote, updateNote } from "../Actions/noteActions";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface NoteFormProps {
  vehicleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note?: {
    id: string;
    title: string;
    content: string;
    isPinned: boolean;
  };
}

export function NoteForm({ vehicleId, open, onOpenChange, note }: NoteFormProps) {
  const router = useRouter();
  const modal = useGlassModal();
  const t = useTranslations("vehicles.notes");
  const tc = useTranslations("common.buttons");
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const isEditing = !!note;

  useEffect(() => {
    if (open) {
      setTitle(note?.title ?? "");
      setContent(note?.content ?? "");
    }
  }, [open, note]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || content === "<p></p>") {
      modal.open("error", "Error", t("titleRequired"));
      return;
    }

    setLoading(true);

    const result = isEditing
      ? await updateNote({ id: note.id, title, content })
      : await createNote({ vehicleId, title, content });

    if (result.success) {
      toast.success(isEditing ? t("noteUpdated") : t("noteCreated"));
      onOpenChange(false);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t("saveError", { action: isEditing ? "update" : "create" }));
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t("titleLabel")}</Label>
            <Input
              id="title"
              placeholder={t("titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t("contentLabel")}</Label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder={t("contentPlaceholder")}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? tc("saveChanges") : t("addTitle")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
