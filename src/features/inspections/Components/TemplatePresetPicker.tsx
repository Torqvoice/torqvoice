"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, Globe2, Loader2, Search, ShieldCheck, Wrench, Zap } from "lucide-react";
import { toast } from "sonner";
import { createTemplateFromPreset } from "../Actions/templateActions";
import {
  PRESET_GROUPS,
  TEMPLATE_PRESETS,
  countPresetItems,
  type TemplatePreset,
} from "../Lib/templatePresets";

const GROUP_ICONS = {
  regulatory: ShieldCheck,
  workshop: Wrench,
  specialist: Zap,
} as const;

function PresetCard({
  preset,
  selected,
  alreadyAdded,
  onSelect,
}: {
  preset: TemplatePreset;
  selected: boolean;
  alreadyAdded: boolean;
  onSelect: () => void;
}) {
  const itemCount = countPresetItems(preset);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={alreadyAdded}
      aria-pressed={selected}
      className={`focus-visible:ring-ring flex h-full flex-col rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${
        alreadyAdded
          ? "cursor-default opacity-55"
          : selected
            ? "border-primary bg-primary/5 ring-primary/30 ring-1"
            : "hover:border-muted-foreground/40 hover:bg-muted/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">{preset.name}</span>
        {alreadyAdded ? (
          <span className="text-muted-foreground shrink-0 text-[11px]">In your list</span>
        ) : (
          selected && <Check className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </div>
      <p className="text-muted-foreground mt-1.5 flex-1 text-xs leading-relaxed">
        {preset.description}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {preset.country && (
          <Badge variant="secondary" className="gap-1 text-[11px]">
            <Globe2 className="h-3 w-3" aria-hidden="true" />
            {preset.country}
          </Badge>
        )}
        <Badge variant="outline" className="text-[11px]">
          {preset.standardLabel}
        </Badge>
        <Badge variant="outline" className="text-[11px]">
          {preset.severityScale === "eu" ? "EU defect scale" : "Pass / attention / fail"}
        </Badge>
        <span className="text-muted-foreground ml-auto text-[11px]">
          {preset.sections.length} sections &middot; {itemCount} checks
        </span>
      </div>
    </button>
  );
}

export function TemplatePresetPicker({
  open,
  onOpenChange,
  installedNames = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names already in the workshop's list, so the same checklist is not offered twice. */
  installedNames?: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const installed = useMemo(
    () => new Set(installedNames.map((name) => name.trim().toLowerCase())),
    [installedNames]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TEMPLATE_PRESETS;
    return TEMPLATE_PRESETS.filter((p) =>
      [p.name, p.description, p.standardLabel, p.country ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query]);

  const handleUse = () => {
    if (!selectedId) return;
    startTransition(async () => {
      const result = await createTemplateFromPreset(selectedId);
      if (result.success) {
        toast.success("Template added. Adjust it to match your workshop.");
        onOpenChange(false);
        setSelectedId(null);
        setQuery("");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to add template");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            Every preset is copied into your workshop as a normal template. Rename sections, move
            checks and change any limit to match your country and your equipment.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b px-6 py-3">
          <div className="relative">
            <Search
              className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, country or standard"
              className="pl-9"
              aria-label="Search templates"
            />
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {PRESET_GROUPS.map((group) => {
            const presets = filtered.filter((p) => p.group === group.key);
            if (presets.length === 0) return null;
            const Icon = GROUP_ICONS[group.key];
            return (
              <section key={group.key} aria-labelledby={`preset-group-${group.key}`}>
                <div className="flex items-center gap-2">
                  <Icon className="text-muted-foreground h-4 w-4" aria-hidden="true" />
                  <h3 id={`preset-group-${group.key}`} className="text-sm font-semibold">
                    {group.label}
                  </h3>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">{group.description}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {presets.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      selected={selectedId === preset.id}
                      alreadyAdded={installed.has(preset.name.trim().toLowerCase())}
                      onSelect={() => setSelectedId(preset.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {filtered.length === 0 && (
            <p className="text-muted-foreground py-10 text-center text-sm">
              No template matches &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <p className="text-muted-foreground text-xs">
            Regulatory presets carry the common EU limits. Check them against your national rules
            before you issue a certificate.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleUse} disabled={!selectedId || isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Add template
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
