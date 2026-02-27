"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useGlassModal } from "@/components/glass-modal";
import { createVehicle, updateVehicle } from "../Actions/vehicleActions";
import { Camera, Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { compressImage } from "@/lib/compress-image";
import { CustomerForm } from "@/features/customers/Components/CustomerForm";
import { useTranslations } from "next-intl";
import type { CreateVehicleInput } from "../Schema/vehicleSchema";

interface VehicleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: {
    id: string;
    make: string;
    model: string;
    year: number;
    vin?: string | null;
    licensePlate?: string | null;
    color?: string | null;
    mileage: number;
    fuelType?: string | null;
    transmission?: string | null;
    engineSize?: string | null;
    imageUrl?: string | null;
    customerId?: string | null;
  };
  customers?: { id: string; name: string; company: string | null }[];
}

export function VehicleForm({ open, onOpenChange, vehicle, customers }: VehicleFormProps) {
  const router = useRouter();
  const modal = useGlassModal();
  const t = useTranslations("vehicles.form");
  const tc = useTranslations("common.buttons");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(vehicle?.imageUrl ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    vehicle?.customerId || "none"
  );
  const [customerOpen, setCustomerOpen] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [localCustomers, setLocalCustomers] = useState(customers || []);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync state when vehicle prop changes (e.g. opening edit for a different vehicle)
  useEffect(() => {
    setSelectedCustomerId(vehicle?.customerId || "none");
    setPreview(vehicle?.imageUrl ?? null);
    setImageFile(null);
  }, [vehicle?.id, vehicle?.customerId, vehicle?.imageUrl]);

  const selectedCustomerLabel = useMemo(() => {
    if (!selectedCustomerId || selectedCustomerId === "none") return t("noCustomer");
    const c = localCustomers.find((c) => c.id === selectedCustomerId);
    if (!c) return t("noCustomer");
    return c.name + (c.company ? ` (${c.company})` : "");
  }, [selectedCustomerId, localCustomers, t]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      modal.open("error", t("imageTooLarge"), t("maxFileSize"));
      return;
    }

    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const uploadImage = async (): Promise<string | undefined> => {
    if (!imageFile) return preview ?? undefined;

    const toastId = toast.loading(t("uploadingImage"));
    const compressed = await compressImage(imageFile);
    const formData = new FormData();
    formData.append("file", compressed);

    const res = await fetch("/api/protected/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || t("uploadFailed"), { id: toastId });
      throw new Error(err.error || t("uploadFailed"));
    }

    const { url } = await res.json();
    toast.success(t("imageUploaded"), { id: toastId });
    return url;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setLoading(true);

    try {
      let imageUrl: string | undefined;
      try {
        imageUrl = await uploadImage();
      } catch (err) {
        modal.open("error", "Upload Failed", err instanceof Error ? err.message : "Could not upload image");
        setLoading(false);
        return;
      }

      const data: CreateVehicleInput & { imageUrl?: string } = {
        make: formData.get("make") as string,
        model: formData.get("model") as string,
        year: Number(formData.get("year")),
        vin: (formData.get("vin") as string) || undefined,
        licensePlate: (formData.get("licensePlate") as string) || undefined,
        color: (formData.get("color") as string) || undefined,
        mileage: Number(formData.get("mileage")) || 0,
        fuelType: (formData.get("fuelType") as string) || undefined,
        transmission: (formData.get("transmission") as string) || undefined,
        engineSize: (formData.get("engineSize") as string) || undefined,
        customerId: selectedCustomerId === "none" ? undefined : selectedCustomerId || undefined,
      };

      const payload = imageUrl ? { ...data, imageUrl } : data;

      const result = vehicle
        ? await updateVehicle({ ...payload, id: vehicle.id })
        : await createVehicle(payload);

      if (result.success) {
        toast.success(vehicle ? t("vehicleUpdated") : t("vehicleAdded"));
        onOpenChange(false);
        setImageFile(null);
        router.refresh();
      } else {
        modal.open("error", "Error", result.error || t("saveError"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {vehicle ? t("editTitle") : t("addTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Image upload */}
          <div className="space-y-2">
            <Label>{t("photo")}</Label>
            <div
              onClick={() => fileRef.current?.click()}
              className="group relative flex h-44 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              {preview ? (
                <>
                  <Image
                    src={preview}
                    alt="Vehicle preview"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearImage();
                    }}
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Camera className="h-8 w-8" />
                  <span className="text-sm">{t("clickToUpload")}</span>
                  <span className="text-xs">{t("imageFormats")}</span>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>

          {/* Customer selector */}
          <div className="space-y-2">
            <Label>{t("customer")}</Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen} modal={true}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">{selectedCustomerLabel}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("searchCustomers")} />
                  <CommandList className="max-h-60 overflow-y-auto">
                    <CommandEmpty>{t("noCustomerFound")}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="no-customer"
                        onSelect={() => {
                          setSelectedCustomerId("none");
                          setCustomerOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${selectedCustomerId === "none" ? "opacity-100" : "opacity-0"}`} />
                        {t("noCustomer")}
                      </CommandItem>
                      {localCustomers.map((c) => {
                        const label = c.name + (c.company ? ` (${c.company})` : "");
                        return (
                          <CommandItem
                            key={c.id}
                            value={label}
                            onSelect={() => {
                              setSelectedCustomerId(c.id);
                              setCustomerOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${selectedCustomerId === c.id ? "opacity-100" : "opacity-0"}`} />
                            {label}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                  <div className="border-t p-1">
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={() => {
                        setCustomerOpen(false);
                        setShowCustomerForm(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      {t("addCustomer")}
                    </button>
                  </div>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="make">{t("make")}</Label>
              <Input
                id="make"
                name="make"
                placeholder="Toyota"
                defaultValue={vehicle?.make}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">{t("model")}</Label>
              <Input
                id="model"
                name="model"
                placeholder="Camry"
                defaultValue={vehicle?.model}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">{t("year")}</Label>
              <Input
                id="year"
                name="year"
                type="number"
                placeholder="2024"
                defaultValue={vehicle?.year}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mileage">{t("mileage")}</Label>
              <Input
                id="mileage"
                name="mileage"
                type="number"
                placeholder="0"
                defaultValue={vehicle?.mileage}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vin">{t("vin")}</Label>
              <Input
                id="vin"
                name="vin"
                placeholder="1HGCM82633A004352"
                defaultValue={vehicle?.vin ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="licensePlate">{t("licensePlate")}</Label>
              <Input
                id="licensePlate"
                name="licensePlate"
                placeholder="ABC-1234"
                defaultValue={vehicle?.licensePlate ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="color">{t("color")}</Label>
              <Input
                id="color"
                name="color"
                placeholder="Silver"
                defaultValue={vehicle?.color ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuelType">{t("fuelType")}</Label>
              <Select
                name="fuelType"
                defaultValue={vehicle?.fuelType ?? "gasoline"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gasoline">{t("gasoline")}</SelectItem>
                  <SelectItem value="diesel">{t("diesel")}</SelectItem>
                  <SelectItem value="electric">{t("electric")}</SelectItem>
                  <SelectItem value="hybrid">{t("hybrid")}</SelectItem>
                  <SelectItem value="other">{t("other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transmission">{t("transmission")}</Label>
              <Select
                name="transmission"
                defaultValue={vehicle?.transmission ?? "automatic"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">{t("automatic")}</SelectItem>
                  <SelectItem value="manual">{t("manual")}</SelectItem>
                  <SelectItem value="cvt">{t("cvt")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="engineSize">{t("engineSize")}</Label>
            <Input
              id="engineSize"
              name="engineSize"
              placeholder="2.5L"
              defaultValue={vehicle?.engineSize ?? ""}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {vehicle ? tc("saveChanges") : t("addTitle")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <CustomerForm
      open={showCustomerForm}
      onOpenChange={setShowCustomerForm}
      onCreated={(created) => {
        setLocalCustomers((prev) => [...prev, created]);
        setSelectedCustomerId(created.id);
      }}
    />
  </>
  );
}
