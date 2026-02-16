"use client";

import { createContext, useContext } from "react";

const SettingsPermissionContext = createContext({ canEdit: true });

export function SettingsPermissionProvider({
  canEdit,
  children,
}: {
  canEdit: boolean;
  children: React.ReactNode;
}) {
  return (
    <SettingsPermissionContext.Provider value={{ canEdit }}>
      {children}
    </SettingsPermissionContext.Provider>
  );
}

export function useSettingsPermission() {
  return useContext(SettingsPermissionContext);
}
