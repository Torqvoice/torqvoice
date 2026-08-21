import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { verifyWhatsappMediaToken } from '@/lib/whatsapp/media-link'
import { resolveWithinDir } from '@/lib/safe-path'
import { resolveUploadPath } from '@/lib/resolve-upload-path'

/**
 * Serves one uploaded file to a WhatsApp provider, and only that file.
 *
 * The provider fetches media from its own servers with no session, so this is
 * the one door into the uploads directory that is not behind auth. It opens
 * only for a signed, expiring token naming a single file inside the
 * organization's own folder.
 */

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const claim = verifyWhatsappMediaToken(token)
  if (!claim) {
    return NextResponse.json({ error: 'Link expired' }, { status: 403 })
  }

  // The signature guarantees the URL is one we minted, but not that it points
  // where we think: resolve it and confirm it lands in this organization's
  // own upload directory before reading anything.
  const absolute = resolveUploadPath(claim.fileUrl)
  const organizationDir = path.join(process.cwd(), 'data', 'uploads', claim.organizationId)
  const safe = resolveWithinDir(organizationDir, path.relative(organizationDir, absolute))
  if (!safe) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const body = await readFile(safe)
    const extension = path.extname(safe).toLowerCase()
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
        // Providers may retry the fetch; nothing else should keep a copy.
        'Cache-Control': 'private, max-age=600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
