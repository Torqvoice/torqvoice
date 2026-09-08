import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import path from 'path'
import sharp from 'sharp'
import { EMAIL_IMAGE_CATEGORY, EMAIL_IMAGE_MAX_WIDTH } from '@/features/email/Lib/emailTemplate'
import { guardEmailUpload } from '@/features/email/Lib/emailUploadAccess.server'

/**
 * A picture for an image block.
 *
 * Mail has no image pipeline of its own: whatever is uploaded is what every
 * reader downloads, on a phone, over whatever connection they have. So the
 * upload is made small here, once. Fitted to twice the mail's width so it
 * stays sharp on a high-density screen, saved as JPEG unless it has
 * transparency, and squeezed until it is under the byte cap. The template
 * stores the protected URL; the public route serves the file to mail
 * clients, and the asset sweep removes it once no template refers to it.
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_OUTPUT_BYTES = 600 * 1024
const MAX_PIXEL_WIDTH = EMAIL_IMAGE_MAX_WIDTH * 2
const MAX_PIXEL_HEIGHT = 1600

/** More pixels than this and the decode alone would eat a gigabyte; no email needs it. */
const MAX_INPUT_PIXELS = 40_000_000

export async function POST(request: Request) {
  const guard = await guardEmailUpload(request)
  if ('response' in guard) return guard.response
  const { ctx } = guard

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return NextResponse.json({ error: 'Upload a PNG, JPEG or WebP image' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
  }

  try {
    const source = Buffer.from(await file.arrayBuffer())
    const image = sharp(source, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate()
    const meta = await image.metadata()
    if (!meta.width || !meta.height) {
      return NextResponse.json({ error: 'Not an image we can read' }, { status: 400 })
    }

    const fitted = image.resize({
      width: MAX_PIXEL_WIDTH,
      height: MAX_PIXEL_HEIGHT,
      fit: 'inside',
      withoutEnlargement: true,
    })

    // Transparency needs PNG; everything else is smaller as JPEG. Either way,
    // step the quality down until the file is under the cap, and when quality
    // alone will not do it, halve the size and try again.
    const encode = async (width: number) => {
      const base = fitted.clone().resize({ width, withoutEnlargement: true })
      if (meta.hasAlpha) {
        const out = await base
          .png({ compressionLevel: 9, palette: true })
          .toBuffer({ resolveWithObject: true })
        // A transparent picture cannot trade quality for bytes; it can only
        // shrink. Over the cap at full size means try again at half.
        if (out.data.length <= MAX_OUTPUT_BYTES || width < MAX_PIXEL_WIDTH)
          return { ext: 'png', out }
        return null
      }
      for (const quality of [82, 72, 62, 52]) {
        const out = await base
          .jpeg({ quality, mozjpeg: true, progressive: true })
          .toBuffer({ resolveWithObject: true })
        if (out.data.length <= MAX_OUTPUT_BYTES) return { ext: 'jpg', out }
      }
      return null
    }

    let result = await encode(MAX_PIXEL_WIDTH)
    if (!result || result.out.data.length > MAX_OUTPUT_BYTES) {
      result = await encode(Math.round(MAX_PIXEL_WIDTH / 2))
    }
    if (!result) {
      return NextResponse.json({ error: 'Could not make the image small enough' }, { status: 400 })
    }

    const fileName = `${randomUUID()}.${result.ext}`
    const dir = path.join(
      process.cwd(),
      'data',
      'uploads',
      ctx.organizationId,
      EMAIL_IMAGE_CATEGORY
    )
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, fileName), result.out.data)

    return NextResponse.json({
      url: `/api/protected/files/${ctx.organizationId}/${EMAIL_IMAGE_CATEGORY}/${fileName}`,
      width: result.out.info.width,
      height: result.out.info.height,
      bytes: result.out.data.length,
    })
  } catch (error) {
    console.error('[Email image upload] Error:', error)
    return NextResponse.json({ error: 'Could not process the image' }, { status: 500 })
  }
}
