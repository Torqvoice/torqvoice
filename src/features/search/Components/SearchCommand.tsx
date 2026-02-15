"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Car, FileText, Package, Users, Wrench } from "lucide-react";
import { globalSearch } from "@/features/search/Actions/searchActions";

interface SearchResult {
  vehicles: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  }[];
  customers: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
  }[];
  services: {
    id: string;
    title: string;
    invoiceNumber: string | null;
    vehicle: {
      id: string;
      make: string;
      model: string;
      year: number;
      licensePlate: string | null;
    };
  }[];
  parts: {
    id: string;
    name: string;
    partNumber: string | null;
    quantity: number;
  }[];
  quotes: {
    id: string;
    title: string;
    quoteNumber: string | null;
    status: string;
  }[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SearchCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>({ vehicles: [], customers: [], services: [], parts: [], quotes: [] });
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results on query change is intentional
      setResults({ vehicles: [], customers: [], services: [], parts: [], quotes: [] });
      return;
    }

    let cancelled = false;
    setLoading(true);

    globalSearch(debouncedQuery).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setResults(res.data);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false);
      setQuery("");
      router.push(path);
    },
    [router]
  );

  const hasResults = results.vehicles.length > 0 || results.customers.length > 0 || results.services.length > 0 || results.parts.length > 0 || results.quotes.length > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Search for vehicles, customers, and services"
    >
      <CommandInput
        placeholder="Search by name, plate, phone, VIN, invoice..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Searching...
          </div>
        )}
        {!loading && debouncedQuery.length >= 2 && !hasResults && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
        {!loading && debouncedQuery.length < 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search
          </div>
        )}
        {results.vehicles.length > 0 && (
          <CommandGroup heading="Vehicles">
            {results.vehicles.map((v) => (
              <CommandItem
                key={v.id}
                value={`${v.year} ${v.make} ${v.model} ${v.licensePlate || ""}`}
                onSelect={() => handleSelect(`/vehicles/${v.id}`)}
              >
                <Car className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>
                  {v.year} {v.make} {v.model}
                </span>
                {v.licensePlate && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {v.licensePlate}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.customers.length > 0 && (
          <CommandGroup heading="Customers">
            {results.customers.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.name} ${c.email || ""} ${c.company || ""}`}
                onSelect={() => handleSelect(`/customers/${c.id}`)}
              >
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[c.company, c.email, c.phone].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.services.length > 0 && (
          <CommandGroup heading="Services">
            {results.services.map((s) => (
              <CommandItem
                key={s.id}
                value={`${s.title} ${s.invoiceNumber || ""} ${s.vehicle.make} ${s.vehicle.model}`}
                onSelect={() => handleSelect(`/vehicles/${s.vehicle.id}/service/${s.id}`)}
              >
                <Wrench className="mr-2 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{s.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      s.invoiceNumber,
                      `${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model}`,
                      s.vehicle.licensePlate,
                    ].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.parts.length > 0 && (
          <CommandGroup heading="Parts">
            {results.parts.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.partNumber || ""}`}
                onSelect={() => handleSelect("/inventory")}
              >
                <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[p.partNumber, `${p.quantity} in stock`].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.quotes.length > 0 && (
          <CommandGroup heading="Quotes">
            {results.quotes.map((q) => (
              <CommandItem
                key={q.id}
                value={`${q.title} ${q.quoteNumber || ""}`}
                onSelect={() => handleSelect(`/quotes/${q.id}`)}
              >
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{q.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {[q.quoteNumber, q.status].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
