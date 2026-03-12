"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchVehicles } from "@/features/vehicles/Actions/vehicleActions";

interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customerId: string | null;
  customer: { id: string; name: string } | null;
}

const PAGE_SIZE = 50;

interface VehicleComboboxProps {
  value: string;
  onChange: (id: string, vehicle: VehicleOption | null) => void;
  initialVehicle?: VehicleOption | null;
  placeholder?: string;
  noneLabel?: string;
}

function formatVehicle(v: VehicleOption) {
  return `${v.year} ${v.make} ${v.model}${v.licensePlate ? ` (${v.licensePlate})` : ""}`;
}

export function VehicleCombobox({
  value,
  onChange,
  initialVehicle,
  placeholder = "Select vehicle...",
  noneLabel = "None",
}: VehicleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<VehicleOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState<VehicleOption | null>(
    initialVehicle ?? null
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  const mapVehicle = (v: VehicleOption) => ({
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    licensePlate: v.licensePlate,
    customerId: v.customerId,
    customer: v.customer,
  });

  const loadOptions = useCallback(
    async (query?: string, offset = 0, append = false) => {
      if (offset === 0) setSearching(true);
      else {
        setLoadingMore(true);
        loadingMoreRef.current = true;
      }

      const result = await searchVehicles(query || undefined, PAGE_SIZE, offset);

      if (result.success && result.data) {
        const mapped = result.data.map(mapVehicle);
        if (append) {
          setOptions((prev) => [...prev, ...mapped]);
        } else {
          setOptions(mapped);
        }
        setHasMore(result.data.length === PAGE_SIZE);
      }

      setSearching(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    },
    []
  );

  // Prefetch on mount
  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Debounced search — resets to page 0
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search) {
      loadOptions();
      return;
    }
    debounceRef.current = setTimeout(() => {
      loadOptions(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, open, loadOptions]);

  useEffect(() => {
    if (initialVehicle) setSelected(initialVehicle);
  }, [initialVehicle]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasMore || loadingMoreRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 50) {
      loadOptions(search || undefined, options.length, true);
    }
  }, [hasMore, search, options.length, loadOptions]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected ? formatVehicle(selected) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList
            ref={listRef}
            onScroll={handleScroll}
          >
            {searching && options.length === 0 && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            <CommandEmpty>No vehicles found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onChange("", null);
                  setSelected(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value ? "opacity-100" : "opacity-0"
                  )}
                />
                {noneLabel}
              </CommandItem>
              {options.map((v) => (
                <CommandItem
                  key={v.id}
                  onSelect={() => {
                    onChange(v.id, v);
                    setSelected(v);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === v.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div>
                    <p className="text-sm">
                      {v.year} {v.make} {v.model}
                      {v.licensePlate && (
                        <span className="ml-1.5 text-muted-foreground">
                          · {v.licensePlate}
                        </span>
                      )}
                    </p>
                    {v.customer?.name && (
                      <p className="text-xs text-muted-foreground">
                        {v.customer.name}
                      </p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {loadingMore && (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
