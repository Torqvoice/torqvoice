import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/**
 * The keyboard focus in the designer's rail and inspector: the canvas's own
 * blue, which stands out at better than 3:1 on the white and on the pale
 * blue of a selected row. The designer is a fixed light canvas, so this is
 * its palette rather than the app's theme tokens.
 */
export const RAIL_FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]'

/**
 * The keyboard's reorder, as the email designer has it: on a row's grip the
 * arrows alone move it, anywhere else in the row Alt with an arrow does.
 */
export function railArrow(event: ReactKeyboardEvent, needsAlt: boolean): -1 | 1 | 0 {
  if (needsAlt && !event.altKey) return 0
  if (event.key === 'ArrowUp') return -1
  if (event.key === 'ArrowDown') return 1
  return 0
}
