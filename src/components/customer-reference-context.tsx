'use client'

import { createContext, useContext } from 'react'

/**
 * Whether this workshop records the customer's reference / PO on work orders
 * and quotes. Settings → Workshop switches it on; until then no form, page,
 * list or designer shows it.
 */
const CustomerReferenceContext = createContext(false)

export function CustomerReferenceProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: React.ReactNode
}) {
  return (
    <CustomerReferenceContext.Provider value={enabled}>
      {children}
    </CustomerReferenceContext.Provider>
  )
}

export function useCustomerReferenceEnabled(): boolean {
  return useContext(CustomerReferenceContext)
}
