'use client'

import { createContext, useContext } from 'react'

const WhiteLabelCtaContext = createContext(false)

export function WhiteLabelCtaProvider({
  show,
  children,
}: {
  show: boolean
  children: React.ReactNode
}) {
  return <WhiteLabelCtaContext.Provider value={show}>{children}</WhiteLabelCtaContext.Provider>
}

export function useShowWhiteLabelCta() {
  return useContext(WhiteLabelCtaContext)
}
