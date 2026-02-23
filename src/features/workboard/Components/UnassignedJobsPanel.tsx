"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkBoardStore } from "../store/workboardStore";
import { UnassignedJobCard } from "./BoardJobCard";

export function UnassignedJobsPanel() {
  const serviceRecords = useWorkBoardStore((s) => s.unassignedServiceRecords);
  const inspections = useWorkBoardStore((s) => s.unassignedInspections);
  const [search, setSearch] = useState("");

  const lowerSearch = search.toLowerCase();

  const filteredSR = serviceRecords.filter((sr) => {
    if (!search) return true;
    return (
      sr.title.toLowerCase().includes(lowerSearch) ||
      sr.vehicle.make.toLowerCase().includes(lowerSearch) ||
      sr.vehicle.model.toLowerCase().includes(lowerSearch) ||
      sr.vehicle.licensePlate?.toLowerCase().includes(lowerSearch)
    );
  });

  const filteredInsp = inspections.filter((i) => {
    if (!search) return true;
    return (
      i.template.name.toLowerCase().includes(lowerSearch) ||
      i.vehicle.make.toLowerCase().includes(lowerSearch) ||
      i.vehicle.model.toLowerCase().includes(lowerSearch) ||
      i.vehicle.licensePlate?.toLowerCase().includes(lowerSearch)
    );
  });

  const totalCount = filteredSR.length + filteredInsp.length;

  return (
    <div className="flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30">
      <div className="border-b p-3">
        <h3 className="mb-2 text-sm font-semibold">
          Unassigned Jobs ({totalCount})
        </h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {filteredSR.map((sr) => (
            <UnassignedJobCard key={sr.id} job={sr} type="serviceRecord" />
          ))}
          {filteredInsp.map((insp) => (
            <UnassignedJobCard key={insp.id} job={insp} type="inspection" />
          ))}
          {totalCount === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No unassigned jobs
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
