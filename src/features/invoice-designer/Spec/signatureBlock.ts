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
 * Beside those, when the design asks, an empty line for the customer, with
 * their name under it and a date of its own: the work order a customer
 * signs at the counter, or a quote they accept on paper.
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
  // A customer line needs a customer side: a certificate has none.
  const withCustomer = fields.has('customer_line') && signature.customerCaption !== undefined
  if (!withLine && !withImage && !withDate && !withCustomer) return null
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
      // An empty value still takes its line, so the columns stay level. A
      // plain space collapses to nothing on the designer's canvas and the
      // column's rule then sinks below its neighbours'; a non-breaking one
      // keeps the line's height in both renderers.
      {
        kind: 'text',
        text: opts.value || '\u00a0',
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
  // The issuer's date only when the issuer has a line; a date beside nothing
  // reads as a mistake.
  if (withDate && (withLine || withImage || !withCustomer)) {
    columns.push({
      width: 'flex',
      node: column({ caption: signature.dateCaption, value: signature.date }),
    })
  }
  if (withCustomer) {
    columns.push({
      width: 'flex',
      node: column({
        caption: signature.customerCaption ?? '',
        value: fields.has('inspector_name') ? (signature.customerName ?? '') : '',
      }),
    })
    // The customer's date is theirs to write, so its line prints empty.
    if (withDate) {
      columns.push({
        width: 'flex',
        node: column({ caption: signature.dateCaption, value: '' }),
      })
    }
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
