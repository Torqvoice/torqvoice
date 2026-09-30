import 'server-only'

import { cookies } from 'next/headers'
import {
  WORK_ORDER_LAYOUT_COOKIE,
  parseWorkOrderLayout,
  type WorkOrderLayout,
} from './work-order-layout'

/** The layout this browser asked for; the overhauled one unless it chose classic. */
export async function resolveWorkOrderLayout(): Promise<WorkOrderLayout> {
  const store = await cookies()
  return parseWorkOrderLayout(store.get(WORK_ORDER_LAYOUT_COOKIE)?.value)
}
