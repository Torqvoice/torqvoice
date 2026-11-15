'use client'

import { ImageOff, Paperclip, Play } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

const VIDEO = /\.(mp4|mov|webm|m4v)$/i

/**
 * The photos and video a customer sent with a request for a visit, for the
 * workshop's own screens (the customer's page, the dashboard). Staff open a
 * file through the app's ordinary file route, which their session unlocks.
 *
 * `compact` is the one-line form for a narrow card: a paperclip and a count.
 * Draws nothing for a request without files.
 */
export function ServiceRequestFiles({
  urls,
  compact = false,
}: {
  /** `ServiceRequest.attachments`: stored file urls, in the order they were added. */
  urls: string[] | null | undefined
  compact?: boolean
}) {
  const t = useTranslations('customers.serviceRequests')
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set())
  const files = (urls ?? []).filter(Boolean)
  if (files.length === 0) return null

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        <Paperclip className="h-3 w-3" aria-hidden />
        {t('files', { count: files.length })}
      </span>
    )
  }

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-muted-foreground">
        {t('files', { count: files.length })}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {files.map((url, index) => {
          const video = VIDEO.test(url)
          // A photo whose file is gone: a quiet tile, never a broken-image mark.
          if (missing.has(url)) {
            return (
              <li key={url}>
                <span
                  role="img"
                  aria-label={t('fileMissing', { number: index + 1 })}
                  className="flex h-20 w-20 items-center justify-center rounded-md border bg-muted"
                >
                  <ImageOff className="h-6 w-6 text-muted-foreground" aria-hidden />
                </span>
              </li>
            )
          }
          return (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t(video ? 'openVideo' : 'openPhoto', { number: index + 1 })}
                className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {video ? (
                  <Play className="h-6 w-6 text-muted-foreground" aria-hidden />
                ) : (
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={() => setMissing((gone) => new Set(gone).add(url))}
                  />
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
