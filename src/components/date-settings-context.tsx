"use client";

import { createContext, useContext } from "react";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_FORMAT } from "@/lib/format";

interface DateSettings {
  dateFormat: string;
  timeFormat: "12h" | "24h";
  timezone: string;
}

const defaultSettings: DateSettings = {
  dateFormat: DEFAULT_DATE_FORMAT,
  timeFormat: DEFAULT_TIME_FORMAT,
  timezone: "",
};

const DateSettingsContext = createContext<DateSettings>(defaultSettings);

export function DateSettingsProvider({
  dateFormat,
  timeFormat,
  timezone,
  children,
}: {
  dateFormat?: string;
  timeFormat?: string;
  timezone?: string;
  children: React.ReactNode;
}) {
  const value: DateSettings = {
    dateFormat: dateFormat || DEFAULT_DATE_FORMAT,
    timeFormat: (timeFormat === "24h" ? "24h" : "12h"),
    timezone: timezone || "",
  };

  return (
    <DateSettingsContext.Provider value={value}>
      {children}
    </DateSettingsContext.Provider>
  );
}

export function useDateSettings() {
  return useContext(DateSettingsContext);
}
