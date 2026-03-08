"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const HOUR_PRESETS = [1, 2, 4, 5, 7];

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

interface DurationPickerProps {
  value: number | null;
  onChange: (hours: number | null) => void;
  className?: string;
}

export function DurationPicker({ value, onChange, className }: DurationPickerProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Estimated hours</span>
        {value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {HOUR_PRESETS.map((hours) => (
          <button
            key={hours}
            type="button"
            onClick={() => onChange(hours)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              value === hours
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            {hours}h
          </button>
        ))}
      </div>
    </div>
  );
}
