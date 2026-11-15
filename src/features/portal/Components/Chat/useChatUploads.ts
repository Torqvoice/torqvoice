'use client'

import { useCallback, useRef, useState } from 'react'
import { z } from 'zod'
import { PORTAL_MESSAGE_MAX_PHOTOS } from '../../Lib/chatTypes'
import { portalUploadKind, portalUploadProblem } from '../../Lib/portalUploads'

/** What the portal's upload route answers for a stored file. */
const uploadedSchema = z.object({ url: z.string().min(1) })

/** A photo or video picked for the next message. */
export interface ChatUpload {
  id: string
  name: string
  kind: 'image' | 'video'
  /** The browser's own copy, for the thumbnail. */
  previewUrl: string
  state: 'uploading' | 'ready'
  /** The stored url the route answered, once it has. */
  storedUrl: string | null
}

export type ChatUploadProblem = 'type' | 'tooLarge' | 'tooMany' | 'failed'

/**
 * The photos and video waiting to go with the next message. A file is sent
 * to the portal's upload route the moment it is picked, so the message
 * itself is quick; one that is refused never joins the tray, and the reason
 * is handed to the chat to say.
 */
export function useChatUploads(orgParam: string) {
  const [uploads, setUploads] = useState<ChatUpload[]>([])
  const [problem, setProblem] = useState<ChatUploadProblem | null>(null)
  const count = useRef(0)
  const endpoint = `/portal/${orgParam}/upload`

  const add = useCallback(
    (files: File[]) => {
      setProblem(null)
      for (const file of files) {
        if (count.current >= PORTAL_MESSAGE_MAX_PHOTOS) {
          setProblem('tooMany')
          break
        }
        const kind = portalUploadKind(file.type)
        const refused = portalUploadProblem(file)
        if (!kind || refused) {
          setProblem(refused === 'tooLarge' ? 'tooLarge' : 'type')
          continue
        }
        count.current += 1
        const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const previewUrl = URL.createObjectURL(file)
        setUploads((list) => [
          ...list,
          { id, name: file.name, kind, previewUrl, state: 'uploading', storedUrl: null },
        ])

        const form = new FormData()
        form.append('file', file)
        fetch(endpoint, { method: 'POST', body: form })
          .then(async (response) => {
            if (!response.ok) throw new Error(String(response.status))
            return uploadedSchema.parse(await response.json())
          })
          .then(({ url }) => {
            setUploads((list) =>
              list.map((one) => (one.id === id ? { ...one, state: 'ready', storedUrl: url } : one))
            )
          })
          .catch(() => {
            count.current -= 1
            URL.revokeObjectURL?.(previewUrl)
            setUploads((list) => list.filter((one) => one.id !== id))
            setProblem('failed')
          })
      }
    },
    [endpoint]
  )

  /** Takes a file out of the tray and tells the server it will not be sent. */
  const remove = useCallback(
    (id: string) => {
      const upload = uploads.find((one) => one.id === id)
      if (!upload) return
      count.current -= 1
      URL.revokeObjectURL?.(upload.previewUrl)
      if (upload.storedUrl) {
        // Housekeeping only: a file nobody mentions is swept up later anyway.
        fetch(endpoint, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: upload.storedUrl }),
        }).catch(() => undefined)
      }
      setUploads((list) => list.filter((one) => one.id !== id))
    },
    [endpoint, uploads]
  )

  /** Empties the tray for a message that is being sent; the previews stay alive with it. */
  const take = useCallback(() => {
    const ready = uploads.filter((one) => one.state === 'ready' && one.storedUrl)
    count.current = 0
    setUploads([])
    setProblem(null)
    return ready
  }, [uploads])

  return {
    uploads,
    problem,
    clearProblem: useCallback(() => setProblem(null), []),
    add,
    remove,
    take,
    busy: uploads.some((one) => one.state === 'uploading'),
    full: uploads.length >= PORTAL_MESSAGE_MAX_PHOTOS,
  }
}
