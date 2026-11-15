/**
 * The browser's half of a customer upload: send one file to the portal's
 * upload route with its progress, and take back files that were never sent.
 *
 * Used by the booking form and the chat. The route is
 * `/portal/<org>/upload` (see its file for what it accepts); the limits both
 * sides agree on are in `portalUploads.ts`.
 */

export interface PortalUploaded {
  /** The stored url: what a request or a message is saved with. */
  url: string
  name: string
  type: string
  size: number
}

/**
 * Why an upload did not arrive, as the route's `code`: 'type', 'empty',
 * 'tooLarge', 'tooMany', 'signedOut', 'restoring', 'failed', … and 'network'
 * when the request never got an answer, 'aborted' when the customer took the
 * file out while it was on its way.
 */
export class PortalUploadError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'PortalUploadError'
  }
}

const uploadAddress = (orgParam: string) => `/portal/${encodeURIComponent(orgParam)}/upload`

/**
 * Sends one file. `onProgress` gets 0 to 1 as the bytes leave; `signal`
 * stops it. XMLHttpRequest and not fetch, which cannot report how much of a
 * request body has been sent.
 */
export function uploadPortalFile(
  orgParam: string,
  file: File,
  { onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<PortalUploaded> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PortalUploadError('aborted'))
      return
    }
    const xhr = new XMLHttpRequest()
    const body = new FormData()
    body.append('file', file)
    xhr.open('POST', uploadAddress(orgParam))
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total)
    }
    xhr.onload = () => {
      const answer = (xhr.response ?? null) as (Partial<PortalUploaded> & { code?: string }) | null
      if (xhr.status >= 200 && xhr.status < 300 && typeof answer?.url === 'string') {
        resolve({
          url: answer.url,
          name: answer.name ?? file.name,
          type: answer.type ?? file.type,
          size: answer.size ?? file.size,
        })
        return
      }
      // 413 can come from a proxy in front of the app, with no body of ours.
      reject(
        new PortalUploadError(
          answer?.code ??
            (xhr.status === 413 ? 'tooLarge' : xhr.status === 429 ? 'tooMany' : 'failed')
        )
      )
    }
    xhr.onerror = () => reject(new PortalUploadError('network'))
    xhr.onabort = () => reject(new PortalUploadError('aborted'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}

/**
 * Tells the workshop's server that these uploads will not be sent after all,
 * so it lets the files go: the customer removed them, or is leaving the page
 * with them still in the form. Never throws and is not waited for; a file
 * this misses is collected by the server's own sweep of unused files.
 * `leaving` keeps the request alive while the page goes away.
 */
export function releasePortalUploads(
  orgParam: string,
  urls: string[],
  { leaving = false }: { leaving?: boolean } = {}
): void {
  if (urls.length === 0) return
  try {
    void fetch(uploadAddress(orgParam), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
      keepalive: leaving,
    }).catch(() => {
      // Not waited for and never an error: the server's sweep takes what this misses.
    })
  } catch {
    // No fetch, or the page is already gone: the sweep takes it.
  }
}
