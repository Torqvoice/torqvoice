'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useHasCustomLogo } from './auth-logo-provider'

export function AuthLogo({ alt }: { alt: string }) {
  const hasCustomLogo = useHasCustomLogo()
  // The setting can outlive the file it points at. A broken image on the
  // first screen is worse than the default mark, so fall back on error.
  const [failed, setFailed] = useState(false)

  if (hasCustomLogo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/api/public/logo"
        alt={alt}
        className="h-11 w-auto"
        onError={() => setFailed(true)}
      />
    )
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
  )
}
