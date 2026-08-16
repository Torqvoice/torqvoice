"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Link to a related record from inside a table cell. Rows are themselves
 * clickable, so the click is stopped here to navigate to this target rather
 * than the row's. Being a real anchor, it also supports middle-click,
 * open-in-new-tab and keyboard focus.
 *
 * Pass `block` for cells whose content is a stacked block rather than a
 * single run of text. The box still hugs its content: a cell is usually wider
 * than the text in it, and stretching the anchor across the rest of the cell
 * would send clicks aimed at the row to this target instead.
 */
export function TableCellLink({
  href,
  block = false,
  className,
  children,
}: {
  href: string;
  block?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "hover:underline underline-offset-2 focus-visible:underline focus-visible:outline-none",
        // max-w-full keeps the shrink-to-fit box inside the cell, which is what
        // lets a `truncate` child still find a width to truncate against.
        block ? "inline-block w-fit max-w-full min-w-0 align-top" : "inline",
        className
      )}
    >
      {children}
    </Link>
  );
}
