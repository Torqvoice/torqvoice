"use client";

import { createContext, useContext } from "react";

const AuthLogoContext = createContext(false);

export function AuthLogoProvider({
  hasCustomLogo,
  children,
}: {
  hasCustomLogo: boolean;
  children: React.ReactNode;
}) {
  return (
    <AuthLogoContext value={hasCustomLogo}>
      {children}
    </AuthLogoContext>
  );
}

export function useHasCustomLogo() {
  return useContext(AuthLogoContext);
}
