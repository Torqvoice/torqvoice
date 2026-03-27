"use client";

import Image from "next/image";
import { useHasCustomLogo } from "./auth-logo-provider";

export function AuthLogo({ alt }: { alt: string }) {
  const hasCustomLogo = useHasCustomLogo();

  if (hasCustomLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/api/public/logo"
        alt={alt}
        className="h-11 w-auto"
      />
    );
  }

  return (
    <Image
      src="/torqvoice_app_logo.png"
      alt={alt}
      width={48}
      height={44}
      className="h-11 w-auto"
      priority
    />
  );
}
