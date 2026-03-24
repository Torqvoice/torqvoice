"use client";

import { createContext, useContext } from "react";

type ServiceType = "automotive" | "boat";

const ServiceTypeContext = createContext<ServiceType>("automotive");

export function ServiceTypeProvider({
  serviceType,
  children,
}: {
  serviceType?: string;
  children: React.ReactNode;
}) {
  const value: ServiceType =
    serviceType === "boat" ? "boat" : "automotive";

  return (
    <ServiceTypeContext.Provider value={value}>
      {children}
    </ServiceTypeContext.Provider>
  );
}

export function useServiceType(): ServiceType {
  return useContext(ServiceTypeContext);
}
