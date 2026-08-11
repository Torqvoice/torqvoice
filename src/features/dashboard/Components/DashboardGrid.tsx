"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Responsive, useContainerWidth, type Layout } from "react-grid-layout";
import { cn } from "@/lib/utils";
import {
  CARD_MIN_H,
  CARD_MIN_W,
  GRID_COLS,
  GRID_MARGIN,
  GRID_ROW_HEIGHT,
  type CardLayout,
} from "../dashboard-grid-config";

/**
 * The dashboard's 12-column drag/resize grid (react-grid-layout v2).
 * Purely presentational: card positions come in via `cards`, commits go out
 * through `onCardsCommit` when the user rearranges or resizes in edit mode.
 * Below the lg breakpoint the grid renders a compacted single column and is
 * never interactive.
 */
export function DashboardGrid({
  cards,
  visibleIds,
  editing,
  onCardsCommit,
  cardNodes,
}: {
  cards: Record<string, CardLayout>;
  visibleIds: string[];
  editing: boolean;
  onCardsCommit: (cards: Record<string, CardLayout>) => void;
  cardNodes: Partial<Record<string, ReactNode>>;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [breakpoint, setBreakpoint] = useState("lg");
  // Animations stay off for the first moments after mount while the width
  // measurement (scrollbar appearance etc.) settles; see globals.css
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!mounted) return;
    const timer = setTimeout(() => setReady(true), 250);
    return () => clearTimeout(timer);
  }, [mounted]);
  const interactive = editing && breakpoint === "lg";

  const layout: Layout = visibleIds.map((id) => ({
    i: id,
    ...cards[id],
    minW: CARD_MIN_W,
    minH: CARD_MIN_H,
  }));

  const handleLayoutChange = (next: Layout) => {
    // Only user edits on the full grid are persisted; the generated
    // single-column layout on small screens never overwrites saved positions.
    if (!editing || breakpoint !== "lg") return;
    const merged = { ...cards };
    let changed = false;
    for (const item of next) {
      const id = item.i;
      const prev = merged[id];
      if (!prev) continue;
      if (prev.x !== item.x || prev.y !== item.y || prev.w !== item.w || prev.h !== item.h) {
        merged[id] = { x: item.x, y: item.y, w: item.w, h: item.h };
        changed = true;
      }
    }
    if (changed) onCardsCommit(merged);
  };

  return (
    <div ref={containerRef}>
      {mounted && (
        <Responsive
          className={cn("dashboard-grid", ready && "dashboard-grid-ready", editing && "dashboard-grid-editing")}
          width={width}
          layouts={{ lg: layout }}
          breakpoints={{ lg: 900, xs: 0 }}
          cols={{ lg: GRID_COLS, xs: 1 }}
          rowHeight={GRID_ROW_HEIGHT}
          margin={GRID_MARGIN}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: interactive, cancel: ".dashboard-no-drag" }}
          resizeConfig={{ enabled: interactive, handles: ["se"] }}
          onBreakpointChange={(bp) => setBreakpoint(bp)}
          onLayoutChange={handleLayoutChange}
        >
          {visibleIds.map((id) => (
            <div key={id} className="dashboard-card-wrap relative">
              {cardNodes[id]}
              {editing && (
                // Wiggle-mode overlay: makes the whole tile the drag surface
                // and shields the card's own links/buttons while rearranging
                <div className="absolute inset-0 z-10 cursor-grab rounded-xl ring-2 ring-primary/40 transition-shadow hover:ring-primary active:cursor-grabbing" />
              )}
            </div>
          ))}
        </Responsive>
      )}
    </div>
  );
}
