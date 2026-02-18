"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Car, FileText, Package, Settings, Users, Wrench } from "lucide-react";
import { globalSearch, getRecentCustomers } from "@/features/search/Actions/searchActions";

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

const SEARCHABLE_SETTINGS = [
  { label: "Company", description: "Company, business, branding, logo", href: "/settings/company", keywords: ["company", "business", "branding", "logo", "name", "address"] },
  { label: "Account", description: "Account, profile, password", href: "/settings/account", keywords: ["account", "profile", "password", "email", "2fa"] },
  { label: "Team", description: "Team members and roles", href: "/settings/team", keywords: ["team", "members", "roles", "invite"] },
  { label: "Invoice", description: "Invoice layout and prefix", href: "/settings/invoice", keywords: ["invoice", "layout", "prefix", "footer", "due"] },
  { label: "Templates", description: "Invoice & quote template styling", href: "/settings/templates", keywords: ["template", "styling", "colors", "font", "header", "quote"] },
  { label: "Payment", description: "Payment and bank settings", href: "/settings/payment", keywords: ["payment", "bank", "vipps", "stripe", "terms"] },
  { label: "Currency", description: "Currency, tax, and VAT", href: "/settings/currency", keywords: ["currency", "tax", "vat", "unit"] },
  { label: "Custom Fields", description: "Custom fields configuration", href: "/settings/custom-fields", keywords: ["custom fields", "fields"] },
  { label: "Email", description: "Email and SMTP settings", href: "/settings/email", keywords: ["email", "mail", "smtp", "sending"] },
  { label: "Workshop", description: "Workshop and labor settings", href: "/settings/workshop", keywords: ["workshop", "technician", "labor", "hours"] },
  { label: "Appearance", description: "Theme and date settings", href: "/settings/appearance", keywords: ["appearance", "theme", "dark", "light", "date", "timezone"] },
  { label: "Data", description: "Data export and backup", href: "/settings/data", keywords: ["data", "export", "import", "backup"] },
  { label: "About", description: "Version and info", href: "/settings/about", keywords: ["about", "version", "info"] },
];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type RecentCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
};

function filterSettings(query: string) {
  const q = query.toLowerCase();
  return SEARCHABLE_SETTINGS.filter(
    (s) =>
      s.label.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

export function SearchCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>({ vehicles: [], customers: [], services: [], parts: [], quotes: [] });
  const [loading, setLoading] = useState(false);
  const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([]);
  const recentFetchedRef = useRef(false);
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

  // Fetch recent customers when dialog opens
  useEffect(() => {
    if (open && !recentFetchedRef.current) {
      recentFetchedRef.current = true;
      getRecentCustomers().then((res) => {
        if (res.success && res.data) {
          setRecentCustomers(res.data);
        }
      });
    }
    if (!open) {
      recentFetchedRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results on query change is intentional
      setResults({ vehicles: [], customers: [], services: [], parts: [], quotes: [] });
      setLoading(false);
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

  const hasQuery = debouncedQuery.length >= 2;
  const hasResults = results.vehicles.length > 0 || results.customers.length > 0 || results.services.length > 0 || results.parts.length > 0 || results.quotes.length > 0;
  const matchedSettings = hasQuery ? filterSettings(debouncedQuery) : SEARCHABLE_SETTINGS;
  const showDefault = !hasQuery;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Search for vehicles, customers, services, and settings"
    >
      <CommandInput
        placeholder="Search by name, plate, phone, VIN, invoice..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!loading && hasQuery && !hasResults && matchedSettings.length === 0 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {/* Default view: recent customers + all settings */}
        {showDefault && recentCustomers.length > 0 && (
          <CommandGroup heading="Recent Customers">
            {recentCustomers.map((c) => (
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

        {/* Search results: grouped by entity type — kept visible while loading to avoid flicker */}
        {hasQuery && (
          <>
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
          </>
        )}

        {/* Settings group: shown in both default and search views */}
        {matchedSettings.length > 0 && (
          <CommandGroup heading="Settings">
            {matchedSettings.map((s) => (
              <CommandItem
                key={s.href}
                value={`${s.label} ${s.keywords.join(" ")}`}
                onSelect={() => handleSelect(s.href)}
              >
                <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{s.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.description}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <div className="border-t px-3 py-2">
        <span className="text-xs text-muted-foreground">
          <kbd className="pointer-events-none inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">ESC</kbd>
          <span className="ml-1.5">to close</span>
        </span>
      </div>
    </CommandDialog>
  );
}
