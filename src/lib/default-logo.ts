import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

/**
 * The app's own mark, as the public logo routes answer on the demo.
 *
 * Those routes are unauthenticated and publicly cacheable for an hour, and on
 * the demo whatever logo a visitor last uploaded would be the first thing the
 * next stranger sees on the sign-in page, cached at the edge past the reset
 * that removes it. The demo workshop has no logo of its own (the seed clears
 * it), so the default mark is also the honest answer.
 */
export async function defaultLogoResponse(): Promise<NextResponse> {
  try {
    const buffer = await readFile(path.join(process.cwd(), 'public', 'torqvoice_app_logo.png'))
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    })
  } catch {
    return NextResponse.json({ error: 'No logo' }, { status: 404 })
  }
}
