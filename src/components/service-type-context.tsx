"use client";

import { createContext, useContext } from "react";

type ServiceType = "automotive" | "marine";

const ServiceTypeContext = createContext<ServiceType>("automotive");

export function ServiceTypeProvider({
  serviceType,
  children,
}: {
  serviceType?: string;
  children: React.ReactNode;
}) {
  const value: ServiceType =
    serviceType === "marine" ? "marine" : "automotive";

  return (
    <ServiceTypeContext.Provider value={value}>
      {children}
    </ServiceTypeContext.Provider>
  );
}

export function useServiceType(): ServiceType {
  return useContext(ServiceTypeContext);
}
