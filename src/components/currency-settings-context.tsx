"use client";

import { createContext, useCallback, useContext } from "react";
import {
  formatCurrency as formatCurrencyRaw,
  getCurrencySymbol as getCurrencySymbolRaw,
  DEFAULT_CURRENCY_FORMAT,
  type CurrencyFormat,
} from "@/lib/format";

interface CurrencySettings {
  currencyCode: string;
  currencyFormat: CurrencyFormat;
}

const defaultSettings: CurrencySettings = {
  currencyCode: "USD",
  currencyFormat: DEFAULT_CURRENCY_FORMAT,
};

const CurrencySettingsContext = createContext<CurrencySettings>(defaultSettings);

export function CurrencySettingsProvider({
  currencyCode,
  currencyFormat,
  children,
}: {
  currencyCode?: string;
  currencyFormat?: string;
  children: React.ReactNode;
}) {
  const value: CurrencySettings = {
    currencyCode: currencyCode || "USD",
    currencyFormat: currencyFormat === "code" ? "code" : "symbol",
  };
  return (
    <CurrencySettingsContext.Provider value={value}>
      {children}
    </CurrencySettingsContext.Provider>
  );
}

export function useCurrencySettings() {
  return useContext(CurrencySettingsContext);
}

/**
 * Returns a formatter bound to the org's currency code and format preference.
 * Use this in client components instead of importing formatCurrency directly.
 */
export function useFormatCurrency() {
  const { currencyCode, currencyFormat } = useCurrencySettings();
  return useCallback(
    (amount: number, codeOverride?: string) =>
      formatCurrencyRaw(amount, codeOverride || currencyCode, currencyFormat),
    [currencyCode, currencyFormat]
  );
}

export function useCurrencySymbol() {
  const { currencyCode, currencyFormat } = useCurrencySettings();
  return getCurrencySymbolRaw(currencyCode, currencyFormat);
}
