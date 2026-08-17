"use client";

import { useRef, type KeyboardEvent, type RefObject } from "react";

/**
 * Keyboard navigation for a list of interactive rows (rows made focusable by
 * `interactiveRow()` — the hook finds them via their `data-row-interactive`
 * attribute, so the two compose without any per-row wiring).
 *
 *   const nav = useTableKeyboardNav();
 *   <Input {...nav.searchInputProps} />        // Tab jumps to the first row
 *   <div {...nav.containerProps}>              // wraps the Table
 *     <TableRow {...interactiveRow(open)} />   // rows as usual
 *   </div>
 *
 * Inside the container, while focus is on a row:
 *  - Tab / ArrowDown  → next row
 *  - Shift+Tab / ArrowUp → previous row
 *  - Home / End       → first / last row
 *  - Enter / Space    → activate (handled by interactiveRow itself)
 * Tab past the last row, or Shift+Tab before the first, falls through to the
 * browser so the widget never traps focus. Keys pressed on controls *inside*
 * a row (kebab menus, checkboxes) are left alone.
 */
export function useTableKeyboardNav<T extends HTMLElement = HTMLDivElement>() {
  const containerRef = useRef<T | null>(null);

  const rows = () =>
    Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>("[data-row-interactive]") ?? [],
    );

  const onKeyDown = (e: KeyboardEvent<T>) => {
    const list = rows();
    const current = list.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return; // focus is on an inner control, not a row

    const go = (target: HTMLElement | undefined) => {
      if (!target) return;
      e.preventDefault();
      target.focus();
    };

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        list[current + 1]?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        list[current - 1]?.focus();
        break;
      case "Tab":
        // Roving Tab inside the list; at either end it falls through, so the
        // rest of the page stays reachable.
        if (e.shiftKey) {
          if (current > 0) go(list[current - 1]);
        } else if (current < list.length - 1) {
          go(list[current + 1]);
        }
        break;
      case "Home":
        go(list[0]);
        break;
      case "End":
        go(list[list.length - 1]);
        break;
    }
  };

  const searchInputProps = {
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab" && !e.shiftKey) {
        const first = rows()[0];
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
    },
  };

  return {
    containerRef: containerRef as RefObject<T | null>,
    containerProps: { ref: containerRef, onKeyDown },
    /** Spread on the search input so Tab jumps straight to the first row. */
    searchInputProps,
  };
}
