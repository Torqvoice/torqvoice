'use client'

import { createContext, useContext } from 'react'
import { TAX_APPLIES_TO_ALL } from '@/lib/taxable-lines'
import type { LineTaxSettings } from '../Lib/workshopTax'

/**
 * How the workshop taxes its lines, for the line editors: whether each line
 * offers the choice, and what a line that has not chosen is taken as.
 *
 * Without a provider every line is taxed and none offers a choice, which is
 * what an editor outside a work order or a quote should assume.
 */
const DEFAULT: LineTaxSettings = { selective: false, applies: TAX_APPLIES_TO_ALL }

const LineTaxContext = createContext<LineTaxSettings>(DEFAULT)

export const LineTaxProvider = LineTaxContext.Provider

export function useLineTax(): LineTaxSettings {
  return useContext(LineTaxContext)
}
