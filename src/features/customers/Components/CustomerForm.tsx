"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGlassModal } from "@/components/glass-modal";
import { toast } from "sonner";
import { createCustomer, updateCustomer } from "../Actions/customerActions";
import { Loader2 } from "lucide-react";

interface CustomerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    company?: string | null;
    notes?: string | null;
  };
  onCreated?: (customer: { id: string; name: string; company: string | null }) => void;
}

export function CustomerForm({ open, onOpenChange, customer, onCreated }: CustomerFormProps) {
  const t = useTranslations("customers.form");
  const tc = useTranslations("common");
  const router = useRouter();
  const modal = useGlassModal();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      email: (formData.get("email") as string) || undefined,
      phone: (formData.get("phone") as string) || undefined,
      address: (formData.get("address") as string) || undefined,
      company: (formData.get("company") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    };

    const result = customer
      ? await updateCustomer({ ...data, id: customer.id })
      : await createCustomer(data);

    if (result.success) {
      toast.success(customer ? t("customerUpdated") : t("customerCreated"));
      onOpenChange(false);
      if (!customer && result.data && onCreated) {
        const created = result.data as { id: string; name: string; company: string | null };
        onCreated({ id: created.id, name: created.name, company: created.company ?? null });
      }
      router.refresh();
    } else {
      modal.open("error", tc("errors.error"), result.error || t("saveError"));
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {customer ? t("editTitle") : t("addTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("nameRequired")}</Label>
            <Input
              id="name"
              name="name"
              placeholder={t("namePlaceholder")}
              defaultValue={customer?.name}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">{tc("form.email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                defaultValue={customer?.email ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{tc("form.phone")}</Label>
              <Input
                id="phone"
                name="phone"
                placeholder={t("phonePlaceholder")}
                defaultValue={customer?.phone ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">{tc("form.company")}</Label>
            <Input
              id="company"
              name="company"
              placeholder={t("companyPlaceholder")}
              defaultValue={customer?.company ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">{tc("form.address")}</Label>
            <Input
              id="address"
              name="address"
              placeholder={t("addressPlaceholder")}
              defaultValue={customer?.address ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{tc("form.notes")}</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder={t("notesPlaceholder")}
              rows={3}
              defaultValue={customer?.notes ?? ""}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tc("buttons.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {customer ? tc("buttons.saveChanges") : t("addTitle")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
