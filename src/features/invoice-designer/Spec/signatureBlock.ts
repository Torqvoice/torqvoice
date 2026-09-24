import type { InvoiceSection } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { Node } from './documentSpec'
import { type DocumentData, type DocumentTheme, lookOf, scale, sectionFields } from './buildSpec'
import { headingStyle } from './certificateBlocks'

/** Room a signature takes above its line, in points. */
const SIGNATURE_WIDTH = 170
const SIGNATURE_HEIGHT = 44

/**
 * Whoever issued the document signs it: a line with their signature drawn on
 * it when they have saved one, their name under it, and the date beside.
 *
 * Every piece is a switch, because paper differs: a certificate is often
 * signed by hand, so the line prints empty; an invoice may carry the image
 * alone. A document without a signer (a job the system opened) still prints
 * the line, which is what a sheet meant for a pen needs.
 */
export function signatureBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  const signature = data.signature
  if (!signature) return null
  const fields = new Set(sectionFields(section))
  const withImage = fields.has('signature_image') && Boolean(signature.image)
  const withLine = fields.has('inspector_line')
  const withDate = fields.has('date_line')
  if (!withLine && !withImage && !withDate) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const boxed = section.boxed === true

  const column = (opts: { caption: string; value: string; image?: string }): Node => ({
    kind: 'stack',
    gap: 3,
    children: [
      // The signature sits on the line; a line without one keeps room for a
      // pen. The row aligns its columns at the bottom, so the lines meet
      // whatever height the signature happens to print at.
      opts.image
        ? {
            kind: 'image',
            src: opts.image,
            maxWidth: SIGNATURE_WIDTH,
            maxHeight: SIGNATURE_HEIGHT,
            align: 'left',
          }
        : { kind: 'spacer', height: 22 },
      ...(withLine || !opts.image
        ? [{ kind: 'spacer' as const, height: 0.75, color: look.border || look.text }]
        : []),
      // An empty value still takes its line, so the two columns stay level.
      {
        kind: 'text',
        text: opts.value || ' ',
        style: { color: look.text, fontSize: scale(size, 0.92) },
      },
      {
        kind: 'text',
        text: opts.caption,
        style: { color: look.muted, fontSize: scale(size, 0.72) },
      },
    ],
  })

  const columns: { width: 'flex'; node: Node }[] = []
  if (withLine || withImage) {
    columns.push({
      width: 'flex',
      node: column({
        caption: signature.nameCaption,
        value: fields.has('inspector_name') ? signature.name : '',
        image: withImage ? signature.image : undefined,
      }),
    })
  }
  if (withDate) {
    columns.push({
      width: 'flex',
      node: column({ caption: signature.dateCaption, value: signature.date }),
    })
  }
  return {
    kind: 'stack',
    id: section.id,
    gap: 6,
    style: boxed
      ? {
          background: look.fill || '#f3f4f6',
          borderColor: look.border,
          borderWidth: look.border ? (look.ruleWidth ?? 0.75) : 0,
          radius: 3,
          padding: look.padding ?? 10,
        }
      : undefined,
    children: [
      ...(section.heading !== false
        ? [
            {
              kind: 'text' as const,
              text: signature.heading,
              style: headingStyle(look, size),
            },
          ]
        : []),
      { kind: 'row', gap: 24, align: 'end', children: columns },
    ],
  }
}
