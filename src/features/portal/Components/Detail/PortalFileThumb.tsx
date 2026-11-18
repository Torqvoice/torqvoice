'use client'

import { ImageOff, Play } from 'lucide-react'
import { useState } from 'react'

/**
 * A small square for a photo or video the customer sent, linking to the file.
 *
 * A photo whose file cannot be shown (deleted since, or not reachable) is
 * drawn as the theme's quiet placeholder with a crossed-out picture, never as
 * the browser's broken-image mark, and is then no longer a link: there is
 * nothing behind it to open. A video is the placeholder with a play mark.
 */
export function PortalFileThumb({
  url,
  kind,
  label,
  missingLabel,
}: {
  url: string
  kind: 'image' | 'video' | 'file'
  /** What opening it does, for a screen reader: "Open the photo". */
  label: string
  /** What to call a photo that is no longer there. */
  missingLabel: string
}) {
  const [missing, setMissing] = useState(false)
  const box =
    'relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[10px] bg-[var(--p-photo)] text-[color:var(--p-muted)]'

  if (missing) {
    return (
      <span role="img" aria-label={missingLabel} className={box}>
        <ImageOff className="h-5 w-5" aria-hidden />
      </span>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label} className={box}>
      {kind === 'image' ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setMissing(true)}
        />
      ) : (
        <Play className="h-5 w-5" aria-hidden />
      )}
    </a>
  )
}
