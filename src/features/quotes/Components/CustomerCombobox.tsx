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
import { searchCustomers } from "@/features/customers/Actions/customerActions";

interface CustomerOption {
  id: string;
  name: string;
  company: string | null;
}

const PAGE_SIZE = 50;

interface CustomerComboboxProps {
  value: string;
  onChange: (id: string, customer: CustomerOption | null) => void;
  initialCustomer?: CustomerOption | null;
  placeholder?: string;
  noneLabel?: string;
}

export function CustomerCombobox({
  value,
  onChange,
  initialCustomer,
  placeholder = "Select customer...",
  noneLabel = "None",
}: CustomerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState<CustomerOption | null>(
    initialCustomer ?? null
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  const loadOptions = useCallback(
    async (query?: string, offset = 0, append = false) => {
      if (offset === 0) setSearching(true);
      else {
        setLoadingMore(true);
        loadingMoreRef.current = true;
      }

      const result = await searchCustomers(query || undefined, PAGE_SIZE, offset);

      if (result.success && result.data) {
        if (append) {
          setOptions((prev) => [...prev, ...result.data!]);
        } else {
          setOptions(result.data);
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

  // Keep selected label in sync
  useEffect(() => {
    if (initialCustomer) setSelected(initialCustomer);
  }, [initialCustomer]);

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
            {selected
              ? `${selected.name}${selected.company ? ` (${selected.company})` : ""}`
              : placeholder}
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
            <CommandEmpty>No customers found.</CommandEmpty>
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
              {options.map((c) => (
                <CommandItem
                  key={c.id}
                  onSelect={() => {
                    onChange(c.id, c);
                    setSelected(c);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === c.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {c.name}
                  {c.company ? ` (${c.company})` : ""}
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
