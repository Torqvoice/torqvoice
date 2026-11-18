'use client'

import { createContext, useContext } from 'react'

/**
 * Whether the sections are being drawn on the work order page.
 *
 * The sections of the work order page are shared with the quote page, so
 * they ask here which frame to draw. Outside a provider the answer is no:
 * the quote page and every other host keep the look they have.
 */
const WorkOrderLayoutContext = createContext(false)

export const WorkOrderLayoutProvider = WorkOrderLayoutContext.Provider

export function useModernWorkOrder(): boolean {
  return useContext(WorkOrderLayoutContext)
}
