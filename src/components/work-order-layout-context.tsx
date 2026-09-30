'use client'

import { createContext, useContext } from 'react'
import type { WorkOrderLayout } from '@/lib/work-order-layout'

/**
 * The sections of the work order page are shared by both layouts, and by the
 * quote page, so they ask here which frame to draw. Outside a provider the
 * answer is always classic: the quote page and every other host keep the look
 * they have.
 */
const WorkOrderLayoutContext = createContext<WorkOrderLayout>('classic')

export const WorkOrderLayoutProvider = WorkOrderLayoutContext.Provider

export function useModernWorkOrder(): boolean {
  return useContext(WorkOrderLayoutContext) === 'modern'
}
