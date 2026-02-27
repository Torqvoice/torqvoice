"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { createTechnician, updateTechnician, deleteTechnician, getOrgMembers } from "../Actions/technicianActions";
import { useWorkBoardStore, type Technician } from "../store/workboardStore";
import { useConfirm } from "@/components/confirm-dialog";
import { useTranslations } from "next-intl";

const PRESET_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
  "#6366f1",
];

type OrgMember = { id: string; name: string; email: string };

export function TechnicianDialog({
  open,
  onOpenChange,
  technician,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technician?: Technician | null;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [memberId, setMemberId] = useState<string>("");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const addTechnician = useWorkBoardStore((s) => s.addTechnician);
  const confirm = useConfirm();
  const t = useTranslations("workBoard.technician");
  const tc = useTranslations("common.buttons");

  useEffect(() => {
    if (open) {
      if (technician) {
        setName(technician.name);
        setColor(technician.color);
        setMemberId(technician.memberId || "");
      } else {
        setName("");
        setColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
        setMemberId("");
      }
      // Fetch org members
      getOrgMembers().then((res) => {
        if (res.success && res.data) setMembers(res.data);
      });
    }
  }, [open, technician]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    if (technician) {
      const res = await updateTechnician({
        id: technician.id,
        name: name.trim(),
        color,
        memberId: memberId && memberId !== "none" ? memberId : null,
      });
      if (res.success) {
        // Update store
        const store = useWorkBoardStore.getState();
        store.setTechnicians(
          store.technicians.map((t) =>
            t.id === technician.id
              ? { ...t, name: name.trim(), color, memberId: memberId || null }
              : t,
          ),
        );
        onOpenChange(false);
      }
    } else {
      const res = await createTechnician({
        name: name.trim(),
        color,
        memberId: memberId && memberId !== "none" ? memberId : undefined,
      });
      if (res.success && res.data) {
        addTechnician(res.data as Technician);
        onOpenChange(false);
      }
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {technician ? t("editTitle") : t("addTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tech-name">{t("name")}</Label>
            <Input
              id="tech-name"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{t("color")}</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "currentColor" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tech-member">{t("linkMember")}</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger id="tech-member">
                <SelectValue placeholder={t("standalone")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("standalone")}</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-between gap-2">
            {technician ? (
              <Button
                type="button"
                variant="destructive"
                disabled={deleting || loading}
                onClick={async () => {
                  const ok = await confirm({
                    title: t("deleteTitle"),
                    description: t("deleteDescription", { name: technician.name }),
                    confirmLabel: tc("delete"),
                    destructive: true,
                  });
                  if (!ok) return;
                  setDeleting(true);
                  const res = await deleteTechnician(technician.id);
                  if (res.success) {
                    useWorkBoardStore.getState().removeTechnician(technician.id);
                    onOpenChange(false);
                  }
                  setDeleting(false);
                }}
              >
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tc("delete")}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={loading || !name.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {technician ? tc("save") : t("addTechnician")}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
