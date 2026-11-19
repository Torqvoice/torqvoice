'use client'

import { createContext, useContext } from 'react'

/**
 * Whether this workshop has defined custom fields for its vehicles and for
 * its customers. Until it defines the first one (Settings, Custom Fields)
 * no form, page or dialog draws or asks for anything: a workshop that never
 * did sees exactly what it always saw.
 */
export interface RecordCustomFields {
  vehicle: boolean
  customer: boolean
}

const NONE: RecordCustomFields = { vehicle: false, customer: false }

const RecordCustomFieldsContext = createContext<RecordCustomFields>(NONE)

export function RecordCustomFieldsProvider({
  value,
  children,
}: {
  value: RecordCustomFields
  children: React.ReactNode
}) {
  return (
    <RecordCustomFieldsContext.Provider value={value}>
      {children}
    </RecordCustomFieldsContext.Provider>
  )
}

export function useHasRecordCustomFields(kind: keyof RecordCustomFields): boolean {
  return useContext(RecordCustomFieldsContext)[kind]
}
